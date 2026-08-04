/**
 * Deterministic, side-effect-free helpers for the external signal radar.
 *
 * This module deliberately does not fetch, persist, or schedule anything. It
 * only validates sources, classifies already-fetched text, maps that text to
 * radar candidates, and prepares a tightly bounded set of search queries.
 */

export type ExternalRadarGame = "pokemon" | "one-piece";
export type CatalystSourceKind = "official" | "community" | "social";
export type CatalystKind =
  | "support"
  | "product"
  | "reveal"
  | "localization"
  | "reprint"
  | "ban"
  | "rotation"
  | "hype";
export type CatalystDirection = "positive" | "negative" | "neutral";
export type CatalystMatchReason = "name" | "alias" | "set-name" | "set-code";

export interface TrustedCatalystDomain {
  domain: string;
  sourceKind: CatalystSourceKind;
  games: readonly ExternalRadarGame[];
  /** Source-level credibility on a 0..1 scale. */
  credibility: number;
}

export const TRUSTED_CATALYST_DOMAINS: readonly TrustedCatalystDomain[] = [
  { domain: "pokemon.com", sourceKind: "official", games: ["pokemon"], credibility: 1 },
  {
    domain: "pokemon-card.com",
    sourceKind: "official",
    games: ["pokemon"],
    credibility: 0.98,
  },
  {
    domain: "pokemoncenter.com",
    sourceKind: "official",
    games: ["pokemon"],
    credibility: 0.96,
  },
  {
    domain: "onepiece-cardgame.com",
    sourceKind: "official",
    games: ["one-piece"],
    credibility: 1,
  },
  {
    domain: "carddass.com",
    sourceKind: "official",
    games: ["one-piece"],
    credibility: 0.96,
  },
  {
    domain: "limitlesstcg.com",
    sourceKind: "community",
    games: ["pokemon", "one-piece"],
    credibility: 0.86,
  },
  {
    domain: "pokebeach.com",
    sourceKind: "community",
    games: ["pokemon"],
    credibility: 0.8,
  },
  {
    domain: "billsarchive.com",
    sourceKind: "community",
    games: ["pokemon"],
    // Strong editorial/release-calendar source, but independent rather than official.
    credibility: 0.8,
  },
  {
    domain: "vice.com",
    sourceKind: "community",
    games: ["pokemon"],
    credibility: 0.78,
  },
  {
    domain: "pokeguardian.com",
    sourceKind: "community",
    games: ["pokemon"],
    credibility: 0.78,
  },
  {
    domain: "justinbasil.com",
    sourceKind: "community",
    games: ["pokemon"],
    credibility: 0.78,
  },
  {
    domain: "onepiecetopdecks.com",
    sourceKind: "community",
    games: ["one-piece"],
    credibility: 0.78,
  },
  {
    domain: "icv2.com",
    sourceKind: "community",
    games: ["pokemon", "one-piece"],
    credibility: 0.84,
  },
  {
    domain: "pokellector.com",
    sourceKind: "community",
    games: ["pokemon"],
    credibility: 0.74,
  },
  {
    domain: "pokemonblog.com",
    sourceKind: "community",
    games: ["pokemon"],
    credibility: 0.7,
  },
  {
    domain: "elitefourum.com",
    sourceKind: "community",
    games: ["pokemon"],
    credibility: 0.68,
  },
  {
    domain: "egmanevents.com",
    sourceKind: "community",
    games: ["one-piece"],
    credibility: 0.76,
  },
  {
    domain: "onepiece.gg",
    sourceKind: "community",
    games: ["one-piece"],
    credibility: 0.72,
  },
  {
    domain: "gumgum.gg",
    sourceKind: "community",
    games: ["one-piece"],
    credibility: 0.7,
  },
  {
    domain: "tcgplayer.com",
    sourceKind: "community",
    games: ["pokemon", "one-piece"],
    credibility: 0.72,
  },
  {
    domain: "cardmarket.com",
    sourceKind: "community",
    games: ["pokemon", "one-piece"],
    credibility: 0.72,
  },
  {
    domain: "reddit.com",
    sourceKind: "social",
    games: ["pokemon", "one-piece"],
    credibility: 0.48,
  },
  {
    domain: "youtube.com",
    sourceKind: "social",
    games: ["pokemon", "one-piece"],
    credibility: 0.44,
  },
  {
    domain: "youtu.be",
    sourceKind: "social",
    games: ["pokemon", "one-piece"],
    credibility: 0.44,
  },
  {
    domain: "x.com",
    sourceKind: "social",
    games: ["pokemon", "one-piece"],
    credibility: 0.38,
  },
  {
    domain: "twitter.com",
    sourceKind: "social",
    games: ["pokemon", "one-piece"],
    credibility: 0.38,
  },
] as const;

