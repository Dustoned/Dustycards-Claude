import BetterSqlite3 from "better-sqlite3";
import path from "node:path";
import { trimImageCache } from "@/lib/image-cache-maintenance";
import { LIVE_DB_PATH } from "@/lib/db-paths";
import { readStoredUpcomingReveals } from "@/lib/upcoming-source-reveals";
import { getMovers } from "@/lib/movers";
import {
  SHARED_MOVERS_SNAPSHOT_USER_ID,
  writeMoversSnapshot,
} from "@/lib/movers-snapshot-store";
import { ALL_GAMES, ONE_PIECE_GAME, POKEMON_GAME } from "@/lib/games";
import type { PriceSource } from "@/lib/user-settings";
import { refreshSharedSealedSignalRadarData } from "@/lib/sealed-signal-radar-server";

const ACTIVE_USER_WINDOW_MS = 3 * 60_000;
const RECENT_DETAIL_DAYS = 14;
const DAILY_HISTORY_DAYS = 395;
// This is a disposable performance cache, not a source of record. Keep a hard
// ceiling well below the VPS free-space margin; referenced originals are
// evicted last and can always be fetched again.
const IMAGE_CACHE_MAX_ENTRIES = 12_000;
const IMAGE_CACHE_MAX_BYTES = 1024 * 1024 * 1024;
const RESPONSIVE_CACHE_MAX_ENTRIES = 3_000;
const RESPONSIVE_CACHE_MAX_BYTES = 192 * 1024 * 1024;

type HistoryTable =
  | "CardGradedPriceSnapshot"
  | "CardEbaySoldGradedPriceSnapshot";

interface MaintenanceSummary {
  ok: true;
  skipped?: "active-users";
  historyRowsRemoved: Record<HistoryTable, number>;
  analyzed: boolean;
  protectedImageSources: number;
  imageCache: Awaited<ReturnType<typeof trimImageCache>> | null;
  moversSnapshots: {
    refreshed: string[];
    errors: string[];
  };
  sealedRadarSnapshots: {
    refreshed: string[];
    errors: string[];
  };
}

interface CollectionMoversSnapshotTarget {
  userId: string;
  game: typeof POKEMON_GAME | typeof ONE_PIECE_GAME;
}

function getCollectionMoversSnapshotTargets(
  database: BetterSqlite3.Database
): CollectionMoversSnapshotTarget[] {
  const rows = database
    .prepare(
      `SELECT DISTINCT cc.user_id AS user_id, c.game AS game
       FROM "CollectionCard" cc
       INNER JOIN "Card" c ON c.id = cc.card_id
       WHERE cc.user_id IS NOT NULL
         AND cc.for_sale = 0
         AND cc.sold_at IS NULL
         AND c.game IN (?, ?)
       ORDER BY c.game ASC, cc.user_id ASC`
    )
    .all(POKEMON_GAME, ONE_PIECE_GAME) as Array<{ user_id: string; game: string }>;

  return rows.flatMap((row) =>
    row.game === POKEMON_GAME || row.game === ONE_PIECE_GAME
      ? [{ userId: row.user_id, game: row.game }]
      : []
  );
}

