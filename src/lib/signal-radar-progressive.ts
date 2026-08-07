import type { CardQuickActionMap } from "@/lib/card-quick-actions";
import type { ExpansionChaseRadarData } from "@/lib/expansion-chase-radar";
import type { ExternalCardSignal } from "@/lib/external-signal-radar";
import type { SealedSignalRadarData } from "@/lib/sealed-signal-radar";

export const INITIAL_SIGNAL_RADAR_CARD_COUNT = 6;
export const INITIAL_SIGNAL_RADAR_FEED_DELAY_MS = 150;
export const SIGNAL_RADAR_CLIENT_CACHE_TTL_MS = 5 * 60_000;
const SIGNAL_RADAR_CLIENT_CACHE_MAX_ENTRIES = 12;
export const MIN_CHASE_WATCH_REVALIDATE_DELAY_MS = 60_000;
export const CHASE_WATCH_RETRY_DELAY_MS = 5 * 60_000;

interface CachedSignalRadarFeed {
  cachedAt: number;
  payload: Pick<SignalRadarProgressivePayload, "signals" | "sealedRadar">;
}

const clientFeedCache = new Map<string, CachedSignalRadarFeed>();

function pruneSignalRadarClientCache(nowMs: number): void {
  for (const [key, cached] of clientFeedCache) {
    if (nowMs - cached.cachedAt > SIGNAL_RADAR_CLIENT_CACHE_TTL_MS) {
      clientFeedCache.delete(key);
    }
  }
}

export function getCachedSignalRadarFeed(
  key: string,
  nowMs = Date.now()
): CachedSignalRadarFeed["payload"] | null {
  pruneSignalRadarClientCache(nowMs);
  const cached = clientFeedCache.get(key);
  if (!cached) return null;
  return cached.payload;
}

export function cacheSignalRadarFeed(
  key: string,
  payload: SignalRadarProgressivePayload,
  nowMs = Date.now()
): void {
  pruneSignalRadarClientCache(nowMs);
  clientFeedCache.delete(key);
  clientFeedCache.set(key, {
    cachedAt: nowMs,
    payload: {
      signals: payload.signals,
      sealedRadar: payload.sealedRadar,
    },
  });
  while (clientFeedCache.size > SIGNAL_RADAR_CLIENT_CACHE_MAX_ENTRIES) {
    const oldestKey = clientFeedCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    clientFeedCache.delete(oldestKey);
  }
}

export function clearSignalRadarClientCache(): void {
  clientFeedCache.clear();
}

export function getChaseWatchRevalidateDelayMs(
  nextRefreshAt: string | null | undefined,
  nowMs = Date.now()
): number | null {
  if (!nextRefreshAt) return null;
  const nextMs = new Date(nextRefreshAt).getTime();
  if (!Number.isFinite(nextMs)) return null;
  // Give the five-minute scheduler a small landing window, while still
  // checking promptly when the tab is reopened after the deadline.
  return Math.max(
    MIN_CHASE_WATCH_REVALIDATE_DELAY_MS,
    nextMs - nowMs + MIN_CHASE_WATCH_REVALIDATE_DELAY_MS
  );
}

export interface SignalRadarChaseWatchPayload {
  newReleaseChases: ExpansionChaseRadarData | null;
  cardQuickActions?: CardQuickActionMap;
}

export function getSignalRadarFeedStartDelay(attempt: number): number {
  return attempt === 0 ? INITIAL_SIGNAL_RADAR_FEED_DELAY_MS : 0;
}

export function scheduleSignalRadarFeedStart(
  attempt: number,
  start: (signal: AbortSignal) => void | Promise<void>
): () => void {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => {
    if (!controller.signal.aborted) void start(controller.signal);
  }, getSignalRadarFeedStartDelay(attempt));

  return () => {
    globalThis.clearTimeout(timer);
    controller.abort();
  };
}

export function commitSignalRadarFeedResult(
  signal: AbortSignal,
  commit: () => void
): boolean {
  if (signal.aborted) return false;
  commit();
  return true;
}

export interface SignalRadarProgressivePayload {
  signals: ExternalCardSignal[];
  sealedRadar: SealedSignalRadarData | null;
  cardQuickActions: CardQuickActionMap;
  newReleaseChases: ExpansionChaseRadarData | null;
}

export function selectInitialSignalRadarCards(
  signals: readonly ExternalCardSignal[],
  excludedCardIds: ReadonlySet<string>,
  limit = INITIAL_SIGNAL_RADAR_CARD_COUNT
): ExternalCardSignal[] {
  const generalSignals = signals.filter((signal) => !excludedCardIds.has(signal.cardId));
  if (generalSignals.length > 0 || signals.length === 0) {
    return generalSignals.slice(0, limit);
  }

  // Keep one lightweight chase signal so the existing duplicate-empty-state
  // logic can still explain that every radar card is already shown above.
  return signals.slice(0, 1);
}