export interface CatalystDocumentInput {
  url: string;
  game?: ExternalRadarGame | null;
  title?: string | null;
  description?: string | null;
  body?: string | null;
  publishedAt?: string | null;
}

export interface CatalystClassification {
  kind: CatalystKind;
  /** Directional catalyst strength on a -1..1 scale. */
  signedImpact: number;
  direction: CatalystDirection;
  /** Source credibility on a 0..1 scale. */
  credibility: number;
  matchedTerms: string[];
}

export interface ClassifiedCatalystDocument {
  url: string;
  game: ExternalRadarGame | null;
  title: string;
  description: string;
  body: string;
  publishedAt: string | null;
  sourceDomain: string;
  sourceKind: CatalystSourceKind;
  sourceCredibility: number;
  classifications: CatalystClassification[];
}

export interface CatalystCandidate {
  cardId: string;
  game: ExternalRadarGame;
  name: string;
  setName?: string | null;
  setCode?: string | null;
  aliases?: readonly string[] | null;
  rank?: number | null;
  externalScore?: number | null;
}

export interface CatalystCardMatch {
  cardId: string;
  cardName: string;
  game: ExternalRadarGame;
  url: string;
  title: string;
  sourceDomain: string;
  sourceKind: CatalystSourceKind;
  sourceCredibility: number;
  publishedAt: string | null;
  matchedBy: CatalystMatchReason[];
  classifications: CatalystClassification[];
}

export const MAX_CATALYST_SEARCH_QUERIES = 14;
export const MAX_CATALYST_SEARCH_QUERY_LENGTH = 220;

export interface CatalystSearchQuery {
  game: ExternalRadarGame;
  cardId: string;
  candidateName: string;
  mode: "set-intelligence" | "candidate";
  topic: "news" | "general";
  query: string;
  allowedDomains: string[];
}

export interface CatalystWatchTopic {
  game: ExternalRadarGame;
  episodeId?: string | null;
  name: string;
  setCode?: string | null;
  focus?: "release" | "lifecycle";
}

interface CatalystPattern {
  phrase: string;
  impact: number;
}

const CATALYST_KIND_ORDER: readonly CatalystKind[] = [
  "support",
  "reveal",
  "localization",
  "product",
  "reprint",
  "ban",
  "rotation",
  "hype",
];

