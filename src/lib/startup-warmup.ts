import "server-only";

import { db } from "@/lib/db";
import { getCollectionOverviewData } from "@/lib/collection-data";
import { loadMoversPageData } from "@/app/movers/page-data";
import { POKEMON_GAME } from "@/lib/games";

// After a deploy/restart every in-memory cache and the SQLite page cache start
// cold, so the first visitor paid the full home/market build (tens of
// seconds). The scheduler tick calls this once per boot: it rebuilds the
// heaviest page data for the most recently active users in the background so
// the first real visit lands on warm caches.
const WARMUP_USER_LIMIT = 3;

let warmupStarted = false;
let warmupFinishedAt: string | null = null;
let warmupError: string | null = null;

export function getStartupWarmupSnapshot() {
  return { started: warmupStarted, finishedAt: warmupFinishedAt, error: warmupError };
}

async function findRecentlyActiveUserIds(): Promise<string[]> {
  const sessions = await db.session.findMany({
    where: { expires_at: { gt: new Date() } },
    orderBy: { expires_at: "desc" },
    select: { user_id: true },
    take: 50,
  });
  const userIds: string[] = [];
  for (const session of sessions) {
    if (!userIds.includes(session.user_id)) {
      userIds.push(session.user_id);
    }
    if (userIds.length >= WARMUP_USER_LIMIT) break;
  }
  return userIds;
}

async function runStartupWarmup(): Promise<void> {
  const userIds = await findRecentlyActiveUserIds();

  for (const userId of userIds) {
    // Sequential on purpose: the goal is warm caches, not extra load spikes.
    await getCollectionOverviewData({
      userId,
      activeTab: "overview",
      game: POKEMON_GAME,
    });
    await loadMoversPageData(undefined, undefined, undefined, userId, POKEMON_GAME);
  }
}

export function maybeStartStartupWarmup(): void {
  if (warmupStarted) return;
  warmupStarted = true;

  void runStartupWarmup()
    .then(() => {
      warmupFinishedAt = new Date().toISOString();
    })
    .catch((error: unknown) => {
      warmupError = error instanceof Error ? error.message : String(error);
    });
}