async function refreshMoversSnapshots(
  collectionTargets: CollectionMoversSnapshotTarget[]
): Promise<MaintenanceSummary["moversSnapshots"]> {
  const result: MaintenanceSummary["moversSnapshots"] = { refreshed: [], errors: [] };
  const sources: PriceSource[] = ["cm_en", "tcp"];
  const games = [POKEMON_GAME, ONE_PIECE_GAME] as const;
  const sharedScopes = ["all", "graded", "grading"] as const;

  for (const game of games) {
    for (const source of sources) {
      for (const scope of sharedScopes) {
        const key = `${game}:${source}:${scope}:all`;
        try {
          const data = await getMovers(source, scope, "all", null, game);
          await writeMoversSnapshot(
            {
              userId: SHARED_MOVERS_SNAPSHOT_USER_ID,
              game,
              source,
              scope,
              itemScope: "all",
            },
            data
          );
          result.refreshed.push(key);
        } catch (error) {
          result.errors.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  for (const [targetIndex, target] of collectionTargets.entries()) {
    for (const source of sources) {
      for (const scope of ["collection", "graded", "grading"] as const) {
        const key = `collection-${targetIndex + 1}:${target.game}:${source}:${scope}`;
        try {
          const data = await getMovers(source, scope, "collection", target.userId, target.game);
          await writeMoversSnapshot(
            {
              userId: target.userId,
              game: target.game,
              source,
              scope,
              itemScope: "collection",
            },
            data
          );
          result.refreshed.push(key);
        } catch (error) {
          result.errors.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  return result;
}

async function refreshSealedRadarSnapshots(): Promise<MaintenanceSummary["sealedRadarSnapshots"]> {
  const result: MaintenanceSummary["sealedRadarSnapshots"] = { refreshed: [], errors: [] };
  for (const gameFilter of [ALL_GAMES, POKEMON_GAME, ONE_PIECE_GAME] as const) {
    try {
      await refreshSharedSealedSignalRadarData(gameFilter);
      result.refreshed.push(gameFilter);
    } catch (error) {
      result.errors.push(
        `${gameFilter}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return result;
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

function normalizeImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function collectProtectedImageUrls(database: BetterSqlite3.Database): Set<string> {
  const imageRows = database
    .prepare(
      `SELECT image_url AS url FROM "Card"
       WHERE image_url IS NOT NULL AND TRIM(image_url) <> ''
       UNION
       SELECT logo_url AS url FROM "Episode"
       WHERE logo_url IS NOT NULL AND TRIM(logo_url) <> ''
       UNION
       SELECT image_url AS url FROM "SealedProduct"
       WHERE image_url IS NOT NULL AND TRIM(image_url) <> ''`
    )
    .all() as Array<{ url: string }>;
  const sourceRows = database
    .prepare(
      `SELECT metadata_json FROM "ExternalCatalystSource"
       WHERE game = 'pokemon' AND metadata_json IS NOT NULL`
    )
    .all() as Array<{ metadata_json: string }>;

  const urls = new Set<string>();
  for (const row of imageRows) {
    const normalized = normalizeImageUrl(row.url);
    if (normalized) urls.add(normalized);
  }
  for (const source of sourceRows) {
    for (const reveal of readStoredUpcomingReveals(source.metadata_json)) {
      const normalized = normalizeImageUrl(reveal.imageUrl);
      if (normalized) urls.add(normalized);
    }
  }
  return urls;
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
    protectedImageSources: 0,
    imageCache: null,
    moversSnapshots: { refreshed: [], errors: [] },
    sealedRadarSnapshots: { refreshed: [], errors: [] },
  };
  let protectedSourceUrls = new Set<string>();
  let collectionMoversSnapshotTargets: CollectionMoversSnapshotTarget[] = [];

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
    protectedSourceUrls = collectProtectedImageUrls(database);
    summary.protectedImageSources = protectedSourceUrls.size;
    collectionMoversSnapshotTargets = getCollectionMoversSnapshotTargets(database);
  } finally {
    database.close();
  }

  if (!summary.skipped) {
    summary.moversSnapshots = await refreshMoversSnapshots(collectionMoversSnapshotTargets);
    summary.sealedRadarSnapshots = await refreshSealedRadarSnapshots();
    const imageCacheDir = path.resolve(
      process.env.DUSTYCARDS_IMAGE_CACHE_DIR?.trim() ||
        path.join(process.cwd(), "data", "image-cache")
    );
    summary.imageCache = await trimImageCache(imageCacheDir, {
      maxEntries: IMAGE_CACHE_MAX_ENTRIES,
      maxBytes: IMAGE_CACHE_MAX_BYTES,
      maxResponsiveEntries: RESPONSIVE_CACHE_MAX_ENTRIES,
      maxResponsiveBytes: RESPONSIVE_CACHE_MAX_BYTES,
      protectedSourceUrls,
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
