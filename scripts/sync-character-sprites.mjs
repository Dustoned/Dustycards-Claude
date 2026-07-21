import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const OUTPUT_ROOT = path.join(ROOT, "public", "assets", "character-sprites");
const POKEMON_OUTPUT = path.join(OUTPUT_ROOT, "pokemon");
const TRAINER_OUTPUT = path.join(OUTPUT_ROOT, "trainers");
const GENERATED_OUTPUT = path.join(ROOT, "src", "generated", "card-characters.generated.ts");
const MANIFEST_OUTPUT = path.join(OUTPUT_ROOT, "manifest.json");
const ATTRIBUTION_OUTPUT = path.join(OUTPUT_ROOT, "ATTRIBUTION.txt");
const POKEMONDB_SPRITES_URL = "https://pokemondb.net/sprites";
const BULBAGARDEN_API_URL = "https://archives.bulbagarden.net/w/api.php";
const TRAINER_ROOT_CATEGORY = "Category:Trainer sprites";
const EXPECTED_POKEMON_COUNT = 1_025;
const BULBAGARDEN_PAGE_SIZE = 200;
const OUTPUT_SIZE = 64;
const REQUEST_CONCURRENCY = getPositiveInteger(
  process.env.SPRITE_SYNC_CONCURRENCY,
  10
);
const force = process.argv.includes("--force");
const forceTrainers = force || process.argv.includes("--force-trainers");
const pokemonOnly = process.argv.includes("--pokemon-only");

// Identity is deliberately independent from archive file names. These entries also
// make routes possible when Bulbagarden has no usable sprite in the Trainer-sprite
// category tree yet. `assetAliases` are matching hints only and never become the UI
// label unless they are also listed in `aliases`.
const TRAINER_IDENTITY_OVERRIDES = [
  {
    name: "Professor Sada",
    aliases: ["Sada"],
    assetAliases: ["Sada", "Professor Sada"],
  },
  {
    name: "Professor Turo",
    aliases: ["Turo"],
    assetAliases: ["Turo", "Professor Turo"],
  },
  {
    name: "Ace Trainer",
    aliases: [],
    assetAliases: ["Ace Trainer", "Ace Trainer F", "Ace Trainer M"],
  },
  {
    name: "Green",
    aliases: [],
    assetAliases: ["Green"],
  },
  {
    name: "Daisy",
    aliases: ["Daisy Oak"],
    assetAliases: ["Daisy", "Daisy Oak"],
  },
  {
    name: "Professor Magnolia",
    aliases: ["Magnolia"],
    assetAliases: ["Professor Magnolia", "Magnolia"],
  },
  {
    name: "Professor Laventon",
    aliases: ["Laventon"],
    assetAliases: ["Professor Laventon", "Laventon"],
  },
  { name: "Bebe", aliases: [], assetAliases: ["Bebe"] },
  { name: "Lanette", aliases: [], assetAliases: ["Lanette"] },
  { name: "Roseanne", aliases: [], assetAliases: ["Roseanne"] },
];

const GAME_TOKENS = new Set([
  "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix",
  "rg", "rgb", "rby", "y", "gsc", "gs", "c", "rse", "rs", "e",
  "frlg", "dp", "dpp", "dppt", "pt", "hgss", "bw", "b2w2", "xy",
  "oras", "sm", "usum", "lgpe", "pe", "swsh", "bdsp", "la", "sv",
  "rb", "gb", "sgb", "stadium", "colosseum", "xd",
]);

const VARIANT_SUFFIX = /^(?:\d+|ex|alt|academy|anniversary|arc|aura|champion|classic|contest|costume|cute|dark|devon|dojo|fall|fiery|fresh|go-goggles|holiday|kimono|lodge|magma|masked|mix|neo|new|palentine|palentines|renegade|riding|sc|special|spring|summer|swimsuit|sygna|team|thunderbolt|variety|winter)\b/i;

function getPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function decodeHtml(value) {
  const namedEntities = new Map([
    ["amp", "&"],
    ["apos", "'"],
    ["quot", "\""],
    ["eacute", "é"],
    ["female", "♀"],
    ["male", "♂"],
  ]);
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replace(/&#(\d+);/g, (_match, code) =>
      String.fromCodePoint(Number.parseInt(code, 10))
    )
    .replace(/&([a-z]+);/gi, (match, name) => namedEntities.get(name.toLowerCase()) ?? match);
}

function toSlug(value) {
  return value
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/♀/g, "-f")
    .replace(/♂/g, "-m")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function cleanTitle(value) {
  return value.replace(/^File:/i, "").replace(/\.[a-z0-9]+$/i, "").trim();
}

function sourcePageUrl(title) {
  return `https://archives.bulbagarden.net/wiki/${encodeURIComponent(
    title.replaceAll(" ", "_")
  )}`;
}

function deriveOverworldTrainerName(title) {
  let label = cleanTitle(title)
    .replace(/\bOD\b.*$/i, "")
    .replace(/\s*walk(?:ing)?(?:\s*(?:up|down|left|right))?$/i, "")
    .trim();
  const tokens = label.split(/\s+/);
  while (tokens.length > 1) {
    const last = tokens.at(-1)?.toLowerCase() ?? "";
    if (GAME_TOKENS.has(last) || /^\d+$/.test(last)) {
      tokens.pop();
      continue;
    }
    break;
  }
  label = tokens.join(" ").replace(/\s+/g, " ").trim();
  return label && !/^\d/.test(label) ? label : null;
}

function deriveMastersTrainerName(title) {
  const label = cleanTitle(title).replace(/^Spr Masters\s+/i, "").trim();
  if (!label || /(?:\s2|\sEX)$/i.test(label)) return null;
  return label;
}

