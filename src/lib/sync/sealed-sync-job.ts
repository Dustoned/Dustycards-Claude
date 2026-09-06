import "server-only";

import { db } from "@/lib/db";
import { runSealedSync, syncEpisodeSealed } from "@/lib/sync";
import { isTcggoQuotaExceededError } from "@/lib/tcggo";
import {
  JUST_RELEASED_SEALED_CHECK_KEY,
  pruneJustReleasedSealedChecks,
  SEALED_SYNC_GAMES,
  selectJustReleasedSealedCandidates,
  type JustReleasedSealedChecks,
} from "@/lib/sync/sealed-sync-scope";
import { decodeSyncLogDetailsJson } from "@/lib/sync-log-details";

// Sealed product prices (and their snapshots, which feed sealed sudden drops,
// the value drivers and set-lifecycle observations) previously only refreshed
// when someone pressed the manual "Sync Sealed Products" button. This job
// keeps them fresh automatically, once per interval.
const SEALED_SYNC_LOG_TYPE = "sealed";
const SEALED_SYNC_INTERVAL_MS = 24 * 60 * 60_000;
// A full sealed sync walks every visible expansion; treat an unfinished run
// older than this as crashed instead of blocking the next attempt forever.
const SEALED_SYNC_STALE_RUNNING_MS = 3 * 60 * 60_000;
// After a failed or quota-cut attempt, wait before retrying so an exhausted
// API day cannot turn into a retry loop on every scheduler tick.
const SEALED_SYNC_RETRY_BACKOFF_MS = 2 * 60 * 60_000;
export const AUTOMATIC_SEALED_SYNC_QUOTA_RESERVE = 1_200;

export interface SealedSyncJobSnapshot {
  started: boolean;
  running: boolean;
  due: boolean;
  lastFinishedAt: string | null;
  skippedReason: string | null;
}

export async function maybeStartSealedSyncJob(options: {
  skip: boolean;
  skipReason?: string;
  requestsRemaining?: number | null;
  hasLiveWindow?: boolean;
  allowReservedRequests?: boolean;
  now?: Date;
}): Promise<SealedSyncJobSnapshot> {
  const now = options.now ?? new Date();
  const [runningLog, lastSuccessLog, lastAttemptLog] = await Promise.all([
    db.syncLog.findFirst({
      where: { type: SEALED_SYNC_LOG_TYPE, status: "running" },
      orderBy: { started_at: "desc" },
      select: { started_at: true },
    }),
    db.syncLog.findFirst({
      where: { type: SEALED_SYNC_LOG_TYPE, status: "success" },
      orderBy: { finished_at: "desc" },
      select: { finished_at: true, details_json: true },
    }),
    db.syncLog.findFirst({
      where: { type: SEALED_SYNC_LOG_TYPE },
      orderBy: { started_at: "desc" },
      select: { started_at: true },
    }),
  ]);

  const running = Boolean(
    runningLog &&
      now.getTime() - new Date(runningLog.started_at).getTime() < SEALED_SYNC_STALE_RUNNING_MS
  );
  const lastSuccessDetails = decodeSyncLogDetailsJson(lastSuccessLog?.details_json);
  const lastRunPausedForQuota =
    lastSuccessDetails?.kind === "sealed-sync" &&
    lastSuccessDetails.status === "quota-paused";
  const lastFinishedAt = lastSuccessLog?.finished_at && !lastRunPausedForQuota
    ? new Date(lastSuccessLog.finished_at)
    : null;
  const due =
    !lastFinishedAt || now.getTime() - lastFinishedAt.getTime() >= SEALED_SYNC_INTERVAL_MS;
  const base: SealedSyncJobSnapshot = {
    started: false,
    running,
    due,
    lastFinishedAt: lastFinishedAt?.toISOString() ?? null,
    skippedReason: null,
  };

  if (options.skip) {
    return { ...base, skippedReason: options.skipReason ?? "scraper-disabled" };
  }
  if (running) return { ...base, skippedReason: "already-running" };
  if (!due) return { ...base, skippedReason: "not-due" };
  const minimumRequestsRemaining = options.allowReservedRequests
    ? 0
    : AUTOMATIC_SEALED_SYNC_QUOTA_RESERVE;
  if (
    options.requestsRemaining != null &&
    options.requestsRemaining <= minimumRequestsRemaining
  ) {
    return { ...base, skippedReason: "quota-reserve" };
  }

  const lastAttemptAt = lastAttemptLog?.started_at ? new Date(lastAttemptLog.started_at) : null;
  if (
    lastAttemptAt &&
    options.hasLiveWindow !== false &&
    now.getTime() - lastAttemptAt.getTime() < SEALED_SYNC_RETRY_BACKOFF_MS &&
    (!lastFinishedAt || lastAttemptAt.getTime() > lastFinishedAt.getTime())
  ) {
    return { ...base, skippedReason: "retry-backoff" };
  }

  void runSealedSync({
    minimumRequestsRemaining,
  })
    .catch((error: unknown) => {
      console.error(
        "[sealed-sync-job] scheduled sealed sync failed:",
        error instanceof Error ? error.message : String(error)
      );
    });

  return { ...base, started: true, running: true };
}

