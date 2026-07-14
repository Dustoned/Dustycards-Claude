import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";

const BASE_URL = "https://www.pokemon.com";
// Keep this outside .firecrawl: deploy cleanup intentionally removes that
// directory, while data/ is persistent on production. The twice-monthly job
// can therefore remain incremental across deploys.
const CACHE_PATH = path.join(process.cwd(), "data", "official-product-releases.json");
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const refresh = args.has("--refresh");
const verbose = args.has("--verbose");
const concurrencyArg = process.argv.find((arg) => arg.startsWith("--concurrency="));
const concurrency = Math.max(1, Math.min(12, Number(concurrencyArg?.split("=")[1] ?? 6)));
const maxPagesArg = process.argv.find((arg) => arg.startsWith("--max-pages="));
const maxPages = Math.max(1, Number(maxPagesArg?.split("=")[1] ?? 60));
const currentYear = new Date().getUTCFullYear();
const yearsArg = process.argv.find((arg) => arg.startsWith("--years="));

function resolveYears() {
  if (!yearsArg) {
    return Array.from({ length: currentYear - 2013 + 1 }, (_, index) => 2013 + index);
  }

  const value = yearsArg.split("=")[1] ?? "";
  if (value === "current-next") return [currentYear, currentYear + 1];
  const range = value.match(/^(\d{4})-(\d{4})$/);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
  }

  return value
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((year) => Number.isInteger(year) && year >= 2013 && year <= currentYear + 1);
}

function decodeHtml(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;|&mdash;/gi, "-")
    .replace(/&eacute;/gi, "é")
    .replace(/&trade;/gi, "™");
}