function normalizeKey(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`´]/g, "'")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trainerAssetSource(categoryTitle) {
  if (/Pokémon Masters|Masters Versus/i.test(categoryTitle)) return "masters";
  if (/Overworld/i.test(categoryTitle)) return "overworld";
  if (/Versus/i.test(categoryTitle)) return "versus";
  if (/Generation [IVX]+ Trainer sprites/i.test(categoryTitle)) return "battle";
  return "fallback";
}

function trimGameAndVariantTokens(value) {
  const tokens = value.split(/\s+/).filter(Boolean);
  while (tokens.length > 1) {
    const last = tokens.at(-1)?.toLowerCase() ?? "";
    if (
      GAME_TOKENS.has(last) ||
      /^\d+$/.test(last) ||
      /^(?:ex|alt|back|front|masters|normal|special|vs)$/i.test(last)
    ) {
      tokens.pop();
      continue;
    }
    break;
  }
  return tokens.join(" ").trim();
}

function deriveBattleTrainerName(title) {
  let label = cleanTitle(title).replace(/^Spr\s+/i, "").trim();
  const tokens = label.split(/\s+/);
  if (tokens.length > 1 && GAME_TOKENS.has(tokens[0].toLowerCase())) tokens.shift();
  label = trimGameAndVariantTokens(tokens.join(" "));
  return label && !/^\d/.test(label) ? label : null;
}

function deriveVersusTrainerName(title) {
  let label = cleanTitle(title).replace(/^VS\s*/i, "").trim();
  label = trimGameAndVariantTokens(label);
  return label && !/^\d/.test(label) ? label : null;
}

function deriveFallbackTrainerName(title) {
  let label = cleanTitle(title)
    .replace(/^Spr\s+/i, "")
    .replace(/^VS\s*/i, "")
    .trim();
  const tokens = label.split(/\s+/);
  if (tokens.length > 1 && GAME_TOKENS.has(tokens[0].toLowerCase())) tokens.shift();
  label = trimGameAndVariantTokens(tokens.join(" "));
  return label && !/^\d/.test(label) ? label : null;
}

function deriveTrainerAssetName(title, categoryTitle) {
  const source = trainerAssetSource(categoryTitle);
  if (source === "overworld") return deriveOverworldTrainerName(title);
  if (source === "masters") return deriveMastersTrainerName(title);
  if (source === "versus") return deriveVersusTrainerName(title);
  if (source === "battle") return deriveBattleTrainerName(title);
  return deriveFallbackTrainerName(title);
}

function canonicalizeVariantNames(entries) {
  const names = [...new Set(entries.map((entry) => entry.name))]
    .sort((left, right) => left.length - right.length || left.localeCompare(right, "en"));
  const knownNames = new Map(names.map((name) => [normalizeKey(name), name]));

  return entries.map((entry) => {
    const tokens = entry.name.split(/\s+/);
    let canonicalName = entry.name;
    for (let length = tokens.length - 1; length > 0; length -= 1) {
      const prefix = tokens.slice(0, length).join(" ");
      const suffix = tokens.slice(length).join(" ");
      const knownPrefix = knownNames.get(normalizeKey(prefix));
      if (knownPrefix && VARIANT_SUFFIX.test(suffix)) canonicalName = knownPrefix;
    }
    return {
      ...entry,
      name: canonicalName,
      slug: toSlug(canonicalName),
      variantName: canonicalName === entry.name ? null : entry.name,
    };
  });
}

function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : null;
}

async function fetchWithRetry(url, { accept = "*/*", headers = {}, ...options } = {}, attempts = 5) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "user-agent": "DustyCards character sprite sync/1.0 (local asset import)",
          accept,
          ...headers,
        },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) return response;

      const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
      const error = new Error(`${response.status} ${response.statusText} for ${url}`);
      if (response.status !== 429 && response.status < 500) throw error;
      lastError = error;
      if (attempt < attempts) {
        await sleep(retryAfter ?? Math.min(8_000, attempt * attempt * 500));
      }
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(Math.min(8_000, attempt * attempt * 500));
    }
  }
  throw lastError;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function loadPokemonEntries() {
  const response = await fetchWithRetry(POKEMONDB_SPRITES_URL, { accept: "text/html" });
  const html = await response.text();
  const entries = [];
  const seen = new Set();
  const pattern = /<a class="infocard" href="\/sprites\/([^\"]+)">[\s\S]*?<img[^>]+src="([^\"]+\/icon\/[^\"]+\.png)"[^>]+alt="([^\"]+)"[^>]+width="60"[^>]+height="56"/g;

  for (const match of html.matchAll(pattern)) {
    const slug = decodeHtml(match[1]);
    if (seen.has(slug)) continue;
    seen.add(slug);
    entries.push({
      dex: entries.length + 1,
      slug,
      source: "pokemondb",
      sourcePage: POKEMONDB_SPRITES_URL,
      sourceTitle: decodeHtml(match[3]),
      sourceUrl: decodeHtml(match[2]),
      name: decodeHtml(match[3]),
      // PokemonDB renders these at 60×56 CSS pixels, while the PNG files are 2×.
      originalWidth: 120,
      originalHeight: 112,
      pixelArt: true,
    });
  }

  if (entries.length !== EXPECTED_POKEMON_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_POKEMON_COUNT} base Pokémon sprites, parsed ${entries.length}. ` +
      "Review the PokemonDB page before accepting a count change."
    );
  }
  return entries;
}

async function loadCategoryMembers(categoryTitle, namespace) {
  const members = [];
  let continuation = null;

  do {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      list: "categorymembers",
      cmtitle: categoryTitle,
      cmnamespace: String(namespace),
      cmlimit: "500",
    });
    if (continuation) params.set("cmcontinue", continuation);

    const response = await fetchWithRetry(`${BULBAGARDEN_API_URL}?${params}`, {
      accept: "application/json",
    });
    const payload = await response.json();
    if (payload?.error) {
      throw new Error(`Bulbagarden API error: ${payload.error.code}: ${payload.error.info}`);
    }
    members.push(...(payload?.query?.categorymembers ?? []));
    continuation = payload?.continue?.cmcontinue ?? null;
  } while (continuation);

  return members;
}

