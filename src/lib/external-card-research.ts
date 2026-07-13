import "server-only";

import { db } from "@/lib/db";
import {
  searchFirecrawlWeb,
  type FirecrawlWebSearchResult,
} from "@/lib/firecrawl";
import { runBudgetedFirecrawlRequest } from "@/lib/firecrawl-budget";
import {
  classifyCatalystDocument,
  getTrustedCatalystSource,
  normalizeCatalystText,
  normalizeCatalystUrl,
  type CatalystDirection,
  type CatalystKind,
  type ExternalRadarGame,
} from "@/lib/external-radar-catalysts-core";
import { getTavilyConfigSnapshot, searchTavilyWeb } from "@/lib/tavily";

const RESEARCH_CACHE_TTL_MS = 24 * 60 * 60_000;
const RESEARCH_VERSION = 1;
const MAX_RESULTS = 10;
const TAVILY_RESULTS_PER_QUERY = 5;
const FIRECRAWL_FALLBACK_RESULTS = 8;

type ResearchProvider = "tavily" | "firecrawl";
type ResearchSourceTier = "trusted" | "discovery";

export interface ExternalCardResearchInput {
  cardId: string;
  game: ExternalRadarGame;
  name: string;
  cardNumber?: string | null;
  episodeName: string;
  episodeCode?: string | null;
  artist?: string | null;
  rarity?: string | null;
}

export interface ExternalCardResearchResult {
  url: string;
  title: string;
  description: string | null;
  domain: string;
  sourceTier: ResearchSourceTier;
  category: string;
  reason: string;
  direction: CatalystDirection | null;
}

export interface ExternalCardResearch {
  cardId: string;
  generatedAt: string;
  cached: boolean;
  provider: ResearchProvider;
  creditsUsed: number;
  queriesRun: number;
  results: ExternalCardResearchResult[];
}

export class ExternalCardResearchError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "ExternalCardResearchError";
    this.status = status;
  }
}

interface SearchLens {
  id: "exact-card" | "demand-news" | "supply-context";
  label: string;
  category: string;
  topic: "news" | "general";
  tbs?: string;
  query: string;
}

interface SearchHit {
  result: FirecrawlWebSearchResult;
  lens: SearchLens;
}

interface StoredResearch extends Omit<ExternalCardResearch, "cached"> {
  version: number;
}

