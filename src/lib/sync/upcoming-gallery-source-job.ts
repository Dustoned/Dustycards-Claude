import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import type { FirecrawlPageScrapeResult } from "@/lib/firecrawl";
import {
  getScrapeDoConfigSnapshot,
  scrapeScrapeDoPage,
} from "@/lib/scrapedo";
import {
  extractUpcomingRevealsFromScrape,
  type StoredUpcomingReveal,
} from "@/lib/upcoming-source-reveals";

const REFRESH_INTERVAL_MS = 12 * 60 * 60_000;
const DIRECT_TIMEOUT_MS = 18_000;
const DIRECT_MINIMUM_HTML_LENGTH = 12_000;

interface UpcomingGallerySourceDefinition {
  url: string;
  sourceType: "official" | "community";
  title: string;
  description: string;
  episodeName: string;
  releaseDate: string | null;
  minimumReveals: number;
  extractOfficialPortraits?: boolean;
  imagePathPattern?: RegExp;
}

export const UPCOMING_GALLERY_SOURCES: readonly UpcomingGallerySourceDefinition[] = [
  {
    url: "https://billsarchive.com/storm-emeralda",
    sourceType: "community",
    title: "Storm Emeralda Card Gallery and Delta Reign Preview",
    description: "Complete revealed-card gallery for Storm Emeralda and its English Delta Reign release.",
    episodeName: "Delta Reign / Storm Emeralda",
    releaseDate: "2026-11-06",
    minimumReveals: 40,
    imagePathPattern: /\/m6[-_]/i,
  },
  {
    url: "https://billsarchive.com/30th-celebration-cards.html",
    sourceType: "community",
    title: "30th Celebration Card List and Gallery",
    description: "Every currently confirmed 30th Celebration card in gallery order.",
    episodeName: "30th Celebration",
    releaseDate: "2026-09-16",
    minimumReveals: 20,
    imagePathPattern: /\/30th[-_]/i,
  },
  {
    url: "https://billsarchive.com/30th-celebration-promos.html",
    sourceType: "community",
    title: "30th Celebration Promo Card Gallery",
    description: "English MEP promo-card gallery for the upcoming 30th Celebration products.",
    episodeName: "30th Celebration Promos",
    releaseDate: "2026-09-16",
    minimumReveals: 10,
    imagePathPattern: /\/(?:MEP[_-]EN|30th_EN_101)/i,
  },
  {
    url: "https://billsarchive.com/30th-celebration-futuristic-rares.html",
    sourceType: "community",
    title: "30th Celebration Futuristic Rare Gallery",
    description: "Confirmed Futuristic rare card artwork from the 30th Celebration expansion.",
    episodeName: "30th Celebration",
    releaseDate: "2026-09-16",
    minimumReveals: 2,
    imagePathPattern: /\/30tha[-_]/i,
  },
  {
    url: "https://www.pokemon.com/us/news/pokemon-tcg-30th-celebration-product-showcase",
    sourceType: "official",
    title: "Pokemon TCG 30th Celebration Product Showcase",
    description: "Official product and promo artwork for the 30th Celebration release waves.",
    episodeName: "30th Celebration Promos",
    releaseDate: "2026-09-16",
    minimumReveals: 0,
    extractOfficialPortraits: true,
  },
  {
    url: "https://www.pokemon.com/us/pokemon-news/pikachu-promo-cards-revealed-ahead-of-the-2026-world-championships",
    sourceType: "official",
    title: "2026 Worlds Promo Cards Revealed",
    description: "Official Pokemon reveal for the 2026 Worlds and PokemonXP promo cards.",
    episodeName: "2026 Pokemon World Championships",
    releaseDate: "2026-08-28",
    minimumReveals: 0,
    extractOfficialPortraits: true,
  },
] as const;