async function discoverTrainerCategories() {
  const queue = [TRAINER_ROOT_CATEGORY];
  const visited = new Set();
  while (queue.length > 0) {
    const categoryTitle = queue.shift();
    if (!categoryTitle || visited.has(categoryTitle)) continue;
    visited.add(categoryTitle);
    const subcategories = await loadCategoryMembers(categoryTitle, 14);
    for (const subcategory of subcategories) {
      if (!visited.has(subcategory.title)) queue.push(subcategory.title);
    }
  }
  return [...visited];
}

async function loadImageInfoPages(titles) {
  const resolved = new Map();
  for (let offset = 0; offset < titles.length; offset += 50) {
    const chunk = titles.slice(offset, offset + 50);
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      redirects: "1",
      titles: chunk.join("|"),
      prop: "imageinfo",
      iiprop: "url|size|mime|sha1",
      iiurlwidth: "96",
    });
    const response = await fetchWithRetry(`${BULBAGARDEN_API_URL}?${params}`, {
      accept: "application/json",
    });
    const payload = await response.json();
    const pagesByTitle = new Map(
      (payload?.query?.pages ?? []).map((page) => [page.title, page])
    );
    const normalized = new Map(
      (payload?.query?.normalized ?? []).map((entry) => [entry.from, entry.to])
    );
    const redirects = new Map(
      (payload?.query?.redirects ?? []).map((entry) => [entry.from, entry.to])
    );
    for (const title of chunk) {
      const normalizedTitle = normalized.get(title) ?? title;
      const targetTitle = redirects.get(normalizedTitle) ?? normalizedTitle;
      const page = pagesByTitle.get(targetTitle);
      if (page?.imageinfo?.[0]) resolved.set(title, page);
    }
  }
  return resolved;
}

async function loadTrainerCategory(categoryTitle) {
  const entries = [];
  let continuation = null;

  do {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      redirects: "1",
      generator: "categorymembers",
      gcmtitle: categoryTitle,
      gcmnamespace: "6",
      gcmlimit: String(BULBAGARDEN_PAGE_SIZE),
      prop: "imageinfo",
      iiprop: "url|size|mime|sha1",
      iiurlwidth: "96",
    });
    if (continuation) params.set("gcmcontinue", continuation);

    const response = await fetchWithRetry(`${BULBAGARDEN_API_URL}?${params}`, {
      accept: "application/json",
    });
    const payload = await response.json();
    if (payload?.error) {
      throw new Error(`Bulbagarden API error: ${payload.error.code}: ${payload.error.info}`);
    }

    const pages = payload?.query?.pages ?? [];
    const missingImageInfo = pages
      .filter((page) => !page.imageinfo?.[0])
      .map((page) => page.title);
    const resolvedImageInfo = await loadImageInfoPages(missingImageInfo);

    for (const page of pages) {
      const resolvedPage = page.imageinfo?.[0]
        ? page
        : resolvedImageInfo.get(page.title) ?? page;
      const image = resolvedPage.imageinfo?.[0];
      const source = trainerAssetSource(categoryTitle);
      const name = deriveTrainerAssetName(page.title, categoryTitle);
      if (
        process.env.SPRITE_SYNC_DEBUG === "1" &&
        /(?:green|sada|turo|magnolia|laventon|bebe|lanette|roseanne)/i.test(page.title)
      ) {
        console.log(
          `RAW ${categoryTitle}: ${page.title} -> ${name ?? "(none)"} ` +
          `[image=${Boolean(image?.url)}, size=${image?.width ?? "?"}x${image?.height ?? "?"}]`
        );
      }
      if (!name || !image?.url || !image?.width || !image?.height) continue;

      entries.push({
        name,
        source,
        category: categoryTitle,
        sourcePage: sourcePageUrl(resolvedPage.title),
        sourceTitle: resolvedPage.title,
        sourceUrl: image.thumburl ?? image.url,
        sourceSha1: image.sha1 ?? null,
        originalWidth: image.width,
        originalHeight: image.height,
        pixelArt:
          (source === "battle" || source === "overworld") &&
          image.width <= 256 &&
          image.height <= 256,
      });
    }
    continuation = payload?.continue?.gcmcontinue ?? null;
  } while (continuation);

  return entries;
}

