import "server-only";

import type { Prisma } from "@/generated/prisma";
import {
  buildCardMarketProductUrl,
  withCardMarketFilters,
} from "@/lib/cardmarket";
import { db } from "@/lib/db";
import { isHiddenExpansion } from "@/lib/episodes";
import {
  FirecrawlBudgetError,
  getFirecrawlBudgetSnapshot,
  runBudgetedFirecrawlRequest,
} from "@/lib/firecrawl-budget";
import {
  scrapeFirecrawlPage,
  type FirecrawlPageScrapeResult,
} from "@/lib/firecrawl";
import { buildNormalizedSealedPriceFields } from "@/lib/sealed-price-preservation";

const JOB_TYPE = "sealed-cardmarket-base-price";
const FIRECRAWL_CONSUMER = "sealed-cardmarket-base-price";
const JOB_STALE_MS = 15 * 60_000;
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
const PROVIDER_SAFETY_RESERVE_CREDITS = 25;

export const SEALED_CARDMARKET_BASE_PRICE_INTERVAL_MS = 2 * HOUR_MS;

let activeJob: Promise<SealedCardMarketBasePriceRunResult> | null = null;
let activeHistoryRestore: Promise<number> | null = null;

type AttemptOutcome =
  | "updated"
  | "already-priced"
  | "no-offers"
  | "missing-link"
  | "identity-mismatch"
  | "deduped"
  | "budget-paused"
  | "failed"
  | "no-work"
  | "busy";

type BacklogCandidate = {
  id: string;
  name: string;
  cardmarket_url: string | null;
  cardmarket_id: string | null;
  episode_id: string;
  episode: {
    id: string;
    name: string;
    code: string | null;
    release_date: string | null;
  };
};

type HistoricalCurrentPriceRow = {
  product_id: string;
  cm_lowest: number | null;
  cm_lowest_eu: number | null;
  cm_lowest_de: number | null;
  cm_lowest_fr: number | null;
  cm_lowest_es: number | null;
  cm_lowest_it: number | null;
  cm_avg_7d: number | null;
  cm_avg_30d: number | null;
};

type ProductCooldown = {
  failures: number;
  nextAttemptAt: string;
  outcome: AttemptOutcome;
  error: string | null;
};

type PersistedDetails = {
  version: 1;
  kind: typeof JOB_TYPE;
  cooldowns: Record<string, ProductCooldown>;
  lastRun?: SealedCardMarketBasePriceRunResult;
  error?: string | null;
};

export interface SealedCardMarketBasePriceRunResult {
  outcome: AttemptOutcome;
  processedProducts: 0 | 1;
  productId: string | null;
  productName: string | null;
  sourceUrl: string | null;
  priceEur: number | null;
  creditsUsed: number;
  startedAt: string;
  finishedAt: string;
  error: string | null;
}

export interface SealedCardMarketBasePriceJobSnapshot {
  started: boolean;
  running: boolean;
  due: boolean;
  status: string | null;
  backlogProducts: number;
  dueProducts: number;
  exactIdProducts: number;
  nextAttemptAt: string | null;
  nextRunAt: string | null;
  lastFinishedAt: string | null;
  lastResult: SealedCardMarketBasePriceRunResult | null;
  budget: {
    configured: boolean;
    globalRemaining: number;
    consumerRemaining: number;
    providerRemaining: number | null;
    providerPlan: number | null;
  };
  error: string | null;
}

export interface ParsedSealedCardMarketOfferTable {
  priceEur: number | null;
  offerCount: number;
  articleRowCount: number;
  explicitNoOffers: boolean;
}

function todayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function currentPriceMissingConditions(): Prisma.SealedProductWhereInput[] {
  return [
    { OR: [{ cm_lowest: null }, { cm_lowest: { lte: 0 } }, { cm_lowest: 9001 }] },
    {
      OR: [
        { cm_lowest_eu: null },
        { cm_lowest_eu: { lte: 0 } },
        { cm_lowest_eu: 9001 },
      ],
    },
    {
      OR: [
        { cm_lowest_de: null },
        { cm_lowest_de: { lte: 0 } },
        { cm_lowest_de: 9001 },
      ],
    },
    {
      OR: [
        { cm_lowest_fr: null },
        { cm_lowest_fr: { lte: 0 } },
        { cm_lowest_fr: 9001 },
      ],
    },
    {
      OR: [
        { cm_lowest_es: null },
        { cm_lowest_es: { lte: 0 } },
        { cm_lowest_es: 9001 },
      ],
    },
    {
      OR: [
        { cm_lowest_it: null },
        { cm_lowest_it: { lte: 0 } },
        { cm_lowest_it: 9001 },
      ],
    },
  ];
}

export function buildSealedCardMarketBasePriceBacklogWhere(
  now = new Date()
): Prisma.SealedProductWhereInput {
  return {
    game: "pokemon",
    episode: { release_date: { not: null, lte: todayKey(now) } },
    // An explicit product release date wins over its expansion date. Null is
    // allowed because older catalogue products often only have the expansion
    // date available.
    OR: [
      { cardmarket_id: { not: null } },
      { cardmarket_url: { startsWith: "https://www.cardmarket.com/" } },
    ],
    AND: [
      {
        OR: [{ release_date: null }, { release_date: { lte: now } }],
      },
      ...currentPriceMissingConditions(),
    ],
  };
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;|&#0*38;/gi, "&")
    .replace(/&quot;|&#0*34;/gi, '"')
    .replace(/&#(?:x27|0*39);|&apos;/gi, "'")
    .replace(/&nbsp;|&#(?:xa0|0*160);/gi, " ")
    .replace(/&euro;|&#(?:x20ac|0*8364);/gi, "€");
}

function htmlToText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSealedCardMarketProductName(
  value: string | null | undefined
): string {
  return decodeHtmlEntities(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stripCardMarketTitleSuffix(title: string): string {
  return title
    .replace(/\s*\|\s*Cardmarket(?:\s.*)?$/i, "")
    .replace(/\s+[\u2013\u2014-]\s+Cardmarket(?:\s.*)?$/i, "")
    .trim();
}

export function sealedCardMarketProductIdentityMatches(input: {
  expectedName: string;
  observedTitle: string | null | undefined;
}): boolean {
  const expected = normalizeSealedCardMarketProductName(input.expectedName);
  const observed = normalizeSealedCardMarketProductName(
    stripCardMarketTitleSuffix(input.observedTitle ?? "")
  );
  return Boolean(expected && observed && expected === observed);
}

function isExactDirectCardMarketSealedUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "www.cardmarket.com") {
      return false;
    }
    const segments = url.pathname.split("/").filter(Boolean);
    const start = /^[a-z]{2}$/i.test(segments[0] ?? "") ? 1 : 0;
    if ((segments[start] ?? "").toLowerCase() !== "pokemon") return false;
    if ((segments[start + 1] ?? "").toLowerCase() !== "products") return false;
    const productId = url.searchParams.get("idProduct")?.trim() ?? "";
    if (/^\d+$/.test(productId) && Number(productId) > 0) return true;
    const category = segments[start + 2]?.trim();
    const productSlug = segments[start + 3]?.trim();
    return Boolean(
      category &&
        productSlug &&
        category.toLowerCase() !== "search"
    );
  } catch {
    return false;
  }
}

export function resolveSealedCardMarketExactSourceUrl(input: {
  cardmarketId: string | null | undefined;
  cardmarketUrl: string | null | undefined;
}): string | null {
  const productId = input.cardmarketId?.trim() ?? "";
  if (/^\d+$/.test(productId) && Number(productId) > 0) {
    return buildCardMarketProductUrl(productId, "pokemon");
  }
  if (!isExactDirectCardMarketSealedUrl(input.cardmarketUrl)) return null;
  return withCardMarketFilters(input.cardmarketUrl);
}

function parsePriceToken(value: string): number | null {
  const normalized = decodeHtmlEntities(value).replace(/[^\d.,]/g, "");
  if (!normalized) return null;
  const commaIndex = normalized.lastIndexOf(",");
  const dotIndex = normalized.lastIndexOf(".");
  const decimalIndex = Math.max(commaIndex, dotIndex);
  const integerPart = decimalIndex >= 0
    ? normalized.slice(0, decimalIndex).replace(/[.,]/g, "")
    : normalized.replace(/[.,]/g, "");
  const decimalPart = decimalIndex >= 0
    ? normalized.slice(decimalIndex + 1).replace(/[^\d]/g, "")
    : "";
  const numeric = Number(
    `${integerPart || "0"}${decimalPart ? `.${decimalPart.slice(0, 2)}` : ""}`
  );
  return Number.isFinite(numeric) && numeric > 0 && numeric !== 9001 && numeric < 10_000_000
    ? numeric
    : null;
}

function extractArticleRows(html: string): string[] {
  const starts = [...html.matchAll(/<div\b[^>]*\bid=["']articleRow[^"']*["'][^>]*>/gi)]
    .map((match) => match.index)
    .filter((index): index is number => index != null);

  return starts.map((start, index) => {
    const nextStart = starts[index + 1];
    const footerStart = html.indexOf('<div class="table-footer"', start);
    const end = nextStart ?? (footerStart >= 0 ? footerStart : html.length);
    return html.slice(start, end);
  });
}

function extractArticlePrice(row: string): number | null {
  for (const match of row.matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi)) {
    const classes = match[1]?.match(/\bclass=["']([^"']+)["']/i)?.[1]?.split(/\s+/) ?? [];
    if (!classes.includes("color-primary")) continue;
    const price = parsePriceToken(htmlToText(match[2] ?? ""));
    if (price != null) return price;
  }
  return null;
}

function hasExplicitNoOfferMarker(scrape: Pick<FirecrawlPageScrapeResult, "html" | "markdown">): boolean {
  const expected = "currently there are no available offers for this article.";
  for (const match of scrape.html.matchAll(
    /<p\b[^>]*class=["'][^"']*\bnoResults\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi
  )) {
    if (htmlToText(match[1] ?? "").toLowerCase() === expected) return true;
  }
  return scrape.markdown
    .split(/\r?\n/)
    .some((line) => line.trim().toLowerCase() === expected);
}

/**
 * Sealed CardMarket rows do not contain the condition/language attribute
 * block used for singles. The request is filtered to English, so the strict
 * sealed parser simply reads one price from each Article row. Zero offers are
 * accepted only when CardMarket emits its explicit no-offer marker.
 */
export function parseSealedCardMarketOfferTable(
  scrape: Pick<FirecrawlPageScrapeResult, "html" | "markdown">
): ParsedSealedCardMarketOfferTable {
  const rows = extractArticleRows(scrape.html);
  const prices = rows
    .map(extractArticlePrice)
    .filter((price): price is number => price != null);
  return {
    priceEur: prices.length > 0 ? Math.min(...prices) : null,
    offerCount: prices.length,
    articleRowCount: rows.length,
    explicitNoOffers: hasExplicitNoOfferMarker(scrape),
  };
}

function observedProductTitle(scrape: FirecrawlPageScrapeResult): string | null {
  if (scrape.title?.trim()) return scrape.title.trim();
  const htmlTitle = scrape.html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return htmlTitle ? htmlToText(htmlTitle) : null;
}

export function buildSealedCardMarketSnapshotData(input: {
  productId: string;
  episodeId: string;
  priceEur: number;
  observedAt: Date;
}) {
  return {
    product_id: input.productId,
    episode_id: input.episodeId,
    fetched_at: input.observedAt,
    cm_lowest: input.priceEur,
    cm_lowest_eu: null,
    cm_lowest_de: null,
    cm_lowest_fr: null,
    cm_lowest_es: null,
    cm_lowest_it: null,
    cm_avg_7d: null,
    cm_avg_30d: null,
  };
}

export function isVisibleSealedCardMarketEpisode(input: {
  id: string;
  name: string;
  code: string | null;
}): boolean {
  return !isHiddenExpansion(input);
}

function sortCandidates(candidates: BacklogCandidate[]): BacklogCandidate[] {
  return [...candidates].sort((left, right) => {
    const exactIdDifference = Number(Boolean(right.cardmarket_id)) - Number(Boolean(left.cardmarket_id));
    if (exactIdDifference !== 0) return exactIdDifference;
    return (
      (right.episode.release_date ?? "").localeCompare(left.episode.release_date ?? "") ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id)
    );
  });
}

async function loadBacklog(now: Date): Promise<BacklogCandidate[]> {
  const candidates = await db.sealedProduct.findMany({
    where: buildSealedCardMarketBasePriceBacklogWhere(now),
    orderBy: [{ episode_id: "asc" }, { name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      cardmarket_url: true,
      cardmarket_id: true,
      episode_id: true,
      episode: {
        select: { id: true, name: true, code: true, release_date: true },
      },
    },
  });
  return sortCandidates(
    candidates.filter(
      (candidate) =>
        isVisibleSealedCardMarketEpisode(candidate.episode) &&
        Boolean(
          resolveSealedCardMarketExactSourceUrl({
            cardmarketId: candidate.cardmarket_id,
            cardmarketUrl: candidate.cardmarket_url,
          })
        )
    )
  );
}

export async function restoreMissingCurrentPricesFromHistory(now: Date): Promise<number> {
  const targets = await db.sealedProduct.findMany({
    where: {
      game: "pokemon",
      episode: { release_date: { not: null, lte: todayKey(now) } },
      AND: [
        { OR: [{ release_date: null }, { release_date: { lte: now } }] },
        ...currentPriceMissingConditions(),
      ],
    },
    select: {
      id: true,
      episode: { select: { id: true, name: true, code: true } },
    },
  });
  const targetIds = targets
    .filter((target) => isVisibleSealedCardMarketEpisode(target.episode))
    .map((target) => target.id);
  if (targetIds.length === 0) return 0;

  const latestRows: HistoricalCurrentPriceRow[] = [];
  for (let index = 0; index < targetIds.length; index += 250) {
    const chunk = targetIds.slice(index, index + 250);
    const placeholders = chunk.map(() => "?").join(", ");
    latestRows.push(
      ...(await db.$queryRawUnsafe<HistoricalCurrentPriceRow[]>(
        `
        SELECT
          product_id,
          cm_lowest,
          cm_lowest_eu,
          cm_lowest_de,
          cm_lowest_fr,
          cm_lowest_es,
          cm_lowest_it,
          cm_avg_7d,
          cm_avg_30d
        FROM (
          SELECT
            s.*,
            ROW_NUMBER() OVER (
              PARTITION BY s.product_id
              ORDER BY s.fetched_at DESC, s.id DESC
            ) AS row_num
          FROM "SealedPriceSnapshot" s
          WHERE s.product_id IN (${placeholders})
            AND (
              (s.cm_lowest > 0 AND s.cm_lowest <> 9001)
              OR (s.cm_lowest_eu > 0 AND s.cm_lowest_eu <> 9001)
              OR (s.cm_lowest_de > 0 AND s.cm_lowest_de <> 9001)
              OR (s.cm_lowest_fr > 0 AND s.cm_lowest_fr <> 9001)
              OR (s.cm_lowest_es > 0 AND s.cm_lowest_es <> 9001)
              OR (s.cm_lowest_it > 0 AND s.cm_lowest_it <> 9001)
            )
        )
        WHERE row_num = 1
        `,
        ...chunk
      ))
    );
  }

  let restored = 0;
  for (let index = 0; index < latestRows.length; index += 100) {
    const updates = await db.$transaction(
      latestRows.slice(index, index + 100).map((row) => {
        const normalized = buildNormalizedSealedPriceFields(row);
        return db.sealedProduct.updateMany({
          where: { id: row.product_id, AND: currentPriceMissingConditions() },
          data: {
            cm_lowest: normalized.cm_lowest,
            cm_lowest_eu: normalized.cm_lowest_eu,
            cm_lowest_de: normalized.cm_lowest_de,
            cm_lowest_fr: normalized.cm_lowest_fr,
            cm_lowest_es: normalized.cm_lowest_es,
            cm_lowest_it: normalized.cm_lowest_it,
          },
        });
      })
    );
    restored += updates.reduce((total, update) => total + update.count, 0);
  }
  return restored;
}

async function restoreMissingCurrentPricesFromHistoryOnce(now: Date): Promise<number> {
  if (activeHistoryRestore) return activeHistoryRestore;
  activeHistoryRestore = restoreMissingCurrentPricesFromHistory(now).finally(() => {
    activeHistoryRestore = null;
  });
  return activeHistoryRestore;
}

function parseDetails(detailsJson: string | null | undefined): PersistedDetails {
  try {
    const parsed = detailsJson ? (JSON.parse(detailsJson) as Partial<PersistedDetails>) : null;
    if (parsed?.version === 1 && parsed.kind === JOB_TYPE && parsed.cooldowns) {
      return {
        version: 1,
        kind: JOB_TYPE,
        cooldowns: parsed.cooldowns,
        lastRun: parsed.lastRun,
        error: typeof parsed.error === "string" ? parsed.error : null,
      };
    }
  } catch {
    // A malformed old status must not permanently stop the backlog.
  }
  return { version: 1, kind: JOB_TYPE, cooldowns: {}, error: null };
}

function cooldownDate(cooldown: ProductCooldown | undefined): Date | null {
  if (!cooldown) return null;
  const value = new Date(cooldown.nextAttemptAt);
  return Number.isFinite(value.getTime()) ? value : null;
}

function isCoolingDown(cooldown: ProductCooldown | undefined, now: Date): boolean {
  const until = cooldownDate(cooldown);
  return Boolean(until && until > now);
}

function cooldownMs(outcome: AttemptOutcome, failures: number): number {
  if (["no-offers", "missing-link", "identity-mismatch"].includes(outcome)) {
    return 30 * DAY_MS;
  }
  if (outcome === "budget-paused" || outcome === "deduped") return 6 * HOUR_MS;
  return Math.min(7 * DAY_MS, HOUR_MS * 2 ** Math.min(6, Math.max(0, failures - 1)));
}

function pruneCooldowns(
  cooldowns: Record<string, ProductCooldown>,
  candidates: BacklogCandidate[]
): Record<string, ProductCooldown> {
  const liveIds = new Set(candidates.map((candidate) => candidate.id));
  return Object.fromEntries(
    Object.entries(cooldowns).filter(([productId]) => liveIds.has(productId))
  );
}

async function budgetedScrape(input: {
  productId: string;
  attempt: number;
  url: string;
}): Promise<{ scrape: FirecrawlPageScrapeResult | null; creditsUsed: number }> {
  const request = await runBudgetedFirecrawlRequest({
    consumer: FIRECRAWL_CONSUMER,
    operation: "cardmarket-sealed-product",
    idempotencyKey: `${FIRECRAWL_CONSUMER}:v1:${input.productId}:${input.attempt}:product`,
    estimatedCredits: 1,
    sourceUrl: input.url,
    request: () => scrapeFirecrawlPage(input.url, { onlyMainContent: false }),
    getCreditsUsed: (result) => result.creditsUsed ?? 1,
  });
  return {
    scrape: request.executed ? request.result : null,
    creditsUsed: request.creditsUsed,
  };
}

async function persistAcceptedPrice(input: {
  candidate: BacklogCandidate;
  priceEur: number;
  observedAt: Date;
}): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const updated = await tx.sealedProduct.updateMany({
      where: {
        id: input.candidate.id,
        AND: currentPriceMissingConditions(),
      },
      data: {
        cm_lowest: input.priceEur,
        cm_lowest_eu: null,
        cm_lowest_de: null,
        cm_lowest_fr: null,
        cm_lowest_es: null,
        cm_lowest_it: null,
      },
    });
    if (updated.count === 0) return false;

    await tx.sealedPriceSnapshot.create({
      data: buildSealedCardMarketSnapshotData({
        productId: input.candidate.id,
        episodeId: input.candidate.episode_id,
        priceEur: input.priceEur,
        observedAt: input.observedAt,
      }),
    });
    return true;
  });
}

