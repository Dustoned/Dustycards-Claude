import {
  type AutoPriceRefreshLogDetails,
  type CardHistoryLogDetails,
  type EpisodeSyncLogDetails,
  type FullSyncLogDetails,
  type SealedSyncLogDetails,
  type SyncLogDetails,
} from "@/lib/sync-log-details";
import { getTcggoRequestRuntimeSnapshot, TCGGO_REQUEST_CONCURRENCY } from "@/lib/tcggo";

interface AutoPriceRefreshResultForDetails {
  checkedEpisodes: number;
  catalogSyncedEpisodes: number;
  dueCards: number;
  missingPriceCards: number;
  selectedCards: number;
  backfillCards: number;
  nativeHistoryItems: number;
  remainingDueCards: number;
  newEpisodes: number;
  newCards: number;
  updatedCards: number;
  newPrices: number;
  refreshedPrices: number;
  refreshedCards: number;
  gradedPricesUpdated: number;
  skipped: boolean;
  quotaExceeded: boolean;
  requestsRemaining: number | null;
  requestConcurrency: number;
}

interface CardHistorySyncResultForDetails {
  candidateCards: number;
  selectedCards: number;
  processedCards: number;
  syncedCards: number;
  failedCards: number;
  newHistorySnapshots: number;
  remainingCards: number;
  hasMore: boolean;
  skipped: boolean;
  quotaExceeded?: boolean;
  requestsRemaining?: number | null;
  requestConcurrency?: number;
}