function trainerScore(entry, identity) {
  let sourceScore = 10_000;
  if ((entry.source === "battle" || entry.source === "overworld") && entry.pixelArt) {
    sourceScore = 50_000;
  } else if (entry.source === "versus") {
    sourceScore = 40_000;
  } else if (entry.source === "masters") {
    sourceScore = 30_000;
  } else if (entry.source === "battle" || entry.source === "overworld") {
    sourceScore = 20_000;
  }

  const normalizedAssetName = normalizeKey(entry.name);
  const exactNameScore = normalizedAssetName === normalizeKey(identity.name) ? 2_000 : 0;
  const baseVariantScore = entry.variantName ? 0 : 1_000;
  const frontScore = /\bback\b/i.test(entry.sourceTitle) ? -2_000 : 0;
  const primaryMastersScore =
    entry.source === "masters" && /^File:Spr Masters [^.]+\.png$/i.test(entry.sourceTitle)
      ? 250
      : 0;
  return (
    sourceScore +
    exactNameScore +
    baseVariantScore +
    frontScore +
    primaryMastersScore -
    entry.sourceTitle.length
  );
}

function buildTrainerCatalog(assetEntries) {
  const identities = new Map();
  const assetAliasToIdentity = new Map();

  for (const override of TRAINER_IDENTITY_OVERRIDES) {
    const identity = {
      name: override.name,
      slug: toSlug(override.name),
      aliases: [...override.aliases],
      assetAliases: [...override.assetAliases],
      candidates: [],
    };
    identities.set(normalizeKey(identity.name), identity);
    for (const alias of [identity.name, ...identity.aliases, ...identity.assetAliases]) {
      assetAliasToIdentity.set(normalizeKey(alias), identity);
    }
  }

  for (const entry of canonicalizeVariantNames(assetEntries)) {
    const normalizedName = normalizeKey(entry.name);
    if (!normalizedName) continue;
    let identity = assetAliasToIdentity.get(normalizedName) ?? identities.get(normalizedName);
    if (!identity) {
      identity = {
        name: entry.name,
        slug: toSlug(entry.name),
        aliases: [],
        assetAliases: [entry.name],
        candidates: [],
      };
      if (!identity.slug) continue;
      identities.set(normalizedName, identity);
      assetAliasToIdentity.set(normalizedName, identity);
    }
    identity.candidates.push(entry);
    if (entry.variantName && normalizeKey(entry.variantName) !== normalizeKey(identity.name)) {
      identity.aliases.push(entry.variantName);
    }
  }

  const result = [];
  const seenNormalizedNames = new Set();
  const seenSlugs = new Set();
  for (const identity of identities.values()) {
    const normalizedName = normalizeKey(identity.name);
    if (!normalizedName || seenNormalizedNames.has(normalizedName) || seenSlugs.has(identity.slug)) {
      continue;
    }
    seenNormalizedNames.add(normalizedName);
    seenSlugs.add(identity.slug);

    const aliases = [];
    const seenAliases = new Set([normalizedName]);
    for (const alias of identity.aliases) {
      const normalizedAlias = normalizeKey(alias);
      if (!normalizedAlias || seenAliases.has(normalizedAlias)) continue;
      seenAliases.add(normalizedAlias);
      aliases.push(alias);
    }

    const selectedAsset = identity.candidates
      .map((entry) => ({ entry, score: trainerScore(entry, identity) }))
      .sort((left, right) => right.score - left.score)[0]?.entry ?? null;
    result.push({
      name: identity.name,
      slug: identity.slug,
      aliases,
      selectedAsset,
      source: selectedAsset?.source ?? "none",
      pixelArt: selectedAsset?.pixelArt ?? false,
      asset: selectedAsset
        ? `/assets/character-sprites/trainers/${identity.slug}.webp`
        : "",
    });
  }

  return result.sort((left, right) => left.name.localeCompare(right.name, "en"));
}

