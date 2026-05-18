import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import {
  formatAutoPriceRefreshPauseRemaining,
  getAutoPriceRefreshPauseRemainingMs,
} from "@/lib/auto-price-refresh-pause";
import { isHiddenExpansion, isPromoExpansion, isRedundantSubsetExpansion } from "@/lib/episodes";
import {
  getGameFromScopedId,
  normalizeTradingCardGame,
  ONE_PIECE_GAME,
  POKEMON_GAME,
  type TradingCardGame,
} from "@/lib/games";
import { startPerformanceTimer, timeAsync } from "@/lib/performance-timing";
import { getPriceRefreshInfo, type PriceRefreshTier } from "@/lib/price-refresh";
import {
  decodeSyncLogMessage,
  encodeSyncLogDetailsJson,
  type AutoPriceRefreshCurrentSetDetails,
  type CardHistoryLogDetails,
  type EbaySoldGradedPriceLogDetails,
  type SyncLogDetails,
} from "@/lib/sync-log-details";
import { resolveTcgdexSupertype } from "@/lib/tcgdex";
import {
  buildCardWriteData,
  dedupeEbaySoldGradedCreateRows,
  dedupeGradedCreateRows,
  findExistingCardsForSync,
  hasAnyMarketplaceId,
  hasAnyPrice,
  hasCardChanges,
  loadEpisodeCardEnrichmentLookups,
  pricesMatch,
  syncCardWithEpisodeSelect,
  type CardWriteData,
  type EbaySoldGradedCreateRow,
  type ExistingPriceRecord,
  type GradedCreateRow,
  type PriceSnapshotData,
} from "@/lib/sync/card-helpers";
import {
  assessEpisodeSourceCheck,
  buildEpisodeSourceCheckUpdate,
  createEmptyAutoCatalogSyncSelection,
  hasEpisodeSourceIssue,
  mergeKnownEpisodeCardCount,
  previewAutoCatalogSync,
  selectAutoCatalogSyncBatch,
  type AutoCatalogSyncSelection,
  upsertVisibleRemoteEpisodes,
} from "@/lib/sync/catalog";
import { warmEpisodeImages } from "@/lib/sync/image-warmer";
import {
  extractEbaySoldGradedPrices,
  extractGradedPrices,
  extractPrices,
  fetchAllEpisodes,
  fetchCardDetail,
  fetchCardsForEpisode,
  fetchHistoryPricesByItemId,
  fetchSealedProductsForEpisode,
  isTcggoHttpStatusError,
  isTcggoQuotaExceededError,
  type NormalizedCard,
  type NormalizedSealedProduct,
} from "@/lib/tcggo";
import {
  createAutoPriceRefreshBatchId,
  createAutoPriceRefreshLogDetails,
  createAutoPriceRefreshResultDetails,
  createCardHistoryLogDetails,
  createCardHistoryResultDetails,
  createEbaySoldGradedPriceLogDetails,
  createEbaySoldGradedPriceResultDetails,
  createEpisodeSyncLogDetails,
  createEpisodeSyncResultDetails,
  createFullSyncLogDetails,
  createFullSyncResultDetails,
  createSealedSyncLogDetails,
  createSealedSyncResultDetails,
  getQuotaPauseMessage,
  getTcggoQuotaResultFields,
  markSyncLogDetailsStatus,
} from "@/lib/sync/progress-details";

const ACTIVE_SYNC_STALE_MS = 1000 * 60 * 60 * 2;
const CANCEL_REQUEST_STALE_MS = 1000 * 60 * 5;
const STALE_SYNC_MESSAGE = "Marked stale after exceeding sync timeout";
const STALE_CANCELLED_SYNC_MESSAGE = "Marked cancelled after stop request exceeded timeout";
const SYNC_CANCELLED_MESSAGE = "Cancelled by user after the current batch finished.";
const AUTO_PRICE_REFRESH_TYPE = "auto-prices";
const CARD_HISTORY_SYNC_TYPE = "card-history";
const EBAY_SOLD_GRADED_PRICE_SYNC_TYPE = "ebay-sold-graded-prices";
const KNOWN_UNAVAILABLE_PRICE_CHECK_TYPE = "known-unavailable-prices";
const AUTO_PRICE_REFRESH_MAX_EPISODES = 12;
const AUTO_PRICE_REFRESH_MAX_CARDS = 1200;
const AUTO_CATALOG_SYNC_GAMES = [POKEMON_GAME, ONE_PIECE_GAME] as const;
const AUTO_PRICE_BACKFILL_MAX_EPISODES = 6;
const AUTO_PRICE_BACKFILL_MAX_CARDS = 400;
const KNOWN_UNAVAILABLE_PRICE_CHECK_MAX_EPISODES = 8;
const KNOWN_UNAVAILABLE_PRICE_CHECK_MAX_CARDS = 240;
const KNOWN_UNAVAILABLE_PRICE_CHECK_CONCURRENCY = 2;
const AUTO_PRICE_PREEMPT_WAIT_TIMEOUT_MS = 1000 * 60 * 5;
const AUTO_CATALOG_SYNC_MIN_INTERVAL_MS = 1000 * 60 * 60;
const AUTO_CATALOG_SYNC_MAX_EPISODES = 6;
// Episodes are synced in parallel; the per-request rate limiter in tcggo.ts
// caps the actual API call rate at 300/min, so episode-level concurrency is
// effectively a pipeline width — 4 keeps initial work parallel without
// queueing too many episodes ahead of the rate-limited API floor.
const EPISODE_SYNC_CONCURRENCY = 4;
const FULL_SYNC_PROMO_VERIFICATION_LIMIT = 2;
const PRICE_SOURCE_UNAVAILABLE_RETRY_MS = 1000 * 60 * 60 * 24 * 7;
const NATIVE_HISTORY_UNAVAILABLE_RETRY_MS = 1000 * 60 * 60 * 24 * 30;
const EBAY_SOLD_GRADED_UNAVAILABLE_RETRY_MS = 1000 * 60 * 60 * 24 * 30;
const HISTORY_BACKFILL_BATCH_SIZE = 12;
const MANUAL_HISTORY_SYNC_BATCH_SIZE = 6;
const MANUAL_HISTORY_SYNC_MAX_CARDS_PER_RUN = 48;
const MANUAL_EBAY_SOLD_GRADED_PRICE_SYNC_MAX_CARDS_PER_RUN = 48;
const MANUAL_EBAY_SOLD_GRADED_PRICE_SYNC_CONCURRENCY = 4;
// SQLite + better-sqlite3 happily handles 300+ rows per insert; the previous 60
// caused 5x more round-trips than necessary on price snapshot writes.
const DB_WRITE_BATCH_SIZE = 300;
const AUTO_NATIVE_HISTORY_CARD_BACKFILL_MAX = 0;
const AUTO_NATIVE_HISTORY_PRODUCT_BACKFILL_MAX = 0;
const CANCELLATION_CHECK_INTERVAL_MS = 250;
const SYNC_WAIT_POLL_INTERVAL_MS = 300;
const MANUAL_HISTORY_BASE_PRICE_ONLY_RARITIES = [
  "Common",
  "Uncommon",
  "COMMON",
  "UNCOMMON",
  "common",
  "uncommon",
  "C",
  "UC",
  "c",
  "uc",
] as const;
const MANUAL_HISTORY_POKEMON_RARE_EXCLUDED_RARITIES = [
  "Rare",
  "RARE",
  "rare",
  "R",
  "r",
] as const;

function getAutoCatalogGameLabel(game: TradingCardGame): string {
  return game === ONE_PIECE_GAME ? "One Piece" : "Pokemon";
}

function shouldSkipAutoCatalogStatusError(error: unknown): boolean {
  return isTcggoHttpStatusError(error, 403);
}

interface DueCardCandidate {
  id: string;
  game: string;
  episodeId: string;
  rarity: string | null;
  latestFetchedAt: string;
  priceSourceStatus: string | null;
  priceSourceCheckedAt: Date | string | null;
  tier: PriceRefreshTier;
}

interface AutoEpisodePriceRefreshResult {
  episodeId: string;
  selectedCards: number;
  updatedCards: number;
  newPrices: number;
  refreshedPrices: number;
  refreshedCards: number;
  gradedPricesUpdated: number;
}

interface MissingPriceCandidate {
  id: string;
  episodeId: string;
  hasMarketId: boolean;
  checkedAt: Date | null;
  createdAt: Date;
}

interface KnownUnavailablePriceCandidate {
  id: string;
  episodeId: string;
  checkedAt: Date | null;
  createdAt: Date;
}

async function getHiddenEpisodeIds(): Promise<string[]> {
  const episodes = await db.episode.findMany({
    where: { game: POKEMON_GAME },
    select: { id: true, code: true, name: true },
  });

  return episodes
    .filter((episode) => isHiddenExpansion(episode))
    .map((episode) => episode.id);
}

interface SyncProgressController {
  syncId: string;
  batchId?: string;
  updateMessage: (message: string, details?: SyncLogDetails | null) => Promise<void>;
  throwIfCancelled: () => Promise<void>;
}

export interface EpisodeSyncResult {
  episodeId: string;
  count: number;
  newCards: number;
  updatedCards: number;
  newPrices: number;
  refreshedPrices: number;
  gradedPricesUpdated: number;
  preemptedAutoPriceRefresh?: boolean;
  quotaExceeded?: boolean;
  requestsRemaining?: number | null;
  requestConcurrency?: number;
}

export interface FullSyncResult {
  count: number;
  newEpisodes: number;
  syncedEpisodes: number;
  skippedEpisodes: number;
  newCards: number;
  updatedCards: number;
  newPrices: number;
  refreshedPrices: number;
  gradedPricesUpdated: number;
  quotaExceeded?: boolean;
  requestsRemaining?: number | null;
  requestConcurrency?: number;
}

export interface AutoPriceRefreshResult {
  checkedEpisodes: number;
  catalogSyncedEpisodes: number;
  newEpisodes: number;
  dueCards: number;
  missingPriceCards: number;
  selectedCards: number;
  backfillCards: number;
  nativeHistoryItems: number;
  remainingDueCards: number;
  newCards: number;
  updatedCards: number;
  newPrices: number;
  refreshedPrices: number;
  refreshedCards: number;
  gradedPricesUpdated: number;
  skipped: boolean;
  message: string;
  quotaExceeded: boolean;
  requestsRemaining: number | null;
  requestConcurrency: number;
}

export interface KnownUnavailablePriceCheckResult {
  totalUnavailableCards: number;
  plannedCards: number;
  checkedCards: number;
  checkedEpisodes: number;
  remainingUnavailableCards: number;
  stillUnavailableCards: number;
  newPrices: number;
  refreshedPrices: number;
  refreshedCards: number;
  updatedCards: number;
  gradedPricesUpdated: number;
  skipped: boolean;
  message: string;
  quotaExceeded: boolean;
  requestsRemaining: number | null;
  requestConcurrency: number;
}

export interface CardPriceRefreshResult {
  cardId: string;
  updatedCard: boolean;
  newPrices: number;
  refreshedPrices: number;
  gradedPricesUpdated: number;
}

export interface CardHistoryImportResult {
  cardId: string;
  historyPointsFetched: number;
  newHistorySnapshots: number;
  historySynced: boolean;
}

export interface SealedProductRefreshResult {
  productId: string;
  syncedAt: Date;
}

export interface SealedProductHistorySyncResult {
  productId: string;
  historyPointsFetched: number;
  newHistorySnapshots: number;
}

export interface SealedSyncResult {
  synced: number;
  products: number;
  quotaExceeded?: boolean;
  requestsRemaining?: number | null;
  requestConcurrency?: number;
}

export interface CardHistorySyncResult {
  candidateCards: number;
  selectedCards: number;
  processedCards: number;
  syncedCards: number;
  failedCards: number;
  newHistorySnapshots: number;
  remainingCards: number;
  hasMore: boolean;
  skipped: boolean;
  message: string;
  quotaExceeded?: boolean;
  requestsRemaining?: number | null;
  requestConcurrency?: number;
}

export interface EbaySoldGradedPriceSyncResult {
  candidateCards: number;
  selectedCards: number;
  processedCards: number;
  cardsWithPrices: number;
  cardsWithoutPrices: number;
  failedCards: number;
  ebaySoldGradedPricesUpdated: number;
  remainingCards: number;
  hasMore: boolean;
  skipped: boolean;
  message: string;
  quotaExceeded?: boolean;
  requestsRemaining?: number | null;
  requestConcurrency?: number;
}

export class SyncConflictError extends Error {
  activeType: string;
  startedAt: Date;

  constructor(activeType: string, startedAt: Date) {
    super("Another sync is already running.");
    this.name = "SyncConflictError";
    this.activeType = activeType;
    this.startedAt = startedAt;
  }
}

export class SyncCancelledError extends Error {
  syncId: string;

  constructor(syncId: string, message = SYNC_CANCELLED_MESSAGE) {
    super(message);
    this.name = "SyncCancelledError";
    this.syncId = syncId;
  }
}

export interface SyncCancellationRequestResult {
  status: "requested" | "already-requested" | "already-finished" | "not-found";
  sync: {
    id: string;
    type: string;
    status: string;
    message: string | null;
    started_at: Date;
    finished_at: Date | null;
    cancel_requested_at: Date | null;
  } | null;
}

function hasAnySealedPrice(
  price: Pick<
    NormalizedSealedProduct["price"],
    | "cm_lowest"
    | "cm_lowest_eu"
    | "cm_lowest_de"
    | "cm_lowest_fr"
    | "cm_lowest_es"
    | "cm_lowest_it"
    | "cm_avg_7d"
    | "cm_avg_30d"
  >
): boolean {
  return (
    price.cm_lowest != null ||
    price.cm_lowest_eu != null ||
    price.cm_lowest_de != null ||
    price.cm_lowest_fr != null ||
    price.cm_lowest_es != null ||
    price.cm_lowest_it != null ||
    price.cm_avg_7d != null ||
    price.cm_avg_30d != null
  );
}

function withAutoQuotaFields(
  result: Omit<
    AutoPriceRefreshResult,
    "quotaExceeded" | "requestsRemaining" | "requestConcurrency"
  >,
  quotaExceeded = false
): AutoPriceRefreshResult {
  return {
    ...result,
    ...getTcggoQuotaResultFields(quotaExceeded),
  };
}

function withKnownUnavailableQuotaFields(
  result: Omit<
    KnownUnavailablePriceCheckResult,
    "quotaExceeded" | "requestsRemaining" | "requestConcurrency"
  >,
  quotaExceeded = false
): KnownUnavailablePriceCheckResult {
  return {
    ...result,
    ...getTcggoQuotaResultFields(quotaExceeded),
  };
}

let dbWriteQueue = Promise.resolve();

async function runExclusiveDbWrite<T>(work: () => Promise<T>): Promise<T> {
  const previousWrite = dbWriteQueue;
  let releaseWrite: () => void = () => {};
  dbWriteQueue = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });

  await previousWrite;

  try {
    return await work();
  } finally {
    releaseWrite();
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(Math.max(concurrency, 1), items.length) },
    async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= items.length) {
          return;
        }

        results[currentIndex] = await worker(items[currentIndex], currentIndex);
      }
    }
  );

  await Promise.all(workers);
  return results;
}

function waitForDelay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForSyncToFinish(
  syncId: string,
  startedAt: Date,
  timeoutMs = AUTO_PRICE_PREEMPT_WAIT_TIMEOUT_MS
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const sync = await db.syncLog.findUnique({
      where: { id: syncId },
      select: { status: true },
    });

    if (!sync || sync.status !== "running") {
      return;
    }

    await waitForDelay(SYNC_WAIT_POLL_INTERVAL_MS);
  }

  throw new SyncConflictError(AUTO_PRICE_REFRESH_TYPE, startedAt);
}

async function reconcileStaleSyncLogsTx(
  tx: Prisma.TransactionClient,
  now: Date
): Promise<void> {
  const staleBefore = new Date(now.getTime() - ACTIVE_SYNC_STALE_MS);
  const staleCancellationBefore = new Date(now.getTime() - CANCEL_REQUEST_STALE_MS);

  await tx.syncLog.updateMany({
    where: {
      status: "running",
      cancel_requested_at: {
        not: null,
        lt: staleCancellationBefore,
      },
    },
    data: {
      status: "cancelled",
      message: STALE_CANCELLED_SYNC_MESSAGE,
      finished_at: now,
    },
  });

  await tx.syncLog.updateMany({
    where: {
      status: "running",
      cancel_requested_at: null,
      started_at: {
        lt: staleBefore,
      },
    },
    data: {
      status: "failed",
      message: STALE_SYNC_MESSAGE,
      finished_at: now,
      cancel_requested_at: null,
    },
  });
}

export async function reconcileStaleSyncLogs(now = new Date()): Promise<void> {
  await db.$transaction(async (tx) => {
    await reconcileStaleSyncLogsTx(tx, now);
  });
}

interface AcquireSyncLogOptions {
  interruptAutoPriceRefresh?: boolean;
  onAutoPriceRefreshInterrupted?: () => void;
}

interface RunLoggedSyncOptions<T> extends AcquireSyncLogOptions {
  successDetails?: (result: T, syncId: string) => SyncLogDetails | null;
}

async function acquireSyncLogWithOptions(
  type: string,
  message: string,
  options?: AcquireSyncLogOptions
) {
  let interruptedAutoPriceRefresh = false;

  while (true) {
    const now = new Date();

    const result = await db.$transaction(async (tx) => {
      await reconcileStaleSyncLogsTx(tx, now);

      const activeSync = await tx.syncLog.findFirst({
        where: { status: "running" },
        orderBy: { started_at: "desc" },
        select: {
          id: true,
          type: true,
          started_at: true,
        },
      });

      if (activeSync) {
        return {
          kind: "conflict" as const,
          activeSync,
        };
      }

      await tx.syncLog.deleteMany({
        where: {
          status: { in: ["success", "failed", "cancelled"] },
          finished_at: { not: null },
        },
      });

      const log = await tx.syncLog.create({
        data: {
          type,
          status: "running",
          message,
        },
      });

      return {
        kind: "created" as const,
        log,
      };
    });

    if (result.kind === "created") {
      if (interruptedAutoPriceRefresh) {
        options?.onAutoPriceRefreshInterrupted?.();
      }

      return result.log;
    }

    const { activeSync } = result;

    if (
      options?.interruptAutoPriceRefresh &&
      type !== AUTO_PRICE_REFRESH_TYPE &&
      activeSync.type === AUTO_PRICE_REFRESH_TYPE
    ) {
      const cancellation = await requestSyncCancellation(activeSync.id);

      if (cancellation.status === "requested" || cancellation.status === "already-requested") {
        interruptedAutoPriceRefresh = true;
        await waitForSyncToFinish(activeSync.id, activeSync.started_at);
        continue;
      }

      if (cancellation.status === "already-finished" || cancellation.status === "not-found") {
        continue;
      }
    }

    throw new SyncConflictError(activeSync.type, activeSync.started_at);
  }
}

