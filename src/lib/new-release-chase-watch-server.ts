import "server-only";

import { db } from "@/lib/db";
import { ONE_PIECE_GAME, POKEMON_GAME } from "@/lib/games";
import { NEW_RELEASE_CHASE_WATCH_DAYS } from "@/lib/new-release-chase-watch-core";

const DAY_MS = 24 * 60 * 60_000;

/**
 * The direct-price lane intentionally follows only the newest released,
 * populated set per game. Both the scheduler and Radar UI use this query so
 * an older set can never advertise a check that will not actually run.
 */
export async function getLatestNewReleaseChaseWatchEpisodes(now = new Date()) {
  const releaseFloor = new Date(
    now.getTime() - NEW_RELEASE_CHASE_WATCH_DAYS * DAY_MS
  );
  const releaseFloorKey = releaseFloor.toISOString().slice(0, 10);
  const todayKey = now.toISOString().slice(0, 10);

  return Promise.all(
    ([POKEMON_GAME, ONE_PIECE_GAME] as const).map((game) =>
      db.episode.findFirst({
        where: {
          game,
          release_date: { gte: releaseFloorKey, lte: todayKey },
          cards: {
            some: {
              cardmarket_id: { not: null },
            },
          },
        },
        orderBy: [{ release_date: "desc" }, { id: "desc" }],
        select: { id: true, game: true, release_date: true },
      })
    )
  );
}