function validateTrainerCatalog(trainers) {
  const normalizedNames = new Set();
  const slugs = new Set();
  for (const trainer of trainers) {
    const normalizedName = normalizeKey(trainer.name);
    if (normalizedNames.has(normalizedName)) {
      throw new Error(`Duplicate normalized trainer name: ${trainer.name}`);
    }
    if (slugs.has(trainer.slug)) {
      throw new Error(`Duplicate trainer slug: ${trainer.slug}`);
    }
    normalizedNames.add(normalizedName);
    slugs.add(trainer.slug);
  }

  for (const required of TRAINER_IDENTITY_OVERRIDES) {
    if (!normalizedNames.has(normalizeKey(required.name))) {
      throw new Error(`Required trainer identity is missing: ${required.name}`);
    }
  }

  const green = trainers.find((trainer) => trainer.name === "Green");
  if (!green?.asset) {
    throw new Error("Green was discovered in the recursive category tree but has no selected asset.");
  }
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker())
  );
  return results;
}

async function fileExists(filePath) {
  try {
    const file = await stat(filePath);
    return file.isFile() && file.size > 0;
  } catch {
    return false;
  }
}

async function cleanupStaleSprites(outputDirectory, expectedSlugs) {
  const resolvedOutput = path.resolve(outputDirectory);
  const resolvedRoot = `${path.resolve(OUTPUT_ROOT)}${path.sep}`;
  if (!`${resolvedOutput}${path.sep}`.startsWith(resolvedRoot)) {
    throw new Error(`Refusing to clean sprites outside ${OUTPUT_ROOT}`);
  }

  const expectedFiles = new Set(expectedSlugs.map((slug) => `${slug}.webp`));
  const files = await readdir(resolvedOutput, { withFileTypes: true });
  let removed = 0;
  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith(".webp") || expectedFiles.has(file.name)) {
      continue;
    }
    await rm(path.join(resolvedOutput, file.name));
    removed += 1;
  }
  return removed;
}

async function normalizeSprite(input, entry) {
  const image = sharp(input, { animated: false }).ensureAlpha();
  if (entry.source === "pokemondb") {
    return image
      .trim({
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        threshold: 1,
      })
      .resize(52, 52, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: sharp.kernel.nearest,
      })
      .extend({
        top: 6,
        bottom: 6,
        left: 6,
        right: 6,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ lossless: true, effort: 4 })
      .toBuffer();
  }

  return image
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: entry.pixelArt ? sharp.kernel.nearest : sharp.kernel.lanczos3,
      withoutEnlargement: false,
    })
    .webp({ lossless: true, effort: 4 })
    .toBuffer();
}

async function saveSprite(entry, outputDirectory, shouldForce = force) {
  const outputPath = path.join(outputDirectory, `${entry.slug}.webp`);
  if (!shouldForce && await fileExists(outputPath)) return "cached";

  const response = await fetchWithRetry(entry.sourceUrl, { accept: "image/*" });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`Expected an image for ${entry.name}, received ${contentType || "unknown MIME"}`);
  }
  const input = Buffer.from(await response.arrayBuffer());
  if (input.length === 0) throw new Error(`Received an empty image for ${entry.name}`);

  const output = await normalizeSprite(input, entry);
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, output);
  await rename(temporaryPath, outputPath);
  return "downloaded";
}

function generatedSource(pokemon, trainers) {
  const pokemonRows = pokemon.map(({ dex, name, slug, pixelArt }) =>
    `  { dex: ${dex}, name: ${JSON.stringify(name)}, slug: ${JSON.stringify(slug)}, aliases: [], pixelArt: ${pixelArt}, asset: ${JSON.stringify(`/assets/character-sprites/pokemon/${slug}.webp`)} },`
  ).join("\n");
  const trainerRows = trainers.map(({ name, slug, aliases, source, pixelArt, asset }) =>
    `  { name: ${JSON.stringify(name)}, slug: ${JSON.stringify(slug)}, aliases: ${JSON.stringify(aliases ?? [])}, source: ${JSON.stringify(source)}, pixelArt: ${pixelArt}, asset: ${JSON.stringify(asset ?? "")} },`
  ).join("\n");
  return `// Generated by scripts/sync-character-sprites.mjs. Do not edit manually.\n\nexport const POKEMON_CHARACTER_SPRITES = [\n${pokemonRows}\n] as const;\n\nexport const TRAINER_CHARACTER_SPRITES = [\n${trainerRows}\n] as const;\n`;
}