async function acquireSyncLog(type: string, message: string) {
  return acquireSyncLogWithOptions(type, message);
}

function createSyncCancellationChecker(syncId: string) {
  let lastCheckedAt = 0;
  let cancellationRequested = false;

  return async () => {
    if (cancellationRequested) {
      throw new SyncCancelledError(syncId);
    }

    const now = Date.now();
    if (now - lastCheckedAt < CANCELLATION_CHECK_INTERVAL_MS) {
      return;
    }

    lastCheckedAt = now;

    const sync = await db.syncLog.findUnique({
      where: { id: syncId },
      select: {
        status: true,
        cancel_requested_at: true,
      },
    });

    if (sync?.status === "running" && sync.cancel_requested_at) {
      cancellationRequested = true;
      throw new SyncCancelledError(syncId);
    }
  };
}

async function finalizeSyncLog(
  id: string,
  status: "success" | "failed" | "cancelled",
  message: string,
  details?: SyncLogDetails | null
) {
  const humanMessage = decodeSyncLogMessage(message).message ?? message;
  await db.syncLog.update({
    where: { id },
    data: {
      status,
      message: humanMessage,
      ...(details !== undefined ? { details_json: encodeSyncLogDetailsJson(details) } : {}),
      finished_at: new Date(),
      ...(status === "cancelled" ? {} : { cancel_requested_at: null }),
    },
  });
}

async function updateSyncLogMessage(
  id: string,
  message: string,
  details?: SyncLogDetails | null
) {
  const humanMessage = decodeSyncLogMessage(message).message ?? message;
  await db.syncLog.update({
    where: { id },
    data: {
      message: humanMessage,
      ...(details !== undefined ? { details_json: encodeSyncLogDetailsJson(details) } : {}),
    },
  });
}

export async function requestSyncCancellation(
  id: string
): Promise<SyncCancellationRequestResult> {
  const existing = await db.syncLog.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      status: true,
      message: true,
      started_at: true,
      finished_at: true,
      cancel_requested_at: true,
    },
  });

  if (!existing) {
    return {
      status: "not-found",
      sync: null,
    };
  }

  if (existing.status !== "running") {
    return {
      status: "already-finished",
      sync: existing,
    };
  }

  if (existing.cancel_requested_at) {
    return {
      status: "already-requested",
      sync: existing,
    };
  }

  const updated = await db.syncLog.update({
    where: { id },
    data: {
      cancel_requested_at: new Date(),
    },
    select: {
      id: true,
      type: true,
      status: true,
      message: true,
      started_at: true,
      finished_at: true,
      cancel_requested_at: true,
    },
  });

  return {
    status: "requested",
    sync: updated,
  };
}

async function runLoggedSync<T>(
  type: string,
  startMessage: string,
  successMessage: (result: T) => string,
  work: (progress: SyncProgressController) => Promise<T>,
  options?: RunLoggedSyncOptions<T>
): Promise<T> {
  const log = await acquireSyncLogWithOptions(type, startMessage, options);
  const throwIfCancelled = createSyncCancellationChecker(log.id);
  let latestDetails: SyncLogDetails | null = null;
  const progress: SyncProgressController = {
    syncId: log.id,
    updateMessage: async (message, details) => {
      if (details) {
        latestDetails = details;
      }
      await updateSyncLogMessage(log.id, message, details ?? latestDetails);
    },
    throwIfCancelled,
  };

  try {
    await progress.throwIfCancelled();
    const result = await work(progress);
    const details = options?.successDetails?.(result, log.id) ?? latestDetails;
    await finalizeSyncLog(log.id, "success", successMessage(result), details);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failureDetails = markSyncLogDetailsStatus(
      latestDetails,
      error instanceof SyncCancelledError ? "cancelled" : "failed"
    );
    await finalizeSyncLog(
      log.id,
      error instanceof SyncCancelledError ? "cancelled" : "failed",
      message,
      failureDetails
    );
    throw error;
  }
}

function summarizeEpisodeSync(result: EpisodeSyncResult): string {
  const summary = [
    `Synced ${result.count} cards`,
    `${result.newCards} new cards`,
    `${result.updatedCards} updated cards`,
    `${result.newPrices} new price snapshots`,
    `${result.refreshedPrices} refreshed prices`,
    `${result.gradedPricesUpdated} graded prices updated`,
  ];

  if (result.quotaExceeded) {
    summary.unshift(getQuotaPauseMessage());
  }

  if (result.requestsRemaining != null) {
    summary.push(`${result.requestsRemaining} scraper requests remaining`);
  }

  if (result.requestConcurrency != null) {
    summary.push(`${result.requestConcurrency} request concurrency`);
  }

  return summary.join(" | ");
}

function summarizeFullSync(result: FullSyncResult): string {
  const summary = [
    `Checked ${result.count} sets`,
    `${result.syncedEpisodes} synced`,
    `${result.skippedEpisodes} skipped`,
    `${result.newEpisodes} new sets`,
    `${result.newCards} new cards`,
    `${result.updatedCards} updated cards`,
    `${result.newPrices} new price snapshots`,
    `${result.refreshedPrices} refreshed prices`,
    `${result.gradedPricesUpdated} graded prices updated`,
  ];

  if (result.quotaExceeded) {
    summary.unshift(getQuotaPauseMessage());
  }

  if (result.requestsRemaining != null) {
    summary.push(`${result.requestsRemaining} scraper requests remaining`);
  }

  if (result.requestConcurrency != null) {
    summary.push(`${result.requestConcurrency} request concurrency`);
  }

  return summary.join(" | ");
}

function summarizeAutoPriceRefresh(result: AutoPriceRefreshResult): string {
  const summary = [
    `Checked ${result.selectedCards} cards`,
    `${result.checkedEpisodes} sets`,
    `${result.backfillCards} first-price checks`,
    `${result.nativeHistoryItems} history backfills`,
  ];

  if (result.quotaExceeded) {
    summary.unshift(getQuotaPauseMessage());
  }

  if (result.catalogSyncedEpisodes > 0) {
    summary.push(`${result.catalogSyncedEpisodes} sets synced`);
  }

  if (result.newEpisodes > 0) {
    summary.push(`${result.newEpisodes} new sets`);
  }

  if (result.newCards > 0) {
    summary.push(`${result.newCards} new cards`);
  }

  summary.push(
    `${result.updatedCards} updated cards`,
    `${result.newPrices} new price snapshots`,
    `${result.refreshedPrices} refreshed prices`,
    `${result.gradedPricesUpdated} graded prices updated`,
    `${result.remainingDueCards} remaining after this batch`,
    `${result.requestConcurrency} request concurrency`
  );

  if (result.requestsRemaining != null) {
    summary.push(`${result.requestsRemaining} scraper requests remaining`);
  }

  return summary.join(" | ");
}

function summarizeKnownUnavailablePriceCheck(
  result: KnownUnavailablePriceCheckResult
): string {
  const summary = [
    `Checked ${result.checkedCards} known unavailable cards`,
    `${result.checkedEpisodes} sets`,
    `${result.refreshedCards} cards have prices now`,
    `${result.stillUnavailableCards} still unavailable`,
    `${result.remainingUnavailableCards} remaining`,
    `${result.requestConcurrency} request concurrency`,
  ];

  if (result.quotaExceeded) {
    summary.unshift(getQuotaPauseMessage());
  }

  if (result.requestsRemaining != null) {
    summary.push(`${result.requestsRemaining} scraper requests remaining`);
  }

  return summary.join(" | ");
}

function summarizeCardPriceRefresh(result: CardPriceRefreshResult): string {
  return [
    "Single card refresh",
    result.updatedCard ? "metadata updated" : "metadata unchanged",
    `${result.newPrices} new price snapshots`,
    `${result.refreshedPrices} refreshed prices`,
    `${result.gradedPricesUpdated} graded prices updated`,
  ].join(" | ");
}

function summarizeCardHistoryImport(result: CardHistoryImportResult): string {
  return [
    "Single card history sync",
    `${result.historyPointsFetched} history points fetched`,
    `${result.newHistorySnapshots} new history snapshots`,
    result.historySynced ? "history synced" : "history unavailable",
  ].join(" | ");
}

function summarizeSealedProductRefresh(result: SealedProductRefreshResult): string {
  return [
    "Single sealed refresh",
    `product ${result.productId}`,
    `synced ${result.syncedAt.toISOString()}`,
  ].join(" | ");
}

function summarizeSealedProductHistorySync(result: SealedProductHistorySyncResult): string {
  return [
    "Single sealed history sync",
    `${result.historyPointsFetched} history points fetched`,
    `${result.newHistorySnapshots} new history snapshots`,
  ].join(" | ");
}

function summarizeSealedSync(result: SealedSyncResult): string {
  const summary = [
    `${result.synced} sets synced`,
    `${result.products} sealed products updated`,
  ];

  if (result.quotaExceeded) {
    summary.unshift(getQuotaPauseMessage());
  }

  if (result.requestsRemaining != null) {
    summary.push(`${result.requestsRemaining} scraper requests remaining`);
  }

  if (result.requestConcurrency != null) {
    summary.push(`${result.requestConcurrency} request concurrency`);
  }

  return summary.join(" | ");
}

function summarizeCardHistorySync(result: CardHistorySyncResult): string {
  const summary = [
    `Eligible ${result.candidateCards} cards`,
    `Selected ${result.selectedCards} cards`,
    `${result.processedCards} processed`,
    `${result.syncedCards} cards synced`,
    `${result.failedCards} unavailable`,
    `${result.newHistorySnapshots} history snapshots`,
    `${result.remainingCards} still pending`,
  ];

  if (result.skipped && result.candidateCards > 0) {
    summary.push("paused for quota reset");
  }

  if (result.requestsRemaining != null) {
    summary.push(`${result.requestsRemaining} scraper requests remaining`);
  }

  if (result.requestConcurrency != null) {
    summary.push(`${result.requestConcurrency} request concurrency`);
  }

  return summary.join(" | ");
}

function summarizeEbaySoldGradedPriceSync(result: EbaySoldGradedPriceSyncResult): string {
  const summary = [
    `Eligible ${result.candidateCards} cards`,
    `Selected ${result.selectedCards} cards`,
    `${result.processedCards} processed`,
    `${result.cardsWithPrices} cards with eBay sold prices`,
    `${result.cardsWithoutPrices} without eBay sold prices`,
    `${result.failedCards} failed`,
    `${result.ebaySoldGradedPricesUpdated} eBay sold graded prices updated`,
    `${result.remainingCards} still pending`,
  ];

  if (result.skipped && result.candidateCards > 0) {
    summary.push("paused for quota reset");
  }

  if (result.requestsRemaining != null) {
    summary.push(`${result.requestsRemaining} scraper requests remaining`);
  }

  if (result.requestConcurrency != null) {
    summary.push(`${result.requestConcurrency} request concurrency`);
  }

  return summary.join(" | ");
}

async function pruneAutoPriceRefreshLogs(keepId: string) {
  await db.syncLog.deleteMany({
    where: {
      type: AUTO_PRICE_REFRESH_TYPE,
      status: "success",
      id: { not: keepId },
    },
  });
}