const CATALYST_PATTERNS: Record<CatalystKind, readonly CatalystPattern[]> = {
  support: [
    { phrase: "major new support", impact: 0.9 },
    { phrase: "new support cards", impact: 0.82 },
    { phrase: "new support card", impact: 0.78 },
    { phrase: "archetype support", impact: 0.72 },
    { phrase: "receives support", impact: 0.7 },
    { phrase: "gets support", impact: 0.65 },
    { phrase: "new engine", impact: 0.62 },
    { phrase: "new synergy", impact: 0.58 },
    { phrase: "direct support", impact: 0.7 },
  ],
  reveal: [
    { phrase: "chase card revealed", impact: 0.96 },
    { phrase: "leaked booklet", impact: 0.95 },
    { phrase: "booklet leaked", impact: 0.95 },
    { phrase: "card list leaked", impact: 0.92 },
    { phrase: "card list leaks", impact: 0.92 },
    { phrase: "leaked card list", impact: 0.92 },
    { phrase: "set list leaked", impact: 0.92 },
    { phrase: "set list leaks", impact: 0.92 },
    { phrase: "leaked set list", impact: 0.92 },
    { phrase: "cards have reportedly leaked", impact: 0.9 },
    { phrase: "cards reportedly leaked", impact: 0.88 },
    { phrase: "card list revealed", impact: 0.88 },
    { phrase: "set list revealed", impact: 0.88 },
    { phrase: "new cards revealed", impact: 0.82 },
    { phrase: "new card revealed", impact: 0.8 },
    { phrase: "card reveal", impact: 0.74 },
    { phrase: "set booklet", impact: 0.72 },
    { phrase: "first look", impact: 0.48 },
  ],
  localization: [
    { phrase: "english set combines", impact: 0.92 },
    { phrase: "international set combines", impact: 0.92 },
    { phrase: "coming to english", impact: 0.86 },
    { phrase: "released in english", impact: 0.78 },
    { phrase: "english release", impact: 0.66 },
    { phrase: "international release", impact: 0.66 },
    { phrase: "japanese sets", impact: 0.54 },
    { phrase: "japanese set", impact: 0.46 },
  ],
  product: [
    { phrase: "new product announced", impact: 0.7 },
    { phrase: "product announcement", impact: 0.65 },
    { phrase: "product reveal", impact: 0.62 },
    { phrase: "products revealed", impact: 0.62 },
    { phrase: "products just revealed", impact: 0.66 },
    { phrase: "product lineup revealed", impact: 0.66 },
    { phrase: "promos revealed", impact: 0.58 },
    { phrase: "new expansion", impact: 0.62 },
    { phrase: "new booster set", impact: 0.62 },
    { phrase: "new set", impact: 0.5 },
    { phrase: "starter deck", impact: 0.52 },
    { phrase: "structure deck", impact: 0.52 },
    { phrase: "collection box", impact: 0.42 },
    { phrase: "promo card", impact: 0.38 },
    { phrase: "promotional card", impact: 0.38 },
    { phrase: "release date", impact: 0.28 },
  ],
  reprint: [
    { phrase: "confirmed no reprint", impact: 0.9 },
    { phrase: "no reprint planned", impact: 0.82 },
    { phrase: "will not be reprinted", impact: 0.8 },
    { phrase: "out of print", impact: 0.78 },
    { phrase: "print run ended", impact: 0.72 },
    { phrase: "discontinued", impact: 0.7 },
    { phrase: "mass reprint", impact: -0.92 },
    { phrase: "reprint announced", impact: -0.82 },
    { phrase: "additional print run", impact: -0.78 },
    { phrase: "increased production", impact: -0.72 },
    { phrase: "back in stock", impact: -0.62 },
    { phrase: "restocked", impact: -0.62 },
    { phrase: "restock", impact: -0.58 },
    { phrase: "reprinted", impact: -0.72 },
    { phrase: "reprinting", impact: -0.7 },
    { phrase: "reprint", impact: -0.66 },
  ],
  ban: [
    { phrase: "no changes to the ban list", impact: 0 },
    { phrase: "no ban announced", impact: 0 },
    { phrase: "restriction lifted", impact: 0.9 },
    { phrase: "ban lifted", impact: 0.9 },
    { phrase: "legal again", impact: 0.82 },
    { phrase: "unbanned", impact: 0.9 },
    { phrase: "emergency ban", impact: -1 },
    { phrase: "banned", impact: -0.95 },
    { phrase: "prohibited", impact: -0.92 },
    { phrase: "suspended", impact: -0.82 },
    { phrase: "restricted to one", impact: -0.78 },
    { phrase: "new restriction", impact: -0.72 },
    { phrase: "ban list", impact: -0.42 },
  ],
  rotation: [
    { phrase: "survives rotation", impact: 0.78 },
    { phrase: "rotation proof", impact: 0.72 },
    { phrase: "remains standard legal", impact: 0.72 },
    { phrase: "stays legal", impact: 0.65 },
    { phrase: "no longer standard legal", impact: -0.9 },
    { phrase: "standard legality ends", impact: -0.86 },
    { phrase: "leaves standard", impact: -0.82 },
    { phrase: "rotates out", impact: -0.86 },
    { phrase: "rotation", impact: -0.38 },
  ],
  hype: [
    { phrase: "hype is fading", impact: -0.72 },
    { phrase: "cooling demand", impact: -0.68 },
    { phrase: "demand falling", impact: -0.68 },
    { phrase: "losing interest", impact: -0.58 },
    { phrase: "sell off", impact: -0.58 },
    { phrase: "overhyped", impact: -0.45 },
    { phrase: "surging demand", impact: 0.82 },
    { phrase: "bought out", impact: 0.82 },
    { phrase: "buyout", impact: 0.78 },
    { phrase: "going viral", impact: 0.72 },
    { phrase: "viral", impact: 0.66 },
    { phrase: "breakout card", impact: 0.65 },
    { phrase: "gaining attention", impact: 0.58 },
    { phrase: "high demand", impact: 0.58 },
    { phrase: "chase card", impact: 0.52 },
    { phrase: "trending", impact: 0.5 },
  ],
};

