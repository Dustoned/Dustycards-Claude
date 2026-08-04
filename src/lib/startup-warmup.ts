import "server-only";

import { db } from "@/lib/db";
import { getCachedCollectionOverviewData } from "@/lib/collection-overview-cache";
import { loadMoversPageData } from "@/app/movers/page-data";
import { POKEMON_GAME } from "@/lib/games";

// After a deploy/restart every in-memory cache and the SQLite page cache
// start cold, so the first visitor paid the full home/market build (tens of
// seconds). The scheduler tick calls maybeRunCacheWarmer() every ~30s; it
// rebuilds the heaviest page data for the most recently active users right
// after boot and then re-warms every few minutes, which keeps the movers
// stale-while-revalidate caches permanently populated. Nobody ever waits for
// a cold Targets/Graded build again.
const WARMUP_USER_LIMIT = 3;
const INITIAL_WARMUP_DELAY_MS = 2 * 60_000;
const REWARM_INTERVAL_MS = 30 * 60_000;
// Market scopes to keep warm; undefined = the default raw view.
const MARKET_SCOPES: Array<string | undefined> = [undefined, "graded", "grading", "sealed"];

let running = false;
let nextEligibleAt = Date.now() + INITIAL_WARMUP_DELAY_MS;
let lastFinishedAt: string | null = null;
let lastError: string | null = null;

export function getStartupWarmupSnapshot() {
  return { running, lastFinishedAt, lastError };
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

async function runCacheWarmup(): Promise<void> {
  const userIds = await findRecentlyActiveUserIds();

  for (const userId of userIds) {
    // Sequential on purpose: the goal is warm caches, not extra load spikes.
    await getCachedCollectionOverviewData({
      userId,
      activeTab: "overview",
      game: POKEMON_GAME,
    });
    for (const scope of MARKET_SCOPES) {
      await loadMoversPageData(undefined, scope, undefined, userId, POKEMON_GAME);
    }
  }
}

export function maybeRunCacheWarmer(): void {
  const now = Date.now();
  if (running || now < nextEligibleAt) return;
  running = true;

  void runCacheWarmup()
    .then(() => {
      lastError = null;
    })
    .catch((error: unknown) => {
      lastError = error instanceof Error ? error.message : String(error);
    })
    .finally(() => {
      running = false;
      lastFinishedAt = new Date().toISOString();
      nextEligibleAt = Date.now() + REWARM_INTERVAL_MS;
    });
}

// Backwards-compatible alias for the boot-time call site.
export const maybeStartStartupWarmup = maybeRunCacheWarmer;
