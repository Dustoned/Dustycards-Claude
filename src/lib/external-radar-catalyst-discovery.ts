import { createHash } from "node:crypto";

import { db } from "@/lib/db";
import {
  MAX_CATALYST_SEARCH_QUERIES,
  analyzeCatalystDocument,
  buildFirecrawlCatalystSearchQueries,
  dedupeCatalystCardMatches,
  getTrustedCatalystSource,
  normalizeCatalystUrl,
  type CatalystCardMatch,
  type CatalystCandidate,
  type CatalystClassification,
  type CatalystSearchQuery,
  type CatalystSourceKind,
  type CatalystWatchTopic,
  type ExternalRadarGame,
} from "@/lib/external-radar-catalysts-core";
import {
  FirecrawlBudgetError,
  runBudgetedFirecrawlRequest,
} from "@/lib/firecrawl-budget";
import {
  scrapeFirecrawlPage,
  searchFirecrawlWeb,
  type FirecrawlPageScrapeResult,
  type FirecrawlWebSearchResponse,
} from "@/lib/firecrawl";
import {
  getScrapeDoConfigSnapshot,
  scrapeScrapeDoPage,
  searchScrapeDoWeb,
} from "@/lib/scrapedo";
import { getTavilyConfigSnapshot, searchTavilyWeb } from "@/lib/tavily";

export const EXTERNAL_CATALYST_DISCOVERY_INTERVAL_MS = 24 * 60 * 60_000;
export const EXTERNAL_CATALYST_QUERY_VERSION = 5;
export const EXTERNAL_CATALYST_SEARCH_LIMIT = 5;
export const EXTERNAL_CATALYST_MAX_SCRAPES_PER_RUN = 4;
export const EXTERNAL_CATALYST_MAX_SCRAPEDO_SEARCHES_PER_RUN = 2;
export const EXTERNAL_CATALYST_RETRY_BACKOFF_MS = 72 * 60 * 60_000;
// Trusted URLs that miss the daily scrape budget are queued as pending rows so
// later runs work through them; the cap bounds daily table growth.
export const EXTERNAL_CATALYST_MAX_BACKLOG_INSERTS_PER_RUN = 25;

// Reserve the documented search-unit maximum even when requesting five
// results. The provider's returned credits replace this estimate afterward.
const SEARCH_ESTIMATED_CREDITS = 2;
const SCRAPE_ESTIMATED_CREDITS = 1;
const FIRECRAWL_CONSUMER = "external-signal-catalysts";

export interface ExternalCatalystDiscoveryCandidate {
  cardId: string;
  game: ExternalRadarGame;
  name: string;
  /** Accepted for callers that already expose a generic set code. */
  setCode?: string | null;
  /** Human-readable set matching lets one set-level event reach its cards. */
  episodeName?: string | null;
  /** Makes ExternalCardSignal[] structurally compatible without remapping. */
  episodeCode?: string | null;
  aliases?: readonly string[] | null;
  rank?: number | null;
  externalScore?: number | null;
}

export interface ExternalCatalystDiscoveryError {
  stage: "search" | "scrape" | "persist";
  message: string;
  query?: string;
  url?: string;
}

export interface ExternalCatalystDiscoveryResult {
  queryVersion: number;
  status: "skipped" | "success" | "partial";
  due: boolean;
  queriesPlanned: number;
  searchesExecuted: number;
  searchResultsSeen: number;
  trustedUrlsSeen: number;
  knownUrlsSkipped: number;
  sourcesCreated: number;
  sourcesScraped: number;
  catalystsPersisted: number;
  matches: CatalystCardMatch[];
  searchProvider: "tavily" | "firecrawl";
  tavilyCreditsUsed: number;
  scrapedoCreditsUsed: number;
  /** Firecrawl credits recorded by the Firecrawl ledger. */
  creditsUsed: number;
  backlogQueued?: number;
  backlogProcessed?: number;
  errors: ExternalCatalystDiscoveryError[];
}

interface DiscoveredCatalystSource {
  canonicalUrl: string;
  urlHash: string;
  domain: string;
  game: ExternalRadarGame;
  sourceKind: CatalystSourceKind;
  title: string | null;
  description: string | null;
  query: CatalystSearchQuery;
}

export interface CatalystSourceCreateInput {
  canonicalUrl: string;
  urlHash: string;
  domain: string;
  game: ExternalRadarGame;
  sourceKind: CatalystSourceKind;
  title: string | null;
  description: string | null;
  now: Date;
}