function makeAttemptResult(input: {
  outcome: AttemptOutcome;
  startedAt: Date;
  candidate?: BacklogCandidate | null;
  sourceUrl?: string | null;
  priceEur?: number | null;
  creditsUsed?: number;
  error?: string | null;
}): SealedCardMarketBasePriceRunResult {
  return {
    outcome: input.outcome,
    processedProducts: input.candidate ? 1 : 0,
    productId: input.candidate?.id ?? null,
    productName: input.candidate?.name ?? null,
    sourceUrl: input.sourceUrl ?? null,
    priceEur: input.priceEur ?? null,
    creditsUsed: input.creditsUsed ?? 0,
    startedAt: input.startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    error: input.error ?? null,
  };
}

async function processCandidate(
  candidate: BacklogCandidate,
  attempt: number,
  startedAt: Date
): Promise<SealedCardMarketBasePriceRunResult> {
  const sourceUrl = resolveSealedCardMarketExactSourceUrl({
    cardmarketId: candidate.cardmarket_id,
    cardmarketUrl: candidate.cardmarket_url,
  });
  if (!sourceUrl) {
    return makeAttemptResult({
      outcome: "missing-link",
      startedAt,
      candidate,
      error: "No exact CardMarket product id or direct product URL is stored.",
    });
  }

  let creditsUsed = 0;
  try {
    const product = await budgetedScrape({
      productId: candidate.id,
      attempt,
      url: sourceUrl,
    });
    creditsUsed += product.creditsUsed;
    if (!product.scrape) {
      return makeAttemptResult({
        outcome: "deduped",
        startedAt,
        candidate,
        sourceUrl,
        creditsUsed,
        error: "This exact CardMarket product attempt was already reserved or completed.",
      });
    }

    const observedTitle = observedProductTitle(product.scrape);
    if (!sealedCardMarketProductIdentityMatches({
      expectedName: candidate.name,
      observedTitle,
    })) {
      return makeAttemptResult({
        outcome: "identity-mismatch",
        startedAt,
        candidate,
        sourceUrl: product.scrape.sourceUrl,
        creditsUsed,
        error: `CardMarket title mismatch; expected ${candidate.name}, received ${observedTitle ?? "no title"}.`,
      });
    }

    const offerTable = parseSealedCardMarketOfferTable(product.scrape);
    if (offerTable.priceEur == null) {
      if (offerTable.articleRowCount === 0 && offerTable.explicitNoOffers) {
        return makeAttemptResult({
          outcome: "no-offers",
          startedAt,
          candidate,
          sourceUrl: product.scrape.sourceUrl,
          creditsUsed,
          error: "CardMarket explicitly reports no available English offers for this sealed product.",
        });
      }
      return makeAttemptResult({
        outcome: "failed",
        startedAt,
        candidate,
        sourceUrl: product.scrape.sourceUrl,
        creditsUsed,
        error: "CardMarket did not return a readable sealed offer table; nothing was written.",
      });
    }

    const inserted = await persistAcceptedPrice({
      candidate,
      priceEur: offerTable.priceEur,
      observedAt: startedAt,
    });
    return makeAttemptResult({
      outcome: inserted ? "updated" : "already-priced",
      startedAt,
      candidate,
      sourceUrl: product.scrape.sourceUrl,
      priceEur: offerTable.priceEur,
      creditsUsed,
    });
  } catch (error) {
    const budgetPaused = error instanceof FirecrawlBudgetError;
    return makeAttemptResult({
      outcome: budgetPaused ? "budget-paused" : "failed",
      startedAt,
      candidate,
      sourceUrl,
      creditsUsed,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function claimJob(now: Date) {
  const job = await db.syncJob.upsert({
    where: { type: JOB_TYPE },
    create: { type: JOB_TYPE, status: "idle" },
    update: {},
  });
  const claimed = await db.syncJob.updateMany({
    where: {
      id: job.id,
      OR: [
        { status: { not: "running" } },
        { heartbeat_at: null },
        { heartbeat_at: { lt: new Date(now.getTime() - JOB_STALE_MS) } },
      ],
    },
    data: {
      status: "running",
      started_at: now,
      finished_at: null,
      heartbeat_at: now,
    },
  });
  return claimed.count === 1 ? job : null;
}

function terminalStatus(outcome: AttemptOutcome): string {
  if (outcome === "budget-paused") return "quota-paused";
  if (outcome === "failed") return "failed";
  if (["updated", "already-priced", "no-work"].includes(outcome)) return "success";
  return "partial";
}

export async function runSealedCardMarketBasePriceJob(
  now = new Date()
): Promise<SealedCardMarketBasePriceRunResult> {
  const job = await claimJob(now);
  if (!job) return makeAttemptResult({ outcome: "busy", startedAt: now });

  const details = parseDetails(job.details_json);
  try {
    // Historical quotes are local evidence and cost no scrape credit. Restore
    // them first, without touching synced_at or inventing a fresh snapshot.
    await restoreMissingCurrentPricesFromHistoryOnce(now);
    const candidates = await loadBacklog(now);
    details.cooldowns = pruneCooldowns(details.cooldowns, candidates);
    // Never-attempted products go first so zero-offer pages cannot repeatedly
    // starve the rest of the backlog when their long cooldown expires.
    const candidate =
      candidates.find((item) => !details.cooldowns[item.id]) ??
      candidates.find((item) => !isCoolingDown(details.cooldowns[item.id], now));
    const result = candidate
      ? await processCandidate(
          candidate,
          (details.cooldowns[candidate.id]?.failures ?? 0) + 1,
          now
        )
      : makeAttemptResult({ outcome: "no-work", startedAt: now });

    if (candidate) {
      if (["updated", "already-priced"].includes(result.outcome)) {
        delete details.cooldowns[candidate.id];
      } else {
        const failures = (details.cooldowns[candidate.id]?.failures ?? 0) + 1;
        details.cooldowns[candidate.id] = {
          failures,
          outcome: result.outcome,
          error: result.error,
          nextAttemptAt: new Date(
            now.getTime() + cooldownMs(result.outcome, failures)
          ).toISOString(),
        };
      }
    }

    details.lastRun = result;
    details.error = result.error;
    await db.syncJob.update({
      where: { id: job.id },
      data: {
        status: terminalStatus(result.outcome),
        details_json: JSON.stringify(details),
        heartbeat_at: new Date(),
        finished_at: new Date(),
      },
    });
    return result;
  } catch (error) {
    const result = makeAttemptResult({
      outcome: "failed",
      startedAt: now,
      error: error instanceof Error ? error.message : String(error),
    });
    details.lastRun = result;
    details.error = result.error;
    await db.syncJob
      .update({
        where: { id: job.id },
        data: {
          status: "failed",
          details_json: JSON.stringify(details),
          heartbeat_at: new Date(),
          finished_at: new Date(),
        },
      })
      .catch(() => undefined);
    return result;
  }
}

function jobIsRunning(
  job: { status: string; heartbeat_at: Date | null } | null,
  now: Date
): boolean {
  return Boolean(
    job?.status === "running" &&
      job.heartbeat_at &&
      job.heartbeat_at > new Date(now.getTime() - JOB_STALE_MS)
  );
}

export async function getSealedCardMarketBasePriceJobSnapshot(
  now = new Date()
): Promise<SealedCardMarketBasePriceJobSnapshot> {
  const [job, candidates, budget] = await Promise.all([
    db.syncJob.findUnique({ where: { type: JOB_TYPE } }),
    loadBacklog(now),
    getFirecrawlBudgetSnapshot(FIRECRAWL_CONSUMER, now),
  ]);
  const details = parseDetails(job?.details_json);
  const cooldowns = pruneCooldowns(details.cooldowns, candidates);
  const dueCandidates = candidates.filter(
    (candidate) => !isCoolingDown(cooldowns[candidate.id], now)
  );
  const nextAttemptAt = candidates
    .map((candidate) => cooldownDate(cooldowns[candidate.id]))
    .filter((value): value is Date => Boolean(value && value > now))
    .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
  const lastFinishedAt = job?.finished_at ? new Date(job.finished_at) : null;
  const nextRunAt = lastFinishedAt
    ? new Date(lastFinishedAt.getTime() + SEALED_CARDMARKET_BASE_PRICE_INTERVAL_MS)
    : null;
  const due =
    candidates.length > 0 &&
    dueCandidates.length > 0 &&
    (!nextRunAt || nextRunAt <= now);

  return {
    started: false,
    running: Boolean(activeJob || jobIsRunning(job, now)),
    due,
    status: job?.status ?? null,
    backlogProducts: candidates.length,
    dueProducts: dueCandidates.length,
    exactIdProducts: candidates.filter((candidate) => Boolean(candidate.cardmarket_id)).length,
    nextAttemptAt: nextAttemptAt?.toISOString() ?? null,
    nextRunAt: nextRunAt?.toISOString() ?? null,
    lastFinishedAt: lastFinishedAt?.toISOString() ?? null,
    lastResult: details.lastRun ?? null,
    budget: {
      configured: budget.configured,
      globalRemaining: budget.globalRemaining,
      consumerRemaining: budget.consumerRemaining,
      providerRemaining: budget.providerRemaining,
      providerPlan: budget.providerPlan,
    },
    error: details.error ?? null,
  };
}

function launchSealedCardMarketBasePriceJob(now: Date): void {
  if (activeJob) return;
  activeJob = runSealedCardMarketBasePriceJob(now)
    .catch((error: unknown) => {
      console.error(
        "[sealed-cardmarket-base-price-job] scheduled run failed:",
        error instanceof Error ? error.message : String(error)
      );
      return makeAttemptResult({
        outcome: "failed",
        startedAt: now,
        error: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      activeJob = null;
    });
}

export async function maybeStartSealedCardMarketBasePriceJob(options?: {
  skip?: boolean;
  now?: Date;
}): Promise<SealedCardMarketBasePriceJobSnapshot> {
  const now = options?.now ?? new Date();
  // This repair uses only our own snapshot history and no provider credit.
  // Run it before every budget/reserve gate so a low Firecrawl balance can
  // never postpone restoration of prices we already know locally.
  await restoreMissingCurrentPricesFromHistoryOnce(now).catch((error: unknown) => {
    console.error(
      "[sealed-cardmarket-base-price-job] local history restore failed:",
      error instanceof Error ? error.message : String(error)
    );
    return 0;
  });
  const snapshot = await getSealedCardMarketBasePriceJobSnapshot(now);
  const providerReserveReached =
    snapshot.budget.providerRemaining != null &&
    snapshot.budget.providerRemaining <= PROVIDER_SAFETY_RESERVE_CREDITS;
  if (
    options?.skip ||
    snapshot.running ||
    !snapshot.due ||
    !snapshot.budget.configured ||
    snapshot.budget.globalRemaining <= 0 ||
    snapshot.budget.consumerRemaining <= 0 ||
    providerReserveReached
  ) {
    return snapshot;
  }
  launchSealedCardMarketBasePriceJob(now);
  return { ...snapshot, started: true, running: true, status: "queued" };
}