const TRACKING_QUERY_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "ref",
  "referrer",
  "source",
]);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function isDomainOrSubdomain(hostname: string, allowedDomain: string): boolean {
  return hostname === allowedDomain || hostname.endsWith(`.${allowedDomain}`);
}

function safeUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getTrustedCatalystSource(
  url: string,
  game?: ExternalRadarGame | null
): TrustedCatalystDomain | null {
  const parsed = safeUrl(url);
  if (!parsed) return null;
  const hostname = normalizeHostname(parsed.hostname);

  const match = TRUSTED_CATALYST_DOMAINS.find(
    (entry) =>
      isDomainOrSubdomain(hostname, entry.domain) &&
      (!game || entry.games.includes(game))
  );

  return match ? { ...match, games: [...match.games] } : null;
}

export function getTrustedCatalystDomains(game: ExternalRadarGame): string[] {
  return TRUSTED_CATALYST_DOMAINS.filter((entry) => entry.games.includes(game)).map(
    (entry) => entry.domain
  );
}

export function normalizeCatalystUrl(value: string): string | null {
  const parsed = safeUrl(value);
  if (!parsed) return null;

  parsed.protocol = "https:";
  parsed.hostname = normalizeHostname(parsed.hostname);
  parsed.hash = "";
  parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/");
  if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");

  const keptParameters = [...parsed.searchParams.entries()]
    .filter(([key]) => {
      const normalizedKey = key.toLowerCase();
      return !normalizedKey.startsWith("utm_") && !TRACKING_QUERY_PARAMETERS.has(normalizedKey);
    })
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
    );

  parsed.search = "";
  for (const [key, value] of keptParameters) parsed.searchParams.append(key, value);
  return parsed.toString();
}

/** Normalizes prose for exact token-sequence comparisons, not fuzzy matching. */
export function normalizeCatalystText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toTokens(value: string | null | undefined): string[] {
  const normalized = normalizeCatalystText(value);
  return normalized ? normalized.split(" ") : [];
}

function findTokenSequence(tokens: readonly string[], phraseTokens: readonly string[]): number {
  if (!phraseTokens.length || phraseTokens.length > tokens.length) return -1;
  for (let index = 0; index <= tokens.length - phraseTokens.length; index += 1) {
    if (phraseTokens.every((token, offset) => tokens[index + offset] === token)) return index;
  }
  return -1;
}

function selectNonOverlappingPatternHits(
  text: string,
  patterns: readonly CatalystPattern[]
): CatalystPattern[] {
  const tokens = toTokens(text);
  if (!tokens.length) return [];

  const possibleHits = patterns
    .map((pattern, order) => {
      const phraseTokens = toTokens(pattern.phrase);
      return {
        pattern,
        order,
        start: findTokenSequence(tokens, phraseTokens),
        length: phraseTokens.length,
      };
    })
    .filter((hit) => hit.start >= 0)
    .sort(
      (left, right) =>
        right.length - left.length ||
        left.start - right.start ||
        left.order - right.order
    );

  const occupied = new Set<number>();
  const selected: typeof possibleHits = [];
  for (const hit of possibleHits) {
    const positions = Array.from({ length: hit.length }, (_, offset) => hit.start + offset);
    if (positions.some((position) => occupied.has(position))) continue;
    positions.forEach((position) => occupied.add(position));
    selected.push(hit);
  }

  return selected
    .sort((left, right) => left.start - right.start || left.order - right.order)
    .map((hit) => hit.pattern);
}

function directionForImpact(signedImpact: number): CatalystDirection {
  if (signedImpact > 0.02) return "positive";
  if (signedImpact < -0.02) return "negative";
  return "neutral";
}