function manifestSource(pokemon, trainers, trainerCategories) {
  return JSON.stringify({
    version: 2,
    generatedAt: new Date().toISOString(),
    outputSize: OUTPUT_SIZE,
    sources: {
      pokemon: POKEMONDB_SPRITES_URL,
      trainers: "https://archives.bulbagarden.net/wiki/Category:Trainer_sprites",
    },
    trainerCategories,
    counts: {
      pokemon: pokemon.length,
      trainers: trainers.length,
      trainerSprites: trainers.filter((entry) => Boolean(entry.asset)).length,
    },
    pokemon: pokemon.map((entry) => ({
      dex: entry.dex,
      name: entry.name,
      slug: entry.slug,
      asset: `/assets/character-sprites/pokemon/${entry.slug}.webp`,
      sourcePage: entry.sourcePage,
      sourceUrl: entry.sourceUrl,
      originalWidth: entry.originalWidth,
      originalHeight: entry.originalHeight,
      pixelArt: entry.pixelArt,
    })),
    trainers: trainers.map((entry) => ({
      ...(() => {
        const selectedAsset = entry.selectedAsset ?? entry;
        return {
          source: entry.source ?? selectedAsset.source ?? "none",
          sourceCategory: selectedAsset.category ?? entry.sourceCategory ?? null,
          sourcePage: selectedAsset.sourcePage ?? entry.sourcePage ?? null,
          sourceTitle: selectedAsset.sourceTitle ?? entry.sourceTitle ?? null,
          sourceUrl: selectedAsset.sourceUrl ?? entry.sourceUrl ?? null,
          sourceSha1: selectedAsset.sourceSha1 ?? entry.sourceSha1 ?? null,
          originalWidth: selectedAsset.originalWidth ?? entry.originalWidth ?? null,
          originalHeight: selectedAsset.originalHeight ?? entry.originalHeight ?? null,
        };
      })(),
      name: entry.name,
      slug: entry.slug,
      aliases: entry.aliases ?? [],
      asset: entry.asset ?? "",
      pixelArt: entry.pixelArt,
    })),
  }, null, 2) + "\n";
}

async function writeAtomic(filePath, contents) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, contents, "utf8");
  try {
    await rename(temporaryPath, filePath);
  } catch (error) {
    if (error?.code !== "EPERM" && error?.code !== "EEXIST") throw error;
    // Windows does not consistently replace an existing destination with rename.
    await writeFile(filePath, contents, "utf8");
    await rm(temporaryPath, { force: true });
  }
}