const OFFICIAL_PROMO_NAMES: Readonly<Record<string, string>> = {
  "092": "2026 Paradise Resort",
  "093": "2026 Worlds Pikachu",
  "094": "Alolan Exeggutor",
  "095": "Lucario",
  "096": "Moltres",
  "097": "Articuno",
  "098": "Zapdos",
  "099": "Greninja ex",
  "100": "Sylveon ex",
  "101": "Nidorina",
  "102": "Victini",
  "103": "Zeraora",
  "104": "Mewtwo",
  "105": "Mew",
  "106": "Ditto",
  "107": "Pikachu ex Day",
  "108": "Espeon ex",
  "109": "Pikachu ex Night",
  "110": "Umbreon ex",
  "153": "PokemonXP Rayquaza",
};

export interface UpcomingGalleryRefreshResult {
  due: number;
  refreshed: number;
  direct: number;
  scrapeDoFallback: number;
  storedFallback: number;
  reveals: number;
  errors: string[];
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function compactText(value: string, maximum: number): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function htmlTitle(html: string): string | null {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? compactText(title, 500) : null;
}

function htmlLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    try {
      links.add(new URL(match[1], baseUrl).toString());
    } catch {
      // Ignore malformed links from third-party markup.
    }
  }
  return [...links];
}

async function scrapeDirect(url: string): Promise<FirecrawlPageScrapeResult> {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml;q=0.9",
      "user-agent": "DustyCards/3.9.3 release-intelligence (+https://dustycards.com)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(DIRECT_TIMEOUT_MS),
  });
  const html = await response.text();
  if (!response.ok) throw new Error(`Direct source returned ${response.status}.`);
  if (
    html.length < DIRECT_MINIMUM_HTML_LENGTH ||
    /(?:just a moment|verify you are human|access denied|captcha)/i.test(html.slice(0, 12_000))
  ) {
    throw new Error("Direct source returned a challenge or incomplete page.");
  }
  return {
    title: htmlTitle(html),
    sourceUrl: response.url || url,
    markdown: "",
    html,
    links: htmlLinks(html, response.url || url),
    creditsUsed: 0,
    metadata: { provider: "direct", fetchedAt: new Date().toISOString() },
  };
}

function htmlAttribute(tag: string, name: string): string | null {
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"))?.[2]?.trim() || null;
}

function responsiveImageUrl(tag: string, baseUrl: string): string | null {
  const src = htmlAttribute(tag, "src");
  const srcSet = htmlAttribute(tag, "srcset");
  const candidate = srcSet
    ?.split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean)
    .at(-1) ?? src;
  if (!candidate) return null;
  try {
    return new URL(candidate.replace(/&amp;/g, "&"), baseUrl).toString();
  } catch {
    return null;
  }
}

function sourceCardNumber(url: string): string | null {
  let filename = "";
  try {
    filename = new URL(url).pathname.split("/").at(-1) ?? "";
  } catch {
    return null;
  }
  const number = filename.match(/(?:^|[_-])MEP[_-]EN[_-](\d{2,3})(?:[_./-]|$)/i)?.[1]
    ?? filename.match(/^(?:m\d*|cel30)[_-](\d{2,3})(?:[_./-]|$)/i)?.[1]
    ?? null;
  return number ? number.padStart(3, "0") : null;
}

/** Official Pokemon articles often repeat a generic alt label for every media
 * slide. Portrait dimensions and stable MEP filenames preserve the card photo
 * even when the accessible label does not contain the Pokemon name. */