export function classifyCatalystDocument(
  input: CatalystDocumentInput
): ClassifiedCatalystDocument | null {
  const source = getTrustedCatalystSource(input.url, input.game);
  const normalizedUrl = normalizeCatalystUrl(input.url);
  if (!source || !normalizedUrl) return null;

  // Bound untrusted scrape payloads before any classification work.
  const title = String(input.title ?? "").slice(0, 500);
  const description = String(input.description ?? "").slice(0, 1_500);
  const body = String(input.body ?? "").slice(0, 30_000);
  const fields = [
    { text: title, weight: 1 },
    { text: description, weight: 0.65 },
    { text: body, weight: 0.3 },
  ] as const;

  const classifications: CatalystClassification[] = [];
  for (const kind of CATALYST_KIND_ORDER) {
    let signedImpact = 0;
    const matchedTerms = new Set<string>();

    for (const field of fields) {
      for (const hit of selectNonOverlappingPatternHits(field.text, CATALYST_PATTERNS[kind])) {
        signedImpact += hit.impact * field.weight;
        matchedTerms.add(hit.phrase);
      }
    }

    if (!matchedTerms.size) continue;
    signedImpact = round(clamp(signedImpact, -1, 1));
    classifications.push({
      kind,
      signedImpact,
      direction: directionForImpact(signedImpact),
      credibility: source.credibility,
      matchedTerms: [...matchedTerms],
    });
  }

  if (!classifications.length) return null;
  classifications.sort(
    (left, right) =>
      Math.abs(right.signedImpact) - Math.abs(left.signedImpact) ||
      CATALYST_KIND_ORDER.indexOf(left.kind) - CATALYST_KIND_ORDER.indexOf(right.kind)
  );

  return {
    url: normalizedUrl,
    game: input.game ?? null,
    title,
    description,
    body,
    publishedAt: input.publishedAt ?? null,
    sourceDomain: source.domain,
    sourceKind: source.sourceKind,
    sourceCredibility: source.credibility,
    classifications,
  };
}

function normalizeSetCode(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function containsExactSetCode(text: string, rawSetCode: string | null | undefined): boolean {
  const setCode = normalizeSetCode(rawSetCode);
  if (setCode.length < 3) return false;
  const escaped = setCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`(^|[^A-Z0-9])${escaped}(?=$|[^A-Z0-9])`, /\d/.test(setCode) ? "i" : "");
  return expression.test(text);
}

function isUsableCandidatePhrase(value: string): boolean {
  const tokens = toTokens(value);
  return tokens.length > 1 || (tokens[0]?.length ?? 0) >= 3;
}

function combinedDocumentText(input: CatalystDocumentInput): string {
  return [input.title, input.description, input.body].filter(Boolean).join("\n");
}

function containsNormalizedPhrase(
  normalizedDocument: string,
  documentTokens: ReadonlySet<string>,
  rawPhrase: string
): boolean {
  const phrase = normalizeCatalystText(rawPhrase);
  if (!phrase) return false;
  const firstToken = phrase.split(" ", 1)[0];
  if (!firstToken || !documentTokens.has(firstToken)) return false;
  return ` ${normalizedDocument} `.includes(` ${phrase} `);
}

export function analyzeCatalystDocument(
  input: CatalystDocumentInput,
  candidates: readonly CatalystCandidate[]
): CatalystCardMatch[] {
  const classified = classifyCatalystDocument(input);
  if (!classified) return [];

  const prose = combinedDocumentText(input);
  const normalizedProse = normalizeCatalystText(prose);
  const documentTokens = new Set(normalizedProse.split(" ").filter(Boolean));
  const matches: CatalystCardMatch[] = [];
  for (const candidate of candidates) {
    if (classified.game && candidate.game !== classified.game) continue;
    const matchedBy = new Set<CatalystMatchReason>();

    if (
      isUsableCandidatePhrase(candidate.name) &&
      containsNormalizedPhrase(normalizedProse, documentTokens, candidate.name)
    ) {
      matchedBy.add("name");
    }
    for (const alias of candidate.aliases ?? []) {
      if (
        isUsableCandidatePhrase(alias) &&
        containsNormalizedPhrase(normalizedProse, documentTokens, alias)
      ) {
        matchedBy.add("alias");
      }
    }
    if (
      candidate.setName &&
      isUsableCandidatePhrase(candidate.setName) &&
      containsNormalizedPhrase(normalizedProse, documentTokens, candidate.setName)
    ) {
      matchedBy.add("set-name");
    }
    if (containsExactSetCode(prose, candidate.setCode)) matchedBy.add("set-code");
    if (!matchedBy.size) continue;

    matches.push({
      cardId: candidate.cardId,
      cardName: candidate.name,
      game: candidate.game,
      url: classified.url,
      title: classified.title,
      sourceDomain: classified.sourceDomain,
      sourceKind: classified.sourceKind,
      sourceCredibility: classified.sourceCredibility,
      publishedAt: classified.publishedAt,
      matchedBy: [...matchedBy],
      classifications: classified.classifications,
    });
  }

  return matches;
}

