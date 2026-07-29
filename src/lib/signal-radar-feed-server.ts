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

function chaseCacheKey(options: SharedSignalRadarFeedOptions): string {
  return `${options.gameFilter}:${options.episodeId ?? "latest"}`;
}

export function clearSharedSignalRadarFeedCache(): void {
  sharedSignalCache.clear();
  sharedChaseCache.clear();
}

export async function getSharedSignalRadarFeedData(
  options: SharedSignalRadarFeedOptions
): Promise<SharedSignalRadarFeedData> {
  const [signals, newReleaseChases] = await Promise.all([
    sharedSignalCache.get(options.gameFilter, async () => {
      const persisted = await getExternalSignalRadarPageData(options.gameFilter);
      const data = await enrichExternalSignalRadarData(persisted);
      return data.signals;
    }),
    sharedChaseCache.get(chaseCacheKey(options), () =>
      getExpansionChaseRadarData({
        gameFilter: options.gameFilter,
        episodeId: options.episodeId,
      })
    ),
  ]);

  return {
    signals,
    newReleaseChases,
  };
}
