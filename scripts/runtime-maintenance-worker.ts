import BetterSqlite3 from "better-sqlite3";
import path from "node:path";
import { trimImageCache } from "@/lib/image-cache-maintenance";
import { LIVE_DB_PATH } from "@/lib/db-paths";

const ACTIVE_USER_WINDOW_MS = 3 * 60_000;
const RECENT_DETAIL_DAYS = 14;
const DAILY_HISTORY_DAYS = 395;
const IMAGE_CACHE_MAX_ENTRIES = 24_000;
const IMAGE_CACHE_MAX_BYTES = 2_500 * 1024 * 1024;
const RESPONSIVE_CACHE_MAX_ENTRIES = 4_096;
const RESPONSIVE_CACHE_MAX_BYTES = 256 * 1024 * 1024;

type HistoryTable =
  | "CardGradedPriceSnapshot"
  | "CardEbaySoldGradedPriceSnapshot";

interface MaintenanceSummary {
  ok: true;
  skipped?: "active-users";
  historyRowsRemoved: Record<HistoryTable, number>;
  analyzed: boolean;
  imageCache: Awaited<ReturnType<typeof trimImageCache>> | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addUtcDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60_000);
}

function hasActiveUsers(database: BetterSqlite3.Database): boolean {
  const now = new Date();
  const activeSince = new Date(now.getTime() - ACTIVE_USER_WINDOW_MS).toISOString();
  const row = database
    .prepare(
      `SELECT COUNT(DISTINCT user_id) AS count
       FROM "Session"
       WHERE expires_at > ?
         AND COALESCE(last_seen_at, created_at) >= ?`
    )
    .get(now.toISOString(), activeSince) as { count?: number | bigint } | undefined;
  return Number(row?.count ?? 0) > 0;
}

function getOldestHistoryDay(
  database: BetterSqlite3.Database,
  table: HistoryTable
): Date | null {
  const row = database
    .prepare(`SELECT MIN(fetched_at) AS oldest FROM "${table}"`)
    .get() as { oldest?: string | null } | undefined;
  if (!row?.oldest) return null;
  const date = new Date(row.oldest);
  return Number.isNaN(date.getTime()) ? null : new Date(`${isoDay(date)}T00:00:00.000Z`);
}

async function downsampleHistory(
  database: BetterSqlite3.Database,
  table: HistoryTable,
  now: Date
): Promise<number> {
  const oldest = getOldestHistoryDay(database, table);
  if (!oldest) return 0;

  const detailedCutoff = new Date(`${isoDay(addUtcDays(now, -RECENT_DETAIL_DAYS))}T00:00:00.000Z`);
  const dailyCutoff = new Date(`${isoDay(addUtcDays(now, -DAILY_HISTORY_DAYS))}T00:00:00.000Z`);
  const partitionColumns =
    table === "CardEbaySoldGradedPriceSnapshot"
      ? "card_id, source, label"
      : "card_id, label";
  const deleteWithinBucket = database.prepare(
    `DELETE FROM "${table}"
     WHERE fetched_at >= ?
       AND fetched_at < ?
       AND id IN (
         SELECT id
         FROM (
           SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY ${partitionColumns}
               ORDER BY fetched_at DESC, id DESC
             ) AS row_num
           FROM "${table}"
           WHERE fetched_at >= ? AND fetched_at < ?
         )
         WHERE row_num > 1
       )`
  );

  let removed = 0;
  for (let bucketStart = oldest; bucketStart < detailedCutoff;) {
    if (hasActiveUsers(database)) break;
    const useWeeklyBucket = bucketStart < dailyCutoff;
    const requestedEnd = addUtcDays(bucketStart, useWeeklyBucket ? 7 : 1);
    const bucketEnd = requestedEnd > detailedCutoff ? detailedCutoff : requestedEnd;
    const startIso = bucketStart.toISOString();
    const endIso = bucketEnd.toISOString();
    const result = deleteWithinBucket.run(startIso, endIso, startIso, endIso);
    removed += Number(result.changes);
    bucketStart = bucketEnd;
    await sleep(25);
  }
  return removed;
}

async function main(): Promise<MaintenanceSummary> {
  const database = new BetterSqlite3(LIVE_DB_PATH, { timeout: 5_000 });
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = NORMAL");
  database.pragma("busy_timeout = 5000");
  // Maintenance sorts must spill to disk rather than crowding the 4 GB VPS.
  database.pragma("temp_store = FILE");

  const summary: MaintenanceSummary = {
    ok: true,
    historyRowsRemoved: {
      CardGradedPriceSnapshot: 0,
      CardEbaySoldGradedPriceSnapshot: 0,
    },
    analyzed: false,
    imageCache: null,
  };

  try {
    if (hasActiveUsers(database)) {
      summary.skipped = "active-users";
      return summary;
    }

    const now = new Date();
    for (const table of [
      "CardGradedPriceSnapshot",
      "CardEbaySoldGradedPriceSnapshot",
    ] as const) {
      summary.historyRowsRemoved[table] = await downsampleHistory(database, table, now);
    }

    if (!hasActiveUsers(database)) {
      database.exec("ANALYZE");
      database.pragma("optimize");
      database.pragma("wal_checkpoint(PASSIVE)");
      summary.analyzed = true;
    }
  } finally {
    database.close();
  }

  if (!summary.skipped) {
    const imageCacheDir = path.resolve(
      process.env.DUSTYCARDS_IMAGE_CACHE_DIR?.trim() ||
        path.join(process.cwd(), "data", "image-cache")
    );
    summary.imageCache = await trimImageCache(imageCacheDir, {
      maxEntries: IMAGE_CACHE_MAX_ENTRIES,
      maxBytes: IMAGE_CACHE_MAX_BYTES,
      maxResponsiveEntries: RESPONSIVE_CACHE_MAX_ENTRIES,
      maxResponsiveBytes: RESPONSIVE_CACHE_MAX_BYTES,
    });
  }

  return summary;
}

try {
  console.log(JSON.stringify(await main()));
} catch (error) {
  console.error(
    "[runtime-maintenance-worker]",
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
}
