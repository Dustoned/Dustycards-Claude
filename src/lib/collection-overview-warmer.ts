import "server-only";

import { getCachedCollectionOverviewData } from "@/lib/collection-overview-cache";
import { db } from "@/lib/db";
import { ONE_PIECE_GAME, POKEMON_GAME } from "@/lib/games";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  parseStoredSettings,
} from "@/lib/user-settings";

export interface CollectionOverviewWarmSummary {
  users: number;
  views: number;
  errors: number;
}

/**
 * Populate the in-process Home overview cache before a collector needs it.
 * The live probe calls this only after the active-user guard reports a quiet
 * server; deploys may force one warm pass immediately after restart.
 */
export async function warmCollectionOverviewCaches(): Promise<CollectionOverviewWarmSummary> {
  const users = await db.user.findMany({
    where: {
      disabled: false,
      email_verified_at: { not: null },
    },
    select: {
      id: true,
      settings_json: true,
    },
  });
  const summary: CollectionOverviewWarmSummary = {
    users: users.length,
    views: 0,
    errors: 0,
  };

  for (const user of users) {
    const settings = mergeSettings(
      parseStoredSettings(user.settings_json) ?? DEFAULT_SETTINGS
    );
    const games = settings.onePieceLibraryEnabled
      ? ([POKEMON_GAME, ONE_PIECE_GAME] as const)
      : ([POKEMON_GAME] as const);

    for (const game of games) {
      try {
        await getCachedCollectionOverviewData({
          userId: user.id,
          activeTab: "overview",
          game,
          deferDetailedRows: true,
        });
        summary.views += 1;
      } catch {
        summary.errors += 1;
      }
    }
  }

  return summary;
}
