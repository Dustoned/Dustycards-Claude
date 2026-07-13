import { db } from "@/lib/db";
import { createSwrCache } from "@/lib/server-swr-cache";

export interface EpisodeSetPriceSnapshotRow {
  card_id: string;
  fetched_at: string;
  cm_en_lowest_nm: number | null;
  cm_de_lowest_nm: number | null;
  cm_fr_lowest_nm: number | null;
  cm_es_lowest_nm: number | null;
  cm_it_lowest_nm: number | null;
  cm_jp_lowest_nm: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const EPISODE_SET_HISTORY_DAYS = 120;

// The per-set daily price-history snapshot rows (latest price per card per day).
// This is a heavy window-function scan over the Price table and is identical for
// every user — pure catalog data that only changes when prices sync — so it is
// cached in-process. Fresh 5 min, stale-served up to 30 min while it refreshes.
const cache = createSwrCache<EpisodeSetPriceSnapshotRow[]>(5 * 60_000, 30 * 60_000);

export function getEpisodeSetPriceSnapshotRows(
  episodeId: string
): Promise<EpisodeSetPriceSnapshotRow[]> {
  const cutoff = new Date(Date.now() - EPISODE_SET_HISTORY_DAYS * DAY_MS).toISOString();

  return cache.get(`${episodeId}:${EPISODE_SET_HISTORY_DAYS}d`, async () => {
    const rows = await db.$queryRaw<
      Array<{
        card_id: string;
        fetched_at: Date | string;
        cm_en_lowest_nm: number | null;
        cm_de_lowest_nm: number | null;
        cm_fr_lowest_nm: number | null;
        cm_es_lowest_nm: number | null;
        cm_it_lowest_nm: number | null;
        cm_jp_lowest_nm: number | null;
      }>
    >`
      SELECT
        card_id,
        fetched_at,
        cm_en_lowest_nm,
        cm_de_lowest_nm,
        cm_fr_lowest_nm,
        cm_es_lowest_nm,
        cm_it_lowest_nm,
        cm_jp_lowest_nm
      FROM (
        SELECT
          p.card_id,
          p.fetched_at,
          p.cm_en_lowest_nm,
          p.cm_de_lowest_nm,
          p.cm_fr_lowest_nm,
          p.cm_es_lowest_nm,
          p.cm_it_lowest_nm,
          p.cm_jp_lowest_nm,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id, DATE(p.fetched_at)
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS row_num
        FROM "Price" p
        INNER JOIN "Card" c ON c.id = p.card_id
        WHERE c.episode_id = ${episodeId}
          AND p.fetched_at >= ${cutoff}
          AND p.cm_en_lowest_nm > 0
          AND p.cm_en_lowest_nm <> 9001
      )
      WHERE row_num = 1
      ORDER BY fetched_at ASC, card_id ASC
    `;

    return rows.map((row) => ({
      card_id: row.card_id,
      fetched_at: new Date(row.fetched_at).toISOString(),
      cm_en_lowest_nm: row.cm_en_lowest_nm,
      cm_de_lowest_nm: row.cm_de_lowest_nm,
      cm_fr_lowest_nm: row.cm_fr_lowest_nm,
      cm_es_lowest_nm: row.cm_es_lowest_nm,
      cm_it_lowest_nm: row.cm_it_lowest_nm,
      cm_jp_lowest_nm: row.cm_jp_lowest_nm,
    }));
  });
}
