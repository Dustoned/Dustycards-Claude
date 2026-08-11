import type { FirecrawlPageScrapeResult } from "@/lib/firecrawl";

export interface StoredUpcomingReveal {
  name: string;
  imageUrl: string;
  cardNumber: string | null;
  rarity: string | null;
  episodeName: string | null;
  releaseDate: string | null;
  status: "confirmed" | "reveal" | "leak";
  libraryMatch: StoredUpcomingLibraryMatch | null;
  libraryMatchCheckedAt: string | null;
  libraryMatchVersion?: number;
}

export interface StoredUpcomingLibraryMatch {
  cardId: string;
  episodeId: string;
  episodeName: string;
  episodeCode: string | null;
  method: "set-number" | "artwork";
  confidence: number;
}

const PRODUCT_IMAGE_PATTERN =
  /\b(?:booster(?:\s+(?:box|bundle|pack))?|elite trainer box|collection box|product showcase|display|case|carton|tin|poster|sticker sheet|sculpted figure|figure collection|statue|logo|banner|playmat|deck box|sleeves?|ebay)\b/i;
const CARD_IMAGE_PATTERN =
  /\b(?:card|promo|full art|art rare|illustration rare|special art rare|secret rare|ultra rare|mega hyper rare|\bMUR\b|\bSAR\b|\bSIR\b|\bSR\b|\bAR\b|leak(?:ed)?)\b/i;
const IMAGE_EXTENSION_PATTERN = /\.(?:avif|gif|jpe?g|png|webp)(?:\?|$)/i;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)(?:\s+["'][^"']*["'])?\)/gi;
const HTML_IMAGE_PATTERN = /<img\b[^>]*>/gi;
function isHiddenUpcomingGroup(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("30th celebration") && /\bpromos?\b/.test(normalized);
}