export interface CatalystPersistenceInput {
  sourceId: string;
  source: DiscoveredCatalystSource;
  scrape: FirecrawlPageScrapeResult;
  matches: readonly CatalystCardMatch[];
  now: Date;
}

export interface ExternalCatalystBacklogSource {
  id: string;
  canonicalUrl: string;
  urlHash: string;
  domain: string;
  game: ExternalRadarGame;
  sourceKind: CatalystSourceKind;
  title: string | null;
  description: string | null;
}

export interface ExternalCatalystDiscoveryStore {
  findKnownCanonicalUrls(urls: readonly string[], now: Date): Promise<string[]>;
  touchKnownCanonicalUrls(urls: readonly string[], now: Date): Promise<void>;
  /** Returns null if a concurrent run already inserted the same canonical URL. */
  createSource(input: CatalystSourceCreateInput): Promise<{ id: string } | null>;
  persistScrapedSource(input: CatalystPersistenceInput): Promise<number>;
  markSourceFailed(sourceId: string, error: unknown, now: Date): Promise<void>;
  /** Oldest never-attempted pending sources queued by earlier runs (optional). */
  listPendingBacklogSources?(limit: number, now: Date): Promise<ExternalCatalystBacklogSource[]>;
}

export interface BudgetedRequestInput<T> {
  consumer?: string;
  operation: string;
  idempotencyKey: string;
  estimatedCredits: number;
  sourceUrl?: string | null;
  request: () => Promise<T>;
  getCreditsUsed: (result: T) => number | null | undefined;
}

export type BudgetedRequestRunner = <T>(
  input: BudgetedRequestInput<T>
) => Promise<{
  executed: boolean;
  result: T | null;
  creditsUsed: number;
  reservationId: string;
}>;

export interface ExternalCatalystDiscoveryDependencies {
  searchWeb: (input: {
    query: string;
    limit?: number;
    includeDomains?: string[];
    tbs?: string;
    topic?: "news" | "general";
  }) => Promise<FirecrawlWebSearchResponse>;
  searchProvider?: "tavily" | "firecrawl";
  fallbackSearchWeb?: ExternalCatalystDiscoveryDependencies["searchWeb"];
  scrapeDoSearchWeb?: ExternalCatalystDiscoveryDependencies["searchWeb"];
  scrapePage: typeof scrapeFirecrawlPage;
  scrapeDoPage?: typeof scrapeScrapeDoPage;
  runBudgetedRequest: BudgetedRequestRunner;
  store: ExternalCatalystDiscoveryStore;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    typeof error === "object" &&
      error &&
      "code" in error &&
      String((error as { code?: unknown }).code) === "P2002"
  );
}

function compactText(value: string | null | undefined, maximum: number): string | null {
  const compact = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return compact ? compact.slice(0, maximum) : null;
}