function compactSearchTerm(value: string | null | undefined, maximum = 100): string {
  return String(value ?? "")
    .replace(/["\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function quoted(value: string | null | undefined): string {
  const compact = compactSearchTerm(value);
  return compact ? `"${compact}"` : "";
}

export function buildExternalCardResearchQueries(
  input: ExternalCardResearchInput,
  now = new Date()
): SearchLens[] {
  const gameLabel = input.game === "one-piece" ? "One Piece Card Game" : "Pokemon TCG";
  const year = now.getUTCFullYear();
  const exactIdentity = [quoted(input.name), quoted(input.cardNumber), quoted(input.episodeName)]
    .filter(Boolean)
    .join(" ");
  const setIdentity = [quoted(input.episodeName), quoted(input.episodeCode)]
    .filter(Boolean)
    .join(" ");
  const artistIdentity = input.artist ? ` illustrator ${quoted(input.artist)}` : "";

  return [
    {
      id: "exact-card",
      label: "Exact card",
      category: "Card-specific",
      topic: "general",
      query: `${gameLabel} ${exactIdentity} market collector grading rarity`.slice(0, 500),
    },
    {
      id: "demand-news",
      label: "Demand and news",
      category: "Demand & news",
      topic: "news",
      tbs: "sbd:1,qdr:y",
      query: `${gameLabel} ${quoted(input.name)} demand tournament collector hype buyout reprint reveal ${year}${artistIdentity}`.slice(
        0,
        500
      ),
    },
    {
      id: "supply-context",
      label: "Set and supply",
      category: "Set & supply",
      topic: "general",
      query: `${gameLabel} ${setIdentity} ${quoted(input.name)} sealed booster pull rate print supply reprint`.slice(
        0,
        500
      ),
    },
  ];
}

function cacheKey(input: ExternalCardResearchInput): string {
  return `external-card-research:v${RESEARCH_VERSION}:${input.game}:${input.cardId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseStoredResearch(value: string, now: Date): ExternalCardResearch | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed) || parsed.version !== RESEARCH_VERSION) return null;
    if (typeof parsed.generatedAt !== "string" || !Array.isArray(parsed.results)) return null;
    const generatedAt = new Date(parsed.generatedAt);
    if (
      !Number.isFinite(generatedAt.getTime()) ||
      now.getTime() - generatedAt.getTime() >= RESEARCH_CACHE_TTL_MS
    ) {
      return null;
    }
    return {
      ...(parsed as unknown as StoredResearch),
      cached: true,
    };
  } catch {
    return null;
  }
}

async function readCachedResearch(
  input: ExternalCardResearchInput,
  now: Date
): Promise<ExternalCardResearch | null> {
  const row = await db.appSetting.findUnique({
    where: { key: cacheKey(input) },
    select: { value: true },
  });
  return row ? parseStoredResearch(row.value, now) : null;
}

export function getCachedExternalCardResearch(
  input: ExternalCardResearchInput,
  now = new Date()
): Promise<ExternalCardResearch | null> {
  return readCachedResearch(input, now);
}

async function persistResearch(
  input: ExternalCardResearchInput,
  research: ExternalCardResearch
): Promise<void> {
  const stored: StoredResearch = {
    version: RESEARCH_VERSION,
    cardId: research.cardId,
    generatedAt: research.generatedAt,
    provider: research.provider,
    creditsUsed: research.creditsUsed,
    queriesRun: research.queriesRun,
    results: research.results,
  };
  await db.appSetting.upsert({
    where: { key: cacheKey(input) },
    create: { key: cacheKey(input), value: JSON.stringify(stored) },
    update: { value: JSON.stringify(stored) },
  });
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "external source";
  }
}

function containsNormalizedPhrase(text: string, phrase: string): boolean {
  return Boolean(phrase && (` ${text} `).includes(` ${phrase} `));
}

function categoryForClassification(kind: CatalystKind | null, fallback: string): string {
  if (!kind) return fallback;
  const labels: Record<CatalystKind, string> = {
    support: "New support",
    product: "Product",
    reveal: "Reveal",
    localization: "Localization",
    reprint: "Reprint & supply",
    ban: "Ban & legality",
    rotation: "Rotation",
    hype: "Demand & hype",
  };
  return labels[kind];
}

function rankSearchHit(
  hit: SearchHit,
  input: ExternalCardResearchInput
): { score: number; result: ExternalCardResearchResult } | null {
  const url = normalizeCatalystUrl(hit.result.url);
  if (!url) return null;
  const title = compactSearchTerm(hit.result.title, 300) || safeDomain(url);
  const description = compactSearchTerm(hit.result.description, 700) || null;
  const text = normalizeCatalystText(`${title} ${description ?? ""}`);
  const name = normalizeCatalystText(input.name);
  const number = normalizeCatalystText(input.cardNumber);
  const episode = normalizeCatalystText(input.episodeName);
  const episodeCode = normalizeCatalystText(input.episodeCode);
  const artist = normalizeCatalystText(input.artist);
  const reasons: string[] = [];
  let score = 0;

  if (containsNormalizedPhrase(text, name)) {
    score += 44;
    reasons.push("Exact card name matched");
  }
  if (containsNormalizedPhrase(text, number)) {
    score += 28;
    reasons.push("Card number matched");
  }
  if (containsNormalizedPhrase(text, episode)) {
    score += 22;
    reasons.push("Expansion matched");
  } else if (containsNormalizedPhrase(text, episodeCode)) {
    score += 18;
    reasons.push("Set code matched");
  }
  if (containsNormalizedPhrase(text, artist)) {
    score += 16;
    reasons.push("Illustrator matched");
  }

  const trusted = getTrustedCatalystSource(url, input.game);
  if (trusted) score += 8;
  if (/\b(?:reprint|revealed|reveal|leak|buyout|demand|sold out|shortage|tournament|championship|pull rate|sealed)\b/i.test(text)) {
    score += 8;
    reasons.push("Fresh market or supply language");
  }
  if (hit.lens.id === "exact-card") score += 4;
  if (score < 18) return null;

  const classified = trusted
    ? classifyCatalystDocument({
        url,
        game: input.game,
        title,
        description,
      })
    : null;
  const primaryClassification = classified?.classifications[0] ?? null;
  const reason = reasons.length
    ? reasons.slice(0, 3).join(" · ")
    : `${hit.lens.label} search match`;

  return {
    score,
    result: {
      url,
      title,
      description,
      domain: safeDomain(url),
      sourceTier: trusted ? "trusted" : "discovery",
      category: categoryForClassification(primaryClassification?.kind ?? null, hit.lens.category),
      reason,
      direction: primaryClassification?.direction ?? null,
    },
  };
}

export function rankExternalCardResearchResults(
  hits: readonly SearchHit[],
  input: ExternalCardResearchInput
): ExternalCardResearchResult[] {
  const byUrl = new Map<string, { score: number; result: ExternalCardResearchResult }>();
  for (const hit of hits) {
    const ranked = rankSearchHit(hit, input);
    if (!ranked) continue;
    const existing = byUrl.get(ranked.result.url);
    if (!existing || ranked.score > existing.score) byUrl.set(ranked.result.url, ranked);
  }
  return [...byUrl.values()]
    .sort(
      (left, right) =>
        Number(right.result.sourceTier === "trusted") -
          Number(left.result.sourceTier === "trusted") ||
        right.score - left.score ||
        left.result.title.localeCompare(right.result.title)
    )
    .slice(0, MAX_RESULTS)
    .map((entry) => entry.result);
}

async function runTavilyResearch(
  lenses: readonly SearchLens[]
): Promise<{ hits: SearchHit[]; creditsUsed: number; queriesRun: number }> {
  const settled = await Promise.allSettled(
    lenses.map(async (lens) => ({
      lens,
      response: await searchTavilyWeb({
        query: lens.query,
        limit: TAVILY_RESULTS_PER_QUERY,
        topic: lens.topic,
        tbs: lens.tbs,
      }),
    }))
  );
  const hits: SearchHit[] = [];
  let creditsUsed = 0;
  let queriesRun = 0;
  for (const item of settled) {
    if (item.status !== "fulfilled") continue;
    queriesRun += 1;
    creditsUsed += item.value.response.creditsUsed ?? 1;
    hits.push(...item.value.response.results.map((result) => ({ result, lens: item.value.lens })));
  }
  if (!queriesRun) throw new ExternalCardResearchError("The card research provider is temporarily unavailable.", 502);
  return { hits, creditsUsed, queriesRun };
}

async function runFirecrawlFallback(
  input: ExternalCardResearchInput,
  lens: SearchLens,
  now: Date
): Promise<{ hits: SearchHit[]; creditsUsed: number; queriesRun: number }> {
  const day = now.toISOString().slice(0, 10);
  const budgeted = await runBudgetedFirecrawlRequest({
    consumer: "external-signal-catalysts",
    operation: "manual-card-research",
    idempotencyKey: `external-card-research:v${RESEARCH_VERSION}:${day}:${input.game}:${input.cardId}`,
    estimatedCredits: 2,
    request: () =>
      searchFirecrawlWeb({
        query: `${lens.query} latest news market supply`,
        limit: FIRECRAWL_FALLBACK_RESULTS,
        tbs: "sbd:1,qdr:y",
      }),
    getCreditsUsed: (response) => response.creditsUsed,
  });
  if (!budgeted.executed || !budgeted.result) {
    throw new ExternalCardResearchError("Research for this card is already running or was recently completed.", 409);
  }
  return {
    hits: budgeted.result.results.map((result) => ({ result, lens })),
    creditsUsed: budgeted.creditsUsed,
    queriesRun: 1,
  };
}

const inflightResearch = new Map<string, Promise<ExternalCardResearch>>();

async function runFreshResearch(
  input: ExternalCardResearchInput,
  now: Date
): Promise<ExternalCardResearch> {
  const lenses = buildExternalCardResearchQueries(input, now);
  let provider: ResearchProvider;
  let search: { hits: SearchHit[]; creditsUsed: number; queriesRun: number };
  if (getTavilyConfigSnapshot().configured) {
    try {
      search = await runTavilyResearch(lenses);
      provider = "tavily";
    } catch {
      search = await runFirecrawlFallback(input, lenses[0], now);
      provider = "firecrawl";
    }
  } else {
    search = await runFirecrawlFallback(input, lenses[0], now);
    provider = "firecrawl";
  }

  const research: ExternalCardResearch = {
    cardId: input.cardId,
    generatedAt: now.toISOString(),
    cached: false,
    provider,
    creditsUsed: search.creditsUsed,
    queriesRun: search.queriesRun,
    results: rankExternalCardResearchResults(search.hits, input),
  };
  await persistResearch(input, research);
  return research;
}

export async function researchExternalRadarCard(
  input: ExternalCardResearchInput,
  now = new Date()
): Promise<ExternalCardResearch> {
  const cached = await readCachedResearch(input, now);
  if (cached) return cached;

  const key = cacheKey(input);
  const existing = inflightResearch.get(key);
  if (existing) return existing;
  const request = runFreshResearch(input, now).finally(() => inflightResearch.delete(key));
  inflightResearch.set(key, request);
  return request;
}