function normalizeImageUrl(value: string): string | null {
  const candidate = value.trim().replace(/&amp;/g, "&");
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol) || !IMAGE_EXTENSION_PATTERN.test(url.href)) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function cleanImageAlt(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/^image\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readHtmlAttribute(tag: string, attribute: string): string | null {
  const match = tag.match(new RegExp(`\\b${attribute}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match?.[2]?.trim() || null;
}

function imageCandidates(scrape: FirecrawlPageScrapeResult): Array<{ alt: string; url: string }> {
  const candidates: Array<{ alt: string; url: string }> = [];
  for (const match of scrape.markdown.matchAll(MARKDOWN_IMAGE_PATTERN)) {
    candidates.push({ alt: match[1] ?? "", url: match[2] ?? "" });
  }
  for (const tag of scrape.html.match(HTML_IMAGE_PATTERN) ?? []) {
    const url = readHtmlAttribute(tag, "src");
    if (!url) continue;
    candidates.push({ alt: readHtmlAttribute(tag, "alt") ?? "", url });
  }
  return candidates;
}

function revealFromImage(altValue: string, urlValue: string): StoredUpcomingReveal | null {
  const alt = cleanImageAlt(altValue);
  const imageUrl = normalizeImageUrl(urlValue);
  if (!alt || !imageUrl || PRODUCT_IMAGE_PATTERN.test(alt)) return null;

  const altNumberMatch = alt.match(/(?:#|\b)(\d{2,3}(?:\/\d{2,3})?)(?:\b|$)/);
  const imageFilename = (() => {
    try {
      return new URL(imageUrl).pathname.split("/").at(-1) ?? "";
    } catch {
      return "";
    }
  })();
  const filenameNumberMatch = imageFilename.match(
    /(?:^|[_-])(?:MEP[_-]EN[_-]|m\d*[_-])?(\d{2,3})(?:[_./-]|$)/i
  );
  const hasNumber = Boolean(altNumberMatch || filenameNumberMatch);
  if (!hasNumber && !CARD_IMAGE_PATTERN.test(alt)) return null;

  const parts = alt.split(/\s+(?:—|–|\|)\s+/).map((part) => part.trim()).filter(Boolean);
  let name = parts[0] ?? alt;
  name = name.replace(/\s+(?:promo\s+)?card(?:\s+featuring.*)?$/i, "").trim();
  name = name.replace(
    /[\s-]+(?:Mega Hyper Rare|Special Art Rare|Special Illustration Rare|Illustration Rare|Secret Rare|Ultra Rare|Full Art|Art Rare|MUR|SAR|SIR|SR|AR)$/i,
    ""
  ).trim();
  if (name.length < 2 || PRODUCT_IMAGE_PATTERN.test(name)) return null;

  const rarityMatch = alt.match(/\b(Mega Hyper Rare|Special Art Rare|Special Illustration Rare|Illustration Rare|Secret Rare|Ultra Rare|Full Art|Art Rare|MUR|SAR|SIR|SR|AR)\b/i);
  const episodeName = parts.length > 1
    ? parts
        .slice(1)
        .map((part) => part
          .replace(/\b(?:leak(?:ed)?|rumou?r|full art|mega hyper rare|special art rare|special illustration rare|illustration rare|secret rare|ultra rare|art rare|MUR|SAR|SIR|SR|AR)\b/gi, "")
          .replace(/\b\d{2,3}(?:\/\d{2,3})?\b/g, "")
          .replace(/\s+/g, " ")
          .trim())
        .find((part) => part.length >= 3) ?? null
    : null;

  return {
    name,
    imageUrl,
    cardNumber: altNumberMatch?.[1] ?? filenameNumberMatch?.[1] ?? null,
    rarity: rarityMatch?.[1] ?? null,
    episodeName,
    releaseDate: null,
    status: /\b(?:leak(?:ed)?|rumou?r)\b/i.test(alt) ? "leak" : "reveal",
    libraryMatch: null,
    libraryMatchCheckedAt: null,
    libraryMatchVersion: 0,
  };
}

/**
 * Pull card-shaped reveal images out of an already budgeted source scrape.
 * The result is stored with the source, so Upcoming never scrapes a website
 * during a page request and can show a reveal before a local Card match exists.
 */
export function extractUpcomingRevealsFromScrape(
  scrape: FirecrawlPageScrapeResult,
  limit = 320
): StoredUpcomingReveal[] {
  const reveals = new Map<string, StoredUpcomingReveal>();
  for (const candidate of imageCandidates(scrape)) {
    const reveal = revealFromImage(candidate.alt, candidate.url);
    if (!reveal) continue;
    const key = `${reveal.name.toLowerCase()}\u0000${reveal.cardNumber ?? ""}\u0000${reveal.imageUrl}`;
    if (!reveals.has(key)) reveals.set(key, reveal);
    if (reveals.size >= limit) break;
  }
  return [...reveals.values()];
}

export function readStoredUpcomingReveals(
  metadataJson: string | null,
  options: { includeHiddenGroups?: boolean } = {}
): StoredUpcomingReveal[] {
  if (!metadataJson) return [];
  try {
    const parsed = JSON.parse(metadataJson) as { upcomingReveals?: unknown };
    if (!Array.isArray(parsed.upcomingReveals)) return [];
    return parsed.upcomingReveals.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const row = value as Record<string, unknown>;
      const name = typeof row.name === "string" ? row.name.trim() : "";
      const imageUrl = typeof row.imageUrl === "string" ? normalizeImageUrl(row.imageUrl) : null;
      if (!name || !imageUrl) return [];
      const episodeName = typeof row.episodeName === "string" && row.episodeName.trim()
        ? row.episodeName.trim()
        : null;
      if (
        !options.includeHiddenGroups &&
        episodeName &&
        isHiddenUpcomingGroup(episodeName)
      ) return [];
      const status = row.status === "confirmed" || row.status === "leak" ? row.status : "reveal";
      const rawMatch = row.libraryMatch && typeof row.libraryMatch === "object"
        ? row.libraryMatch as Record<string, unknown>
        : null;
      const libraryMatch = rawMatch
        && typeof rawMatch.cardId === "string"
        && typeof rawMatch.episodeId === "string"
        && typeof rawMatch.episodeName === "string"
        && (rawMatch.method === "set-number" || rawMatch.method === "artwork")
        ? {
            cardId: rawMatch.cardId,
            episodeId: rawMatch.episodeId,
            episodeName: rawMatch.episodeName,
            episodeCode: typeof rawMatch.episodeCode === "string" ? rawMatch.episodeCode : null,
            method: rawMatch.method,
            confidence: typeof rawMatch.confidence === "number" ? rawMatch.confidence : 1,
          } satisfies StoredUpcomingLibraryMatch
        : null;
      return [{
        name,
        imageUrl,
        cardNumber: typeof row.cardNumber === "string" && row.cardNumber.trim() ? row.cardNumber.trim() : null,
        rarity: typeof row.rarity === "string" && row.rarity.trim() ? row.rarity.trim() : null,
        episodeName,
        releaseDate: typeof row.releaseDate === "string" && row.releaseDate.trim() ? row.releaseDate.trim() : null,
        status,
        libraryMatch,
        libraryMatchCheckedAt: typeof row.libraryMatchCheckedAt === "string" && row.libraryMatchCheckedAt.trim()
          ? row.libraryMatchCheckedAt.trim()
          : null,
        libraryMatchVersion: typeof row.libraryMatchVersion === "number"
          ? row.libraryMatchVersion
          : 0,
      } satisfies StoredUpcomingReveal];
    });
  } catch {
    return [];
  }
}

/** Internal/background readers must retain every stored row. UI callers use
 * `readStoredUpcomingReveals` so retired galleries can stay hidden without
 * being deleted from source metadata or its release safeguards. */
export function readAllStoredUpcomingReveals(
  metadataJson: string | null
): StoredUpcomingReveal[] {
  return readStoredUpcomingReveals(metadataJson, { includeHiddenGroups: true });
}
