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

export const EXTERNAL_CATALYST_DISCOVERY_INTERVAL_MS = 72 * 60 * 60_000;
export const EXTERNAL_CATALYST_SEARCH_LIMIT = 5;
export const EXTERNAL_CATALYST_MAX_SCRAPES_PER_RUN = 2;
export const EXTERNAL_CATALYST_RETRY_BACKOFF_MS = 72 * 60 * 60_000;

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
  creditsUsed: number;
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

export interface ExternalCatalystDiscoveryStore {
  findKnownCanonicalUrls(urls: readonly string[], now: Date): Promise<string[]>;
  touchKnownCanonicalUrls(urls: readonly string[], now: Date): Promise<void>;
  /** Returns null if a concurrent run already inserted the same canonical URL. */
  createSource(input: CatalystSourceCreateInput): Promise<{ id: string } | null>;
  persistScrapedSource(input: CatalystPersistenceInput): Promise<number>;
  markSourceFailed(sourceId: string, error: unknown, now: Date): Promise<void>;
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
  searchWeb: typeof searchFirecrawlWeb;
  scrapePage: typeof scrapeFirecrawlPage;
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
      : classification.kind === "support" || classification.kind === "product"
        ? 90
        : 180;
  return new Date(now.getTime() + days * 24 * 60 * 60_000);
}

function headlineForClassification(
  cardName: string,
  classification: CatalystClassification
): string {
  const label: Record<CatalystClassification["kind"], string> = {
    support: "New support signal",
    product: "Product announcement",
    reprint: classification.direction === "positive" ? "Scarcity signal" : "Reprint risk",
    ban: classification.direction === "positive" ? "Legality restored" : "Ban risk",
    rotation:
      classification.direction === "positive" ? "Rotation resilience" : "Rotation risk",
    hype: classification.direction === "negative" ? "Cooling attention" : "Rising attention",
  };
  return `${label[classification.kind]} for ${cardName}`.slice(0, 300);
}

function explanationForClassification(
  classification: CatalystClassification,
  sourceKind: CatalystSourceKind
): string {
  const direction =
    classification.direction === "positive"
      ? "can increase demand"
      : classification.direction === "negative"
        ? "can reduce demand or cap price upside"
        : "needs more confirmation before it is directional";
  const terms = classification.matchedTerms.slice(0, 3).join(", ");
  return `A ${sourceKind} source matched ${classification.kind}${terms ? ` (${terms})` : ""}. This ${direction}; it is evidence, not a guaranteed price move.`.slice(
    0,
    1_000
  );
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
              strength: Math.abs(classification.signedImpact),
              headline: headlineForClassification(match.cardName, classification),
              explanation: explanationForClassification(
                classification,
                match.sourceKind
              ),
              evidence_excerpt: evidenceExcerpt(input.scrape, match.cardName),
              observed_at: input.now,
              expires_at: expiryForClassification(classification, input.now),
            },
            update: {
              direction: classification.direction,
              strength: Math.abs(classification.signedImpact),
              headline: headlineForClassification(match.cardName, classification),
              explanation: explanationForClassification(
                classification,
                match.sourceKind
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
};

const DEFAULT_DEPENDENCIES: ExternalCatalystDiscoveryDependencies = {
  searchWeb: searchFirecrawlWeb,
  scrapePage: scrapeFirecrawlPage,
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
  const unseen = sources.filter((source) => !knownUrls.has(source.canonicalUrl));
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
    creditsUsed: 0,
    errors: [],
  };
}

export async function runExternalCatalystDiscovery(
  input: {
    candidates: readonly ExternalCatalystDiscoveryCandidate[];
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
  const queries = buildFirecrawlCatalystSearchQueries(candidates, now, {
    maxQueries: MAX_CATALYST_SEARCH_QUERIES,
  });
  result.queriesPlanned = queries.length;
  const discoveredByUrl = new Map<string, DiscoveredCatalystSource>();

  for (const query of queries) {
    try {
      const budgeted = await dependencies.runBudgetedRequest<FirecrawlWebSearchResponse>({
        consumer: FIRECRAWL_CONSUMER,
        operation: "catalyst-search",
        idempotencyKey: `external-catalyst:search:${discoveryBucket(now)}:${hash(`${query.game}\u0000${query.query}`)}`,
        estimatedCredits: SEARCH_ESTIMATED_CREDITS,
        request: () =>
          dependencies.searchWeb({
            query: query.query,
            limit: EXTERNAL_CATALYST_SEARCH_LIMIT,
            includeDomains: query.allowedDomains,
            tbs: "sbd:1,qdr:m",
          }),
        getCreditsUsed: (response) => response.creditsUsed,
      });
      if (!budgeted.executed || !budgeted.result) continue;
      result.searchesExecuted += 1;
      result.creditsUsed += budgeted.creditsUsed;
      const searchResults = budgeted.result.results.slice(0, EXTERNAL_CATALYST_SEARCH_LIMIT);
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
      // The budget layer counts a failed provider request conservatively. A
      // budget rejection itself did not consume credits.
      if (!(error instanceof FirecrawlBudgetError)) {
        result.creditsUsed += SEARCH_ESTIMATED_CREDITS;
      }
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
  const selected = selectUnseenSourcesFairly(discovered, knownUrlSet);

  for (const source of selected) {
    let sourceRow: { id: string } | null;
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
      const budgeted = await dependencies.runBudgetedRequest<FirecrawlPageScrapeResult>({
        consumer: FIRECRAWL_CONSUMER,
        operation: "catalyst-scrape",
        idempotencyKey: `external-catalyst:scrape:${discoveryBucket(now)}:${source.urlHash}`,
        estimatedCredits: SCRAPE_ESTIMATED_CREDITS,
        sourceUrl: source.canonicalUrl,
        request: () => dependencies.scrapePage(source.canonicalUrl),
        getCreditsUsed: (scrape) => scrape.creditsUsed,
      });
      if (!budgeted.executed || !budgeted.result) continue;
      result.creditsUsed += budgeted.creditsUsed;
      result.sourcesScraped += 1;
      const dedupedMatches = analyzeScrapedCatalystSource(
        source,
        budgeted.result,
        candidates
      );
      result.matches.push(...dedupedMatches);

      try {
        result.catalystsPersisted += await dependencies.store.persistScrapedSource({
          sourceId: sourceRow.id,
          source,
          scrape: budgeted.result,
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
      if (!(error instanceof FirecrawlBudgetError)) {
        result.creditsUsed += SCRAPE_ESTIMATED_CREDITS;
      }
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

  result.matches = dedupeCatalystCardMatches(result.matches);
  result.status = result.errors.length ? "partial" : "success";
  return result;
}
