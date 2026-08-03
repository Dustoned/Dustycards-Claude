import "server-only";

import {
  getExpansionChaseRadarData,
  type ExpansionChaseRadarData,
} from "@/lib/expansion-chase-radar";
import { enrichExternalSignalRadarData } from "@/lib/external-signal-intelligence";
import { getExternalSignalRadarPageData } from "@/lib/external-signal-persisted";
import type { ExternalCardSignal } from "@/lib/external-signal-radar";
import type { TradingCardGameFilter } from "@/lib/games";
import { createSwrCache } from "@/lib/server-swr-cache";
import {
  readSignalRadarChaseSnapshot,
  readSignalRadarSnapshot,
  writeSignalRadarChaseSnapshot,
  writeSignalRadarSnapshots,
} from "@/lib/signal-radar-snapshot-store";

export interface SharedSignalRadarFeedData {
  signals: ExternalCardSignal[];
  newReleaseChases: ExpansionChaseRadarData | null;
}

interface SharedSignalRadarFeedOptions {
  gameFilter: TradingCardGameFilter;
  episodeId: string | null;
}

const sharedSignalCache = createSwrCache<ExternalCardSignal[]>(
  60_000,
  15 * 60_000,
  { maxEntries: 3 }
);
const sharedChaseCache = createSwrCache<ExpansionChaseRadarData | null>(
  60_000,
  15 * 60_000,
  { maxEntries: 24 }
);
const CHASE_SNAPSHOT_BACKGROUND_REFRESH_MS = 10 * 60_000;
const chaseBackgroundRefreshes = new Map<string, Promise<void>>();

function chaseCacheKey(options: SharedSignalRadarFeedOptions): string {
  return `${options.gameFilter}:${options.episodeId ?? "latest"}`;
}

export function clearSharedSignalRadarFeedCache(): void {
  sharedSignalCache.clear();
  sharedChaseCache.clear();
}

export function clearSharedSignalRadarChaseCache(): void {
  sharedChaseCache.clear();
}

async function computeAndPersistSignals(
  gameFilter: TradingCardGameFilter
): Promise<ExternalCardSignal[]> {
  const persisted = await getExternalSignalRadarPageData(gameFilter);
  const data = await enrichExternalSignalRadarData(persisted);
  await writeSignalRadarSnapshots(data).catch((error) => {
    console.error("[signal-radar snapshot write]", error);
  });
  return data.signals;
}

export function getSharedSignalRadarSignals(
  gameFilter: TradingCardGameFilter
): Promise<ExternalCardSignal[]> {
  return sharedSignalCache.get(gameFilter, async () => {
    const snapshot = await readSignalRadarSnapshot(gameFilter);
    if (snapshot) return snapshot.data.signals;
    return computeAndPersistSignals(gameFilter);
  });
}

export function getSharedSignalRadarChases(
  options: SharedSignalRadarFeedOptions
): Promise<ExpansionChaseRadarData | null> {
  const key = chaseCacheKey(options);
  return sharedChaseCache.get(key, async () => {
    const snapshot = await readSignalRadarChaseSnapshot(options);
    if (snapshot) {
      const writtenAt = new Date(snapshot.writtenAt).getTime();
      if (
        !Number.isFinite(writtenAt) ||
        writtenAt <= Date.now() - CHASE_SNAPSHOT_BACKGROUND_REFRESH_MS
      ) {
        scheduleChaseBackgroundRefresh(options);
      }
      return snapshot.data;
    }
    return computeAndPersistChases(options);
  });
}

async function computeAndPersistChases(
  options: SharedSignalRadarFeedOptions
): Promise<ExpansionChaseRadarData | null> {
  const data = await getExpansionChaseRadarData({
    gameFilter: options.gameFilter,
    episodeId: options.episodeId,
  });
  await writeSignalRadarChaseSnapshot(options, data).catch((error) => {
    console.error("[signal-radar chase snapshot write]", error);
  });
  return data;
}

function scheduleChaseBackgroundRefresh(options: SharedSignalRadarFeedOptions): void {
  const key = chaseCacheKey(options);
  if (chaseBackgroundRefreshes.has(key)) return;
  const refresh = new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      void computeAndPersistChases(options)
        .then(() => {
          sharedChaseCache.delete(key);
        })
        .catch((error) => {
          console.error("[signal-radar chase background refresh]", error);
        })
        .finally(resolve);
    }, 1_000);
    timer.unref?.();
  }).finally(() => {
    chaseBackgroundRefreshes.delete(key);
  });
  chaseBackgroundRefreshes.set(key, refresh);
}

export async function refreshSharedSignalRadarChases(
  options: SharedSignalRadarFeedOptions
): Promise<ExpansionChaseRadarData | null> {
  const key = chaseCacheKey(options);
  sharedChaseCache.delete(key);
  const data = await computeAndPersistChases(options);
  sharedChaseCache.delete(key);
  return getSharedSignalRadarChases(options).then(() => data);
}

export async function refreshSharedSignalRadarSignals(
  gameFilter: TradingCardGameFilter
): Promise<ExternalCardSignal[]> {
  sharedSignalCache.delete(gameFilter);
  await computeAndPersistSignals(gameFilter);
  sharedSignalCache.delete(gameFilter);
  return getSharedSignalRadarSignals(gameFilter);
}

export async function getSharedSignalRadarFeedData(
  options: SharedSignalRadarFeedOptions
): Promise<SharedSignalRadarFeedData> {
  const [signals, newReleaseChases] = await Promise.all([
    getSharedSignalRadarSignals(options.gameFilter),
    getSharedSignalRadarChases(options),
  ]);

  return {
    signals,
    newReleaseChases,
  };
}
