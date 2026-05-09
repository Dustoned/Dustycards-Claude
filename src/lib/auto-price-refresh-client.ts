export const AUTO_PRICE_REFRESH_MAX_CHAINED_FOLLOW_UPS = 3;
export const AUTO_PRICE_REFRESH_TAB_LOCK_KEY = "dustycards-auto-price-refresh-tab-lock";
export const AUTO_PRICE_REFRESH_TAB_LOCK_TTL_MS = 90_000;

export interface AutoPriceRefreshClientResponse {
  ok?: boolean;
  skipped?: boolean;
  quotaExceeded?: boolean;
  dueCards?: number;
  missingPriceCards?: number;
  selectedCards?: number;
  backfillCards?: number;
  remainingDueCards?: number;
  catalogSyncedEpisodes?: number;
  nativeHistoryItems?: number;
  newEpisodes?: number;
  newCards?: number;
  updatedCards?: number;
  newPrices?: number;
  refreshedPrices?: number;
  refreshedCards?: number;
  gradedPricesUpdated?: number;
  cardHistoryJobStarted?: boolean;
  cardHistoryJobRunning?: boolean;
  cardHistoryPendingCards?: number;
}

export function hasVisibleRefreshChanges(data: AutoPriceRefreshClientResponse): boolean {
  return (
    (data.catalogSyncedEpisodes ?? 0) > 0 ||
    (data.nativeHistoryItems ?? 0) > 0 ||
    (data.newEpisodes ?? 0) > 0 ||
    (data.newCards ?? 0) > 0 ||
    (data.updatedCards ?? 0) > 0 ||
    (data.newPrices ?? 0) > 0 ||
    (data.refreshedPrices ?? 0) > 0 ||
    (data.refreshedCards ?? 0) > 0 ||
    (data.gradedPricesUpdated ?? 0) > 0 ||
    data.cardHistoryJobStarted === true ||
    data.cardHistoryJobRunning === true
  );
}

export function hasRefreshProgress(data: AutoPriceRefreshClientResponse): boolean {
  return hasVisibleRefreshChanges(data);
}

export function hasQueuedFollowUp(data: AutoPriceRefreshClientResponse): boolean {
  if (data.skipped || data.quotaExceeded) return false;
  if (!hasRefreshProgress(data)) return false;

  const remainingDueCards =
    data.remainingDueCards ?? Math.max((data.dueCards ?? 0) - (data.selectedCards ?? 0), 0);
  const remainingMissingPriceCards = Math.max(
    (data.missingPriceCards ?? 0) - (data.backfillCards ?? 0),
    0
  );

  return remainingDueCards > 0 || remainingMissingPriceCards > 0;
}

export function shouldQueueAutoPriceRefreshFollowUp(
  data: AutoPriceRefreshClientResponse,
  chainedFollowUps: number
): boolean {
  if (chainedFollowUps >= AUTO_PRICE_REFRESH_MAX_CHAINED_FOLLOW_UPS) {
    return false;
  }

  return hasQueuedFollowUp(data);
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface AutoPriceRefreshTabLock {
  ownerId: string;
  expiresAt: number;
}

function parseTabLock(raw: string | null): AutoPriceRefreshTabLock | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      if (typeof record.ownerId === "string" && typeof record.expiresAt === "number") {
        return {
          ownerId: record.ownerId,
          expiresAt: record.expiresAt,
        };
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function createAutoPriceRefreshTabOwnerId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return `${Date.now().toString(36)}-${random}`;
}

export function tryAcquireAutoPriceRefreshTabLock(
  storage: StorageLike,
  ownerId: string,
  now = Date.now(),
  ttlMs = AUTO_PRICE_REFRESH_TAB_LOCK_TTL_MS
): boolean {
  const current = parseTabLock(storage.getItem(AUTO_PRICE_REFRESH_TAB_LOCK_KEY));
  if (current && current.ownerId !== ownerId && current.expiresAt > now) {
    return false;
  }

  const nextLock = {
    ownerId,
    expiresAt: now + ttlMs,
  };

  storage.setItem(AUTO_PRICE_REFRESH_TAB_LOCK_KEY, JSON.stringify(nextLock));

  return parseTabLock(storage.getItem(AUTO_PRICE_REFRESH_TAB_LOCK_KEY))?.ownerId === ownerId;
}

export function releaseAutoPriceRefreshTabLock(storage: StorageLike, ownerId: string): void {
  const current = parseTabLock(storage.getItem(AUTO_PRICE_REFRESH_TAB_LOCK_KEY));
  if (current?.ownerId === ownerId) {
    storage.removeItem(AUTO_PRICE_REFRESH_TAB_LOCK_KEY);
  }
}
