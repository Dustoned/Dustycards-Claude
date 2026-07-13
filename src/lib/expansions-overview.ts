import { db } from "@/lib/db";
import { createSwrCache } from "@/lib/server-swr-cache";

const DAY_MS = 24 * 60 * 60 * 1000;
const OVERVIEW_HISTORY_DAYS = 365;

export interface ExpansionsOverviewHistoryRow {
  date: string;
  total_market: number | null;
  priced_cards: number | null;
}

export interface ExpansionCurrentValueRow {
  episode_id: string;
  total_market: number | null;
  priced_cards: number | bigint | null;
}

export interface ExpansionsOverviewPoint {
  date: string;
  label: string;
  value: number | null;
}

export interface ExpansionsOverviewHistoryPayload {
  points: ExpansionsOverviewPoint[];
  currentValue: number | null;
  pricedCardCount: number;
}

function placeholdersFor(values: unknown[]): string {
  return values.map(() => "?").join(", ");
}

function toDateLabel(dateKey: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${dateKey}T00:00:00.000Z`));
}

export async function getExpansionsOverviewHistory(episodeIds: string[]) {
  if (episodeIds.length === 0) {
    return [];
  }

  const cutoff = new Date(Date.now() - OVERVIEW_HISTORY_DAYS * DAY_MS).toISOString();
  const episodePlaceholders = placeholdersFor(episodeIds);

  return db.$queryRawUnsafe<ExpansionsOverviewHistoryRow[]>(
    `
    WITH visible_cards AS (
      SELECT c.id AS card_id
      FROM "Card" c
      WHERE c.episode_id IN (${episodePlaceholders})
    ),
    latest_before AS (
      SELECT
        card_id,
        DATE(?) AS day,
        0 AS sort_order,
        cm_market
      FROM (
        SELECT
          p.card_id,
          p.cm_en_lowest_nm AS cm_market,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS row_num
        FROM "Price" p
        INNER JOIN visible_cards vc ON vc.card_id = p.card_id
        WHERE p.fetched_at < ?
          AND p.cm_en_lowest_nm > 0
          AND p.cm_en_lowest_nm <> 9001
      )
      WHERE row_num = 1
    ),
    recent_daily AS (
      SELECT
        card_id,
        DATE(fetched_at) AS day,
        1 AS sort_order,
        cm_market
      FROM (
        SELECT
          p.card_id,
          p.fetched_at,
          p.cm_en_lowest_nm AS cm_market,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id, DATE(p.fetched_at)
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS row_num
        FROM "Price" p
        INNER JOIN visible_cards vc ON vc.card_id = p.card_id
        WHERE p.fetched_at >= ?
          AND p.cm_en_lowest_nm > 0
          AND p.cm_en_lowest_nm <> 9001
      )
      WHERE row_num = 1
    ),
    points AS (
      SELECT * FROM latest_before
      UNION ALL
      SELECT * FROM recent_daily
    ),
    deduped AS (
      SELECT card_id, day, cm_market
      FROM (
        SELECT
          card_id,
          day,
          cm_market,
          ROW_NUMBER() OVER (
            PARTITION BY card_id, day
            ORDER BY sort_order DESC
          ) AS row_num
        FROM points
      )
      WHERE row_num = 1
    ),
    changes AS (
      SELECT
        day,
        COALESCE(cm_market, 0) - COALESCE(
          LAG(cm_market) OVER (PARTITION BY card_id ORDER BY day),
          0
        ) AS value_delta,
        CASE WHEN cm_market IS NOT NULL THEN 1 ELSE 0 END - COALESCE(
          LAG(CASE WHEN cm_market IS NOT NULL THEN 1 ELSE 0 END) OVER (
            PARTITION BY card_id ORDER BY day
          ),
          0
        ) AS priced_delta
      FROM deduped
    ),
    daily_changes AS (
      SELECT
        day,
        SUM(value_delta) AS value_delta,
        SUM(priced_delta) AS priced_delta
      FROM changes
      GROUP BY day
    )
    SELECT
      day AS date,
      ROUND(
        SUM(value_delta) OVER (
          ORDER BY day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ),
        2
      ) AS total_market,
      SUM(priced_delta) OVER (
        ORDER BY day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS priced_cards
    FROM daily_changes
    ORDER BY day ASC
  `,
    ...episodeIds,
    cutoff,
    cutoff,
    cutoff
  );
}

// Current set totals per expansion — a heavy latest-price scan over every card
// in the visible sets, identical for all users (catalog data), so it is cached
// keyed by the exact set of episode ids. Fresh 5 min, stale up to 30 min.
const expansionCurrentValuesCache = createSwrCache<ExpansionCurrentValueRow[]>(
  5 * 60_000,
  30 * 60_000
);

export async function getExpansionCurrentValues(episodeIds: string[]) {
  if (episodeIds.length === 0) {
    return [];
  }

  const key = [...episodeIds].sort().join(",");
  return expansionCurrentValuesCache.get(key, () =>
    db.$queryRawUnsafe<ExpansionCurrentValueRow[]>(
      `
    WITH latest_card_prices AS (
      SELECT
        c.episode_id,
        p.cm_en_lowest_nm AS cm_market
      FROM "Card" c
      LEFT JOIN "Price" p
        ON p.id = (
          SELECT p2.id
          FROM "Price" p2
          WHERE p2.card_id = c.id
            AND p2.cm_en_lowest_nm > 0
            AND p2.cm_en_lowest_nm <> 9001
          ORDER BY p2.fetched_at DESC, p2.id DESC
          LIMIT 1
        )
      WHERE c.episode_id IN (${placeholdersFor(episodeIds)})
    )
    SELECT
      episode_id,
      ROUND(SUM(cm_market), 2) AS total_market,
      COUNT(cm_market) AS priced_cards
    FROM latest_card_prices
    WHERE cm_market IS NOT NULL
    GROUP BY episode_id
  `,
      ...episodeIds
    )
  );
}

export function buildExpansionsOverviewHistoryPayload(
  rows: ExpansionsOverviewHistoryRow[]
): ExpansionsOverviewHistoryPayload {
  const latestRow = rows[rows.length - 1] ?? null;

  return {
    points: rows.map((point) => ({
      date: point.date,
      label: toDateLabel(point.date),
      value: point.total_market == null ? null : Number(point.total_market),
    })),
    currentValue: latestRow?.total_market == null ? null : Number(latestRow.total_market),
    pricedCardCount: Number(latestRow?.priced_cards ?? 0),
  };
}