const JUST_RELEASED_WINDOW_DAY_MS = 24 * 60 * 60_000;

export interface JustReleasedSealedSnapshot {
  checked: number;
  skippedReason: string | null;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseChecks(value: string | null | undefined): JustReleasedSealedChecks {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as JustReleasedSealedChecks)
      : {};
  } catch {
    return {};
  }
}

/**
 * The daily sealed sync walks every expansion once a day, but a set's sealed
 * products appear on the marketplace around its release day. This check runs
 * on every scheduler tick, finds sets released in the last two weeks that
 * still have no sealed products, and fetches those few sets directly. Each
 * set is re-asked at most every six hours until its products arrive.
 */
export async function maybeSyncJustReleasedSealed(options: {
  skip: boolean;
  skipReason?: string;
  requestsRemaining?: number | null;
  now?: Date;
}): Promise<JustReleasedSealedSnapshot> {
  const now = options.now ?? new Date();
  const base: JustReleasedSealedSnapshot = { checked: 0, skippedReason: null };
  if (options.skip) return { ...base, skippedReason: options.skipReason ?? "scraper-disabled" };
  if (
    options.requestsRemaining != null &&
    options.requestsRemaining <= AUTOMATIC_SEALED_SYNC_QUOTA_RESERVE
  ) {
    return { ...base, skippedReason: "quota-reserve" };
  }

  const [episodes, setting] = await Promise.all([
    db.episode.findMany({
      where: {
        game: { in: [...SEALED_SYNC_GAMES] },
        release_date: {
          gte: isoDay(new Date(now.getTime() - 14 * JUST_RELEASED_WINDOW_DAY_MS)),
          lte: isoDay(new Date(now.getTime() + JUST_RELEASED_WINDOW_DAY_MS)),
        },
        sealedProducts: { none: {} },
      },
      select: { id: true, game: true, name: true, code: true, release_date: true },
    }),
    db.appSetting.findUnique({ where: { key: JUST_RELEASED_SEALED_CHECK_KEY } }),
  ]);
  const lastChecks = parseChecks(setting?.value);
  const candidates = selectJustReleasedSealedCandidates({ episodes, lastChecks, now });
  if (candidates.length === 0) return base;

  const nextChecks = pruneJustReleasedSealedChecks(lastChecks, now);
  let checked = 0;
  let skippedReason: string | null = null;
  for (const candidate of candidates) {
    try {
      await syncEpisodeSealed(candidate.id, { backfillNativeHistory: false });
    } catch (error) {
      if (isTcggoQuotaExceededError(error)) {
        skippedReason = "quota-exceeded";
        break;
      }
      console.error(
        `[sealed-sync-job] release check failed for ${candidate.id}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
    checked += 1;
    nextChecks[candidate.id] = now.toISOString();
  }

  const value = JSON.stringify(nextChecks);
  await db.appSetting.upsert({
    where: { key: JUST_RELEASED_SEALED_CHECK_KEY },
    create: { key: JUST_RELEASED_SEALED_CHECK_KEY, value },
    update: { value },
  });
  return { checked, skippedReason };
}