function stripTags(value) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalizeProductName(value) {
  return decodeHtml(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/pok[eé]mon\s+trading\s+card\s+game/g, " ")
    .replace(/pok[eé]mon\s+tcg/g, " ")
    .replace(/pok[eé]mon/g, " ")
    .replace(/&/g, " and ")
    .replace(/\bex\b/g, " ex ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PRODUCT_TYPES = [
  "pokemon center elite trainer box",
  "elite trainer box",
  "ultra premium collection",
  "premium collection",
  "poster collection",
  "binder collection",
  "tech sticker collection",
  "figure collection",
  "pin collection",
  "booster bundle",
  "booster display",
  "booster box",
  "booster pack",
  "battle deck",
  "collection box",
  "mini tin",
  "tin",
  "case",
  "collection",
];

function getProductType(normalizedName) {
  return PRODUCT_TYPES.find((type) => normalizedName.includes(type)) ?? null;
}

function tokenDice(left, right) {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return (2 * overlap) / (leftTokens.size + rightTokens.size);
}

function scoreMatch(localName, officialName) {
  if (localName === officialName) return 1;
  const localType = getProductType(localName);
  const officialType = getProductType(officialName);
  if (localType && officialType && localType !== officialType) return 0;
  if ((localType === "case") !== (officialType === "case")) return 0;

  const containment = localName.includes(officialName) || officialName.includes(localName);
  const lengthRatio = Math.min(localName.length, officialName.length) / Math.max(localName.length, officialName.length);
  const dice = tokenDice(localName, officialName);
  return Math.min(0.99, dice * 0.78 + lengthRatio * 0.12 + (containment ? 0.1 : 0));
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  const html = await response.text();
  if (!html.includes("Pardon Our Interruption")) return html;

  const target = new URL(url);
  const readerUrl = `https://r.jina.ai/http://${target.host}${target.pathname}${target.search}`;
  const readerResponse = await fetch(readerUrl, {
    headers: {
      Accept: "text/plain,text/markdown",
      "User-Agent": "DustyCards/3.6 official-release-date-importer",
    },
  });
  if (!readerResponse.ok) {
    throw new Error(`${readerResponse.status} ${readerResponse.statusText} for ${readerUrl}`);
  }
  return readerResponse.text();
}

function galleryUrl(year) {
  return year === currentYear
    ? `${BASE_URL}/us/pokemon-tcg/product-gallery`
    : `${BASE_URL}/us/pokemon-tcg/product-gallery/${year}`;
}

function extractProductUrls(html) {
  const urls = new Set();
  for (const match of html.matchAll(/href=["']([^"']*\/us\/pokemon-tcg\/product-gallery\/[^"'#?]+)["']/gi)) {
    const url = new URL(match[1], BASE_URL);
    if (/\/product-gallery\/\d{4}\/?$/.test(url.pathname)) continue;
    urls.add(`${url.origin}${url.pathname.replace(/\/$/, "")}`);
  }
  for (const match of html.matchAll(/https?:\/\/(?:www\.)?pokemon\.com\/us\/pokemon-tcg\/product-gallery\/[^\s)<"'#?]+/gi)) {
    const url = new URL(match[0]);
    if (/\/product-gallery\/\d{4}\/?$/.test(url.pathname)) continue;
    urls.add(`https://www.pokemon.com${url.pathname.replace(/\/$/, "")}`);
  }
  return [...urls];
}

function parseProductPage(html, url) {
  const titleMeta = html.match(/<meta\s+name=["']pkm-title["']\s+content=["']([^"']+)["']/i)?.[1];
  const titleHtml = html.match(/<h1[^>]*class=["'][^"']*us-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const titleMarkdown = html.match(/^#\s+(.+)$/m)?.[1];
  const launchText =
    html.match(/class=["'][^"']*generic-date[^"']*["'][^>]*>\s*Launch:\s*([^<]+)</i)?.[1] ??
    html.match(/^Launch:\s*([^\r\n]+)$/mi)?.[1];
  const imageUrl = html.match(/<meta\s+name=["']pkm-image["']\s+content=["']([^"']+)["']/i)?.[1] ?? null;
  const title = stripTags(titleMeta ?? titleHtml ?? titleMarkdown ?? "");
  const releaseDate = launchText ? new Date(`${stripTags(launchText)} 12:00:00 UTC`) : null;

  if (!title || !releaseDate || Number.isNaN(releaseDate.getTime())) return null;
  return {
    title,
    normalizedName: normalizeProductName(title),
    releaseDate: releaseDate.toISOString(),
    sourceUrl: url,
    imageUrl,
  };
}

async function mapConcurrent(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        results[index] = { error: error instanceof Error ? error.message : String(error), item: items[index] };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function loadOfficialProducts() {
  let cached = { products: [], failedUrls: [] };
  try {
    const parsed = JSON.parse(await fs.readFile(CACHE_PATH, "utf8"));
    cached = {
      products: Array.isArray(parsed.products) ? parsed.products : [],
      failedUrls: Array.isArray(parsed.failedUrls) ? parsed.failedUrls : [],
    };
  } catch {}

  if (!refresh) {
    if (cached.products.length > 0) return cached.products;
  }

  const years = resolveYears();
  const galleryResults = await mapConcurrent(years, Math.min(concurrency, 4), async (year) => {
    const html = await fetchHtml(galleryUrl(year));
    return extractProductUrls(html);
  });
  const productUrls = [...new Set(galleryResults.flatMap((result) => Array.isArray(result) ? result : []))];
  console.log(`Official gallery: ${years.length} years, ${productUrls.length} product pages.`);

  const cachedUrls = new Set(cached.products.map((product) => product.sourceUrl));
  const retryPriority = new Set(cached.failedUrls);
  const pendingUrls = productUrls
    .filter((url) => !cachedUrls.has(url))
    .sort((left, right) => Number(retryPriority.has(left)) - Number(retryPriority.has(right)))
    .slice(0, maxPages);
  console.log(`Fetching ${pendingUrls.length} uncached pages this run (max ${maxPages}).`);

  const pageResults = await mapConcurrent(pendingUrls, Math.min(concurrency, 2), async (url, index) => {
    if (verbose && index % 25 === 0) console.log(`Fetching ${index + 1}/${pendingUrls.length}...`);
    return parseProductPage(await fetchHtml(url), url);
  });
  const fetchedProducts = pageResults.filter((result) => result && !result.error && result.releaseDate);
  const productsByUrl = new Map(cached.products.map((product) => [product.sourceUrl, product]));
  for (const product of fetchedProducts) productsByUrl.set(product.sourceUrl, product);
  const products = [...productsByUrl.values()];
  const failedUrlSet = new Set(cached.failedUrls);
  pageResults.forEach((result, index) => {
    const url = pendingUrls[index];
    if (result?.error || result === null) failedUrlSet.add(url);
    else failedUrlSet.delete(url);
  });
  const failedUrls = [...failedUrlSet];
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(
    CACHE_PATH,
    JSON.stringify({
      fetchedAt: new Date().toISOString(),
      discoveredPages: productUrls.length,
      failedUrls,
      products,
    }, null, 2),
    "utf8"
  );
  return products;
}

function findBestMatch(localProduct, officialProducts) {
  const localName = normalizeProductName(localProduct.name);
  let best = null;
  for (const official of officialProducts) {
    const score = scoreMatch(localName, official.normalizedName);
    if (!best || score > best.score) best = { official, score };
  }
  return best && best.score >= 0.93 ? best : null;
}

async function main() {
  const officialProducts = await loadOfficialProducts();
  const db = new Database(path.join(process.cwd(), "dustycards.db"));
  db.pragma("busy_timeout = 5000");
  const localProducts = db.prepare(`
    SELECT sp.id, sp.name, sp.episode_id, e.name AS episode_name, e.release_date AS set_release_date
    FROM "SealedProduct" sp
    JOIN "Episode" e ON e.id = sp.episode_id
    WHERE sp.game = 'pokemon'
    ORDER BY sp.name
  `).all();

  const matches = [];
  const unmatched = [];
  for (const product of localProducts) {
    const match = findBestMatch(product, officialProducts);
    if (match) matches.push({ product, ...match });
    else unmatched.push(product);
  }

  const exactMatches = matches.filter((match) => match.score === 1).length;
  const likelyMatches = matches.length - exactMatches;
  console.log(
    `Release matching: ${localProducts.length} local products, ${officialProducts.length} official products, ` +
      `${matches.length} matched (${exactMatches} exact, ${likelyMatches} likely), ${unmatched.length} fallback to set date.`
  );

  if (verbose) {
    console.log("Likely matches:");
    for (const match of matches.filter((entry) => entry.score < 1).slice(0, 30)) {
      console.log(`  ${match.score.toFixed(3)}  ${match.product.name} -> ${match.official.title}`);
    }
    console.log("Unmatched samples:");
    for (const product of unmatched.slice(0, 30)) console.log(`  ${product.name}`);
  }

  if (apply) {
    if (officialProducts.length < 50 && !args.has("--allow-partial")) {
      db.close();
      throw new Error(
        `Official source cache is incomplete (${officialProducts.length} products). ` +
          "Refresh it first or use --allow-partial after manually reviewing the dry run."
      );
    }
    const columns = db.prepare(`PRAGMA table_info('SealedProduct')`).all().map((row) => row.name);
    if (!columns.includes("release_date")) {
      db.close();
      throw new Error("Database migration for SealedProduct.release_date has not been applied.");
    }

    const update = db.prepare(`
      UPDATE "SealedProduct"
      SET release_date = ?,
          release_date_source = 'pokemon.com',
          release_date_source_url = ?,
          release_date_confidence = ?,
          release_date_checked_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const applyMatches = db.transaction((rows) => {
      for (const match of rows) {
        update.run(
          match.official.releaseDate,
          match.official.sourceUrl,
          Number(match.score.toFixed(4)),
          match.product.id
        );
      }
    });
    applyMatches(matches);
    const matchedProductBySourceUrl = new Map(
      matches.map((match) => [match.official.sourceUrl, match.product.id])
    );
    const upsertReleaseWatch = db.prepare(`
      INSERT INTO "SealedReleaseWatch" (
        id, game, name, release_date, image_url, source_name, source_url,
        confidence, matched_product_id, created_at, updated_at
      ) VALUES (?, 'pokemon', ?, ?, ?, 'Pokemon.com', ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(source_url, name) DO UPDATE SET
        release_date = excluded.release_date,
        image_url = excluded.image_url,
        confidence = excluded.confidence,
        matched_product_id = excluded.matched_product_id,
        updated_at = CURRENT_TIMESTAMP
    `);
    const countTrackedSource = db.prepare(`
      SELECT COUNT(*) AS count FROM "SealedReleaseWatch" WHERE source_url = ?
    `);
    const refreshTrackedSource = db.prepare(`
      UPDATE "SealedReleaseWatch"
      SET release_date = ?,
          image_url = COALESCE(image_url, ?),
          confidence = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE source_url = ?
    `);
    const applyReleaseWatch = db.transaction((rows) => {
      for (const product of rows) {
        const trackedSourceCount = Number(countTrackedSource.get(product.sourceUrl)?.count ?? 0);
        if (trackedSourceCount > 0) {
          refreshTrackedSource.run(product.releaseDate, product.imageUrl, product.sourceUrl);
          continue;
        }
        const id = `pokemon-${createHash("sha1").update(product.sourceUrl).digest("hex").slice(0, 20)}`;
        upsertReleaseWatch.run(
          id,
          product.title,
          product.releaseDate,
          product.imageUrl,
          product.sourceUrl,
          matchedProductBySourceUrl.get(product.sourceUrl) ?? null
        );
      }
    });
    applyReleaseWatch(officialProducts);
    console.log(
      `Applied ${matches.length} matched product dates and ${officialProducts.length} release-watch records.`
    );
  } else {
    console.log("Dry run only. Re-run with --apply after reviewing the match summary.");
  }

  db.close();
}

await main();