function parsePublishedAt(metadata: Record<string, unknown>): Date | null {
  for (const key of ["publishedTime", "publishedDate", "datePublished", "article:published_time"]) {
    const raw = metadata[key];
    if (typeof raw !== "string" && typeof raw !== "number") continue;
    const parsed = new Date(raw);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return null;
}

function expiryForClassification(classification: CatalystClassification, now: Date): Date {
  const days =
    classification.kind === "hype"
      ? 14
      : ["support", "product", "reveal", "localization"].includes(classification.kind)
        ? 90
        : 180;
  return new Date(now.getTime() + days * 24 * 60 * 60_000);
}

function headlineForClassification(
  cardName: string,
  classification: CatalystClassification,
  sourceTitle?: string | null
): string {
  const label: Record<CatalystClassification["kind"], string> = {
    support: "New support signal",
    product: "Product announcement",
    reveal: "New card reveal",
    localization: "Japan-to-English signal",
    reprint: classification.direction === "positive" ? "Scarcity signal" : "Reprint risk",
    ban: classification.direction === "positive" ? "Legality restored" : "Ban risk",
    rotation:
      classification.direction === "positive" ? "Rotation resilience" : "Rotation risk",
    hype: classification.direction === "negative" ? "Cooling attention" : "Rising attention",
  };
  if (
    sourceTitle &&
    ["product", "reveal", "localization"].includes(classification.kind)
  ) {
    return `${label[classification.kind]}: ${sourceTitle}`.slice(0, 300);
  }
  return `${label[classification.kind]} for ${cardName}`.slice(0, 300);
}

function explanationForClassification(
  classification: CatalystClassification,
  sourceKind: CatalystSourceKind,
  match: CatalystCardMatch
): string {
  const direction =
    classification.direction === "positive"
      ? "can increase demand"
      : classification.direction === "negative"
        ? "can reduce demand or cap price upside"
        : "needs more confirmation before it is directional";
  const terms = classification.matchedTerms.slice(0, 3).join(", ");
  const relation = match.matchedBy.includes("name")
    ? "The exact card name appears in the source."
    : match.matchedBy.includes("alias")
      ? "The same character or Pokémon is named, so older variants can receive spillover demand."
      : "The source concerns this card's set, so the connection is broader and less specific.";
  return `A ${sourceKind} source matched ${classification.kind}${terms ? ` (${terms})` : ""}. ${relation} This ${direction}; it is evidence, not a guaranteed price move.`.slice(
    0,
    1_000
  );
}

function matchStrengthMultiplier(match: CatalystCardMatch): number {
  if (match.matchedBy.includes("name")) return 1;
  if (match.matchedBy.includes("alias")) return 0.78;
  if (match.matchedBy.includes("set-name")) return 0.56;
  return 0.6;
}

function evidenceExcerpt(scrape: FirecrawlPageScrapeResult, cardName: string): string | null {
  const text = compactText(scrape.markdown, 30_000) ?? compactText(scrape.html, 30_000);
  if (!text) return null;
  const index = text.toLowerCase().indexOf(cardName.toLowerCase());
  const start = index >= 0 ? Math.max(0, index - 180) : 0;
  return text.slice(start, start + 520);
}

const prismaCatalystStore: ExternalCatalystDiscoveryStore = {
  async findKnownCanonicalUrls(urls, now) {
    if (!urls.length) return [];
    const retryCutoff = new Date(now.getTime() - EXTERNAL_CATALYST_RETRY_BACKOFF_MS);
    const rows = await db.externalCatalystSource.findMany({
      where: {
        canonical_url: { in: [...urls] },
        OR: [
          { scrape_status: { in: ["matched", "ignored"] } },
          {
            scrape_status: { in: ["pending", "failed"] },
            updated_at: { gt: retryCutoff },
          },
        ],
      },
      select: { canonical_url: true },
    });
    return rows.map((row) => row.canonical_url);
  },

  async touchKnownCanonicalUrls(urls, now) {
    if (!urls.length) return;
    await db.externalCatalystSource.updateMany({
      where: {
        canonical_url: { in: [...urls] },
        scrape_status: { in: ["matched", "ignored"] },
      },
      data: { last_seen_at: now },
    });
  },

  async createSource(input) {
    const existing = await db.externalCatalystSource.findUnique({
      where: { canonical_url: input.canonicalUrl },
      select: { id: true, scrape_status: true },
    });
    if (existing) {
      if (!["pending", "failed"].includes(existing.scrape_status)) return null;
      const retryCutoff = new Date(input.now.getTime() - EXTERNAL_CATALYST_RETRY_BACKOFF_MS);
      const claimed = await db.externalCatalystSource.updateMany({
        where: {
          id: existing.id,
          scrape_status: { in: ["pending", "failed"] },
          updated_at: { lte: retryCutoff },
        },
        data: {
          scrape_status: "pending",
          last_seen_at: input.now,
        },
      });
      return claimed.count === 1 ? { id: existing.id } : null;
    }
    try {
      return await db.externalCatalystSource.create({
        data: {
          canonical_url: input.canonicalUrl,
          url_hash: input.urlHash,
          domain: input.domain,
          game: input.game,
          source_type: input.sourceKind,
          title: input.title?.slice(0, 500) ?? null,
          description: input.description?.slice(0, 1_500) ?? null,
          first_seen_at: input.now,
          last_seen_at: input.now,
          scrape_status: "pending",
        },
        select: { id: true },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      await db.externalCatalystSource.updateMany({
        where: { canonical_url: input.canonicalUrl },
        data: { last_seen_at: input.now },
      });
      return null;
    }
  },

  async persistScrapedSource(input) {
    const title = compactText(input.scrape.title ?? input.source.title, 500);
    const description = compactText(input.source.description, 1_500);
    const content = input.scrape.markdown || input.scrape.html;
    const contentHash = content ? hash(content) : null;
    const contentExcerpt = compactText(content, 1_200);
    const publishedAt = parsePublishedAt(input.scrape.metadata);
    const metadataJson = JSON.stringify({
      query: input.source.query.query,
      queryCardId: input.source.query.cardId,
      queryMode: input.source.query.mode,
      sourceUrl: input.scrape.sourceUrl,
      metadata: input.scrape.metadata,
    }).slice(0, 8_000);

    return db.$transaction(async (tx) => {
      await tx.externalCatalystSource.update({
        where: { id: input.sourceId },
        data: {
          title,
          description,
          published_at: publishedAt,
          last_seen_at: input.now,
          last_scraped_at: input.now,
          scrape_status: input.matches.length ? "matched" : "ignored",
          content_hash: contentHash,
          content_excerpt: contentExcerpt,
          metadata_json: metadataJson,
        },
      });

      let persisted = 0;
      for (const match of input.matches) {
        for (const classification of match.classifications) {
          await tx.externalCardCatalyst.upsert({
            where: {
              source_id_entity_key_catalyst_type: {
                source_id: input.sourceId,
                entity_key: `card:${match.cardId}`,
                catalyst_type: classification.kind,
              },
            },
            create: {
              source_id: input.sourceId,
              entity_key: `card:${match.cardId}`,
              card_id: match.cardId,
              game: match.game,
              catalyst_type: classification.kind,
              direction: classification.direction,
              strength: Math.abs(classification.signedImpact) * matchStrengthMultiplier(match),
              headline: headlineForClassification(
                match.cardName,
                classification,
                input.scrape.title ?? input.source.title
              ),
              explanation: explanationForClassification(
                classification,
                match.sourceKind,
                match
              ),
              evidence_excerpt: evidenceExcerpt(input.scrape, match.cardName),
              observed_at: input.now,
              expires_at: expiryForClassification(classification, input.now),
            },
            update: {
              direction: classification.direction,
              strength: Math.abs(classification.signedImpact) * matchStrengthMultiplier(match),
              headline: headlineForClassification(
                match.cardName,
                classification,
                input.scrape.title ?? input.source.title
              ),
              explanation: explanationForClassification(
                classification,
                match.sourceKind,
                match
              ),
              evidence_excerpt: evidenceExcerpt(input.scrape, match.cardName),
              observed_at: input.now,
              expires_at: expiryForClassification(classification, input.now),
            },
          });
          persisted += 1;
        }
      }
      return persisted;
    });
  },

  async markSourceFailed(sourceId, error, now) {
    const message = error instanceof Error ? error.message : String(error);
    await db.externalCatalystSource.update({
      where: { id: sourceId },
      data: {
        last_seen_at: now,
        last_scraped_at: now,
        scrape_status: "failed",
        metadata_json: JSON.stringify({ error: message.slice(0, 500) }),
      },
    });
  },

  async listPendingBacklogSources(limit) {
    // Never-attempted rows only: failed sources keep their 72-hour backoff via
    // the createSource retry path and are excluded here by scrape_status.
    const rows = await db.externalCatalystSource.findMany({
      where: { scrape_status: "pending", last_scraped_at: null },
      orderBy: [{ first_seen_at: "asc" }, { id: "asc" }],
      take: Math.max(0, Math.floor(limit)),
      select: {
        id: true,
        canonical_url: true,
        url_hash: true,
        domain: true,
        game: true,
        source_type: true,
        title: true,
        description: true,
      },
    });
    return rows.flatMap((row) => {
      if (!["official", "community", "social"].includes(row.source_type)) return [];
      return [
        {
          id: row.id,
          canonicalUrl: row.canonical_url,
          urlHash: row.url_hash,
          domain: row.domain,
          game: row.game === "one-piece" ? ("one-piece" as const) : ("pokemon" as const),
          sourceKind: row.source_type as CatalystSourceKind,
          title: row.title,
          description: row.description,
        },
      ];
    });
  },
};

const tavilyConfigured = getTavilyConfigSnapshot().configured;
const scrapeDoConfigured = getScrapeDoConfigSnapshot().configured;
const DEFAULT_DEPENDENCIES: ExternalCatalystDiscoveryDependencies = {
  searchWeb: tavilyConfigured ? searchTavilyWeb : searchFirecrawlWeb,
  searchProvider: tavilyConfigured ? "tavily" : "firecrawl",
  fallbackSearchWeb: tavilyConfigured ? searchFirecrawlWeb : undefined,
  scrapeDoSearchWeb: scrapeDoConfigured ? searchScrapeDoWeb : undefined,
  scrapePage: scrapeFirecrawlPage,
  scrapeDoPage: scrapeDoConfigured ? scrapeScrapeDoPage : undefined,
  runBudgetedRequest: runBudgetedFirecrawlRequest,
  store: prismaCatalystStore,
};

function normalizeCandidates(
  candidates: readonly ExternalCatalystDiscoveryCandidate[]
): CatalystCandidate[] {
  return candidates.map((candidate) => ({
    cardId: candidate.cardId,
    game: candidate.game,
    name: candidate.name,
    setName: candidate.episodeName,
    setCode: candidate.setCode ?? candidate.episodeCode,
    aliases: candidate.aliases,
    rank: candidate.rank,
    externalScore: candidate.externalScore,
  }));
}

function discoveryBucket(now: Date): number {
  return Math.floor(now.getTime() / EXTERNAL_CATALYST_DISCOVERY_INTERVAL_MS);
}

export function isExternalCatalystDiscoveryDue(
  lastRunAt: Date | null | undefined,
  now = new Date()
): boolean {
  if (!Number.isFinite(now.getTime())) throw new RangeError("A valid current date is required.");
  if (!lastRunAt || !Number.isFinite(lastRunAt.getTime())) return true;
  return now.getTime() - lastRunAt.getTime() >= EXTERNAL_CATALYST_DISCOVERY_INTERVAL_MS;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function selectUnseenSourcesFairly(
  sources: readonly DiscoveredCatalystSource[],
  knownUrls: ReadonlySet<string>
): DiscoveredCatalystSource[] {
  const sourceKindPriority: Record<CatalystSourceKind, number> = {
    official: 3,
    community: 2,
    social: 1,
  };
  const unseen = sources
    .filter((source) => !knownUrls.has(source.canonicalUrl))
    .sort(
      (left, right) =>
        sourceKindPriority[right.sourceKind] - sourceKindPriority[left.sourceKind] ||
        Number(right.query.cardId.startsWith("watch-topic:")) -
          Number(left.query.cardId.startsWith("watch-topic:")) ||
        Number(right.query.cardId.endsWith(":releases")) -
          Number(left.query.cardId.endsWith(":releases")) ||
        left.canonicalUrl.localeCompare(right.canonicalUrl)
    );
  const selected: DiscoveredCatalystSource[] = [];

  for (const game of ["pokemon", "one-piece"] as const) {
    const source = unseen.find((candidate) => candidate.game === game);
    if (source) selected.push(source);
  }
  for (const source of unseen) {
    if (selected.length >= EXTERNAL_CATALYST_MAX_SCRAPES_PER_RUN) break;
    if (!selected.some((candidate) => candidate.canonicalUrl === source.canonicalUrl)) {
      selected.push(source);
    }
  }

  return selected.slice(0, EXTERNAL_CATALYST_MAX_SCRAPES_PER_RUN);
}

function buildSocialSnippetEvidence(
  source: DiscoveredCatalystSource
): FirecrawlPageScrapeResult {
  return {
    title: source.title,
    sourceUrl: source.canonicalUrl,
    markdown: [source.title, source.description].filter(Boolean).join("\n\n"),
    html: "",
    links: [],
    creditsUsed: 0,
    metadata: { evidenceMode: "search-snippet" },
  };
}

function analyzeScrapedCatalystSource(
  source: DiscoveredCatalystSource,
  scrape: FirecrawlPageScrapeResult,
  candidates: readonly CatalystCandidate[]
): CatalystCardMatch[] {
  const publishedAt = parsePublishedAt(scrape.metadata);
  return dedupeCatalystCardMatches(
    analyzeCatalystDocument(
      {
        url: source.canonicalUrl,
        game: source.game,
        title: scrape.title ?? source.title,
        description: source.description,
        body: scrape.markdown || scrape.html,
        publishedAt: publishedAt?.toISOString() ?? null,
      },
      candidates
    )
  );
}

function baseResult(due: boolean): ExternalCatalystDiscoveryResult {
  return {
    queryVersion: EXTERNAL_CATALYST_QUERY_VERSION,
    status: due ? "success" : "skipped",
    due,
    queriesPlanned: 0,
    searchesExecuted: 0,
    searchResultsSeen: 0,
    trustedUrlsSeen: 0,
    knownUrlsSkipped: 0,
    sourcesCreated: 0,
    sourcesScraped: 0,
    catalystsPersisted: 0,
    matches: [],
    searchProvider: tavilyConfigured ? "tavily" : "firecrawl",
    tavilyCreditsUsed: 0,
    scrapedoCreditsUsed: 0,
    creditsUsed: 0,
    backlogQueued: 0,
    backlogProcessed: 0,
    errors: [],
  };
}

function backlogSearchQuery(source: ExternalCatalystBacklogSource): CatalystSearchQuery {
  return {
    game: source.game,
    cardId: "backlog",
    candidateName: "",
    mode: "candidate",
    topic: "news",
    query: "",
    allowedDomains: [],
  };
}

export async function runExternalCatalystDiscovery(
  input: {
    candidates: readonly ExternalCatalystDiscoveryCandidate[];
    watchTopics?: readonly CatalystWatchTopic[];
    /** Caller-owned cadence marker; no hidden scheduler or DB timing lookup occurs here. */
    lastRunAt?: Date | null;
    now?: Date;
  },
  dependencies: ExternalCatalystDiscoveryDependencies = DEFAULT_DEPENDENCIES
): Promise<ExternalCatalystDiscoveryResult> {
  const now = input.now ?? new Date();
  const due = isExternalCatalystDiscoveryDue(input.lastRunAt, now);
  const result = baseResult(due);
  if (!due) return result;

  const candidates = normalizeCandidates(input.candidates);
  const searchProvider = dependencies.searchProvider ?? "firecrawl";
  result.searchProvider = searchProvider;
  const queries = buildFirecrawlCatalystSearchQueries(candidates, now, {
    maxQueries: MAX_CATALYST_SEARCH_QUERIES,
    watchTopics: input.watchTopics,
  });
  result.queriesPlanned = queries.length;
  const discoveredByUrl = new Map<string, DiscoveredCatalystSource>();

  const searchInput = (query: CatalystSearchQuery) => ({
    query: query.query,
    limit: EXTERNAL_CATALYST_SEARCH_LIMIT,
    includeDomains: query.allowedDomains,
    tbs: "sbd:1,qdr:m",
    topic: query.topic,
  });
  let scrapeDoSearchesExecuted = 0;

  const runScrapeDoSearch = async (
    query: CatalystSearchQuery,
    priorError: unknown
  ): Promise<FirecrawlWebSearchResponse | null> => {
    if (!dependencies.scrapeDoSearchWeb) throw priorError;
    if (scrapeDoSearchesExecuted >= EXTERNAL_CATALYST_MAX_SCRAPEDO_SEARCHES_PER_RUN) {
      return null;
    }
    scrapeDoSearchesExecuted += 1;
    const response = await dependencies.scrapeDoSearchWeb(searchInput(query));
    result.scrapedoCreditsUsed += response.creditsUsed ?? 0;
    return response;
  };

  const runFirecrawlSearchWithFallback = async (input: {
    query: CatalystSearchQuery;
    searchWeb: ExternalCatalystDiscoveryDependencies["searchWeb"];
    operation: string;
    idempotencyPrefix: string;
  }): Promise<FirecrawlWebSearchResponse | null> => {
    // Capture a successful provider response separately. If only the ledger
    // completion fails after Firecrawl returned data, re-use that response and
    // do not spend a second provider credit for the same query.
    const providerState: { response: FirecrawlWebSearchResponse | null } = {
      response: null,
    };
    try {
      const budgeted = await dependencies.runBudgetedRequest<FirecrawlWebSearchResponse>({
        consumer: FIRECRAWL_CONSUMER,
        operation: input.operation,
        idempotencyKey: `${input.idempotencyPrefix}:${discoveryBucket(now)}:${hash(`${input.query.game}\u0000${input.query.query}`)}`,
        estimatedCredits: SEARCH_ESTIMATED_CREDITS,
        request: async () => {
          providerState.response = await input.searchWeb(searchInput(input.query));
          return providerState.response;
        },
        getCreditsUsed: (response) => response.creditsUsed,
      });
      if (!budgeted.executed || !budgeted.result) return null;
      result.creditsUsed += budgeted.creditsUsed;
      return budgeted.result;
    } catch (error) {
      const providerResponse = providerState.response;
      if (!(error instanceof FirecrawlBudgetError)) {
        result.creditsUsed += providerResponse?.creditsUsed ?? SEARCH_ESTIMATED_CREDITS;
      }
      if (providerResponse) return providerResponse;
      return runScrapeDoSearch(input.query, error);
    }
  };

  for (const query of queries) {
    try {
      let searchResponse: FirecrawlWebSearchResponse | null = null;
      if (searchProvider === "tavily") {
        try {
          searchResponse = await dependencies.searchWeb(searchInput(query));
          result.tavilyCreditsUsed += searchResponse.creditsUsed ?? 1;
        } catch (tavilyError) {
          searchResponse = dependencies.fallbackSearchWeb
            ? await runFirecrawlSearchWithFallback({
                query,
                searchWeb: dependencies.fallbackSearchWeb,
                operation: "catalyst-search-fallback",
                idempotencyPrefix: "external-catalyst:search-fallback",
              })
            : await runScrapeDoSearch(query, tavilyError);
        }
      } else {
        searchResponse = await runFirecrawlSearchWithFallback({
          query,
          searchWeb: dependencies.searchWeb,
          operation: "catalyst-search",
          idempotencyPrefix: "external-catalyst:search",
        });
      }

      if (!searchResponse) continue;
      result.searchesExecuted += 1;
      const searchResults = searchResponse.results.slice(0, EXTERNAL_CATALYST_SEARCH_LIMIT);
      result.searchResultsSeen += searchResults.length;

      for (const searchResult of searchResults) {
        const trusted = getTrustedCatalystSource(searchResult.url, query.game);
        const canonicalUrl = normalizeCatalystUrl(searchResult.url);
        if (!trusted || !canonicalUrl || discoveredByUrl.has(canonicalUrl)) continue;
        discoveredByUrl.set(canonicalUrl, {
          canonicalUrl,
          urlHash: hash(canonicalUrl),
          domain: new URL(canonicalUrl).hostname,
          game: query.game,
          sourceKind: trusted.sourceKind,
          title: compactText(searchResult.title, 500),
          description: compactText(searchResult.description, 1_500),
          query,
        });
      }
    } catch (error) {
      result.errors.push({ stage: "search", message: errorMessage(error), query: query.query });
    }
  }

  const discovered = [...discoveredByUrl.values()];
  result.trustedUrlsSeen = discovered.length;
  let knownUrls: string[] = [];
  try {
    knownUrls = await dependencies.store.findKnownCanonicalUrls(
      discovered.map((source) => source.canonicalUrl),
      now
    );
    await dependencies.store.touchKnownCanonicalUrls(knownUrls, now);
  } catch (error) {
    result.errors.push({ stage: "persist", message: errorMessage(error) });
    result.status = "partial";
    return result;
  }

  const knownUrlSet = new Set(knownUrls);
  result.knownUrlsSkipped = discovered.filter((source) => knownUrlSet.has(source.canonicalUrl)).length;

  // Earlier runs queued more trusted URLs than the scrape budget allowed; the
  // backlog is worked through first and new finds only take the leftover slots.
  let backlogEntries: Array<{ source: DiscoveredCatalystSource; existingId: string }> = [];
  if (dependencies.store.listPendingBacklogSources) {
    try {
      const pending = await dependencies.store.listPendingBacklogSources(
        EXTERNAL_CATALYST_MAX_SCRAPES_PER_RUN,
        now
      );
      backlogEntries = pending.map((row) => ({
        existingId: row.id,
        source: {
          canonicalUrl: row.canonicalUrl,
          urlHash: row.urlHash,
          domain: row.domain,
          game: row.game,
          sourceKind: row.sourceKind,
          title: row.title,
          description: row.description,
          query: backlogSearchQuery(row),
        },
      }));
    } catch (error) {
      result.errors.push({ stage: "persist", message: errorMessage(error) });
    }
  }
  const backlogUrls = new Set(backlogEntries.map((entry) => entry.source.canonicalUrl));
  const selected = selectUnseenSourcesFairly(discovered, knownUrlSet)
    .filter((source) => !backlogUrls.has(source.canonicalUrl))
    .slice(0, Math.max(0, EXTERNAL_CATALYST_MAX_SCRAPES_PER_RUN - backlogEntries.length));
  const scrapeQueue = [
    ...backlogEntries,
    ...selected.map((source) => ({ source, existingId: null as string | null })),
  ];

  const scrapeWithProviderFallback = async (
    source: DiscoveredCatalystSource
  ): Promise<FirecrawlPageScrapeResult | null> => {
    const providerState: { response: FirecrawlPageScrapeResult | null } = {
      response: null,
    };
    try {
      const budgeted = await dependencies.runBudgetedRequest<FirecrawlPageScrapeResult>({
        consumer: FIRECRAWL_CONSUMER,
        operation: "catalyst-scrape",
        idempotencyKey: `external-catalyst:scrape:${discoveryBucket(now)}:${source.urlHash}`,
        estimatedCredits: SCRAPE_ESTIMATED_CREDITS,
        sourceUrl: source.canonicalUrl,
        request: async () => {
          providerState.response = await dependencies.scrapePage(source.canonicalUrl, {
            onlyMainContent: true,
            fastMode: true,
            maxAge: 6 * 60 * 60_000,
          });
          return providerState.response;
        },
        getCreditsUsed: (scrape) => scrape.creditsUsed,
      });
      if (!budgeted.executed || !budgeted.result) return null;
      result.creditsUsed += budgeted.creditsUsed;
      return budgeted.result;
    } catch (error) {
      const providerResponse = providerState.response;
      if (!(error instanceof FirecrawlBudgetError)) {
        result.creditsUsed += providerResponse?.creditsUsed ?? SCRAPE_ESTIMATED_CREDITS;
      }
      if (providerResponse) return providerResponse;
      if (!dependencies.scrapeDoPage) throw error;
      const scrape = await dependencies.scrapeDoPage(source.canonicalUrl);
      result.scrapedoCreditsUsed += scrape.creditsUsed ?? 0;
      return scrape;
    }
  };

  for (const { source, existingId } of scrapeQueue) {
    let sourceRow: { id: string } | null;
    if (existingId) {
      sourceRow = { id: existingId };
      result.backlogProcessed = (result.backlogProcessed ?? 0) + 1;
    } else {
      try {
        sourceRow = await dependencies.store.createSource({
          canonicalUrl: source.canonicalUrl,
          urlHash: source.urlHash,
          domain: source.domain,
          game: source.game,
          sourceKind: source.sourceKind,
          title: source.title,
          description: source.description,
          now,
        });
      } catch (error) {
        result.errors.push({
          stage: "persist",
          message: errorMessage(error),
          url: source.canonicalUrl,
        });
        continue;
      }
      if (!sourceRow) {
        result.knownUrlsSkipped += 1;
        continue;
      }
      result.sourcesCreated += 1;
    }

    if (source.sourceKind === "social") {
      const snippet = buildSocialSnippetEvidence(source);
      const snippetMatches = analyzeScrapedCatalystSource(source, snippet, candidates);
      result.matches.push(...snippetMatches);
      try {
        result.catalystsPersisted += await dependencies.store.persistScrapedSource({
          sourceId: sourceRow.id,
          source,
          scrape: snippet,
          matches: snippetMatches,
          now,
        });
      } catch (error) {
        result.errors.push({
          stage: "persist",
          message: errorMessage(error),
          url: source.canonicalUrl,
        });
      }
      continue;
    }

    try {
      const scrape = await scrapeWithProviderFallback(source);
      if (!scrape) continue;
      result.sourcesScraped += 1;
      const dedupedMatches = analyzeScrapedCatalystSource(
        source,
        scrape,
        candidates
      );
      result.matches.push(...dedupedMatches);

      try {
        result.catalystsPersisted += await dependencies.store.persistScrapedSource({
          sourceId: sourceRow.id,
          source,
          scrape,
          matches: dedupedMatches,
          now,
        });
      } catch (error) {
        result.errors.push({
          stage: "persist",
          message: errorMessage(error),
          url: source.canonicalUrl,
        });
      }
    } catch (error) {
      result.errors.push({
        stage: "scrape",
        message: errorMessage(error),
        url: source.canonicalUrl,
      });
      try {
        await dependencies.store.markSourceFailed(sourceRow.id, error, now);
      } catch (persistError) {
        result.errors.push({
          stage: "persist",
          message: errorMessage(persistError),
          url: source.canonicalUrl,
        });
      }
    }
  }

  // Queue the unseen trusted URLs that missed this run's scrape budget as
  // pending rows so they stop vanishing; later runs drain this backlog first.
  const processedUrls = new Set(scrapeQueue.map((entry) => entry.source.canonicalUrl));
  const backlogCandidates = discovered.filter(
    (source) => !knownUrlSet.has(source.canonicalUrl) && !processedUrls.has(source.canonicalUrl)
  );
  for (const source of backlogCandidates.slice(0, EXTERNAL_CATALYST_MAX_BACKLOG_INSERTS_PER_RUN)) {
    try {
      const created = await dependencies.store.createSource({
        canonicalUrl: source.canonicalUrl,
        urlHash: source.urlHash,
        domain: source.domain,
        game: source.game,
        sourceKind: source.sourceKind,
        title: source.title,
        description: source.description,
        now,
      });
      if (created) {
        result.sourcesCreated += 1;
        result.backlogQueued = (result.backlogQueued ?? 0) + 1;
      }
    } catch (error) {
      result.errors.push({
        stage: "persist",
        message: errorMessage(error),
        url: source.canonicalUrl,
      });
    }
  }

  result.matches = dedupeCatalystCardMatches(result.matches);
  result.status = result.errors.length ? "partial" : "success";
  return result;
}