async function main() {
  await Promise.all([
    mkdir(POKEMON_OUTPUT, { recursive: true }),
    mkdir(TRAINER_OUTPUT, { recursive: true }),
    mkdir(path.dirname(GENERATED_OUTPUT), { recursive: true }),
  ]);

  const pokemonPromise = loadPokemonEntries();
  const trainerCatalogPromise = pokemonOnly
    ? readFile(MANIFEST_OUTPUT, "utf8").then((contents) => {
        const manifest = JSON.parse(contents);
        return {
          trainers: manifest.trainers,
          categories: manifest.trainerCategories ?? [TRAINER_ROOT_CATEGORY],
        };
      })
    : discoverTrainerCategories().then(async (categories) => {
        console.log(`Discovered ${categories.length} Trainer-sprite categories recursively.`);
        const trainerGroups = await mapWithConcurrency(categories, 3, loadTrainerCategory);
        const trainerAssets = trainerGroups.flat();
        if (process.env.SPRITE_SYNC_DEBUG === "1") {
          const names = TRAINER_IDENTITY_OVERRIDES.flatMap((entry) => entry.assetAliases)
            .map((entry) => normalizeKey(entry));
          console.log(
            trainerAssets
              .filter((entry) => names.some((name) => normalizeKey(entry.name).includes(name)))
              .map((entry) => `${entry.sourceTitle} -> ${entry.name} [${entry.source}]`)
              .join("\n")
          );
        }
        return { trainers: buildTrainerCatalog(trainerAssets), categories };
      });
  const [pokemon, trainerCatalog] = await Promise.all([pokemonPromise, trainerCatalogPromise]);
  const { trainers, categories: trainerCategories } = trainerCatalog;
  validateTrainerCatalog(trainers);
  const trainerAssets = trainers
    .filter((entry) => Boolean(entry.asset) && Boolean(entry.selectedAsset))
    .map((entry) => ({ ...entry.selectedAsset, name: entry.name, slug: entry.slug }));
  console.log(
    `Found ${pokemon.length} Pokémon, ${trainers.length} trainer identities, and ` +
    `${trainers.filter((entry) => Boolean(entry.asset)).length} canonical trainer sprites.`
  );

  let completed = 0;
  const total = pokemon.length + (pokemonOnly ? 0 : trainerAssets.length);
  const results = { downloaded: 0, cached: 0 };
  const onProgress = (result) => {
    completed += 1;
    results[result] += 1;
    if (completed % 100 === 0 || completed === total) {
      console.log(`Sprites ${completed}/${total}`);
    }
  };

  await mapWithConcurrency(pokemon, REQUEST_CONCURRENCY, async (entry) => {
    onProgress(await saveSprite(entry, POKEMON_OUTPUT));
  });
  if (!pokemonOnly) {
    await mapWithConcurrency(trainerAssets, REQUEST_CONCURRENCY, async (entry) => {
      onProgress(await saveSprite(entry, TRAINER_OUTPUT, forceTrainers));
    });
  }

  const removedPokemon = await cleanupStaleSprites(
    POKEMON_OUTPUT,
    pokemon.map((entry) => entry.slug)
  );
  const removedTrainers = pokemonOnly
    ? 0
    : await cleanupStaleSprites(
        TRAINER_OUTPUT,
        trainers.filter((entry) => Boolean(entry.asset)).map((entry) => entry.slug)
      );
  if (removedPokemon + removedTrainers > 0) {
    console.log(
      `Removed ${removedPokemon} stale Pokémon and ${removedTrainers} stale trainer sprites.`
    );
  }

  await Promise.all([
    writeAtomic(GENERATED_OUTPUT, generatedSource(pokemon, trainers)),
    writeAtomic(MANIFEST_OUTPUT, manifestSource(pokemon, trainers, trainerCategories)),
    writeAtomic(
      ATTRIBUTION_OUTPUT,
      [
        "Pokémon icon sprites imported from https://pokemondb.net/sprites.",
        "Pokémon images and names © Nintendo / Creatures Inc. / GAME FREAK inc.",
        "Trainer sprites imported from https://archives.bulbagarden.net/wiki/Category:Trainer_sprites.",
        "The Trainer sprites category and all namespace-14 subcategories are traversed recursively.",
        "One canonical sprite is selected per trainer; every selected file and source URL is in manifest.json.",
        "Trainer identities and aliases are catalogued separately from archive filenames; some identities use a monogram when no suitable source sprite exists.",
        "Bulbagarden Archives describes most Pokémon media as unlicensed fair-use material;",
        "the surrounding Archives content is available under CC BY-NC-SA 2.5:",
        "https://creativecommons.org/licenses/by-nc-sa/2.5/",
        "Files are locally normalized to transparent 64×64 lossless WebP for DustyCards UI use.",
        "",
      ].join("\n")
    ),
  ]);

  console.log(
    `Finished: ${results.downloaded} downloaded, ${results.cached} cached. ` +
    `Wrote ${path.relative(ROOT, GENERATED_OUTPUT)} and ${path.relative(ROOT, MANIFEST_OUTPUT)}.`
  );
}

await main();
