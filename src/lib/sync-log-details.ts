export const SYNC_LOG_DETAILS_MARKER = "\n\n@@dustycards-sync-details:";

export interface AutoPriceRefreshCurrentSetDetails {
  index: number;
  total: number;
  name: string;
  cards: number;
  previewCards: string[];
}

export interface AutoPriceRefreshLogDetails {
  version: 1;
  kind: "auto-price-refresh";
  batchId: string;
  status: "running" | "success" | "skipped" | "quota-paused" | "cancelled" | "failed";
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
  quotaExceeded: boolean;
  requestsRemaining: number | null;
  requestConcurrency: number;
  currentSet?: AutoPriceRefreshCurrentSetDetails | null;
}

export interface CardHistoryLogDetails {
  version: 1;
  kind: "card-history";
  runId: string;
  status: "running" | "success" | "skipped" | "quota-paused" | "cancelled" | "failed";
  candidateCards: number;
  selectedCards: number;
  processedCards: number;
  syncedCards: number;
  failedCards: number;
  newHistorySnapshots: number;
  remainingCards: number;
  hasMore: boolean;
  quotaExceeded: boolean;
  requestsRemaining: number | null;
  requestConcurrency: number;
}

export interface SyncCurrentEpisodeDetails {
  index: number;
  total: number;
  id: string;
  name: string;
}

export interface EpisodeSyncLogDetails {
  version: 1;
  kind: "episode-sync";
  syncId: string;
  status: "running" | "success" | "quota-paused" | "cancelled" | "failed";
  episodeId: string;
  count: number;
  newCards: number;
  updatedCards: number;
  newPrices: number;
  refreshedPrices: number;
  gradedPricesUpdated: number;
  preemptedAutoPriceRefresh: boolean;
  quotaExceeded: boolean;
  requestsRemaining: number | null;
  requestConcurrency: number;
}

export interface FullSyncLogDetails {
  version: 1;
  kind: "full-sync";
  syncId: string;
  status: "running" | "success" | "quota-paused" | "cancelled" | "failed";
  count: number;
  newEpisodes: number;
  syncedEpisodes: number;
  skippedEpisodes: number;
  newCards: number;
  updatedCards: number;
  newPrices: number;
  refreshedPrices: number;
  gradedPricesUpdated: number;
  quotaExceeded: boolean;
  requestsRemaining: number | null;
  requestConcurrency: number;
  currentEpisode?: SyncCurrentEpisodeDetails | null;
}

export interface SealedSyncLogDetails {
  version: 1;
  kind: "sealed-sync";
  syncId: string;
  status: "running" | "success" | "quota-paused" | "cancelled" | "failed";
  synced: number;
  products: number;
  quotaExceeded: boolean;
  requestsRemaining: number | null;
  requestConcurrency: number;
  currentEpisode?: SyncCurrentEpisodeDetails | null;
}

export type SyncLogDetails =
  | AutoPriceRefreshLogDetails
  | CardHistoryLogDetails
  | EpisodeSyncLogDetails
  | FullSyncLogDetails
  | SealedSyncLogDetails;

export interface DecodedSyncLogMessage {
  message: string | null;
  details: SyncLogDetails | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAutoPriceRefreshDetails(value: unknown): value is AutoPriceRefreshLogDetails {
  if (!isRecord(value)) return false;

  return value.version === 1 && value.kind === "auto-price-refresh";
}

function isCardHistoryDetails(value: unknown): value is CardHistoryLogDetails {
  if (!isRecord(value)) return false;

  return value.version === 1 && value.kind === "card-history";
}

function isEpisodeSyncDetails(value: unknown): value is EpisodeSyncLogDetails {
  if (!isRecord(value)) return false;

  return value.version === 1 && value.kind === "episode-sync";
}

function isFullSyncDetails(value: unknown): value is FullSyncLogDetails {
  if (!isRecord(value)) return false;

  return value.version === 1 && value.kind === "full-sync";
}

function isSealedSyncDetails(value: unknown): value is SealedSyncLogDetails {
  if (!isRecord(value)) return false;

  return value.version === 1 && value.kind === "sealed-sync";
}

function isSyncLogDetails(value: unknown): value is SyncLogDetails {
  return (
    isAutoPriceRefreshDetails(value) ||
    isCardHistoryDetails(value) ||
    isEpisodeSyncDetails(value) ||
    isFullSyncDetails(value) ||
    isSealedSyncDetails(value)
  );
}

export function decodeSyncLogMessage(message: string | null | undefined): DecodedSyncLogMessage {
  if (!message) {
    return { message: null, details: null };
  }

  const markerIndex = message.lastIndexOf(SYNC_LOG_DETAILS_MARKER);
  if (markerIndex === -1) {
    return { message, details: null };
  }

  const humanMessage = message.slice(0, markerIndex).trimEnd();
  const payload = message.slice(markerIndex + SYNC_LOG_DETAILS_MARKER.length).trim();

  if (!payload) {
    return { message: humanMessage || null, details: null };
  }

  try {
    const parsed: unknown = JSON.parse(payload);

    if (isSyncLogDetails(parsed)) {
      return { message: humanMessage || null, details: parsed };
    }
  } catch {
    return { message: humanMessage || null, details: null };
  }

  return { message: humanMessage || null, details: null };
}

export function decodeSyncLogDetailsJson(detailsJson: string | null | undefined): SyncLogDetails | null {
  if (!detailsJson) return null;

  try {
    const parsed: unknown = JSON.parse(detailsJson);
    return isSyncLogDetails(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function encodeSyncLogMessage(
  message: string,
  details?: SyncLogDetails | null
): string {
  const decoded = decodeSyncLogMessage(message);
  const humanMessage = decoded.message ?? "";

  if (!details) {
    return humanMessage;
  }

  return `${humanMessage}${SYNC_LOG_DETAILS_MARKER}${JSON.stringify(details)}`;
}

export function encodeSyncLogDetailsJson(details?: SyncLogDetails | null): string | null {
  return details ? JSON.stringify(details) : null;
}