async function runAutoLoggedSync<T>(
  startMessage: string,
  successMessage: (result: T) => string,
  work: (progress: SyncProgressController) => Promise<T>,
  options?: {
    recoverError?: (error: unknown) => T | null;
    successDetails?: (result: T, batchId: string) => SyncLogDetails | null;
  }
): Promise<T> {
  const log = await acquireSyncLog(AUTO_PRICE_REFRESH_TYPE, startMessage);
  const throwIfCancelled = createSyncCancellationChecker(log.id);
  const batchId = createAutoPriceRefreshBatchId(log.id);
  let latestDetails: SyncLogDetails | null = null;
  const progress: SyncProgressController = {
    syncId: log.id,
    batchId,
    updateMessage: async (message, details) => {
      if (details) {
        latestDetails = details;
      }
      await updateSyncLogMessage(log.id, message, details ?? latestDetails);
    },
    throwIfCancelled,
  };

  try {
    await progress.throwIfCancelled();
    const result = await work(progress);
    const details = options?.successDetails?.(result, batchId) ?? latestDetails;
    await finalizeSyncLog(log.id, "success", successMessage(result), details);
    await pruneAutoPriceRefreshLogs(log.id);
    return result;
  } catch (error) {
    const recovered = options?.recoverError?.(error);
    if (recovered) {
      const details = options?.successDetails?.(recovered, batchId) ?? latestDetails;
      await finalizeSyncLog(log.id, "success", successMessage(recovered), details);
      await pruneAutoPriceRefreshLogs(log.id);
      return recovered;
    }

    const message = error instanceof Error ? error.message : String(error);
    const failureDetails = markSyncLogDetailsStatus(
      latestDetails,
      error instanceof SyncCancelledError ? "cancelled" : "failed"
    );
    await finalizeSyncLog(
      log.id,
      error instanceof SyncCancelledError ? "cancelled" : "failed",
      message,
      failureDetails
    );
    throw error;
  }
}
function normalizeTimestamp(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function getTierWeight(tier: PriceRefreshTier): number {
  switch (tier) {
    case "base":
      return 0;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
    default:
      return 1;
  }
}

function queuePriceSnapshotWrite(
  latestPrice: ExistingPriceRecord | null,
  nextPrice: PriceSnapshotData,
  cardId: string,
  fetchedAt: Date,
  options: { refreshAllPrices: boolean },
  priceCreates: Array<{ card_id: string; fetched_at: Date } & PriceSnapshotData>,
  priceRefreshes: string[]
): "new" | "refreshed" | "none" {
  if (!hasAnyPrice(nextPrice)) {
    return "none";
  }

  if (!options.refreshAllPrices) {
    if (!latestPrice) {
      priceCreates.push({
        card_id: cardId,
        fetched_at: fetchedAt,
        ...nextPrice,
      });
      return "new";
    }

    return "none";
  }

  if (latestPrice && pricesMatch(latestPrice, nextPrice)) {
    priceRefreshes.push(latestPrice.id);
    return "refreshed";
  }

  priceCreates.push({
    card_id: cardId,
    fetched_at: fetchedAt,
    ...nextPrice,
  });
  return "new";
}

function toHistorySnapshotDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

async function mapInBatches<T>(
  items: T[],
  batchSize: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  for (let index = 0; index < items.length; index += batchSize) {
    await Promise.all(items.slice(index, index + batchSize).map((item) => worker(item)));
  }
}

async function writeInChunks<T>(
  items: T[],
  chunkSize: number,
  writer: (chunk: T[]) => Promise<void>
): Promise<void> {
  for (let index = 0; index < items.length; index += chunkSize) {
    await writer(items.slice(index, index + chunkSize));
  }
}

async function persistCardPriceWrites(
  tx: Prisma.TransactionClient,
  input: {
    fetchedAt: Date;
    gradedCardIdsToReplace: Set<string>;
    gradedCreates: GradedCreateRow[];
    ebaySoldGradedCardIdsToReplace: Set<string>;
    ebaySoldGradedCreates: EbaySoldGradedCreateRow[];
    ebaySoldGradedSyncedCardIds?: Set<string>;
    ebaySoldGradedUnavailableCardIds?: Set<string>;
    priceRefreshes: string[];
    priceCreates: Array<{ card_id: string; fetched_at: Date } & PriceSnapshotData>;
  }
): Promise<{ gradedPricesUpdated: number }> {
  if (input.gradedCardIdsToReplace.size > 0) {
    await tx.cardGradedPrice.deleteMany({
      where: { card_id: { in: [...input.gradedCardIdsToReplace] } },
    });
  }

  const dedupedGradedCreates = dedupeGradedCreateRows(input.gradedCreates);
  const dedupedEbaySoldGradedCreates = dedupeEbaySoldGradedCreateRows(
    input.ebaySoldGradedCreates
  );

  if (dedupedGradedCreates.length > 0) {
    await tx.cardGradedPrice.createMany({
      data: dedupedGradedCreates,
    });

    await tx.cardGradedPriceSnapshot.createMany({
      data: dedupedGradedCreates,
    });
  }

  if (input.ebaySoldGradedCardIdsToReplace.size > 0) {
    await tx.cardEbaySoldGradedPrice.deleteMany({
      where: { card_id: { in: [...input.ebaySoldGradedCardIdsToReplace] } },
    });
  }

  if (dedupedEbaySoldGradedCreates.length > 0) {
    await tx.cardEbaySoldGradedPrice.createMany({
      data: dedupedEbaySoldGradedCreates,
    });

    await tx.cardEbaySoldGradedPriceSnapshot.createMany({
      data: dedupedEbaySoldGradedCreates,
    });
  }

  const ebaySoldGradedSyncedCardIds = input.ebaySoldGradedSyncedCardIds
    ? [...input.ebaySoldGradedSyncedCardIds]
    : [];
  const syncedCardIdSet = new Set(ebaySoldGradedSyncedCardIds);
  const ebaySoldGradedUnavailableCardIds = input.ebaySoldGradedUnavailableCardIds
    ? [...input.ebaySoldGradedUnavailableCardIds].filter((cardId) => !syncedCardIdSet.has(cardId))
    : [];

  if (ebaySoldGradedSyncedCardIds.length > 0) {
    await tx.card.updateMany({
      where: { id: { in: ebaySoldGradedSyncedCardIds } },
      data: {
        ebay_sold_graded_synced_at: input.fetchedAt,
        ebay_sold_graded_status: "synced",
        ebay_sold_graded_checked_at: input.fetchedAt,
      },
    });
  }

  if (ebaySoldGradedUnavailableCardIds.length > 0) {
    await tx.card.updateMany({
      where: { id: { in: ebaySoldGradedUnavailableCardIds } },
      data: {
        ebay_sold_graded_synced_at: null,
        ebay_sold_graded_status: "unavailable",
        ebay_sold_graded_checked_at: input.fetchedAt,
      },
    });
  }

  if (input.priceRefreshes.length > 0) {
    await writeInChunks([...new Set(input.priceRefreshes)], DB_WRITE_BATCH_SIZE, async (chunk) => {
      await tx.price.updateMany({
        where: { id: { in: chunk } },
        data: { fetched_at: input.fetchedAt },
      });
    });
  }

  if (input.priceCreates.length > 0) {
    await tx.price.createMany({
      data: input.priceCreates,
    });
  }

  return {
    gradedPricesUpdated: dedupedGradedCreates.length,
  };
}

/**
 * Format a Date as YYYY-MM-DD for the cardmarket-api-tcg date_from query
 * parameter. Using this lets the API return only history points after the
 * given day, dropping per-card cost from ~20 paginated requests to ~1 once a
 * card already has history in the DB.
 */
function formatHistoryDateFrom(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Build a Map<cardId, latest fetched_at> from the same set used to dedupe
 * inserts so callers can pass an incremental date_from to the API.
 */
function buildLatestSnapshotByCard(
  existingByCard: Map<string, Set<string>>
): Map<string, Date> {
  const latest = new Map<string, Date>();
  for (const [cardId, dateSet] of existingByCard) {
    let max: number | null = null;
    for (const iso of dateSet) {
      const t = Date.parse(iso);
      if (!Number.isFinite(t)) continue;
      if (max == null || t > max) max = t;
    }
    if (max != null) latest.set(cardId, new Date(max));
  }
  return latest;
}

async function backfillCardNativeHistoryDetailed(
  cardIds: string[],
  syncedAt: Date,
  options?: {
    batchSize?: number;
    markFailedAsSynced?: boolean;
    throwIfCancelled?: () => Promise<void>;
    onProgress?: (progress: {
      totalCards: number;
      processedCards: number;
      syncedCards: number;
      failedCards: number;
      snapshotsCreated: number;
    }) => Promise<void> | void;
  }
): Promise<{
  syncedCards: number;
  failedCards: number;
  snapshotsCreated: number;
  processedCards: number;
  quotaExceeded: boolean;
}> {
  if (cardIds.length === 0) {
    return {
      syncedCards: 0,
      failedCards: 0,
      snapshotsCreated: 0,
      processedCards: 0,
      quotaExceeded: false,
    };
  }

  await options?.throwIfCancelled?.();

  const existingCards = await db.card.findMany({
    where: { id: { in: cardIds } },
    select: {
      id: true,
      native_history_synced_at: true,
    },
  });
  const nativeHistorySyncedCardIds = new Set(
    existingCards
      .filter((card) => card.native_history_synced_at != null)
      .map((card) => card.id)
  );

  const existingSnapshots = await db.price.findMany({
    where: { card_id: { in: cardIds } },
    select: {
      card_id: true,
      fetched_at: true,
    },
  });

  const existingByCard = new Map<string, Set<string>>();

  for (const snapshot of existingSnapshots) {
    const existing = existingByCard.get(snapshot.card_id) ?? new Set<string>();
    existing.add(snapshot.fetched_at.toISOString());
    existingByCard.set(snapshot.card_id, existing);
  }

  const latestSnapshotByCard = buildLatestSnapshotByCard(existingByCard);
  const batchSize = options?.batchSize ?? HISTORY_BACKFILL_BATCH_SIZE;
  let processedCards = 0;
  let totalSyncedCards = 0;
  let totalFailedCards = 0;
  let totalSnapshotsCreated = 0;
  let quotaExceeded = false;

  for (let index = 0; index < cardIds.length; index += batchSize) {
    await options?.throwIfCancelled?.();

    const batchIds = cardIds.slice(index, index + batchSize);
    const batchResults = await Promise.all(
      batchIds.map(async (cardId) => {
        await options?.throwIfCancelled?.();

        try {
          const latestExisting = nativeHistorySyncedCardIds.has(cardId)
            ? latestSnapshotByCard.get(cardId)
            : undefined;
          const history = await fetchHistoryPricesByItemId(cardId, {
            dateFrom: latestExisting ? formatHistoryDateFrom(latestExisting) : undefined,
          });
          // When date_from skips already-fetched history, an empty response just
          // means the card is already up to date — that is a success, not a fail.
          if (history.length === 0 && !latestExisting) {
            return {
              cardId,
              synced: false,
              failed: true,
              creates: [] as Array<{
                card_id: string;
                fetched_at: Date;
              } & PriceSnapshotData>,
              quotaExceeded: false,
            };
          }

          const existing = existingByCard.get(cardId) ?? new Set<string>();
          const creates: Array<{
            card_id: string;
            fetched_at: Date;
          } & PriceSnapshotData> = [];

          for (const point of history) {
            const fetchedAt = toHistorySnapshotDate(point.date);
            const iso = fetchedAt.toISOString();
            if (existing.has(iso)) {
              continue;
            }

            creates.push({
              card_id: cardId,
              fetched_at: fetchedAt,
              cm_en_lowest_nm: point.cm_market,
              cm_de_lowest_nm: point.cm_market_de,
              cm_fr_lowest_nm: point.cm_market_fr,
              cm_es_lowest_nm: point.cm_market_es,
              cm_it_lowest_nm: point.cm_market_it,
              cm_en_avg_30d: null,
              cm_en_avg_7d: null,
              tcp_market: point.tcp_market,
              tcp_mid: null,
              tcp_low: null,
            });
            existing.add(iso);
          }

          existingByCard.set(cardId, existing);

          return {
            cardId,
            synced: true,
            failed: false,
            creates,
            quotaExceeded: false,
          };
        } catch (error) {
          if (isTcggoQuotaExceededError(error)) {
            return {
              cardId,
              synced: false,
              failed: false,
              creates: [] as Array<{
                card_id: string;
                fetched_at: Date;
              } & PriceSnapshotData>,
              quotaExceeded: true,
            };
          }

          return {
            cardId,
            synced: false,
            failed: true,
            creates: [] as Array<{
              card_id: string;
              fetched_at: Date;
            } & PriceSnapshotData>,
            quotaExceeded: false,
          };
        }
      })
    );

    await options?.throwIfCancelled?.();

    const batchCreates = batchResults.flatMap((result) => result.creates);
    const batchSyncedCardIds = batchResults
      .filter((result) => result.synced)
      .map((result) => result.cardId);
    const batchFailedCardIds = batchResults
      .filter((result) => result.failed)
      .map((result) => result.cardId);

    await db.$transaction(async (tx) => {
      if (batchCreates.length > 0) {
        await writeInChunks(batchCreates, DB_WRITE_BATCH_SIZE, async (chunk) => {
          await tx.price.createMany({
            data: chunk,
          });
        });
      }

      if (batchSyncedCardIds.length > 0) {
        await tx.card.updateMany({
          where: { id: { in: batchSyncedCardIds } },
          data: {
            native_history_synced_at: syncedAt,
            native_history_status: "synced",
            native_history_checked_at: syncedAt,
          },
        });
      }

      if (options?.markFailedAsSynced && batchFailedCardIds.length > 0) {
        await tx.card.updateMany({
          where: { id: { in: batchFailedCardIds } },
          data: {
            native_history_synced_at: null,
            native_history_status: "unavailable",
            native_history_checked_at: syncedAt,
          },
        });
      }
    });

    processedCards += batchIds.length;
    totalSyncedCards += batchSyncedCardIds.length;
    totalFailedCards += batchFailedCardIds.length;
    totalSnapshotsCreated += batchCreates.length;

    if (options?.onProgress) {
      await options.onProgress({
        totalCards: cardIds.length,
        processedCards,
        syncedCards: totalSyncedCards,
        failedCards: totalFailedCards,
        snapshotsCreated: totalSnapshotsCreated,
      });
    }

    if (batchResults.some((result) => result.quotaExceeded)) {
      quotaExceeded = true;
      break;
    }
  }

  await options?.throwIfCancelled?.();

  return {
    syncedCards: totalSyncedCards,
    failedCards: totalFailedCards,
    snapshotsCreated: totalSnapshotsCreated,
    processedCards,
    quotaExceeded,
  };
}

async function backfillCardNativeHistory(
  cardIds: string[],
  syncedAt: Date,
  throwIfCancelled?: () => Promise<void>
): Promise<number> {
  const result = await backfillCardNativeHistoryDetailed(cardIds, syncedAt, {
    throwIfCancelled,
  });
  return result.syncedCards;
}

async function backfillEbaySoldGradedPricesDetailed(
  cardIds: string[],
  fetchedAt: Date,
  options?: {
    concurrency?: number;
    throwIfCancelled?: () => Promise<void>;
    onProgress?: (progress: {
      totalCards: number;
      processedCards: number;
      cardsWithPrices: number;
      cardsWithoutPrices: number;
      failedCards: number;
      pricesUpdated: number;
    }) => Promise<void> | void;
  }
): Promise<{
  cardsWithPrices: number;
  cardsWithoutPrices: number;
  failedCards: number;
  pricesUpdated: number;
  processedCards: number;
  quotaExceeded: boolean;
}> {
  if (cardIds.length === 0) {
    return {
      cardsWithPrices: 0,
      cardsWithoutPrices: 0,
      failedCards: 0,
      pricesUpdated: 0,
      processedCards: 0,
      quotaExceeded: false,
    };
  }

  await options?.throwIfCancelled?.();

  const concurrency = Math.min(
    Math.max(options?.concurrency ?? MANUAL_EBAY_SOLD_GRADED_PRICE_SYNC_CONCURRENCY, 1),
    cardIds.length
  );
  let nextIndex = 0;
  let processedCards = 0;
  let cardsWithPrices = 0;
  let cardsWithoutPrices = 0;
  let failedCards = 0;
  let pricesUpdated = 0;
  let quotaExceeded = false;

  async function publishProgress() {
    if (!options?.onProgress) return;

    await options.onProgress({
      totalCards: cardIds.length,
      processedCards,
      cardsWithPrices,
      cardsWithoutPrices,
      failedCards,
      pricesUpdated,
    });
  }

  async function worker() {
    while (!quotaExceeded) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= cardIds.length) {
        return;
      }

      await options?.throwIfCancelled?.();

      const cardId = cardIds[index];
      let shouldCountCard = false;

      try {
        const remoteCard = await fetchCardDetail(cardId, getGameFromScopedId(cardId));
        await options?.throwIfCancelled?.();

        const creates = remoteCard
          ? dedupeEbaySoldGradedCreateRows(
              buildEbaySoldGradedCreateRows(cardId, remoteCard.prices, fetchedAt)
            )
          : [];

        if (creates.length > 0) {
          await runExclusiveDbWrite(() =>
            db.$transaction(async (tx) => {
              await persistCardPriceWrites(tx, {
                fetchedAt,
                gradedCardIdsToReplace: new Set(),
                gradedCreates: [],
                ebaySoldGradedCardIdsToReplace: new Set([cardId]),
                ebaySoldGradedCreates: creates,
                priceRefreshes: [],
                priceCreates: [],
              });
              await tx.card.update({
                where: { id: cardId },
                data: {
                  ebay_sold_graded_synced_at: fetchedAt,
                  ebay_sold_graded_status: "synced",
                  ebay_sold_graded_checked_at: fetchedAt,
                },
              });
            })
          );

          cardsWithPrices += 1;
          pricesUpdated += creates.length;
        } else {
          await db.card.update({
            where: { id: cardId },
            data: {
              ebay_sold_graded_synced_at: null,
              ebay_sold_graded_status: "unavailable",
              ebay_sold_graded_checked_at: fetchedAt,
            },
          });
          cardsWithoutPrices += 1;
        }

        shouldCountCard = true;
      } catch (error) {
        if (isTcggoQuotaExceededError(error)) {
          quotaExceeded = true;
          return;
        }

        failedCards += 1;
        shouldCountCard = true;
      } finally {
        if (shouldCountCard) {
          processedCards += 1;
          await publishProgress();
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  await options?.throwIfCancelled?.();

  return {
    cardsWithPrices,
    cardsWithoutPrices,
    failedCards,
    pricesUpdated,
    processedCards,
    quotaExceeded,
  };
}

async function backfillSealedNativeHistory(
  products: Array<{ id: string; episodeId: string }>,
  syncedAt: Date,
  throwIfCancelled?: () => Promise<void>
): Promise<number> {
  if (products.length === 0) return 0;

  await throwIfCancelled?.();

  const existingSnapshots = await db.sealedPriceSnapshot.findMany({
    where: { product_id: { in: products.map((product) => product.id) } },
    select: {
      product_id: true,
      fetched_at: true,
    },
  });

  const existingByProduct = new Map<string, Set<string>>();

  for (const snapshot of existingSnapshots) {
    const existing = existingByProduct.get(snapshot.product_id) ?? new Set<string>();
    existing.add(snapshot.fetched_at.toISOString());
    existingByProduct.set(snapshot.product_id, existing);
  }

  const latestSnapshotByProduct = buildLatestSnapshotByCard(existingByProduct);

  const historyCreates: Array<{
    product_id: string;
    episode_id: string;
    fetched_at: Date;
    cm_lowest: number | null;
    cm_lowest_eu: number | null;
    cm_lowest_de: number | null;
    cm_lowest_fr: number | null;
    cm_lowest_es: number | null;
    cm_lowest_it: number | null;
    cm_avg_7d: number | null;
    cm_avg_30d: number | null;
  }> = [];
  const syncedProductIds: string[] = [];

  await mapInBatches(products, HISTORY_BACKFILL_BATCH_SIZE, async (product) => {
    await throwIfCancelled?.();

    try {
      const latestExisting = latestSnapshotByProduct.get(product.id);
      const history = await fetchHistoryPricesByItemId(product.id, {
        dateFrom: latestExisting ? formatHistoryDateFrom(latestExisting) : undefined,
      });
      const existing = existingByProduct.get(product.id) ?? new Set<string>();

      for (const point of history) {
        const fetchedAt = toHistorySnapshotDate(point.date);
        const iso = fetchedAt.toISOString();
        if (existing.has(iso)) {
          continue;
        }

        historyCreates.push({
          product_id: product.id,
          episode_id: product.episodeId,
          fetched_at: fetchedAt,
          cm_lowest: point.cm_market,
          cm_lowest_eu: null,
          cm_lowest_de: point.cm_market_de,
          cm_lowest_fr: point.cm_market_fr,
          cm_lowest_es: point.cm_market_es,
          cm_lowest_it: point.cm_market_it,
          cm_avg_7d: null,
          cm_avg_30d: null,
        });
        existing.add(iso);
      }

      syncedProductIds.push(product.id);
    } catch {
      // Leave this product eligible for a later history backfill retry.
    }
  });

  await throwIfCancelled?.();

  await db.$transaction(async (tx) => {
    if (historyCreates.length > 0) {
      await writeInChunks(historyCreates, DB_WRITE_BATCH_SIZE, async (chunk) => {
        await tx.sealedPriceSnapshot.createMany({
          data: chunk,
        });
      });
    }

    if (syncedProductIds.length > 0) {
      await tx.sealedProduct.updateMany({
        where: { id: { in: syncedProductIds } },
        data: {
          native_history_synced_at: syncedAt,
          native_history_status: "synced",
          native_history_checked_at: syncedAt,
        },
      });
    }
  });

  await throwIfCancelled?.();

  return syncedProductIds.length;
}

async function selectNativeHistoryBackfillBatch(): Promise<{
  cardIds: string[];
  products: Array<{ id: string; episodeId: string }>;
}> {
  if (
    AUTO_NATIVE_HISTORY_CARD_BACKFILL_MAX <= 0 &&
    AUTO_NATIVE_HISTORY_PRODUCT_BACKFILL_MAX <= 0
  ) {
    return { cardIds: [], products: [] };
  }

  const [cards, products] = await Promise.all([
    db.card.findMany({
      where: {
        native_history_synced_at: null,
        NOT: {
          native_history_status: "unavailable",
          native_history_checked_at: {
            gte: new Date(Date.now() - NATIVE_HISTORY_UNAVAILABLE_RETRY_MS),
          },
        },
        OR: [
          { prices: { some: {} } },
          { cardmarket_id: { not: null } },
          { tcgplayer_id: { not: null } },
        ],
      },
      orderBy: [{ updated_at: "desc" }],
      select: { id: true },
      take: AUTO_NATIVE_HISTORY_CARD_BACKFILL_MAX,
    }),
    db.sealedProduct.findMany({
      where: {
        native_history_synced_at: null,
        NOT: {
          native_history_status: "unavailable",
          native_history_checked_at: {
            gte: new Date(Date.now() - NATIVE_HISTORY_UNAVAILABLE_RETRY_MS),
          },
        },
        OR: [
          { cm_lowest: { not: null } },
          { cm_lowest_eu: { not: null } },
          { cm_lowest_de: { not: null } },
          { cm_lowest_fr: { not: null } },
          { cm_lowest_es: { not: null } },
          { cm_lowest_it: { not: null } },
          { cm_avg_7d: { not: null } },
          { cm_avg_30d: { not: null } },
          { cardmarket_id: { not: null } },
          { tcgplayer_id: { not: null } },
        ],
      },
      orderBy: [{ synced_at: "desc" }],
      select: {
        id: true,
        episode_id: true,
      },
      take: AUTO_NATIVE_HISTORY_PRODUCT_BACKFILL_MAX,
    }),
  ]);

  return {
    cardIds: cards.map((card) => card.id),
    products: products.map((product) => ({
      id: product.id,
      episodeId: product.episode_id,
    })),
  };
}

function buildNativeHistoryRetryWindowWhere(retryBefore: Date): Prisma.CardWhereInput {
  return {
    OR: [
      { native_history_status: null },
      { native_history_status: { not: "unavailable" } },
      { native_history_checked_at: null },
      { native_history_checked_at: { lt: retryBefore } },
    ],
  };
}

function buildManualCardHistoryExcludedRarityWhere(): Prisma.CardWhereInput {
  return {
    OR: [
      {
        rarity: {
          in: [...MANUAL_HISTORY_BASE_PRICE_ONLY_RARITIES],
        },
      },
      {
        game: POKEMON_GAME,
        rarity: {
          in: [...MANUAL_HISTORY_POKEMON_RARE_EXCLUDED_RARITIES],
        },
      },
    ],
  };
}

function buildManualCardHistoryCardWhere(options?: {
  game?: TradingCardGame;
}): Prisma.CardWhereInput {
  const retryBefore = new Date(Date.now() - NATIVE_HISTORY_UNAVAILABLE_RETRY_MS);

  return {
    native_history_synced_at: null,
    tcggo_url: { not: null },
    ...(options?.game ? { game: options.game } : {}),
    AND: [
      {
        NOT: buildManualCardHistoryExcludedRarityWhere(),
      },
      buildNativeHistoryRetryWindowWhere(retryBefore),
    ],
  };
}

export async function countManualCardHistoryCandidates(options?: {
  game?: TradingCardGame;
}): Promise<number> {
  return timeAsync("sync.card-history-candidates.count", () =>
    db.card.count({
      where: buildManualCardHistoryCardWhere(options),
    })
  );
}

async function selectManualCardHistoryCandidates(options?: { take?: number }): Promise<string[]> {
  const cards = await db.card.findMany({
    where: buildManualCardHistoryCardWhere(),
    orderBy: [
      { episode: { release_date: "desc" } },
      { updated_at: "desc" },
      { id: "asc" },
    ],
    select: { id: true },
    ...(options?.take ? { take: options.take } : {}),
  });

  return cards.map((card) => card.id);
}

export async function countEbaySoldGradedPriceCandidates(): Promise<number> {
  const retryBefore = new Date(Date.now() - EBAY_SOLD_GRADED_UNAVAILABLE_RETRY_MS);

  return timeAsync("sync.ebay-sold-graded-price-candidates.count", () =>
    db.card.count({
      where: {
        ebaySoldGradedPrices: {
          none: {},
        },
        gradedPrices: {
          some: {},
        },
        OR: [
          { ebay_sold_graded_status: null },
          { ebay_sold_graded_status: { not: "unavailable" } },
          { ebay_sold_graded_checked_at: null },
          { ebay_sold_graded_checked_at: { lt: retryBefore } },
        ],
      },
    })
  );
}

async function selectEbaySoldGradedPriceCandidates(options: {
  take: number;
  skip?: number;
}): Promise<string[]> {
  const retryBefore = new Date(Date.now() - EBAY_SOLD_GRADED_UNAVAILABLE_RETRY_MS);
  const cards = await db.card.findMany({
    where: {
      ebaySoldGradedPrices: {
        none: {},
      },
      gradedPrices: {
        some: {},
      },
      OR: [
        { ebay_sold_graded_status: null },
        { ebay_sold_graded_status: { not: "unavailable" } },
        { ebay_sold_graded_checked_at: null },
        { ebay_sold_graded_checked_at: { lt: retryBefore } },
      ],
    },
    orderBy: [{ updated_at: "desc" }, { id: "asc" }],
    select: { id: true },
    take: options.take,
    skip: options.skip ?? 0,
  });

  return cards.map((card) => card.id);
}

function buildEbaySoldGradedCreateRows(
  cardId: string,
  prices: NormalizedCard["prices"],
  fetchedAt: Date
): EbaySoldGradedCreateRow[] {
  return extractEbaySoldGradedPrices(prices).map((gradedPrice) => ({
    card_id: cardId,
    source: gradedPrice.source,
    label: gradedPrice.label,
    company: gradedPrice.company,
    grade: gradedPrice.grade,
    median_price: gradedPrice.median_price,
    currency: gradedPrice.currency,
    sample_size: gradedPrice.sample_size,
    fetched_at: fetchedAt,
  }));
}

function queueEbaySoldGradedPriceWrites(input: {
  cardId: string;
  prices: NormalizedCard["prices"];
  fetchedAt: Date;
  markUnavailableIfMissing: boolean;
  cardIdsToReplace: Set<string>;
  creates: EbaySoldGradedCreateRow[];
  syncedCardIds: Set<string>;
  unavailableCardIds: Set<string>;
}): number {
  const creates = buildEbaySoldGradedCreateRows(input.cardId, input.prices, input.fetchedAt);

  if (creates.length > 0) {
    input.cardIdsToReplace.add(input.cardId);
    input.syncedCardIds.add(input.cardId);
    input.unavailableCardIds.delete(input.cardId);
    input.creates.push(...creates);
    return creates.length;
  }

  if (input.markUnavailableIfMissing) {
    input.unavailableCardIds.add(input.cardId);
  }

  return 0;
}

function countSelectedCards(selectedByEpisode: Map<string, string[]>): number {
  let total = 0;
  for (const cardIds of selectedByEpisode.values()) {
    total += cardIds.length;
  }
  return total;
}

function mergeSelectedByEpisode(...maps: Array<Map<string, string[]>>): Map<string, string[]> {
  const merged = new Map<string, string[]>();

  for (const current of maps) {
    for (const [episodeId, cardIds] of current) {
      const existing = merged.get(episodeId) ?? [];
      const next = new Set([...existing, ...cardIds]);
      merged.set(episodeId, [...next]);
    }
  }

  return merged;
}

function mergeAutoCatalogSyncSelections(
  selections: AutoCatalogSyncSelection[]
): AutoCatalogSyncSelection {
  const remoteEpisodeMap = new Map<string, AutoCatalogSyncSelection["remoteEpisodes"][number]>();
  const selectedEpisodeMap = new Map<
    string,
    AutoCatalogSyncSelection["selectedEpisodes"][number]
  >();

  for (const selection of selections) {
    for (const episode of selection.remoteEpisodes) {
      remoteEpisodeMap.set(episode.id, episode);
    }

    for (const episode of selection.selectedEpisodes) {
      selectedEpisodeMap.set(episode.id, episode);
    }
  }

  return {
    remoteEpisodes: [...remoteEpisodeMap.values()],
    selectedEpisodes: [...selectedEpisodeMap.values()],
    candidateEpisodes: selections.reduce(
      (total, selection) => total + selection.candidateEpisodes,
      0
    ),
    newEpisodes: selections.reduce((total, selection) => total + selection.newEpisodes, 0),
  };
}

async function syncEpisodeCards(
  episodeId: string,
  options: {
    refreshAllPrices: boolean;
    backfillNativeHistory: boolean;
    throwIfCancelled?: () => Promise<void>;
  }
): Promise<EpisodeSyncResult> {
  await options.throwIfCancelled?.();

  const episode = await db.episode.findUnique({
    where: { id: episodeId },
    select: { code: true, name: true, card_count: true, game: true },
  });
  const game = normalizeTradingCardGame(episode?.game);
  const cards = await fetchCardsForEpisode(episodeId, game);

  await options.throwIfCancelled?.();

  const { tcgdexSupertypeLookup, tcgdexIllustratorLookup } =
    await loadEpisodeCardEnrichmentLookups(episode, cards);

  await options.throwIfCancelled?.();

  const fetchedAt = new Date();
  const nativeHistoryCandidateCardIds = cards
    .filter(
      (card) => hasAnyPrice(extractPrices(card.prices)) || hasAnyMarketplaceId(card)
    )
    .map((card) => card.id);

  const result = await runExclusiveDbWrite(() => db.$transaction(async (tx) => {
    const existingCards = await findExistingCardsForSync(tx, {
      episode_id: episodeId,
    });

    const existingCardMap = new Map(existingCards.map((card) => [card.id, card]));
    const priceCreates: Array<{ card_id: string; fetched_at: Date } & PriceSnapshotData> = [];
    const priceRefreshes: string[] = [];
    const gradedCardIdsToReplace = new Set<string>();
    const gradedCreates: GradedCreateRow[] = [];
    const ebaySoldGradedCardIdsToReplace = new Set<string>();
    const ebaySoldGradedCreates: EbaySoldGradedCreateRow[] = [];
    const ebaySoldGradedSyncedCardIds = new Set<string>();
    const ebaySoldGradedUnavailableCardIds = new Set<string>();

    let newCards = 0;
    let updatedCards = 0;
    let newPrices = 0;
    let refreshedPrices = 0;

    for (const [cardIndex, card] of cards.entries()) {
      if (cardIndex === 0 || cardIndex % 25 === 0) {
        await options.throwIfCancelled?.();
      }

      const existingCard = existingCardMap.get(card.id);
      const fallbackSupertype = resolveTcgdexSupertype(card.tcgid, tcgdexSupertypeLookup);
      const fallbackArtist = tcgdexIllustratorLookup.get(card.id) ?? null;
      const nextCardData = buildCardWriteData(
        existingCard,
        {
          ...card,
          ...card.score,
          artist: card.artist ?? fallbackArtist,
        },
        fallbackSupertype
      );

      if (!existingCard) {
        await tx.card.create({
          data: {
            id: card.id,
            episode_id: episodeId,
            ...nextCardData,
            game,
          },
        });
        existingCardMap.set(card.id, {
          id: card.id,
          ...nextCardData,
          game,
          price_source_status: null,
          price_source_checked_at: null,
          native_history_synced_at: null,
          ebaySoldGradedPrices: [],
          prices: [],
        });
        newCards += 1;
      } else if (hasCardChanges(existingCard, nextCardData)) {
        await tx.card.update({
          where: { id: card.id },
          data: nextCardData,
        });
        existingCardMap.set(card.id, {
          ...existingCard,
          ...nextCardData,
        });
        updatedCards += 1;
      }

      const nextGradedPrices = extractGradedPrices(card.prices);
      if (nextGradedPrices.length > 0) {
        gradedCardIdsToReplace.add(card.id);
        for (const gradedPrice of nextGradedPrices) {
          gradedCreates.push({
            card_id: card.id,
            label: gradedPrice.label,
            price: gradedPrice.price,
            fetched_at: fetchedAt,
          });
        }
      }

      queueEbaySoldGradedPriceWrites({
        cardId: card.id,
        prices: card.prices,
        fetchedAt,
        markUnavailableIfMissing:
          nextGradedPrices.length > 0 &&
          (existingCard?.ebaySoldGradedPrices.length ?? 0) === 0,
        cardIdsToReplace: ebaySoldGradedCardIdsToReplace,
        creates: ebaySoldGradedCreates,
        syncedCardIds: ebaySoldGradedSyncedCardIds,
        unavailableCardIds: ebaySoldGradedUnavailableCardIds,
      });

      const latestPrice = existingCard?.prices[0] ?? null;
      const nextPrice = extractPrices(card.prices);
      const writeMode = queuePriceSnapshotWrite(
        latestPrice,
        nextPrice,
        card.id,
        fetchedAt,
        options,
        priceCreates,
        priceRefreshes
      );

      if (writeMode === "new") {
        await tx.card.update({
          where: { id: card.id },
          data: {
            price_source_status: null,
            price_source_checked_at: fetchedAt,
          },
        });
        newPrices += 1;
      } else if (writeMode === "refreshed") {
        await tx.card.update({
          where: { id: card.id },
          data: {
            price_source_status: null,
            price_source_checked_at: fetchedAt,
          },
        });
        refreshedPrices += 1;
      } else if (!latestPrice) {
        await tx.card.update({
          where: { id: card.id },
          data: {
            price_source_status: "unavailable",
            price_source_checked_at: fetchedAt,
          },
        });
      }
    }

    const { gradedPricesUpdated } = await persistCardPriceWrites(tx, {
      fetchedAt,
      gradedCardIdsToReplace,
      gradedCreates,
      ebaySoldGradedCardIdsToReplace,
      ebaySoldGradedCreates,
      ebaySoldGradedSyncedCardIds,
      ebaySoldGradedUnavailableCardIds,
      priceRefreshes,
      priceCreates,
    });
    const localCardCountAfterSync = existingCards.length + newCards;

    await tx.episode.update({
      where: { id: episodeId },
      data: buildEpisodeSourceCheckUpdate({
        catalogCardCount: episode?.card_count ?? null,
        localCardCount: localCardCountAfterSync,
        actualCardCount: cards.length,
        checkedAt: fetchedAt,
        markSynced: true,
      }),
    });

    return {
      episodeId,
      count: cards.length,
      newCards,
      updatedCards,
      newPrices,
      refreshedPrices,
      gradedPricesUpdated,
    };
  }));

  if (options.backfillNativeHistory) {
    await options.throwIfCancelled?.();

    const cardIdsNeedingHistory = (
      await db.card.findMany({
        where: {
          episode_id: episodeId,
          id: { in: nativeHistoryCandidateCardIds },
          native_history_synced_at: null,
        },
        select: { id: true },
      })
    ).map((card) => card.id);

    await backfillCardNativeHistory(cardIdsNeedingHistory, fetchedAt, options.throwIfCancelled);
  }

  // Fire-and-forget: pre-warm the image cache so cards work offline.
  // Already-cached images are fast HITs; new images get downloaded in the background.
  void warmEpisodeImages(episodeId);

  return result;
}

async function selectAutoRefreshBatch(
  now: Date,
  options?: { game?: TradingCardGame }
): Promise<{
  dueCards: number;
  selectedCards: number;
  selectedByEpisode: Map<string, string[]>;
}> {
  const retryBefore = new Date(now.getTime() - PRICE_SOURCE_UNAVAILABLE_RETRY_MS);
  const candidates = await db.$queryRaw<
    Array<{
      id: string;
      game: string;
      episode_id: string;
      rarity: string | null;
      latest_fetched_at: Date | string;
      price_source_status: string | null;
      price_source_checked_at: Date | string | null;
    }>
  >`
    WITH latest_prices AS (
      SELECT card_id, MAX(fetched_at) AS latest_fetched_at
      FROM "Price"
      GROUP BY card_id
    )
    SELECT
      c.id,
      c.game,
      c.episode_id,
      c.rarity,
      c.price_source_status,
      c.price_source_checked_at,
      latest_prices.latest_fetched_at
    FROM "Card" c
    INNER JOIN latest_prices ON latest_prices.card_id = c.id
    WHERE c.tcggo_url IS NOT NULL
      AND (c.price_source_status IS NULL OR c.price_source_status <> 'unavailable')
  `;
  const hiddenEpisodeIds = new Set(await getHiddenEpisodeIds());

  const dueCandidates: DueCardCandidate[] = [];

  for (const candidate of candidates) {
    if (options?.game && candidate.game !== options.game) continue;
    if (hiddenEpisodeIds.has(candidate.episode_id)) continue;
    // A card can have an old snapshot but no current marketplace price. Do not spin on it.
    if (
      candidate.price_source_status === "unavailable" &&
      candidate.price_source_checked_at &&
      new Date(candidate.price_source_checked_at).getTime() > retryBefore.getTime()
    ) {
      continue;
    }

    const latestFetchedAt = normalizeTimestamp(candidate.latest_fetched_at);
    if (!latestFetchedAt) continue;

    const refreshInfo = getPriceRefreshInfo(candidate.rarity, latestFetchedAt, now.getTime());
    if (!refreshInfo.autoRefreshEnabled) continue;
    if (!refreshInfo.due) continue;

    dueCandidates.push({
      id: candidate.id,
      game: candidate.game,
      episodeId: candidate.episode_id,
      rarity: candidate.rarity,
      latestFetchedAt,
      priceSourceStatus: candidate.price_source_status,
      priceSourceCheckedAt: candidate.price_source_checked_at,
      tier: refreshInfo.tier,
    });
  }

  if (dueCandidates.length === 0) {
    return {
      dueCards: 0,
      selectedCards: 0,
      selectedByEpisode: new Map(),
    };
  }

  const byEpisode = new Map<string, DueCardCandidate[]>();
  for (const candidate of dueCandidates) {
    const existing = byEpisode.get(candidate.episodeId);
    if (existing) {
      existing.push(candidate);
    } else {
      byEpisode.set(candidate.episodeId, [candidate]);
    }
  }

  const rankedEpisodes = [...byEpisode.entries()]
    .map(([episodeId, cards]) => {
      const rankedCards = [...cards].sort((a, b) => {
        const tierDiff = getTierWeight(b.tier) - getTierWeight(a.tier);
        if (tierDiff !== 0) return tierDiff;
        return a.latestFetchedAt.localeCompare(b.latestFetchedAt);
      });

      return {
        episodeId,
        cards: rankedCards,
        highestTierWeight: Math.max(...rankedCards.map((card) => getTierWeight(card.tier))),
        score: rankedCards.reduce((total, card) => total + getTierWeight(card.tier), 0),
        oldestFetchedAt: rankedCards[0]?.latestFetchedAt ?? "",
      };
    })
    .sort((a, b) => {
      const highestTierDiff = b.highestTierWeight - a.highestTierWeight;
      if (highestTierDiff !== 0) return highestTierDiff;

      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;

      const oldestDiff = a.oldestFetchedAt.localeCompare(b.oldestFetchedAt);
      if (oldestDiff !== 0) return oldestDiff;

      return b.cards.length - a.cards.length;
    });

  const selectedByEpisode = new Map<string, string[]>();
  let selectedCards = 0;

  for (const episode of rankedEpisodes) {
    if (
      selectedByEpisode.size >= AUTO_PRICE_REFRESH_MAX_EPISODES ||
      selectedCards >= AUTO_PRICE_REFRESH_MAX_CARDS
    ) {
      break;
    }

    const remainingSlots = AUTO_PRICE_REFRESH_MAX_CARDS - selectedCards;
    const pickedCards = episode.cards.slice(0, remainingSlots).map((card) => card.id);
    if (pickedCards.length === 0) continue;

    selectedByEpisode.set(episode.episodeId, pickedCards);
    selectedCards += pickedCards.length;
  }

  return {
    dueCards: dueCandidates.length,
    selectedCards,
    selectedByEpisode,
  };
}

async function selectMissingPriceBackfillBatch(options?: {
  maxEpisodes?: number;
  maxCards?: number;
  game?: TradingCardGame;
}): Promise<{
  missingPriceCards: number;
  selectedCards: number;
  selectedByEpisode: Map<string, string[]>;
}> {
  const maxEpisodes = options?.maxEpisodes ?? AUTO_PRICE_BACKFILL_MAX_EPISODES;
  const maxCards = options?.maxCards ?? AUTO_PRICE_BACKFILL_MAX_CARDS;

  if (maxEpisodes <= 0 || maxCards <= 0) {
    return {
      missingPriceCards: 0,
      selectedCards: 0,
      selectedByEpisode: new Map(),
    };
  }

  const hiddenEpisodeIds = await getHiddenEpisodeIds();
  const visibleEpisodeFilter =
    hiddenEpisodeIds.length > 0 ? { episode_id: { notIn: hiddenEpisodeIds } } : {};
  const retryBefore = new Date(Date.now() - PRICE_SOURCE_UNAVAILABLE_RETRY_MS);
  const retryableMissingPriceWhere: Prisma.CardWhereInput = {
    ...visibleEpisodeFilter,
    ...(options?.game ? { game: options.game } : {}),
    tcggo_url: { not: null },
    prices: {
      none: {},
    },
    AND: [
      {
        OR: [
          { price_source_status: null },
          { price_source_status: { not: "unavailable" } },
        ],
      },
      {
        OR: [
          { price_source_checked_at: null },
          { price_source_checked_at: { lt: retryBefore } },
        ],
      },
    ],
  };

  const [missingPriceCards, cards] = await Promise.all([
    db.card.count({
      where: retryableMissingPriceWhere,
    }),
    db.card.findMany({
      where: retryableMissingPriceWhere,
      select: {
        id: true,
        episode_id: true,
        cardmarket_id: true,
        tcgplayer_id: true,
        price_source_status: true,
        price_source_checked_at: true,
        created_at: true,
      },
      take: Math.max(maxCards * 6, maxCards),
    }),
  ]);

  if (missingPriceCards === 0) {
    return {
      missingPriceCards: 0,
      selectedCards: 0,
      selectedByEpisode: new Map(),
    };
  }

  const candidates: MissingPriceCandidate[] = cards
    .map((card) => ({
      id: card.id,
      episodeId: card.episode_id,
      hasMarketId: hasAnyMarketplaceId(card),
      checkedAt: card.price_source_checked_at,
      createdAt: card.created_at,
    }))
    .sort((a, b) => {
      if (a.hasMarketId !== b.hasMarketId) return a.hasMarketId ? -1 : 1;

      const aNeverChecked = !a.checkedAt;
      const bNeverChecked = !b.checkedAt;
      if (aNeverChecked !== bNeverChecked) return aNeverChecked ? -1 : 1;

      if (a.checkedAt && b.checkedAt) {
        const checkedDiff = a.checkedAt.getTime() - b.checkedAt.getTime();
        if (checkedDiff !== 0) return checkedDiff;
      }

      return b.createdAt.getTime() - a.createdAt.getTime();
    });

  const selectedByEpisode = new Map<string, string[]>();
  let selectedCards = 0;

  for (const candidate of candidates) {
    if (selectedByEpisode.size >= maxEpisodes || selectedCards >= maxCards) {
      break;
    }

    const existing = selectedByEpisode.get(candidate.episodeId);
    if (existing) {
      existing.push(candidate.id);
      selectedCards += 1;
      continue;
    }

    selectedByEpisode.set(candidate.episodeId, [candidate.id]);
    selectedCards += 1;
  }

  return {
    missingPriceCards,
    selectedCards,
    selectedByEpisode,
  };
}

async function getVisibleKnownUnavailablePriceWhere(): Promise<Prisma.CardWhereInput> {
  const hiddenEpisodeIds = await getHiddenEpisodeIds();
  const visibleEpisodeFilter =
    hiddenEpisodeIds.length > 0 ? { episode_id: { notIn: hiddenEpisodeIds } } : {};

  return {
    ...visibleEpisodeFilter,
    tcggo_url: { not: null },
    price_source_status: "unavailable",
  };
}

export async function countKnownUnavailablePriceCandidates(): Promise<number> {
  return db.card.count({
    where: await getVisibleKnownUnavailablePriceWhere(),
  });
}

export async function getKnownUnavailablePriceSummary(): Promise<{
  totalCards: number;
  pokemonCards: number;
  onePieceCards: number;
  retryWindowCards: number;
  withoutPriceSnapshotCards: number;
  withPriceSnapshotCards: number;
  oldestCheckedAt: Date | null;
  latestCheckedAt: Date | null;
  nextRetryAt: Date | null;
}> {
  const where = await getVisibleKnownUnavailablePriceWhere();
  const retryBefore = new Date(Date.now() - PRICE_SOURCE_UNAVAILABLE_RETRY_MS);

  const [
    totalCards,
    byGame,
    checkedRange,
    retryWindowCards,
    withoutPriceSnapshotCards,
    withPriceSnapshotCards,
  ] = await Promise.all([
    db.card.count({ where }),
    db.card.groupBy({
      by: ["game"],
      where,
      _count: { _all: true },
    }),
    db.card.aggregate({
      where,
      _min: { price_source_checked_at: true },
      _max: { price_source_checked_at: true },
    }),
    db.card.count({
      where: {
        ...where,
        OR: [
          { price_source_checked_at: null },
          { price_source_checked_at: { lt: retryBefore } },
        ],
      },
    }),
    db.card.count({
      where: {
        ...where,
        prices: { none: {} },
      },
    }),
    db.card.count({
      where: {
        ...where,
        prices: { some: {} },
      },
    }),
  ]);

  const gameCounts = new Map(byGame.map((row) => [row.game, row._count._all]));
  const nextWaitingCard =
    totalCards > 0 && retryWindowCards === 0
      ? await db.card.findFirst({
          where: {
            ...where,
            price_source_checked_at: { not: null },
          },
          orderBy: { price_source_checked_at: "asc" },
          select: { price_source_checked_at: true },
        })
      : null;

  return {
    totalCards,
    pokemonCards: gameCounts.get(POKEMON_GAME) ?? 0,
    onePieceCards: gameCounts.get(ONE_PIECE_GAME) ?? 0,
    retryWindowCards,
    withoutPriceSnapshotCards,
    withPriceSnapshotCards,
    oldestCheckedAt: checkedRange._min.price_source_checked_at ?? null,
    latestCheckedAt: checkedRange._max.price_source_checked_at ?? null,
    nextRetryAt: retryWindowCards > 0
      ? new Date()
      : nextWaitingCard?.price_source_checked_at
        ? new Date(nextWaitingCard.price_source_checked_at.getTime() + PRICE_SOURCE_UNAVAILABLE_RETRY_MS)
        : null,
  };
}

export async function reconcilePriceSourceCheckedAtFromSnapshots(): Promise<number> {
  return runExclusiveDbWrite(() =>
    db.$executeRaw`
      UPDATE "Card"
      SET
        price_source_status = NULL,
        price_source_checked_at = (
          SELECT MAX("Price".fetched_at)
          FROM "Price"
          WHERE "Price".card_id = "Card".id
        )
      WHERE tcggo_url IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM "Price"
          WHERE "Price".card_id = "Card".id
        )
        AND (
          price_source_checked_at IS NULL
          OR datetime(price_source_checked_at) < datetime((
            SELECT MAX("Price".fetched_at)
            FROM "Price"
            WHERE "Price".card_id = "Card".id
          ))
        )
    `
  );
}

async function selectKnownUnavailablePriceCheckBatch(options?: {
  maxEpisodes?: number;
  maxCards?: number;
}): Promise<{
  totalUnavailableCards: number;
  plannedCards: number;
  selectedByEpisode: Map<string, string[]>;
}> {
  const maxEpisodes = options?.maxEpisodes ?? KNOWN_UNAVAILABLE_PRICE_CHECK_MAX_EPISODES;
  const maxCards = options?.maxCards ?? KNOWN_UNAVAILABLE_PRICE_CHECK_MAX_CARDS;

  if (maxEpisodes <= 0 || maxCards <= 0) {
    return {
      totalUnavailableCards: 0,
      plannedCards: 0,
      selectedByEpisode: new Map(),
    };
  }

  const where = await getVisibleKnownUnavailablePriceWhere();
  const [totalUnavailableCards, cards] = await Promise.all([
    db.card.count({ where }),
    db.card.findMany({
      where,
      select: {
        id: true,
        episode_id: true,
        price_source_checked_at: true,
        created_at: true,
      },
    }),
  ]);

  if (totalUnavailableCards === 0) {
    return {
      totalUnavailableCards,
      plannedCards: 0,
      selectedByEpisode: new Map(),
    };
  }

  const candidates: KnownUnavailablePriceCandidate[] = cards.map((card) => ({
    id: card.id,
    episodeId: card.episode_id,
    checkedAt: card.price_source_checked_at,
    createdAt: card.created_at,
  }));

  const byEpisode = new Map<string, KnownUnavailablePriceCandidate[]>();
  for (const candidate of candidates) {
    const existing = byEpisode.get(candidate.episodeId);
    if (existing) {
      existing.push(candidate);
    } else {
      byEpisode.set(candidate.episodeId, [candidate]);
    }
  }

  const rankedEpisodes = [...byEpisode.entries()]
    .map(([episodeId, episodeCards]) => {
      const rankedCards = [...episodeCards].sort((a, b) => {
        const checkedDiff =
          (a.checkedAt?.getTime() ?? 0) - (b.checkedAt?.getTime() ?? 0);
        if (checkedDiff !== 0) return checkedDiff;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

      return {
        episodeId,
        cards: rankedCards,
        oldestCheckedAt: rankedCards[0]?.checkedAt?.getTime() ?? 0,
      };
    })
    .sort((a, b) => {
      const oldestDiff = a.oldestCheckedAt - b.oldestCheckedAt;
      if (oldestDiff !== 0) return oldestDiff;
      return b.cards.length - a.cards.length;
    });

  const selectedByEpisode = new Map<string, string[]>();
  let plannedCards = 0;

  for (const episode of rankedEpisodes) {
    if (selectedByEpisode.size >= maxEpisodes || plannedCards >= maxCards) {
      break;
    }

    const remainingSlots = maxCards - plannedCards;
    const pickedCards = episode.cards.slice(0, remainingSlots).map((card) => card.id);
    if (pickedCards.length === 0) continue;

    selectedByEpisode.set(episode.episodeId, pickedCards);
    plannedCards += pickedCards.length;
  }

  return {
    totalUnavailableCards,
    plannedCards,
    selectedByEpisode,
  };
}

export async function getAutoPriceRefreshSnapshot(options?: {
  game?: TradingCardGame;
}): Promise<{
  dueCards: number;
  missingPriceCards: number;
  unavailableCooldownCards: number;
  nextUnavailableRetryAt: Date | null;
  nextBatchCards: number;
  nextBatchEpisodes: number;
  nextBatchEpisodeIds: string[];
  nextBatchCardIds: string[];
}> {
  const timer = startPerformanceTimer("sync.auto-price-refresh.snapshot");
  const now = new Date();
  const dueBatch = await selectAutoRefreshBatch(now, { game: options?.game });
  const backfillBatch = await selectMissingPriceBackfillBatch({
    maxCards: Math.min(
      AUTO_PRICE_BACKFILL_MAX_CARDS,
      Math.max(AUTO_PRICE_REFRESH_MAX_CARDS - dueBatch.selectedCards, 0)
    ),
    game: options?.game,
  });
  const combinedBatch = mergeSelectedByEpisode(dueBatch.selectedByEpisode, backfillBatch.selectedByEpisode);
  const hiddenEpisodeIds = await getHiddenEpisodeIds();
  const visibleEpisodeFilter =
    hiddenEpisodeIds.length > 0 ? { episode_id: { notIn: hiddenEpisodeIds } } : {};

  const unavailableCooldownCards = await db.card.count({
    where: {
      ...visibleEpisodeFilter,
      ...(options?.game ? { game: options.game } : {}),
      tcggo_url: { not: null },
      price_source_status: "unavailable",
    },
  });

  const result = {
    dueCards: dueBatch.dueCards,
    missingPriceCards: backfillBatch.missingPriceCards,
    unavailableCooldownCards,
    nextUnavailableRetryAt: null,
    nextBatchCards: countSelectedCards(combinedBatch),
    nextBatchEpisodes: combinedBatch.size,
    nextBatchEpisodeIds: [...combinedBatch.keys()].slice(0, 6),
    nextBatchCardIds: [...new Set([...combinedBatch.values()].flat())].slice(0, 8),
  };

  timer.finish({
    dueCards: result.dueCards,
    missingPriceCards: result.missingPriceCards,
    cooldownCards: result.unavailableCooldownCards,
    nextBatchCards: result.nextBatchCards,
    nextBatchEpisodes: result.nextBatchEpisodes,
  });

  return result;
}

async function refreshEpisodeDueCards(
  episodeId: string,
  cardIds: string[],
  fetchedAt: Date,
  throwIfCancelled?: () => Promise<void>
): Promise<AutoEpisodePriceRefreshResult> {
  await throwIfCancelled?.();

  const episode = await db.episode.findUnique({
    where: { id: episodeId },
    select: {
      game: true,
      code: true,
      name: true,
      card_count: true,
      _count: {
        select: {
          cards: true,
        },
      },
    },
  });
  const game = normalizeTradingCardGame(episode?.game);
  const remoteCards = await fetchCardsForEpisode(episodeId, game);

  await throwIfCancelled?.();

  const remoteCardMap = new Map(remoteCards.map((card) => [card.id, card]));
  const tcgdexSupertypeLookup = new Map<string, string>();
  const tcgdexIllustratorLookup = new Map<string, string>();

  return runExclusiveDbWrite(() => db.$transaction(async (tx) => {
    const existingCards = await findExistingCardsForSync(tx, {
      id: { in: cardIds },
    });

    const existingCardMap = new Map(existingCards.map((card) => [card.id, card]));
    const priceCreates: Array<{ card_id: string; fetched_at: Date } & PriceSnapshotData> = [];
    const priceRefreshes: string[] = [];
    const gradedCardIdsToReplace = new Set<string>();
    const gradedCreates: GradedCreateRow[] = [];
    const ebaySoldGradedCardIdsToReplace = new Set<string>();
    const ebaySoldGradedCreates: EbaySoldGradedCreateRow[] = [];
    const ebaySoldGradedSyncedCardIds = new Set<string>();
    const ebaySoldGradedUnavailableCardIds = new Set<string>();

    let updatedCards = 0;
    let newPrices = 0;
    let refreshedPrices = 0;
    let refreshedCards = 0;

    for (const [cardIndex, cardId] of cardIds.entries()) {
      if (cardIndex === 0 || cardIndex % 25 === 0) {
        await throwIfCancelled?.();
      }

      const existingCard = existingCardMap.get(cardId);
      const remoteCard = remoteCardMap.get(cardId);

      if (!existingCard || !remoteCard) {
        continue;
      }

      const fallbackSupertype = resolveTcgdexSupertype(remoteCard.tcgid, tcgdexSupertypeLookup);
      const fallbackArtist = tcgdexIllustratorLookup.get(cardId) ?? null;
      const nextCardData = buildCardWriteData(
        existingCard,
        {
          ...remoteCard,
          ...remoteCard.score,
          artist: remoteCard.artist ?? fallbackArtist,
        },
        fallbackSupertype
      );
      const cardUpdateData: Partial<CardWriteData> & {
        price_source_status?: string | null;
        price_source_checked_at?: Date | null;
      } = {};
      let shouldUpdateCard = false;

      if (hasCardChanges(existingCard, nextCardData)) {
        Object.assign(cardUpdateData, nextCardData);
        shouldUpdateCard = true;
        updatedCards += 1;
      }

      const nextGradedPrices = extractGradedPrices(remoteCard.prices);
      if (nextGradedPrices.length > 0) {
        gradedCardIdsToReplace.add(cardId);
        for (const gradedPrice of nextGradedPrices) {
          gradedCreates.push({
            card_id: cardId,
            label: gradedPrice.label,
            price: gradedPrice.price,
            fetched_at: fetchedAt,
          });
        }
      }

      queueEbaySoldGradedPriceWrites({
        cardId,
        prices: remoteCard.prices,
        fetchedAt,
        markUnavailableIfMissing:
          nextGradedPrices.length > 0 &&
          (existingCard.ebaySoldGradedPrices.length ?? 0) === 0,
        cardIdsToReplace: ebaySoldGradedCardIdsToReplace,
        creates: ebaySoldGradedCreates,
        syncedCardIds: ebaySoldGradedSyncedCardIds,
        unavailableCardIds: ebaySoldGradedUnavailableCardIds,
      });

      const latestPrice = existingCard.prices[0] ?? null;
      const nextPrice = extractPrices(remoteCard.prices);
      const writeMode = queuePriceSnapshotWrite(
        latestPrice,
        nextPrice,
        cardId,
        fetchedAt,
        { refreshAllPrices: true },
        priceCreates,
        priceRefreshes
      );

      if (writeMode === "new") {
        cardUpdateData.price_source_status = null;
        cardUpdateData.price_source_checked_at = fetchedAt;
        shouldUpdateCard = true;
        newPrices += 1;
        refreshedCards += 1;
      } else if (writeMode === "refreshed") {
        cardUpdateData.price_source_status = null;
        cardUpdateData.price_source_checked_at = fetchedAt;
        shouldUpdateCard = true;
        refreshedPrices += 1;
        refreshedCards += 1;
      } else {
        cardUpdateData.price_source_status = "unavailable";
        cardUpdateData.price_source_checked_at = fetchedAt;
        shouldUpdateCard = true;
      }

      if (shouldUpdateCard) {
        await tx.card.update({
          where: { id: cardId },
          data: cardUpdateData,
        });
      }
    }

    const { gradedPricesUpdated } = await persistCardPriceWrites(tx, {
      fetchedAt,
      gradedCardIdsToReplace,
      gradedCreates,
      ebaySoldGradedCardIdsToReplace,
      ebaySoldGradedCreates,
      ebaySoldGradedSyncedCardIds,
      ebaySoldGradedUnavailableCardIds,
      priceRefreshes,
      priceCreates,
    });

    await tx.episode.update({
      where: { id: episodeId },
      data: buildEpisodeSourceCheckUpdate({
        catalogCardCount: episode?.card_count ?? null,
        localCardCount: episode?._count.cards ?? 0,
        actualCardCount: remoteCards.length,
        checkedAt: fetchedAt,
      }),
    });

    return {
      episodeId,
      selectedCards: cardIds.length,
      updatedCards,
      newPrices,
      refreshedPrices,
      refreshedCards,
      gradedPricesUpdated,
    };
  }));
}

export async function runCardPriceRefresh(cardId: string): Promise<CardPriceRefreshResult> {
  return runLoggedSync(
    `card:${cardId}`,
    `Refreshing price for card ${cardId}`,
    summarizeCardPriceRefresh,
    async (progress) => {
      await progress.throwIfCancelled();

      const existingCard = await db.card.findUnique({
        where: { id: cardId },
        select: syncCardWithEpisodeSelect,
      });

      if (!existingCard) {
        throw new Error("Card not found.");
      }

      await progress.throwIfCancelled();
      await progress.updateMessage(`Refreshing ${existingCard.name} (${cardId})`);

      const remoteCard = await fetchCardDetail(cardId, normalizeTradingCardGame(existingCard.game));
      if (!remoteCard) {
        throw new Error("Card not found in the scraper source.");
      }

      await progress.throwIfCancelled();

      const { tcgdexSupertypeLookup, tcgdexIllustratorLookup } =
        await loadEpisodeCardEnrichmentLookups(existingCard.episode, [remoteCard]);
      const fetchedAt = new Date();

      const refreshResult = await db.$transaction(async (tx) => {
        const fallbackSupertype = resolveTcgdexSupertype(remoteCard.tcgid, tcgdexSupertypeLookup);
        const fallbackArtist = tcgdexIllustratorLookup.get(cardId) ?? null;
        const nextCardData = buildCardWriteData(
          existingCard,
          {
            ...remoteCard,
            ...remoteCard.score,
            artist: remoteCard.artist ?? fallbackArtist,
          },
          fallbackSupertype
        );

        let updatedCard = false;
        let newPrices = 0;
        let refreshedPrices = 0;

        if (hasCardChanges(existingCard, nextCardData)) {
          await tx.card.update({
            where: { id: cardId },
            data: nextCardData,
          });
          updatedCard = true;
        }

        const nextGradedPrices = extractGradedPrices(remoteCard.prices);
        const gradedCreates = nextGradedPrices.map((gradedPrice) => ({
          card_id: cardId,
          label: gradedPrice.label,
          price: gradedPrice.price,
          fetched_at: fetchedAt,
        }));
        const ebaySoldGradedCardIdsToReplace = new Set<string>();
        const ebaySoldGradedCreates: EbaySoldGradedCreateRow[] = [];
        const ebaySoldGradedSyncedCardIds = new Set<string>();
        const ebaySoldGradedUnavailableCardIds = new Set<string>();
        queueEbaySoldGradedPriceWrites({
          cardId,
          prices: remoteCard.prices,
          fetchedAt,
          markUnavailableIfMissing:
            nextGradedPrices.length > 0 &&
            existingCard.ebaySoldGradedPrices.length === 0,
          cardIdsToReplace: ebaySoldGradedCardIdsToReplace,
          creates: ebaySoldGradedCreates,
          syncedCardIds: ebaySoldGradedSyncedCardIds,
          unavailableCardIds: ebaySoldGradedUnavailableCardIds,
        });

        const latestPrice = existingCard.prices[0] ?? null;
        const nextPrice = extractPrices(remoteCard.prices);
        const priceCreates: Array<{ card_id: string; fetched_at: Date } & PriceSnapshotData> = [];
        const priceRefreshes: string[] = [];
        const writeMode = queuePriceSnapshotWrite(
          latestPrice,
          nextPrice,
          cardId,
          fetchedAt,
          { refreshAllPrices: true },
          priceCreates,
          priceRefreshes
        );

        if (writeMode === "new") {
          await tx.card.update({
            where: { id: cardId },
            data: {
              price_source_status: null,
              price_source_checked_at: fetchedAt,
            },
          });
          newPrices += 1;
        } else if (writeMode === "refreshed") {
          await tx.card.update({
            where: { id: cardId },
            data: {
              price_source_status: null,
              price_source_checked_at: fetchedAt,
            },
          });
          refreshedPrices += 1;
        } else {
          await tx.card.update({
            where: { id: cardId },
            data: {
              price_source_status: "unavailable",
              price_source_checked_at: fetchedAt,
            },
          });
        }

        const { gradedPricesUpdated } = await persistCardPriceWrites(tx, {
          fetchedAt,
          gradedCardIdsToReplace: new Set(gradedCreates.length > 0 ? [cardId] : []),
          gradedCreates,
          ebaySoldGradedCardIdsToReplace,
          ebaySoldGradedCreates,
          ebaySoldGradedSyncedCardIds,
          ebaySoldGradedUnavailableCardIds,
          priceRefreshes,
          priceCreates,
        });

        return {
          cardId,
          updatedCard,
          newPrices,
          refreshedPrices,
          gradedPricesUpdated,
        };
      });

      return refreshResult;
    }
  );
}

export async function runSingleCardHistoryImport(
  cardId: string
): Promise<CardHistoryImportResult> {
  return runLoggedSync(
    `card-history:${cardId}`,
    `Syncing history for card ${cardId}`,
    summarizeCardHistoryImport,
    async (progress) => {
      await progress.throwIfCancelled();

      const existingCard = await db.card.findUnique({
        where: { id: cardId },
        select: {
          id: true,
          name: true,
          native_history_synced_at: true,
        },
      });

      if (!existingCard) {
        throw new Error("Card not found.");
      }

      await progress.throwIfCancelled();
      await progress.updateMessage(`Syncing ${existingCard.name} history (${cardId})`);

      // Only use the latest local row as date_from after native history was
      // imported. First imports must fetch full TCGGO history.
      const existingSnapshots = await db.price.findMany({
        where: { card_id: cardId },
        select: {
          fetched_at: true,
        },
      });
      const existingSnapshotDates = new Set(
        existingSnapshots.map((snapshot) => snapshot.fetched_at.toISOString())
      );
      const latestExisting = existingSnapshots.reduce<Date | null>((acc, snap) => {
        const t = snap.fetched_at.getTime();
        return acc == null || t > acc.getTime() ? snap.fetched_at : acc;
      }, null);
      const incrementalDateFrom =
        existingCard.native_history_synced_at != null ? latestExisting : null;

      const history = await fetchHistoryPricesByItemId(cardId, {
        dateFrom: incrementalDateFrom ? formatHistoryDateFrom(incrementalDateFrom) : undefined,
      });
      await progress.throwIfCancelled();
      const priceCreates: Array<{ card_id: string; fetched_at: Date } & PriceSnapshotData> = [];

      for (const point of history) {
        const fetchedAt = toHistorySnapshotDate(point.date);
        const iso = fetchedAt.toISOString();

        if (existingSnapshotDates.has(iso)) {
          continue;
        }

        priceCreates.push({
          card_id: cardId,
          fetched_at: fetchedAt,
          cm_en_lowest_nm: point.cm_market,
          cm_de_lowest_nm: point.cm_market_de,
          cm_fr_lowest_nm: point.cm_market_fr,
          cm_es_lowest_nm: point.cm_market_es,
          cm_it_lowest_nm: point.cm_market_it,
          cm_en_avg_30d: null,
          cm_en_avg_7d: null,
          tcp_market: point.tcp_market,
          tcp_mid: null,
          tcp_low: null,
        });
        existingSnapshotDates.add(iso);
      }

      const syncedAt = new Date();

      await db.$transaction(async (tx) => {
        if (priceCreates.length > 0) {
          await writeInChunks(priceCreates, DB_WRITE_BATCH_SIZE, async (chunk) => {
            await tx.price.createMany({
              data: chunk,
            });
          });
        }

        // Local refresh snapshots alone do not prove that native TCGGO history
        // was imported during a first sync.
        const hasAnyHistory =
          history.length > 0 ||
          (existingCard.native_history_synced_at != null && existingSnapshots.length > 0);
        await tx.card.update({
          where: { id: cardId },
          data: {
            native_history_synced_at: hasAnyHistory ? syncedAt : null,
            native_history_status: hasAnyHistory ? "synced" : "unavailable",
            native_history_checked_at: syncedAt,
          },
        });
      });

      return {
        cardId,
        historyPointsFetched: history.length,
        newHistorySnapshots: priceCreates.length,
        historySynced: history.length > 0 || existingSnapshots.length > 0,
      };
    }
  );
}

export async function runSealedProductRefresh(
  productId: string
): Promise<SealedProductRefreshResult> {
  return runLoggedSync(
    `sealed-product:${productId}`,
    `Refreshing price for sealed product ${productId}`,
    summarizeSealedProductRefresh,
    async (progress) => {
      await progress.throwIfCancelled();

      const existingProduct = await db.sealedProduct.findUnique({
        where: { id: productId },
        select: {
          id: true,
          game: true,
          name: true,
          episode_id: true,
        },
      });

      if (!existingProduct) {
        throw new Error("Sealed product not found.");
      }

      await progress.throwIfCancelled();
      await progress.updateMessage(`Refreshing ${existingProduct.name} (${productId})`);

      const remoteProducts = await fetchSealedProductsForEpisode(
        existingProduct.episode_id,
        normalizeTradingCardGame(existingProduct.game)
      );
      const remoteProduct = remoteProducts.find((product) => product.id === productId);

      if (!remoteProduct) {
        throw new Error("Sealed product not found in the scraper source.");
      }

      await progress.throwIfCancelled();

      const syncedAt = new Date();
      await persistEpisodeSealedProducts(existingProduct.episode_id, [remoteProduct], syncedAt, {
        replaceMissingEpisodeProducts: false,
      });

      return {
        productId,
        syncedAt,
      };
    }
  );
}

export async function runSealedProductHistorySync(
  productId: string
): Promise<SealedProductHistorySyncResult> {
  return runLoggedSync(
    `sealed-history:${productId}`,
    `Syncing price history for sealed product ${productId}`,
    summarizeSealedProductHistorySync,
    async (progress) => {
      await progress.throwIfCancelled();

      const product = await db.sealedProduct.findUnique({
        where: { id: productId },
        select: {
          id: true,
          name: true,
          episode_id: true,
        },
      });

      if (!product) {
        throw new Error("Sealed product not found.");
      }

      await progress.throwIfCancelled();
      await progress.updateMessage(`Syncing ${product.name} history (${productId})`);

      // Read existing snapshots first so we can request only newer history.
      const existingSnapshots = await db.sealedPriceSnapshot.findMany({
        where: { product_id: product.id },
        select: {
          fetched_at: true,
        },
      });
      const existingSnapshotDates = new Set(
        existingSnapshots.map((snapshot) => snapshot.fetched_at.toISOString())
      );
      const latestExisting = existingSnapshots.reduce<Date | null>((acc, snap) => {
        const t = snap.fetched_at.getTime();
        return acc == null || t > acc.getTime() ? snap.fetched_at : acc;
      }, null);

      const history = await fetchHistoryPricesByItemId(product.id, {
        dateFrom: latestExisting ? formatHistoryDateFrom(latestExisting) : undefined,
      });

      await progress.throwIfCancelled();
      const historyCreates: Array<{
        product_id: string;
        episode_id: string;
        fetched_at: Date;
        cm_lowest: number | null;
        cm_lowest_eu: number | null;
        cm_lowest_de: number | null;
        cm_lowest_fr: number | null;
        cm_lowest_es: number | null;
        cm_lowest_it: number | null;
        cm_avg_7d: number | null;
        cm_avg_30d: number | null;
      }> = [];

      for (const point of history) {
        const fetchedAt = toHistorySnapshotDate(point.date);
        const iso = fetchedAt.toISOString();

        if (existingSnapshotDates.has(iso)) {
          continue;
        }

        historyCreates.push({
          product_id: product.id,
          episode_id: product.episode_id,
          fetched_at: fetchedAt,
          cm_lowest: point.cm_market,
          cm_lowest_eu: null,
          cm_lowest_de: point.cm_market_de,
          cm_lowest_fr: point.cm_market_fr,
          cm_lowest_es: point.cm_market_es,
          cm_lowest_it: point.cm_market_it,
          cm_avg_7d: null,
          cm_avg_30d: null,
        });
        existingSnapshotDates.add(iso);
      }

      await progress.throwIfCancelled();

      const syncedAt = new Date();
      await db.$transaction(async (tx) => {
        if (historyCreates.length > 0) {
          await writeInChunks(historyCreates, DB_WRITE_BATCH_SIZE, async (chunk) => {
            await tx.sealedPriceSnapshot.createMany({
              data: chunk,
            });
          });
        }

        const hasAnyHistory = history.length > 0 || existingSnapshots.length > 0;
        await tx.sealedProduct.update({
          where: { id: product.id },
          data: {
            native_history_synced_at: hasAnyHistory ? syncedAt : null,
            native_history_status: hasAnyHistory ? "synced" : "unavailable",
            native_history_checked_at: syncedAt,
          },
        });
      });

      return {
        productId,
        historyPointsFetched: history.length,
        newHistorySnapshots: historyCreates.length,
      };
    }
  );
}

export async function runEbaySoldGradedPriceSync(options?: {
  skip?: number;
}): Promise<EbaySoldGradedPriceSyncResult> {
  const skip = Math.max(options?.skip ?? 0, 0);
  const totalCandidateCardCount = await countEbaySoldGradedPriceCandidates();
  const candidateCardCount = Math.max(totalCandidateCardCount - skip, 0);

  if (candidateCardCount === 0) {
    return {
      candidateCards: 0,
      selectedCards: 0,
      processedCards: 0,
      cardsWithPrices: 0,
      cardsWithoutPrices: 0,
      failedCards: 0,
      ebaySoldGradedPricesUpdated: 0,
      remainingCards: 0,
      hasMore: false,
      skipped: true,
      message: "All cards already have imported eBay sold graded prices.",
    };
  }

  const candidateCards = await selectEbaySoldGradedPriceCandidates({
    take: MANUAL_EBAY_SOLD_GRADED_PRICE_SYNC_MAX_CARDS_PER_RUN,
    skip,
  });

  if (candidateCards.length === 0) {
    return {
      candidateCards: candidateCardCount,
      selectedCards: 0,
      processedCards: 0,
      cardsWithPrices: 0,
      cardsWithoutPrices: 0,
      failedCards: 0,
      ebaySoldGradedPricesUpdated: 0,
      remainingCards: await countEbaySoldGradedPriceCandidates(),
      hasMore: false,
      skipped: true,
      message: "No eBay sold graded price candidates were selectable for this run.",
    };
  }

  return runLoggedSync(
    EBAY_SOLD_GRADED_PRICE_SYNC_TYPE,
    `Syncing eBay sold graded prices for ${candidateCards.length} of ${candidateCardCount} cards`,
    summarizeEbaySoldGradedPriceSync,
    async (progress) => {
      await progress.throwIfCancelled();
      const updateEbayProgress = (
        message: string,
        input: Partial<
          Omit<EbaySoldGradedPriceLogDetails, "version" | "kind" | "runId" | "status">
        >
      ) =>
        progress.updateMessage(
          message,
          createEbaySoldGradedPriceLogDetails(progress.syncId, "running", {
            candidateCards: candidateCardCount,
            selectedCards: candidateCards.length,
            remainingCards: candidateCardCount,
            hasMore: candidateCardCount > candidateCards.length,
            ...input,
          })
        );

      await progress.updateMessage(
        `Syncing eBay sold graded prices for ${candidateCards.length}/${candidateCardCount} cards. This uses scraper requests.`,
        createEbaySoldGradedPriceLogDetails(progress.syncId, "running", {
          candidateCards: candidateCardCount,
          selectedCards: candidateCards.length,
          remainingCards: candidateCardCount,
          hasMore: candidateCardCount > candidateCards.length,
        })
      );

      const fetchedAt = new Date();
      const result = await backfillEbaySoldGradedPricesDetailed(candidateCards, fetchedAt, {
        concurrency: MANUAL_EBAY_SOLD_GRADED_PRICE_SYNC_CONCURRENCY,
        throwIfCancelled: progress.throwIfCancelled,
        onProgress: async ({
          totalCards,
          processedCards,
          cardsWithPrices,
          cardsWithoutPrices,
          failedCards,
          pricesUpdated,
        }) => {
          await updateEbayProgress(
            `Syncing eBay sold graded prices ${processedCards}/${totalCards} | ${cardsWithPrices} with prices | ${cardsWithoutPrices} without prices | ${failedCards} failed | ${pricesUpdated} eBay rows | ${Math.max(totalCards - processedCards, 0)} left in this batch`,
            {
              processedCards,
              cardsWithPrices,
              cardsWithoutPrices,
              failedCards,
              ebaySoldGradedPricesUpdated: pricesUpdated,
              remainingCards: Math.max(candidateCardCount - cardsWithPrices, 0),
            }
          );
        },
      });
      const remainingUnvisitedCards = Math.max(candidateCardCount - result.processedCards, 0);
      const remainingCards = await countEbaySoldGradedPriceCandidates();

      return {
        candidateCards: candidateCardCount,
        selectedCards: candidateCards.length,
        processedCards: result.processedCards,
        cardsWithPrices: result.cardsWithPrices,
        cardsWithoutPrices: result.cardsWithoutPrices,
        failedCards: result.failedCards,
        ebaySoldGradedPricesUpdated: result.pricesUpdated,
        remainingCards,
        hasMore: remainingUnvisitedCards > 0 && !result.quotaExceeded,
        skipped: result.quotaExceeded,
        ...getTcggoQuotaResultFields(result.quotaExceeded),
        message: result.quotaExceeded
          ? `Paused after ${result.processedCards} cards because scraper requests are exhausted. Resume after the quota reset.`
          : remainingCards > 0
            ? `Imported eBay sold graded prices for ${result.cardsWithPrices} cards. ${remainingCards} cards still do not have eBay sold rows.`
            : `eBay sold graded price import complete. Imported prices for ${result.cardsWithPrices} cards.`,
      };
    },
    {
      interruptAutoPriceRefresh: true,
      successDetails: (result, syncId) =>
        createEbaySoldGradedPriceResultDetails(syncId, result),
    }
  );
}

export async function runCardHistorySync(): Promise<CardHistorySyncResult> {
  const candidateCardCount = await countManualCardHistoryCandidates();

  if (candidateCardCount === 0) {
    return {
      candidateCards: 0,
      selectedCards: 0,
      processedCards: 0,
      syncedCards: 0,
      failedCards: 0,
      newHistorySnapshots: 0,
      remainingCards: 0,
      hasMore: false,
      skipped: true,
      message: "All eligible cards across expansions already have imported history.",
    };
  }

  const candidateCards = await selectManualCardHistoryCandidates({
    take: MANUAL_HISTORY_SYNC_MAX_CARDS_PER_RUN,
  });

  return runLoggedSync(
    CARD_HISTORY_SYNC_TYPE,
    `Syncing TCGGO card history for ${candidateCards.length} of ${candidateCardCount} cards`,
    summarizeCardHistorySync,
    async (progress) => {
      await progress.throwIfCancelled();
      const updateHistoryProgress = (
        message: string,
        input: Partial<Omit<CardHistoryLogDetails, "version" | "kind" | "runId" | "status">>
      ) =>
        progress.updateMessage(
          message,
          createCardHistoryLogDetails(progress.syncId, "running", {
            candidateCards: candidateCardCount,
            selectedCards: candidateCards.length,
            remainingCards: candidateCardCount,
            hasMore: candidateCardCount > candidateCards.length,
            ...input,
          })
        );

      await progress.updateMessage(
        `Syncing TCGGO card history for ${candidateCards.length}/${candidateCardCount} eligible cards across expansions. Common and Uncommon stay base-price only. This uses scraper requests.`,
        createCardHistoryLogDetails(progress.syncId, "running", {
          candidateCards: candidateCardCount,
          selectedCards: candidateCards.length,
          remainingCards: candidateCardCount,
          hasMore: candidateCardCount > candidateCards.length,
        })
      );

      const syncedAt = new Date();
      const result = await backfillCardNativeHistoryDetailed(candidateCards, syncedAt, {
        batchSize: MANUAL_HISTORY_SYNC_BATCH_SIZE,
        markFailedAsSynced: true,
        throwIfCancelled: progress.throwIfCancelled,
        onProgress: async ({
          totalCards,
          processedCards,
          syncedCards,
          failedCards,
          snapshotsCreated,
        }) => {
          await updateHistoryProgress(
            `Syncing card history ${processedCards}/${totalCards} | ${syncedCards} synced | ${failedCards} unavailable | ${snapshotsCreated} history snapshots | ${Math.max(totalCards - processedCards, 0)} left in this batch`,
            {
              processedCards,
              syncedCards,
              failedCards,
              newHistorySnapshots: snapshotsCreated,
              remainingCards: Math.max(candidateCardCount - processedCards, 0),
            }
          );
        },
      });
      const remainingCards = await countManualCardHistoryCandidates();

      return {
        candidateCards: candidateCardCount,
        selectedCards: candidateCards.length,
        processedCards: result.processedCards,
        syncedCards: result.syncedCards,
        failedCards: result.failedCards,
        newHistorySnapshots: result.snapshotsCreated,
        remainingCards,
        hasMore: remainingCards > 0 && !result.quotaExceeded,
        skipped: result.quotaExceeded,
        ...getTcggoQuotaResultFields(result.quotaExceeded),
        message: result.quotaExceeded
          ? `Paused after ${result.processedCards} cards because scraper requests are exhausted. Resume after the quota reset.`
          : remainingCards > 0
            ? `Imported history for ${result.syncedCards} cards and skipped ${result.failedCards} unavailable cards. Continuing with ${remainingCards} remaining.`
            : `History import complete. Imported ${result.syncedCards} cards and skipped ${result.failedCards} unavailable cards.`,
      };
    },
    {
      interruptAutoPriceRefresh: true,
      successDetails: (result, syncId) => createCardHistoryResultDetails(syncId, result),
    }
  );
}

export async function runAutoPriceRefresh(): Promise<AutoPriceRefreshResult> {
  const now = new Date();
  const latestCancelledAutoRefresh = await db.syncLog.findFirst({
    where: {
      type: AUTO_PRICE_REFRESH_TYPE,
      status: "cancelled",
      finished_at: { not: null },
    },
    orderBy: { finished_at: "desc" },
    select: { finished_at: true },
  });
  const pauseRemainingMs = getAutoPriceRefreshPauseRemainingMs({
    cancelledAt: latestCancelledAutoRefresh?.finished_at ?? null,
    now,
  });

  if (pauseRemainingMs > 0) {
    return withAutoQuotaFields({
      checkedEpisodes: 0,
      catalogSyncedEpisodes: 0,
      newEpisodes: 0,
      dueCards: 0,
      missingPriceCards: 0,
      selectedCards: 0,
      backfillCards: 0,
      nativeHistoryItems: 0,
      remainingDueCards: 0,
      newCards: 0,
      updatedCards: 0,
      newPrices: 0,
      refreshedPrices: 0,
      refreshedCards: 0,
      gradedPricesUpdated: 0,
      skipped: true,
      message: `Background price refresh is paused for about ${formatAutoPriceRefreshPauseRemaining(
        pauseRemainingMs
      )} after a manual stop.`,
    });
  }

  const previewCatalogs = await Promise.all(
    AUTO_CATALOG_SYNC_GAMES.map(async (game) => ({
      game,
      preview: await previewAutoCatalogSync({
        now,
        minIntervalMs: AUTO_CATALOG_SYNC_MIN_INTERVAL_MS,
        game,
      }),
    }))
  );
  const catalogGamesToSync = previewCatalogs
    .filter(({ preview }) => preview.shouldSync)
    .map(({ game }) => game);
  const previewDueBatch = await selectAutoRefreshBatch(now);
  const previewBackfillBatch = await selectMissingPriceBackfillBatch({
    maxCards: Math.min(
      AUTO_PRICE_BACKFILL_MAX_CARDS,
      Math.max(AUTO_PRICE_REFRESH_MAX_CARDS - previewDueBatch.selectedCards, 0)
    ),
  });
  const previewNativeHistoryBatch = await selectNativeHistoryBackfillBatch();

  const hasAutoRefreshWork =
    catalogGamesToSync.length > 0 ||
    previewDueBatch.dueCards > 0 ||
    previewBackfillBatch.missingPriceCards > 0 ||
    previewNativeHistoryBatch.cardIds.length > 0 ||
    previewNativeHistoryBatch.products.length > 0;

  if (!hasAutoRefreshWork) {
    return withAutoQuotaFields({
      checkedEpisodes: 0,
      catalogSyncedEpisodes: 0,
      newEpisodes: 0,
      dueCards: 0,
      missingPriceCards: 0,
      selectedCards: 0,
      backfillCards: 0,
      nativeHistoryItems: 0,
      remainingDueCards: 0,
      newCards: 0,
      updatedCards: 0,
      newPrices: 0,
      refreshedPrices: 0,
      refreshedCards: 0,
      gradedPricesUpdated: 0,
      skipped: true,
      message: "No cards are due or waiting for a first price sync.",
    });
  }

  const shouldRunCatalogWithAutoBatch = catalogGamesToSync.length > 0;

  return runAutoLoggedSync(
    "Refreshing due cards and backfilling missing first prices in the background",
    summarizeAutoPriceRefresh,
    async (progress) => {
      await progress.throwIfCancelled();

      const catalogBatch = shouldRunCatalogWithAutoBatch
        ? mergeAutoCatalogSyncSelections(
            await Promise.all(
              catalogGamesToSync.map(async (game) =>
                selectAutoCatalogSyncBatch({
                  now: new Date(),
                  minIntervalMs: AUTO_CATALOG_SYNC_MIN_INTERVAL_MS,
                  maxEpisodes: AUTO_CATALOG_SYNC_MAX_EPISODES,
                  game,
                  fetchRemoteEpisodes: () => fetchAllEpisodes(game),
                }).catch(async (error) => {
                  if (!shouldSkipAutoCatalogStatusError(error)) {
                    throw error;
                  }

                  await progress.updateMessage(
                    `Skipping ${getAutoCatalogGameLabel(game)} catalog refresh after TCGGO returned 403; continuing with price batch.`
                  );

                  return createEmptyAutoCatalogSyncSelection();
                })
              )
            )
          )
        : createEmptyAutoCatalogSyncSelection();
      const fetchedAt = new Date();
      let catalogSyncedEpisodes = 0;
      let newEpisodes = 0;
      let newCards = 0;
      let updatedCards = 0;
      let newPrices = 0;
      let refreshedPrices = 0;
      let refreshedCards = 0;
      let gradedPricesUpdated = 0;
      let quotaExceeded = false;
      const batchId = progress.batchId ?? progress.syncId;
      const previewCombinedBatch = mergeSelectedByEpisode(
        previewDueBatch.selectedByEpisode,
        previewBackfillBatch.selectedByEpisode
      );
      let activeDueCards = previewDueBatch.dueCards;
      let activeMissingPriceCards = previewBackfillBatch.missingPriceCards;
      let activeSelectedCards = countSelectedCards(previewCombinedBatch);
      let activeBackfillCards = previewBackfillBatch.selectedCards;
      let activeEpisodeCount = previewCombinedBatch.size;
      let activeRemainingDueCards = Math.max(
        previewDueBatch.dueCards - previewDueBatch.selectedCards,
        0
      );
      const updateAutoProgress = (
        message: string,
        currentSet?: AutoPriceRefreshCurrentSetDetails | null
      ) =>
        progress.updateMessage(
          message,
          createAutoPriceRefreshLogDetails(batchId, "running", {
            checkedEpisodes: activeEpisodeCount,
            catalogSyncedEpisodes,
            dueCards: activeDueCards,
            missingPriceCards: activeMissingPriceCards,
            selectedCards: activeSelectedCards,
            backfillCards: activeBackfillCards,
            nativeHistoryItems: 0,
            remainingDueCards: activeRemainingDueCards,
            newEpisodes,
            newCards,
            updatedCards,
            newPrices,
            refreshedPrices,
            refreshedCards,
            gradedPricesUpdated,
            quotaExceeded,
            currentSet: currentSet ?? null,
          })
        );

      if (catalogBatch.remoteEpisodes.length > 0) {
        await updateAutoProgress(
          catalogBatch.selectedEpisodes.length > 0
            ? `Catalog sync ${catalogBatch.selectedEpisodes.length} sets pending | eligible queue preview ${previewDueBatch.dueCards}`
            : "Refreshing remote set catalog before the background price batch"
        );
        await upsertVisibleRemoteEpisodes(catalogBatch.remoteEpisodes);
        newEpisodes = catalogBatch.newEpisodes;
      }

      let completedCatalogEpisodes = 0;
      const catalogResults = await mapWithConcurrency(
        catalogBatch.selectedEpisodes,
        EPISODE_SYNC_CONCURRENCY,
        async (episode, episodeIndex) => {
          if (quotaExceeded) return null;

          await progress.throwIfCancelled();
          await updateAutoProgress(
            `Catalog sync ${catalogBatch.selectedEpisodes.length} sets pending | Refreshing ${episode.name} (${episodeIndex + 1}/${catalogBatch.selectedEpisodes.length}) | finding missing cards`,
            {
              index: episodeIndex + 1,
              total: catalogBatch.selectedEpisodes.length,
              id: episode.id,
              game: episode.game,
              name: episode.name,
              cards: 0,
              previewCards: [],
            }
          );

          try {
            const result = await syncEpisodeCards(episode.id, {
              refreshAllPrices: false,
              backfillNativeHistory: false,
              throwIfCancelled: progress.throwIfCancelled,
            });

            completedCatalogEpisodes += 1;
            await updateAutoProgress(
              `Catalog sync ${catalogBatch.selectedEpisodes.length} sets pending | Completed ${completedCatalogEpisodes}/${catalogBatch.selectedEpisodes.length} sets`
            );

            return result;
          } catch (error) {
            if (isTcggoQuotaExceededError(error)) {
              quotaExceeded = true;
              return null;
            }

            if (shouldSkipAutoCatalogStatusError(error)) {
              completedCatalogEpisodes += 1;
              await updateAutoProgress(
                `Catalog sync ${catalogBatch.selectedEpisodes.length} sets pending | Skipped ${episode.name} after TCGGO returned 403 | Completed ${completedCatalogEpisodes}/${catalogBatch.selectedEpisodes.length} sets`
              );

              return null;
            }

            throw error;
          }
        }
      );

      for (const result of catalogResults) {
        if (!result) continue;

        catalogSyncedEpisodes += 1;
        newCards += result.newCards;
        updatedCards += result.updatedCards;
        newPrices += result.newPrices;
        refreshedPrices += result.refreshedPrices;
        gradedPricesUpdated += result.gradedPricesUpdated;
      }

      const dueBatch = await selectAutoRefreshBatch(new Date());
      const backfillBatch = await selectMissingPriceBackfillBatch({
        maxCards: Math.min(
          AUTO_PRICE_BACKFILL_MAX_CARDS,
          Math.max(AUTO_PRICE_REFRESH_MAX_CARDS - dueBatch.selectedCards, 0)
        ),
      });
      const nativeHistoryBatch = await selectNativeHistoryBackfillBatch();
      const combinedBatch = mergeSelectedByEpisode(
        dueBatch.selectedByEpisode,
        backfillBatch.selectedByEpisode
      );
      activeDueCards = dueBatch.dueCards;
      activeMissingPriceCards = backfillBatch.missingPriceCards;
      activeSelectedCards = countSelectedCards(combinedBatch);
      activeBackfillCards = backfillBatch.selectedCards;
      activeEpisodeCount = combinedBatch.size;
      activeRemainingDueCards = Math.max(dueBatch.dueCards - dueBatch.selectedCards, 0);

      if (
        combinedBatch.size === 0 &&
        nativeHistoryBatch.cardIds.length === 0 &&
        nativeHistoryBatch.products.length === 0 &&
        catalogSyncedEpisodes === 0 &&
        newEpisodes === 0
      ) {
        return withAutoQuotaFields({
          checkedEpisodes: 0,
          catalogSyncedEpisodes: 0,
          newEpisodes: 0,
          dueCards: dueBatch.dueCards,
          missingPriceCards: backfillBatch.missingPriceCards,
          selectedCards: 0,
          backfillCards: 0,
          nativeHistoryItems: 0,
          remainingDueCards: 0,
          newCards: 0,
          updatedCards: 0,
          newPrices: 0,
          refreshedPrices: 0,
          refreshedCards: 0,
          gradedPricesUpdated: 0,
          skipped: true,
          message: quotaExceeded
            ? getQuotaPauseMessage()
            : "No cards are due or waiting for a first price sync.",
        }, quotaExceeded);
      }

      const episodeEntries = [...combinedBatch.entries()];
      const selectedCards = countSelectedCards(combinedBatch);
      const batchSummary = `Batch ${selectedCards} cards across ${episodeEntries.length} sets | eligible queue ${dueBatch.dueCards}`;
      const previewCardRecords = episodeEntries.length
        ? await db.card.findMany({
            where: {
              id: {
                in: [...new Set(episodeEntries.flatMap(([, cardIds]) => cardIds.slice(0, 4)))],
              },
            },
            select: {
              id: true,
              name: true,
            },
          })
        : [];
      const previewCardNameById = Object.fromEntries(
        previewCardRecords.map((card) => [card.id, card.name])
      );
      const episodeRecords = episodeEntries.length
        ? await db.episode.findMany({
            where: { id: { in: episodeEntries.map(([episodeId]) => episodeId) } },
            select: { id: true, name: true, game: true },
          })
        : [];
      const episodeNameById = Object.fromEntries(
        episodeRecords.map((episode) => [episode.id, episode.name])
      );
      const episodeGameById = Object.fromEntries(
        episodeRecords.map((episode) => [episode.id, episode.game])
      );

      await progress.throwIfCancelled();
      await updateAutoProgress(batchSummary);

      let completedPriceEpisodes = 0;
      const priceResults = await mapWithConcurrency(
        episodeEntries,
        EPISODE_SYNC_CONCURRENCY,
        async ([episodeId, cardIds], episodeIndex) => {
          if (quotaExceeded) return null;

          await progress.throwIfCancelled();

          const episodeName = episodeNameById[episodeId] ?? `Set ${episodeId}`;
          const previewNames = cardIds
            .slice(0, 4)
            .map((id) => previewCardNameById[id])
            .filter((name): name is string => Boolean(name));
          const previewLabel =
            previewNames.length > 0 ? ` | cards: ${previewNames.join(", ")}` : "";
          await updateAutoProgress(
            `${batchSummary} | Refreshing ${episodeName} (${episodeIndex + 1}/${episodeEntries.length}) | ${cardIds.length} cards${previewLabel}`,
            {
              index: episodeIndex + 1,
              total: episodeEntries.length,
              id: episodeId,
              game: episodeGameById[episodeId] ?? POKEMON_GAME,
              name: episodeName,
              cards: cardIds.length,
              previewCards: previewNames,
            }
          );

          try {
            const result = await refreshEpisodeDueCards(
              episodeId,
              cardIds,
              fetchedAt,
              progress.throwIfCancelled
            );

            completedPriceEpisodes += 1;
            await updateAutoProgress(
              `${batchSummary} | Completed ${completedPriceEpisodes}/${episodeEntries.length} sets`
            );

            return result;
          } catch (error) {
            if (isTcggoQuotaExceededError(error)) {
              quotaExceeded = true;
              return null;
            }

            throw error;
          }
        }
      );

      for (const result of priceResults) {
        if (!result) continue;

        updatedCards += result.updatedCards;
        newPrices += result.newPrices;
        refreshedPrices += result.refreshedPrices;
        refreshedCards += result.refreshedCards;
        gradedPricesUpdated += result.gradedPricesUpdated;
      }

      await progress.throwIfCancelled();

      let syncedCardHistoryItems = 0;
      let syncedSealedHistoryItems = 0;

      try {
        [syncedCardHistoryItems, syncedSealedHistoryItems] = await Promise.all([
          backfillCardNativeHistory(
            nativeHistoryBatch.cardIds,
            fetchedAt,
            progress.throwIfCancelled
          ),
          backfillSealedNativeHistory(
            nativeHistoryBatch.products,
            fetchedAt,
            progress.throwIfCancelled
          ),
        ]);
      } catch (error) {
        if (isTcggoQuotaExceededError(error)) {
          quotaExceeded = true;
        } else {
          throw error;
        }
      }

      const remainingDueCards = Math.max(dueBatch.dueCards - dueBatch.selectedCards, 0);
      const nativeHistoryCount = syncedCardHistoryItems + syncedSealedHistoryItems;
      activeRemainingDueCards = remainingDueCards;

      return withAutoQuotaFields({
        checkedEpisodes: combinedBatch.size,
        catalogSyncedEpisodes,
        newEpisodes,
        dueCards: dueBatch.dueCards,
        missingPriceCards: backfillBatch.missingPriceCards,
        selectedCards,
        backfillCards: backfillBatch.selectedCards,
        nativeHistoryItems: nativeHistoryCount,
        remainingDueCards,
        newCards,
        updatedCards,
        newPrices,
        refreshedPrices,
        refreshedCards,
        gradedPricesUpdated,
        skipped: false,
        message:
          nativeHistoryCount > 0
            ? `Checked ${selectedCards} cards across ${combinedBatch.size} sets, synced ${catalogSyncedEpisodes} catalog sets, and backfilled history for ${nativeHistoryCount} items.`
            : catalogSyncedEpisodes > 0 || newEpisodes > 0
              ? `Checked ${selectedCards} cards across ${combinedBatch.size} sets after syncing ${catalogSyncedEpisodes} catalog sets and discovering ${newEpisodes} new sets.`
              : `Checked ${selectedCards} cards across ${combinedBatch.size} sets.`,
      }, quotaExceeded);
    },
    {
      successDetails: (result, batchId) =>
        createAutoPriceRefreshResultDetails(batchId, result as AutoPriceRefreshResult),
      recoverError: (error) => {
        if (!isTcggoQuotaExceededError(error)) {
          return null;
        }

        return withAutoQuotaFields(
          {
            checkedEpisodes: 0,
            catalogSyncedEpisodes: 0,
            newEpisodes: 0,
            dueCards: previewDueBatch.dueCards,
            missingPriceCards: previewBackfillBatch.missingPriceCards,
            selectedCards: 0,
            backfillCards: 0,
            nativeHistoryItems: 0,
            remainingDueCards: previewDueBatch.dueCards,
            newCards: 0,
            updatedCards: 0,
            newPrices: 0,
            refreshedPrices: 0,
            refreshedCards: 0,
            gradedPricesUpdated: 0,
            skipped: true,
            message: getQuotaPauseMessage(),
          },
          true
        );
      },
    }
  );
}

export async function runKnownUnavailablePriceCheck(): Promise<KnownUnavailablePriceCheckResult> {
  return runLoggedSync(
    KNOWN_UNAVAILABLE_PRICE_CHECK_TYPE,
    "Checking known unavailable cards for prices",
    summarizeKnownUnavailablePriceCheck,
    async (progress) => {
      await progress.throwIfCancelled();

      const batch = await selectKnownUnavailablePriceCheckBatch();

      if (batch.plannedCards === 0) {
        return withKnownUnavailableQuotaFields({
          totalUnavailableCards: batch.totalUnavailableCards,
          plannedCards: 0,
          checkedCards: 0,
          checkedEpisodes: 0,
          remainingUnavailableCards: batch.totalUnavailableCards,
          stillUnavailableCards: 0,
          newPrices: 0,
          refreshedPrices: 0,
          refreshedCards: 0,
          updatedCards: 0,
          gradedPricesUpdated: 0,
          skipped: true,
          message: "No known unavailable cards are waiting for a manual price check.",
        });
      }

      const fetchedAt = new Date();
      const episodeEntries = [...batch.selectedByEpisode.entries()];
      const episodeRecords = await db.episode.findMany({
        where: { id: { in: episodeEntries.map(([episodeId]) => episodeId) } },
        select: { id: true, name: true },
      });
      const episodeNameById = Object.fromEntries(
        episodeRecords.map((episode) => [episode.id, episode.name])
      );
      const batchSummary = `Checking ${batch.plannedCards} known unavailable cards across ${episodeEntries.length} sets`;

      let quotaExceeded = false;
      let completedEpisodes = 0;
      await progress.updateMessage(batchSummary);

      const priceResults = await mapWithConcurrency(
        episodeEntries,
        KNOWN_UNAVAILABLE_PRICE_CHECK_CONCURRENCY,
        async ([episodeId, cardIds], episodeIndex) => {
          if (quotaExceeded) return null;

          await progress.throwIfCancelled();

          const episodeName = episodeNameById[episodeId] ?? `Set ${episodeId}`;
          await progress.updateMessage(
            `${batchSummary} | Refreshing ${episodeName} (${episodeIndex + 1}/${episodeEntries.length})`
          );

          try {
            const result = await refreshEpisodeDueCards(
              episodeId,
              cardIds,
              fetchedAt,
              progress.throwIfCancelled
            );

            completedEpisodes += 1;
            await progress.updateMessage(
              `${batchSummary} | Completed ${completedEpisodes}/${episodeEntries.length} sets`
            );

            return result;
          } catch (error) {
            if (isTcggoQuotaExceededError(error)) {
              quotaExceeded = true;
              return null;
            }

            throw error;
          }
        }
      );

      let checkedCards = 0;
      let updatedCards = 0;
      let newPrices = 0;
      let refreshedPrices = 0;
      let refreshedCards = 0;
      let gradedPricesUpdated = 0;

      for (const result of priceResults) {
        if (!result) continue;

        checkedCards += result.selectedCards;
        updatedCards += result.updatedCards;
        newPrices += result.newPrices;
        refreshedPrices += result.refreshedPrices;
        refreshedCards += result.refreshedCards;
        gradedPricesUpdated += result.gradedPricesUpdated;
      }

      const remainingUnavailableCards = await countKnownUnavailablePriceCandidates();
      const stillUnavailableCards = Math.max(checkedCards - refreshedCards, 0);

      return withKnownUnavailableQuotaFields({
        totalUnavailableCards: batch.totalUnavailableCards,
        plannedCards: batch.plannedCards,
        checkedCards,
        checkedEpisodes: completedEpisodes,
        remainingUnavailableCards,
        stillUnavailableCards,
        newPrices,
        refreshedPrices,
        refreshedCards,
        updatedCards,
        gradedPricesUpdated,
        skipped: checkedCards === 0,
        message: quotaExceeded
          ? `Paused after checking ${checkedCards} cards because scraper requests are exhausted.`
          : `Checked ${checkedCards} known unavailable cards; ${refreshedCards} now have prices.`,
      }, quotaExceeded);
    },
    {
      interruptAutoPriceRefresh: true,
    }
  );
}

async function persistEpisodeSealedProducts(
  episodeId: string,
  products: NormalizedSealedProduct[],
  syncedAt: Date,
  options?: {
    replaceMissingEpisodeProducts?: boolean;
  }
): Promise<void> {
  const fetchedIds = products.map((product) => product.id);
  const replaceMissingEpisodeProducts = options?.replaceMissingEpisodeProducts ?? true;

  await runExclusiveDbWrite(() => db.$transaction(async (tx) => {
    for (const product of products) {
      await tx.sealedProduct.upsert({
        where: { id: product.id },
        create: {
          id: product.id,
          game: product.game,
          episode_id: episodeId,
          name: product.name,
          image_url: product.image_url,
          tcggo_url: product.tcggo_url,
          cardmarket_url: product.cardmarket_url,
          cardmarket_id: product.cardmarket_id,
          tcgplayer_id: product.tcgplayer_id,
          cm_lowest: product.price.cm_lowest,
          cm_lowest_eu: product.price.cm_lowest_eu,
          cm_lowest_de: product.price.cm_lowest_de,
          cm_lowest_fr: product.price.cm_lowest_fr,
          cm_lowest_es: product.price.cm_lowest_es,
          cm_lowest_it: product.price.cm_lowest_it,
          cm_avg_7d: product.price.cm_avg_7d,
          cm_avg_30d: product.price.cm_avg_30d,
          synced_at: syncedAt,
        },
        update: {
          game: product.game,
          episode_id: episodeId,
          name: product.name,
          image_url: product.image_url,
          tcggo_url: product.tcggo_url,
          cardmarket_url: product.cardmarket_url,
          cardmarket_id: product.cardmarket_id,
          tcgplayer_id: product.tcgplayer_id,
          cm_lowest: product.price.cm_lowest,
          cm_lowest_eu: product.price.cm_lowest_eu,
          cm_lowest_de: product.price.cm_lowest_de,
          cm_lowest_fr: product.price.cm_lowest_fr,
          cm_lowest_es: product.price.cm_lowest_es,
          cm_lowest_it: product.price.cm_lowest_it,
          cm_avg_7d: product.price.cm_avg_7d,
          cm_avg_30d: product.price.cm_avg_30d,
          synced_at: syncedAt,
        },
      });
    }

    await tx.sealedPriceSnapshot.createMany({
      data: products.map((product) => ({
        product_id: product.id,
        episode_id: episodeId,
        fetched_at: syncedAt,
        cm_lowest: product.price.cm_lowest,
        cm_lowest_eu: product.price.cm_lowest_eu,
        cm_lowest_de: product.price.cm_lowest_de,
        cm_lowest_fr: product.price.cm_lowest_fr,
        cm_lowest_es: product.price.cm_lowest_es,
        cm_lowest_it: product.price.cm_lowest_it,
        cm_avg_7d: product.price.cm_avg_7d,
        cm_avg_30d: product.price.cm_avg_30d,
      })),
    });

    if (replaceMissingEpisodeProducts) {
      await tx.sealedProduct.deleteMany({
        where: {
          episode_id: episodeId,
          id: { notIn: fetchedIds },
        },
      });
    }
  }));
}

export async function runSealedSync(): Promise<SealedSyncResult> {
  return runLoggedSync(
    "sealed",
    "Syncing sealed products for all expansions",
    summarizeSealedSync,
    async (progress) => {
      await progress.throwIfCancelled();

      const episodes = (
        await db.episode.findMany({
          where: { game: POKEMON_GAME },
          select: { id: true, game: true, name: true, code: true },
        })
      ).filter((episode) => !isHiddenExpansion(episode));
      let synced = 0;
      let products = 0;
      let quotaExceeded = false;

      await mapWithConcurrency(episodes, EPISODE_SYNC_CONCURRENCY, async (ep, index) => {
        if (quotaExceeded) return;

        await progress.throwIfCancelled();
        await progress.updateMessage(
          `Syncing sealed products ${index + 1}/${episodes.length} | ${ep.name}`,
          createSealedSyncLogDetails(progress.syncId, "running", {
            synced,
            products,
            quotaExceeded,
            currentEpisode: {
              index: index + 1,
              total: episodes.length,
              id: ep.id,
              name: ep.name,
            },
          })
        );

        try {
          const fetched = await fetchSealedProductsForEpisode(
            ep.id,
            normalizeTradingCardGame(ep.game)
          );
          if (fetched.length === 0) return;

          const syncedAt = new Date();
          await persistEpisodeSealedProducts(ep.id, fetched, syncedAt);
          synced += 1;
          products += fetched.length;
        } catch (error) {
          if (isTcggoQuotaExceededError(error)) {
            quotaExceeded = true;
            return;
          }
          // Skip failed episodes silently, matching the previous sealed sync behavior.
        }
      });

      return {
        synced,
        products,
        ...getTcggoQuotaResultFields(quotaExceeded),
      };
    },
    {
      successDetails: (result, syncId) => createSealedSyncResultDetails(syncId, result),
    }
  );
}

async function syncEpisodeSealed(
  episodeId: string,
  options: {
    backfillNativeHistory: boolean;
    throwIfCancelled?: () => Promise<void>;
  }
): Promise<void> {
  await options.throwIfCancelled?.();

  const episode = await db.episode.findUnique({
    where: { id: episodeId },
    select: { game: true },
  });
  const game = normalizeTradingCardGame(episode?.game);
  const products = await fetchSealedProductsForEpisode(episodeId, game);
  if (products.length === 0) return;

  await options.throwIfCancelled?.();

  const syncedAt = new Date();
  const nativeHistoryCandidateProductIds = products
    .filter(
      (product) =>
        hasAnySealedPrice(product.price) ||
        Boolean(product.cardmarket_id || product.tcgplayer_id)
    )
    .map((product) => product.id);
  await persistEpisodeSealedProducts(episodeId, products, syncedAt);

  if (options.backfillNativeHistory) {
    await options.throwIfCancelled?.();

    const productsNeedingHistory = await db.sealedProduct.findMany({
      where: {
        episode_id: episodeId,
        id: { in: nativeHistoryCandidateProductIds },
        native_history_synced_at: null,
      },
      select: {
        id: true,
        episode_id: true,
      },
    });

    await backfillSealedNativeHistory(
      productsNeedingHistory.map((product) => ({
        id: product.id,
        episodeId: product.episode_id,
      })),
      syncedAt,
      options.throwIfCancelled
    );
  }

  // Fire-and-forget image cache warm-up for sealed product art.
  void warmEpisodeImages(episodeId);
}

export async function runEpisodeSync(episodeId: string): Promise<EpisodeSyncResult> {
  let preemptedAutoPriceRefresh = false;

  return runLoggedSync(
    `episode:${episodeId}`,
    `Syncing cards and all prices for episode ${episodeId}`,
    summarizeEpisodeSync,
    async (progress) => {
      await progress.throwIfCancelled();

      const episode = await db.episode.findUnique({
        where: { id: episodeId },
        select: { name: true },
      });
      if (episode?.name) {
        await progress.updateMessage(
          `Syncing ${episode.name}`,
          createEpisodeSyncLogDetails(progress.syncId, "running", {
            episodeId,
            preemptedAutoPriceRefresh,
          })
        );
      }

      try {
        let sealedQuotaExceeded = false;
        const [cardResult] = await Promise.all([
          syncEpisodeCards(episodeId, {
            refreshAllPrices: true,
            backfillNativeHistory: false,
            throwIfCancelled: progress.throwIfCancelled,
          }),
          syncEpisodeSealed(episodeId, {
            backfillNativeHistory: false,
            throwIfCancelled: progress.throwIfCancelled,
          }).catch((error) => {
            if (isTcggoQuotaExceededError(error)) {
              sealedQuotaExceeded = true;
              return undefined;
            }
            return undefined;
          }),
        ]);
        return {
          ...cardResult,
          preemptedAutoPriceRefresh,
          ...getTcggoQuotaResultFields(sealedQuotaExceeded),
        };
      } catch (error) {
        if (!isTcggoQuotaExceededError(error)) {
          throw error;
        }

        return {
          episodeId,
          count: 0,
          newCards: 0,
          updatedCards: 0,
          newPrices: 0,
          refreshedPrices: 0,
          gradedPricesUpdated: 0,
          preemptedAutoPriceRefresh,
          ...getTcggoQuotaResultFields(true),
        };
      }
    },
    {
      interruptAutoPriceRefresh: true,
      onAutoPriceRefreshInterrupted: () => {
        preemptedAutoPriceRefresh = true;
      },
      successDetails: (result, syncId) => createEpisodeSyncResultDetails(syncId, result),
    }
  );
}

export async function runFullSync(): Promise<FullSyncResult> {
  return runLoggedSync(
    "full",
    "Checking for new sets and newly added cards",
    summarizeFullSync,
    async (progress) => {
      await progress.throwIfCancelled();

      const [remoteEpisodes, localEpisodes] = await Promise.all([
        fetchAllEpisodes(),
        db.episode.findMany({
          where: { game: POKEMON_GAME },
          select: {
            id: true,
            card_count: true,
            source_status: true,
            source_checked_at: true,
            synced_at: true,
            _count: {
              select: { cards: true },
            },
          },
        }),
      ]);

      const localEpisodeMap = new Map(localEpisodes.map((episode) => [episode.id, episode]));

      let newEpisodes = 0;
      const episodesToSync = new Set<string>();

      for (const episode of remoteEpisodes) {
        await progress.throwIfCancelled();

        if (isHiddenExpansion(episode) || isRedundantSubsetExpansion(episode.name)) {
          continue;
        }

        const existingEpisode = localEpisodeMap.get(episode.id);
        const isNewEpisode = !existingEpisode;
        const localCardCount = existingEpisode?._count.cards ?? 0;
        const mayHaveRemoteCards = episode.card_count == null || episode.card_count > 0;
        const missingRemoteCards =
          episode.card_count == null ? localCardCount === 0 : localCardCount < episode.card_count;

        if (isNewEpisode) {
          newEpisodes += 1;
        }

        await db.episode.upsert({
          where: { id: episode.id },
          create: episode,
          update: {
            game: episode.game,
            name: episode.name,
            code: episode.code,
            release_date: episode.release_date,
            card_count: mergeKnownEpisodeCardCount(existingEpisode?.card_count, episode.card_count),
            logo_url: episode.logo_url,
            symbol_url: episode.symbol_url,
            series: episode.series,
          },
        });
        episode.card_count = mergeKnownEpisodeCardCount(existingEpisode?.card_count, episode.card_count);

        if ((mayHaveRemoteCards && missingRemoteCards) || hasEpisodeSourceIssue(existingEpisode?.source_status ?? null)) {
          episodesToSync.add(episode.id);
        }
      }

      const promoEpisodesToVerify = remoteEpisodes
        .filter(
          (episode) =>
            !isHiddenExpansion(episode) &&
            !isRedundantSubsetExpansion(episode.name) &&
            isPromoExpansion(episode) &&
            !episodesToSync.has(episode.id)
        )
        .sort((a, b) => {
          const releaseDiff =
            new Date(b.release_date ?? 0).getTime() - new Date(a.release_date ?? 0).getTime();
          if (releaseDiff !== 0) {
            return releaseDiff;
          }

          return a.name.localeCompare(b.name);
        })
        .slice(0, FULL_SYNC_PROMO_VERIFICATION_LIMIT);

      for (const [promoIndex, episode] of promoEpisodesToVerify.entries()) {
        await progress.throwIfCancelled();
        await progress.updateMessage(
          `Checking promo expansion ${episode.name} (${promoIndex + 1}/${promoEpisodesToVerify.length}) for newly added cards`
        );

        let remoteActualCount = 0;
        try {
          remoteActualCount = (await fetchCardsForEpisode(episode.id)).length;
        } catch (error) {
          if (error instanceof Error && error.message.includes("404")) {
            continue;
          }

          throw error;
        }
        const localCardCount = localEpisodeMap.get(episode.id)?._count.cards ?? 0;
        const catalogCardCount = episode.card_count;
        const checkedAt = new Date();
        const sourceCheck = assessEpisodeSourceCheck({
          catalogCardCount,
          localCardCount,
          actualCardCount: remoteActualCount,
        });

        episode.card_count = sourceCheck.nextCardCount;
        await db.episode.update({
          where: { id: episode.id },
          data: buildEpisodeSourceCheckUpdate({
            catalogCardCount,
            localCardCount,
            actualCardCount: remoteActualCount,
            checkedAt,
          }),
        });

        if (remoteActualCount > localCardCount) {
          episodesToSync.add(episode.id);
        }
      }

      const orderedEpisodesToSync = remoteEpisodes
        .filter((episode) => episodesToSync.has(episode.id))
        .map((episode) => episode.id);

      let newCards = 0;
      let updatedCards = 0;
      let newPrices = 0;
      let refreshedPrices = 0;
      let gradedPricesUpdated = 0;
      let quotaExceeded = false;
      let syncedEpisodes = 0;
      const episodeNameById = Object.fromEntries(
        remoteEpisodes.map((episode) => [episode.id, episode.name])
      );
      const buildFullSyncRunningDetails = (
        currentEpisode?: {
          index: number;
          total: number;
          id: string;
          name: string;
        } | null
      ) =>
        createFullSyncLogDetails(progress.syncId, "running", {
          count: remoteEpisodes.length,
          newEpisodes,
          syncedEpisodes,
          skippedEpisodes: Math.max(remoteEpisodes.length - syncedEpisodes, 0),
          newCards,
          updatedCards,
          newPrices,
          refreshedPrices,
          gradedPricesUpdated,
          quotaExceeded,
          currentEpisode: currentEpisode ?? null,
        });

      const episodeResults = await mapWithConcurrency(
        orderedEpisodesToSync,
        EPISODE_SYNC_CONCURRENCY,
        async (episodeId, episodeIndex) => {
          if (quotaExceeded) return null;

          await progress.throwIfCancelled();

          const episodeName = episodeNameById[episodeId] ?? `Set ${episodeId}`;
          await progress.updateMessage(
            `Syncing ${episodeName} (${episodeIndex + 1}/${orderedEpisodesToSync.length})`,
            buildFullSyncRunningDetails({
              index: episodeIndex + 1,
              total: orderedEpisodesToSync.length,
              id: episodeId,
              name: episodeName,
            })
          );

          try {
            const [episodeResult] = await Promise.all([
              syncEpisodeCards(episodeId, {
                refreshAllPrices: false,
                backfillNativeHistory: false,
                throwIfCancelled: progress.throwIfCancelled,
              }),
              syncEpisodeSealed(episodeId, {
                backfillNativeHistory: false,
                throwIfCancelled: progress.throwIfCancelled,
              }).catch((error) => {
                if (isTcggoQuotaExceededError(error)) {
                  quotaExceeded = true;
                }
                return undefined;
              }),
            ]);

            syncedEpisodes += 1;
            await progress.updateMessage(
              `Syncing episodes | Completed ${syncedEpisodes}/${orderedEpisodesToSync.length}`,
              buildFullSyncRunningDetails({
                index: episodeIndex + 1,
                total: orderedEpisodesToSync.length,
                id: episodeId,
                name: episodeName,
              })
            );

            return episodeResult;
          } catch (error) {
            if (isTcggoQuotaExceededError(error)) {
              quotaExceeded = true;
              return null;
            }

            throw error;
          }
        }
      );

      for (const episodeResult of episodeResults) {
        if (!episodeResult) continue;

        newCards += episodeResult.newCards;
        updatedCards += episodeResult.updatedCards;
        newPrices += episodeResult.newPrices;
        refreshedPrices += episodeResult.refreshedPrices;
        gradedPricesUpdated += episodeResult.gradedPricesUpdated;
      }

      return {
        count: remoteEpisodes.length,
        newEpisodes,
        syncedEpisodes,
        skippedEpisodes: Math.max(remoteEpisodes.length - syncedEpisodes, 0),
        newCards,
        updatedCards,
        newPrices,
        refreshedPrices,
        gradedPricesUpdated,
        ...getTcggoQuotaResultFields(quotaExceeded),
      };
    },
    {
      successDetails: (result, syncId) => createFullSyncResultDetails(syncId, result),
    }
  );
}