export function extractOfficialPokemonPortraitReveals(
  scrape: FirecrawlPageScrapeResult,
  definition: Pick<UpcomingGallerySourceDefinition, "episodeName" | "releaseDate">
): StoredUpcomingReveal[] {
  const reveals = new Map<string, StoredUpcomingReveal>();
  for (const match of scrape.html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const width = Number(htmlAttribute(tag, "width"));
    const height = Number(htmlAttribute(tag, "height"));
    const imageUrl = responsiveImageUrl(tag, scrape.sourceUrl);
    if (!imageUrl) continue;
    const cardNumber = sourceCardNumber(imageUrl);
    const isPortrait = width > 0 && height > width * 1.2;
    const alt = htmlAttribute(tag, "alt")?.replace(/\s+/g, " ").trim() ?? "";
    const explicitCardAlt = isPortrait
      && /\b(?:promo|card|MEP|Pok[eÃ©]mon|Pikachu|Rayquaza|Mewtwo|Mew|Lucario|Greninja|Sylveon|Victini|Zeraora|Ditto|Articuno|Zapdos|Moltres|Nidorina|Exeggutor)\b/i.test(alt)
      && !/\b(?:product showcase|collection|box|tin|poster|bundle|display|case|carton|playmat|sleeves?)\b/i.test(alt);
    if (!cardNumber && !explicitCardAlt) continue;
    const knownName = cardNumber ? OFFICIAL_PROMO_NAMES[cardNumber] : null;
    const name = knownName ?? (
      alt && !/product showcase|promo cards revealed/i.test(alt)
        ? alt.replace(/^Pok[eé]mon TCG:\s*/i, "").trim()
        : `Official promo artwork${cardNumber ? ` #${cardNumber}` : ""}`
    );
    if (!name || /shop pok[eé]mon center|trainer central|^home$/i.test(name)) continue;
    const key = cardNumber ?? name.toLowerCase();
    reveals.set(key, {
      name,
      imageUrl,
      cardNumber,
      rarity: "Official promo",
      episodeName: definition.episodeName,
      releaseDate: definition.releaseDate,
      status: "confirmed",
    });
  }
  return [...reveals.values()];
}

function normalizeReveals(
  scrape: FirecrawlPageScrapeResult,
  definition: UpcomingGallerySourceDefinition
): StoredUpcomingReveal[] {
  const extracted = definition.extractOfficialPortraits
    ? extractOfficialPokemonPortraitReveals(scrape, definition)
    : extractUpcomingRevealsFromScrape(scrape);
  const combined = definition.imagePathPattern
    ? extracted.filter((reveal) => definition.imagePathPattern!.test(reveal.imageUrl))
    : extracted;
  const reveals = new Map<string, StoredUpcomingReveal>();
  for (const reveal of combined) {
    const normalized = {
      ...reveal,
      episodeName: definition.episodeName || reveal.episodeName,
      releaseDate: definition.releaseDate ?? reveal.releaseDate,
      status: definition.sourceType === "official" ? "confirmed" as const : reveal.status,
    };
    const key = `${normalized.name.toLowerCase()}\u0000${normalized.cardNumber ?? ""}\u0000${normalized.imageUrl}`;
    reveals.set(key, normalized);
  }
  return [...reveals.values()];
}

async function storeSuccessfulSource(input: {
  definition: UpcomingGallerySourceDefinition;
  scrape: FirecrawlPageScrapeResult;
  reveals: StoredUpcomingReveal[];
  provider: "direct" | "scrapedo";
  now: Date;
}): Promise<void> {
  const canonicalUrl = input.definition.url;
  const metadataJson = JSON.stringify({
    provider: input.provider,
    fetchedAt: input.now.toISOString(),
    sourceUrl: input.scrape.sourceUrl,
    metadata: input.scrape.metadata,
    upcomingReveals: input.reveals,
  });
  const content = input.scrape.html || input.scrape.markdown;
  const data = {
    domain: new URL(canonicalUrl).hostname,
    game: "pokemon",
    source_type: input.definition.sourceType,
    title: input.scrape.title?.trim().slice(0, 500) || input.definition.title,
    description: input.definition.description,
    last_seen_at: input.now,
    last_scraped_at: input.now,
    scrape_status: input.reveals.length ? "matched" : "ignored",
    content_hash: content ? hash(content) : null,
    content_excerpt: content ? compactText(content, 1_200) : null,
    metadata_json: metadataJson,
    updated_at: input.now,
  };
  await db.externalCatalystSource.upsert({
    where: { canonical_url: canonicalUrl },
    create: {
      canonical_url: canonicalUrl,
      url_hash: hash(canonicalUrl),
      first_seen_at: input.now,
      created_at: input.now,
      ...data,
    },
    update: data,
  });
}