interface EpisodeSyncResultForDetails {
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

interface FullSyncResultForDetails {
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

interface SealedSyncResultForDetails {
  synced: number;
  products: number;
  quotaExceeded?: boolean;
  requestsRemaining?: number | null;
  requestConcurrency?: number;
}

export function getTcggoQuotaResultFields(quotaExceeded = false) {
  const snapshot = getTcggoRequestRuntimeSnapshot();

  return {
    quotaExceeded,
    requestsRemaining: snapshot.requestsRemaining,
    requestConcurrency: TCGGO_REQUEST_CONCURRENCY,
  };
}

export function createAutoPriceRefreshBatchId(syncId: string): string {
  return `${Date.now().toString(36)}-${syncId.slice(-8)}`;
}

function getAutoPriceRefreshLogStatus(
  result: Pick<AutoPriceRefreshResultForDetails, "quotaExceeded" | "skipped">
): AutoPriceRefreshLogDetails["status"] {
  if (result.quotaExceeded) return "quota-paused";
  if (result.skipped) return "skipped";
  return "success";
}

export function createAutoPriceRefreshLogDetails(
  batchId: string,
  status: AutoPriceRefreshLogDetails["status"],
  input: Partial<Omit<AutoPriceRefreshLogDetails, "version" | "kind" | "batchId" | "status">>
): AutoPriceRefreshLogDetails {
  const quota = getTcggoQuotaResultFields(input.quotaExceeded ?? false);

  return {
    version: 1,
    kind: "auto-price-refresh",
    batchId,
    status,
    checkedEpisodes: input.checkedEpisodes ?? 0,
    catalogSyncedEpisodes: input.catalogSyncedEpisodes ?? 0,
    dueCards: input.dueCards ?? 0,
    missingPriceCards: input.missingPriceCards ?? 0,
    selectedCards: input.selectedCards ?? 0,
    backfillCards: input.backfillCards ?? 0,
    nativeHistoryItems: input.nativeHistoryItems ?? 0,
    remainingDueCards: input.remainingDueCards ?? 0,
    newEpisodes: input.newEpisodes ?? 0,
    newCards: input.newCards ?? 0,
    updatedCards: input.updatedCards ?? 0,
    newPrices: input.newPrices ?? 0,
    refreshedPrices: input.refreshedPrices ?? 0,
    refreshedCards: input.refreshedCards ?? 0,
    gradedPricesUpdated: input.gradedPricesUpdated ?? 0,
    quotaExceeded: input.quotaExceeded ?? quota.quotaExceeded ?? false,
    requestsRemaining: input.requestsRemaining ?? quota.requestsRemaining,
    requestConcurrency: input.requestConcurrency ?? quota.requestConcurrency,
    currentSet: input.currentSet ?? null,
  };
}

export function createAutoPriceRefreshResultDetails(
  batchId: string,
  result: AutoPriceRefreshResultForDetails,
  status = getAutoPriceRefreshLogStatus(result)
): AutoPriceRefreshLogDetails {
  return createAutoPriceRefreshLogDetails(batchId, status, {
    checkedEpisodes: result.checkedEpisodes,
    catalogSyncedEpisodes: result.catalogSyncedEpisodes,
    dueCards: result.dueCards,
    missingPriceCards: result.missingPriceCards,
    selectedCards: result.selectedCards,
    backfillCards: result.backfillCards,
    nativeHistoryItems: result.nativeHistoryItems,
    remainingDueCards: result.remainingDueCards,
    newEpisodes: result.newEpisodes,
    newCards: result.newCards,
    updatedCards: result.updatedCards,
    newPrices: result.newPrices,
    refreshedPrices: result.refreshedPrices,
    refreshedCards: result.refreshedCards,
    gradedPricesUpdated: result.gradedPricesUpdated,
    quotaExceeded: result.quotaExceeded,
    requestsRemaining: result.requestsRemaining,
    requestConcurrency: result.requestConcurrency,
  });
}

function getCardHistoryLogStatus(
  result: Pick<CardHistorySyncResultForDetails, "quotaExceeded" | "skipped">
): CardHistoryLogDetails["status"] {
  if (result.quotaExceeded) return "quota-paused";
  if (result.skipped) return "skipped";
  return "success";
}

export function createCardHistoryLogDetails(
  runId: string,
  status: CardHistoryLogDetails["status"],
  input: Partial<Omit<CardHistoryLogDetails, "version" | "kind" | "runId" | "status">>
): CardHistoryLogDetails {
  const quota = getTcggoQuotaResultFields(input.quotaExceeded ?? false);

  return {
    version: 1,
    kind: "card-history",
    runId,
    status,
    candidateCards: input.candidateCards ?? 0,
    selectedCards: input.selectedCards ?? 0,
    processedCards: input.processedCards ?? 0,
    syncedCards: input.syncedCards ?? 0,
    failedCards: input.failedCards ?? 0,
    newHistorySnapshots: input.newHistorySnapshots ?? 0,
    remainingCards: input.remainingCards ?? 0,
    hasMore: input.hasMore ?? false,
    quotaExceeded: input.quotaExceeded ?? quota.quotaExceeded ?? false,
    requestsRemaining: input.requestsRemaining ?? quota.requestsRemaining,
    requestConcurrency: input.requestConcurrency ?? quota.requestConcurrency,
  };
}

export function createCardHistoryResultDetails(
  runId: string,
  result: CardHistorySyncResultForDetails,
  status = getCardHistoryLogStatus(result)
): CardHistoryLogDetails {
  return createCardHistoryLogDetails(runId, status, {
    candidateCards: result.candidateCards,
    selectedCards: result.selectedCards,
    processedCards: result.processedCards,
    syncedCards: result.syncedCards,
    failedCards: result.failedCards,
    newHistorySnapshots: result.newHistorySnapshots,
    remainingCards: result.remainingCards,
    hasMore: result.hasMore,
    quotaExceeded: result.quotaExceeded,
    requestsRemaining: result.requestsRemaining,
    requestConcurrency: result.requestConcurrency,
  });
}

function getQuotaAwareStatus(
  result: Pick<EpisodeSyncResultForDetails, "quotaExceeded">
): "success" | "quota-paused" {
  return result.quotaExceeded ? "quota-paused" : "success";
}

export function createEpisodeSyncLogDetails(
  syncId: string,
  status: EpisodeSyncLogDetails["status"],
  input: Partial<Omit<EpisodeSyncLogDetails, "version" | "kind" | "syncId" | "status">>
): EpisodeSyncLogDetails {
  const quota = getTcggoQuotaResultFields(input.quotaExceeded ?? false);

  return {
    version: 1,
    kind: "episode-sync",
    syncId,
    status,
    episodeId: input.episodeId ?? "",
    count: input.count ?? 0,
    newCards: input.newCards ?? 0,
    updatedCards: input.updatedCards ?? 0,
    newPrices: input.newPrices ?? 0,
    refreshedPrices: input.refreshedPrices ?? 0,
    gradedPricesUpdated: input.gradedPricesUpdated ?? 0,
    preemptedAutoPriceRefresh: input.preemptedAutoPriceRefresh ?? false,
    quotaExceeded: input.quotaExceeded ?? quota.quotaExceeded ?? false,
    requestsRemaining: input.requestsRemaining ?? quota.requestsRemaining,
    requestConcurrency: input.requestConcurrency ?? quota.requestConcurrency,
  };
}

export function createEpisodeSyncResultDetails(
  syncId: string,
  result: EpisodeSyncResultForDetails,
  status = getQuotaAwareStatus(result)
): EpisodeSyncLogDetails {
  return createEpisodeSyncLogDetails(syncId, status, {
    episodeId: result.episodeId,
    count: result.count,
    newCards: result.newCards,
    updatedCards: result.updatedCards,
    newPrices: result.newPrices,
    refreshedPrices: result.refreshedPrices,
    gradedPricesUpdated: result.gradedPricesUpdated,
    preemptedAutoPriceRefresh: result.preemptedAutoPriceRefresh,
    quotaExceeded: result.quotaExceeded,
    requestsRemaining: result.requestsRemaining,
    requestConcurrency: result.requestConcurrency,
  });
}

export function createFullSyncLogDetails(
  syncId: string,
  status: FullSyncLogDetails["status"],
  input: Partial<Omit<FullSyncLogDetails, "version" | "kind" | "syncId" | "status">>
): FullSyncLogDetails {
  const quota = getTcggoQuotaResultFields(input.quotaExceeded ?? false);

  return {
    version: 1,
    kind: "full-sync",
    syncId,
    status,
    count: input.count ?? 0,
    newEpisodes: input.newEpisodes ?? 0,
    syncedEpisodes: input.syncedEpisodes ?? 0,
    skippedEpisodes: input.skippedEpisodes ?? 0,
    newCards: input.newCards ?? 0,
    updatedCards: input.updatedCards ?? 0,
    newPrices: input.newPrices ?? 0,
    refreshedPrices: input.refreshedPrices ?? 0,
    gradedPricesUpdated: input.gradedPricesUpdated ?? 0,
    quotaExceeded: input.quotaExceeded ?? quota.quotaExceeded ?? false,
    requestsRemaining: input.requestsRemaining ?? quota.requestsRemaining,
    requestConcurrency: input.requestConcurrency ?? quota.requestConcurrency,
    currentEpisode: input.currentEpisode ?? null,
  };
}

export function createFullSyncResultDetails(
  syncId: string,
  result: FullSyncResultForDetails,
  status = getQuotaAwareStatus(result)
): FullSyncLogDetails {
  return createFullSyncLogDetails(syncId, status, {
    count: result.count,
    newEpisodes: result.newEpisodes,
    syncedEpisodes: result.syncedEpisodes,
    skippedEpisodes: result.skippedEpisodes,
    newCards: result.newCards,
    updatedCards: result.updatedCards,
    newPrices: result.newPrices,
    refreshedPrices: result.refreshedPrices,
    gradedPricesUpdated: result.gradedPricesUpdated,
    quotaExceeded: result.quotaExceeded,
    requestsRemaining: result.requestsRemaining,
    requestConcurrency: result.requestConcurrency,
  });
}

export function createSealedSyncLogDetails(
  syncId: string,
  status: SealedSyncLogDetails["status"],
  input: Partial<Omit<SealedSyncLogDetails, "version" | "kind" | "syncId" | "status">>
): SealedSyncLogDetails {
  const quota = getTcggoQuotaResultFields(input.quotaExceeded ?? false);

  return {
    version: 1,
    kind: "sealed-sync",
    syncId,
    status,
    synced: input.synced ?? 0,
    products: input.products ?? 0,
    quotaExceeded: input.quotaExceeded ?? quota.quotaExceeded ?? false,
    requestsRemaining: input.requestsRemaining ?? quota.requestsRemaining,
    requestConcurrency: input.requestConcurrency ?? quota.requestConcurrency,
    currentEpisode: input.currentEpisode ?? null,
  };
}

export function createSealedSyncResultDetails(
  syncId: string,
  result: SealedSyncResultForDetails,
  status = getQuotaAwareStatus(result)
): SealedSyncLogDetails {
  return createSealedSyncLogDetails(syncId, status, {
    synced: result.synced,
    products: result.products,
    quotaExceeded: result.quotaExceeded,
    requestsRemaining: result.requestsRemaining,
    requestConcurrency: result.requestConcurrency,
  });
}

export function markSyncLogDetailsStatus(
  details: SyncLogDetails | null,
  status: SyncLogDetails["status"]
): SyncLogDetails | null {
  if (!details) return null;

  return { ...details, status } as SyncLogDetails;
}

export function getQuotaPauseMessage() {
  return "Paused because scraper requests are exhausted. Resume after quota reset.";
}