function matchQuality(match: CatalystCardMatch): number {
  return Math.max(
    0,
    ...match.classifications.map(
      (classification) => Math.abs(classification.signedImpact) * classification.credibility
    )
  );
}

export function dedupeCatalystCardMatches(
  matches: readonly CatalystCardMatch[]
): CatalystCardMatch[] {
  const byUrlAndCard = new Map<string, CatalystCardMatch>();

  for (const match of matches) {
    const normalizedUrl = normalizeCatalystUrl(match.url);
    if (!normalizedUrl) continue;
    const normalizedMatch = { ...match, url: normalizedUrl };
    const key = `${normalizedUrl}\u0000${match.cardId}`;
    const existing = byUrlAndCard.get(key);

    if (!existing || matchQuality(normalizedMatch) > matchQuality(existing)) {
      byUrlAndCard.set(key, normalizedMatch);
    }
  }

  return [...byUrlAndCard.values()];
}

function compareSearchCandidates(left: CatalystCandidate, right: CatalystCandidate): number {
  const leftRank = Number.isFinite(left.rank) ? Number(left.rank) : Number.POSITIVE_INFINITY;
  const rightRank = Number.isFinite(right.rank) ? Number(right.rank) : Number.POSITIVE_INFINITY;
  if (leftRank !== rightRank) return leftRank - rightRank;

  const leftScore = Number.isFinite(left.externalScore) ? Number(left.externalScore) : -1;
  const rightScore = Number.isFinite(right.externalScore) ? Number(right.externalScore) : -1;
  return (
    rightScore - leftScore ||
    normalizeCatalystText(left.name).localeCompare(normalizeCatalystText(right.name)) ||
    left.cardId.localeCompare(right.cardId)
  );
}