async function refreshSource(
  definition: UpcomingGallerySourceDefinition,
  now: Date
): Promise<{ provider: "direct" | "scrapedo" | "stored"; reveals: number; error: string | null }> {
  const existing = await db.externalCatalystSource.findUnique({
    where: { canonical_url: definition.url },
    select: { metadata_json: true },
  });
  const attempts: string[] = [];
  let scrape: FirecrawlPageScrapeResult | null = null;
  let provider: "direct" | "scrapedo" = "direct";
  try {
    scrape = await scrapeDirect(definition.url);
  } catch (error) {
    attempts.push(error instanceof Error ? error.message : String(error));
  }

  if (!scrape && getScrapeDoConfigSnapshot().configured) {
    try {
      provider = "scrapedo";
      scrape = await scrapeScrapeDoPage(definition.url, {
        output: "html",
        render: definition.sourceType === "official",
        providerTimeoutMs: 60_000,
        timeoutMs: 75_000,
      });
    } catch (error) {
      attempts.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (scrape) {
    const reveals = normalizeReveals(scrape, definition);
    if (reveals.length >= definition.minimumReveals) {
      await storeSuccessfulSource({ definition, scrape, reveals, provider, now });
      return { provider, reveals: reveals.length, error: null };
    }
    attempts.push(`Only ${reveals.length} of at least ${definition.minimumReveals} expected card images were found.`);
  }

  // Hard fallback: never replace or clear the last successful gallery when a
  // source, provider or parser is temporarily unavailable.
  if (existing?.metadata_json) {
    await db.externalCatalystSource.update({
      where: { canonical_url: definition.url },
      data: {
        last_seen_at: now,
        // Count the failed live attempt for cadence as well. The stored gallery
        // remains visible, while the scheduler avoids retrying a blocked source
        // on every tick and spending fallback credits repeatedly.
        last_scraped_at: now,
      },
    });
    return { provider: "stored", reveals: 0, error: attempts.join(" | ") || null };
  }
  return { provider: "stored", reveals: 0, error: attempts.join(" | ") || "No source provider succeeded." };
}

export async function refreshUpcomingGallerySources(
  options: { now?: Date; force?: boolean } = {}
): Promise<UpcomingGalleryRefreshResult> {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - REFRESH_INTERVAL_MS);
  const existing = await db.externalCatalystSource.findMany({
    where: { canonical_url: { in: UPCOMING_GALLERY_SOURCES.map((source) => source.url) } },
    select: { canonical_url: true, last_scraped_at: true },
  });
  const lastScrapedByUrl = new Map(existing.map((row) => [row.canonical_url, row.last_scraped_at]));
  const due = UPCOMING_GALLERY_SOURCES.filter((source) =>
    options.force || !lastScrapedByUrl.get(source.url) || lastScrapedByUrl.get(source.url)! < cutoff
  );
  const result: UpcomingGalleryRefreshResult = {
    due: due.length,
    refreshed: 0,
    direct: 0,
    scrapeDoFallback: 0,
    storedFallback: 0,
    reveals: 0,
    errors: [],
  };
  for (const definition of due) {
    const refreshed = await refreshSource(definition, now);
    if (refreshed.provider === "direct") result.direct += 1;
    else if (refreshed.provider === "scrapedo") result.scrapeDoFallback += 1;
    else result.storedFallback += 1;
    if (refreshed.provider !== "stored") result.refreshed += 1;
    result.reveals += refreshed.reveals;
    if (refreshed.error) result.errors.push(`${definition.url}: ${refreshed.error}`);
  }
  return result;
}

let activeRefresh: Promise<UpcomingGalleryRefreshResult> | null = null;

export function maybeRunUpcomingGallerySourceJob(
  options: { now?: Date; skip?: boolean } = {}
): void {
  if (options.skip || activeRefresh) return;
  activeRefresh = refreshUpcomingGallerySources({ now: options.now })
    .catch((error: unknown) => ({
      due: 0,
      refreshed: 0,
      direct: 0,
      scrapeDoFallback: 0,
      storedFallback: 0,
      reveals: 0,
      errors: [error instanceof Error ? error.message : String(error)],
    }))
    .finally(() => {
      activeRefresh = null;
    });
}