function sanitizeSearchPhrase(value: string): string {
  const normalized = value
    .replace(/["'`\\<>]/g, " ")
    .replace(/[(){}\[\]]/g, " ")
    .replace(/\b(?:AND|OR|NOT)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.slice(0, 80).trim();
}

function topSearchCandidates(
  candidates: readonly CatalystCandidate[],
  game: ExternalRadarGame
): CatalystCandidate[] {
  const seenNames = new Set<string>();
  return candidates
    .filter((candidate) => candidate.game === game && sanitizeSearchPhrase(candidate.name))
    .sort(compareSearchCandidates)
    .filter((candidate) => {
      const key = normalizeCatalystText(candidate.name);
      if (!key || seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    })
    .slice(0, 3);
}

function monthAndYear(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new RangeError("A valid date is required.");
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(now);
}

export function buildFirecrawlCatalystSearchQueries(
  candidates: readonly CatalystCandidate[],
  now: Date,
  options?: { maxQueries?: number; watchTopics?: readonly CatalystWatchTopic[] }
): CatalystSearchQuery[] {
  const requestedMaximum = Number.isFinite(options?.maxQueries)
    ? Math.floor(Number(options?.maxQueries))
    : MAX_CATALYST_SEARCH_QUERIES;
  const maximum = clamp(requestedMaximum, 0, MAX_CATALYST_SEARCH_QUERIES);
  if (maximum === 0) return [];

  const dateLabel = monthAndYear(now);
  const games = (["pokemon", "one-piece"] as const).filter((game) =>
    candidates.some((candidate) => candidate.game === game)
  );
  const genericQueries = games.flatMap((game): CatalystSearchQuery[] => {
    const gameLabel = game === "pokemon" ? "Pokemon TCG" : "One Piece Card Game";
    const lenses = game === "pokemon"
      ? [
          ["releases", "Japanese set English set leaked booklet card list chase reveal localization", "news"],
          ["products", "sealed product promo collection box restock reprint out of print supply", "news"],
          ["competitive", "tournament results deck support rotation ban new archetype", "news"],
          ["collector", "trending buyout scarcity grading population illustrator chase demand", "general"],
        ] as const
      : [
          ["releases", "Japanese set English release leaked card list manga rare reveal localization", "news"],
          ["products", "sealed product promo starter deck restock reprint supply", "news"],
          ["competitive", "tournament results deck support restriction ban meta archetype", "news"],
          ["collector", "trending buyout scarcity grading population manga rare chase demand", "general"],
        ] as const;
    return lenses.map(([lens, terms, topic]) => ({
      game,
      cardId: `set-intelligence:${game}:${lens}`,
      candidateName: `${lens[0].toUpperCase()}${lens.slice(1)} intelligence`,
      mode: "set-intelligence",
      topic,
      query: `${gameLabel} ${terms} ${dateLabel}`.slice(0, MAX_CATALYST_SEARCH_QUERY_LENGTH),
      allowedDomains: getTrustedCatalystDomains(game),
    }));
  });
  const watchQueries = games.flatMap((game) => {
    const gameLabel = game === "pokemon" ? "Pokemon TCG" : "One Piece Card Game";
    const seen = new Set<string>();
    return (options?.watchTopics ?? [])
      .filter((topic) => topic.game === game)
      .map((topic) => ({ topic, name: sanitizeSearchPhrase(topic.name) }))
      .filter(({ name }) => {
        const key = normalizeCatalystText(name);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3)
      .map(({ topic, name }): CatalystSearchQuery => {
        const setCode = normalizeSetCode(topic.setCode);
        const setFragment = setCode ? ` "${setCode.slice(0, 16)}"` : "";
        const terms = topic.focus === "lifecycle"
          ? "reprint restock additional print run out of print discontinued sealed supply"
          : "leaked booklet card list cards revealed chase";
        return {
          game,
          cardId: `watch-topic:${game}:${topic.focus ?? "release"}:${
            topic.episodeId?.trim() || normalizeCatalystText(name).replace(/\s+/g, "-")
          }`,
          candidateName: name,
          mode: "set-intelligence",
          topic: "news",
          query: `${gameLabel} "${name}"${setFragment} ${terms} ${dateLabel}`.slice(
            0,
            MAX_CATALYST_SEARCH_QUERY_LENGTH
          ),
          allowedDomains: getTrustedCatalystDomains(game),
        };
      });
  });
  const selected = games.flatMap((game) => topSearchCandidates(candidates, game));
  const candidateQueries = selected.map((candidate): CatalystSearchQuery => {
    const candidateName = sanitizeSearchPhrase(candidate.name);
    const gameLabel = candidate.game === "pokemon" ? "Pokemon TCG" : "One Piece Card Game";
    const setCode = normalizeSetCode(candidate.setCode);
    const setFragment = setCode ? ` "${setCode.slice(0, 16)}"` : "";
    const suffix = "support product reprint ban rotation trending";
    let query = `${gameLabel} "${candidateName}"${setFragment} ${suffix} ${dateLabel}`;
    if (query.length > MAX_CATALYST_SEARCH_QUERY_LENGTH) {
      query = query.slice(0, MAX_CATALYST_SEARCH_QUERY_LENGTH).trimEnd();
    }

    return {
      game: candidate.game,
      cardId: candidate.cardId,
      candidateName,
      mode: "candidate",
      topic: "general",
      query,
      allowedDomains: getTrustedCatalystDomains(candidate.game),
    };
  });
  const ordered: CatalystSearchQuery[] = [];
  for (const game of games) {
    ordered.push(...watchQueries.filter((query) => query.game === game));
  }
  // Keep small custom budgets useful too: first cover each game, then its top
  // candidate, before widening into the remaining research lenses.
  for (const game of games) {
    const primary = genericQueries.find(
      (query) => query.game === game && query.cardId.endsWith(":releases")
    );
    if (primary) ordered.push(primary);
  }
  for (const game of games) {
    const primary = candidateQueries.find((query) => query.game === game);
    if (primary) ordered.push(primary);
  }
  for (const lens of ["products", "competitive", "collector"] as const) {
    for (const game of games) {
      const query = genericQueries.find(
        (candidate) => candidate.game === game && candidate.cardId.endsWith(`:${lens}`)
      );
      if (query) ordered.push(query);
    }
  }
  for (const game of games) {
    ordered.push(...candidateQueries.filter((query) => query.game === game).slice(1));
  }
  return ordered.slice(0, maximum);
}

