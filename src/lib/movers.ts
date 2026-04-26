import { db } from "@/lib/db";
import { startPerformanceTimer } from "@/lib/performance-timing";
import {
  buildCardPriceHistory,
  getCardMarketValue,
  type CardPriceHistoryPoint,
  type CardPriceHistorySnapshot,
} from "@/lib/price-history";
import { KNOWN_RARITY_ORDER, normalizeRarityLabel } from "@/lib/rarity";
import type { PriceSource } from "@/lib/user-settings";

const DAY_MS = 1000 * 60 * 60 * 24;
const HISTORY_LOOKBACK_DAYS = 45;
const MIN_PERCENT_BASE_VALUE = 1;

type MoverSource = "cardmarket" | "tcgplayer";

type LatestPriceSnapshot = CardPriceHistorySnapshot;

interface OwnedCardRecord {
  id: string;
  name: string;
  card_number: string | null;
  rarity: string | null;
  image_url: string | null;
  episode: {
    id: string;
    name: string;
    code: string | null;
  };
  prices: LatestPriceSnapshot[];
  ownedCount: number;
}

interface RecentHistoryRow {
  card_id: string;
  fetched_at: Date;
  cm_en_lowest_nm: number | null;
  cm_de_lowest_nm: number | null;
  cm_fr_lowest_nm: number | null;
  cm_es_lowest_nm: number | null;
  cm_it_lowest_nm: number | null;
  tcp_market: number | null;
  cm_en_avg_7d: number | null;
  cm_en_avg_30d: number | null;
}

interface AllTimeHistorySummaryRow {
  card_id: string;
  cm_first_fetched_at: Date | null;
  cm_first_value: number | null;
  cm_low_fetched_at: Date | null;
  cm_low_value: number | null;
  cm_high_fetched_at: Date | null;
  cm_high_value: number | null;
  cm_history_points: number | null;
  tcp_first_fetched_at: Date | null;
  tcp_first_value: number | null;
  tcp_low_fetched_at: Date | null;
  tcp_low_value: number | null;
  tcp_high_fetched_at: Date | null;
  tcp_high_value: number | null;
  tcp_history_points: number | null;
}

interface MoverSeriesPoint {
  date: string;
  timestamp: number;
  value: number;
}

interface MoverWindowMetric {
  change: number;
  changePct: number | null;
  coveredDays: number;
}

interface PeakGapMetric {
  change: number;
  changePct: number | null;
}

interface AllTimeSourceSummary {
  firstFetchedAt: Date | null;
  firstValue: number | null;
  lowFetchedAt: Date | null;
  lowValue: number | null;
  highFetchedAt: Date | null;
  highValue: number | null;
  historyPoints: number;
}

interface LifetimeMoverMetrics {
  firstTrackedAt: string | null;
  firstPrice: number | null;
  lowAt: string | null;
  lowPrice: number | null;
  highAt: string | null;
  highPrice: number | null;
  trackedDays: number | null;
  lifetimeHistoryPoints: number;
  changeSinceTracked: MoverWindowMetric | null;
  changeFromLow: MoverWindowMetric | null;
  gapToPeak: PeakGapMetric | null;
}

interface EvaluatedMoverSource {
  key: MoverSource;
  label: "CardMarket" | "TCGPlayer";
  currency: "EUR" | "USD";
  currentPrice: number;
  historyPoints: number;
  series: MoverSeriesPoint[];
  change7d: MoverWindowMetric | null;
  change30d: MoverWindowMetric | null;
  lifetime: LifetimeMoverMetrics;
}

export interface MoverRecentPricePoint {
  date: string;
  label: string;
  value: number;
}

export interface CollectionMoverItem {
  cardId: string;
  name: string;
  imageUrl: string | null;
  cardNumber: string | null;
  rarity: string | null;
  normalizedRarity: string | null;
  episodeId: string;
  episodeName: string;
  episodeCode: string | null;
  ownedCount: number;
  source: MoverSource;
  sourceLabel: "CardMarket" | "TCGPlayer";
  currency: "EUR" | "USD";
  currentPrice: number;
  cardmarketPrice: number | null;
  tcgplayerPrice: number | null;
  latestFetchedAt: string;
  historyPoints: number;
  cardmarketHistoryPoints: number;
  tcgplayerHistoryPoints: number;
  lifetimeHistoryPoints: number;
  recentPriceSeries: MoverRecentPricePoint[];
  trackedDays: number | null;
  change7d: number | null;
  change7dPct: number | null;
  change7dCoveredDays: number | null;
  change30d: number | null;
  change30dPct: number | null;
  change30dCoveredDays: number | null;
  changeSinceTracked: number | null;
  changeSinceTrackedPct: number | null;
  changeSinceTrackedCoveredDays: number | null;
  changeFromLow: number | null;
  changeFromLowPct: number | null;
  changeFromLowCoveredDays: number | null;
  gapToPeak: number | null;
  gapToPeakPct: number | null;
  firstTrackedAt: string | null;
  firstPrice: number | null;
  lowAt: string | null;
  lowPrice: number | null;
  highAt: string | null;
  highPrice: number | null;
  rarityWeight: number;
  cheapnessWeight: number;
  moverScore: number;
}

export interface CollectionMoversData {
  preferredSource: PriceSource;
  trackedCards: number;
  eligibleCards: number;
  movers: CollectionMoverItem[];
  topOpportunities: CollectionMoverItem[];
  cheapestHighRarityMovers: CollectionMoverItem[];
  discountedHighRarity: CollectionMoverItem[];
  strongest7d: CollectionMoverItem | null;
  strongest30d: CollectionMoverItem | null;
}

const SQLITE_SAFE_CHUNK_SIZE = 200;

interface OwnedCollectionCardRow {
  card: {
    id: string;
    name: string;
    card_number: string | null;
    rarity: string | null;
    image_url: string | null;
    episode: {
      id: string;
      name: string;
      code: string | null;
    };
    prices: LatestPriceSnapshot[];
  };
}

function round(value: number, decimals = 2): number {
  return Number(value.toFixed(decimals));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toDateKey(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function toDateLabel(dateKey: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${dateKey}T00:00:00.000Z`));
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

function getCurrentSourceValue(
  snapshot: LatestPriceSnapshot | null | undefined,
  source: MoverSource
): number | null {
  if (!snapshot) {
    return null;
  }

  return source === "tcgplayer" ? snapshot.tcp_market ?? null : getCardMarketValue(snapshot);
}

function getHistorySourceValue(
  point: CardPriceHistoryPoint,
  source: MoverSource
): number | null {
  return source === "tcgplayer" ? point.tcp_market ?? null : point.cm_market ?? null;
}

function buildSeries(
  points: CardPriceHistoryPoint[],
  latestPrice: LatestPriceSnapshot | null,
  source: MoverSource
): MoverSeriesPoint[] {
  const series = points
    .map((point) => {
      const value = getHistorySourceValue(point, source);
      if (value == null) {
        return null;
      }

      return {
        date: point.date,
        timestamp: new Date(`${point.date}T00:00:00.000Z`).getTime(),
        value,
      } satisfies MoverSeriesPoint;
    })
    .filter((point): point is MoverSeriesPoint => Boolean(point));

  const latestValue = getCurrentSourceValue(latestPrice, source);
  if (latestPrice && latestValue != null) {
    const latestDate = toDateKey(latestPrice.fetched_at);
    const latestTimestamp = new Date(`${latestDate}T00:00:00.000Z`).getTime();
    const existingIndex = series.findIndex((point) => point.date === latestDate);

    if (existingIndex >= 0) {
      series[existingIndex] = {
        date: latestDate,
        timestamp: latestTimestamp,
        value: latestValue,
      };
    } else {
      series.push({
        date: latestDate,
        timestamp: latestTimestamp,
        value: latestValue,
      });
    }
  }

  return series.sort((a, b) => a.timestamp - b.timestamp);
}

function buildRecentPriceSeries(series: MoverSeriesPoint[]): MoverRecentPricePoint[] {
  return series.slice(-28).map((point) => ({
    date: point.date,
    label: toDateLabel(point.date),
    value: round(point.value),
  }));
}

function computeWindowMetric(
  series: MoverSeriesPoint[],
  desiredDays: number
): MoverWindowMetric | null {
  if (series.length < 2) {
    return null;
  }

  const latest = series[series.length - 1];
  const cutoff = latest.timestamp - desiredDays * DAY_MS;
  const baselineAtOrBeforeCutoff = [...series]
    .reverse()
    .find((point) => point.timestamp <= cutoff);
  const baseline =
    baselineAtOrBeforeCutoff ??
    series.find((point) => point.timestamp < latest.timestamp) ??
    null;

  if (!baseline || baseline.timestamp >= latest.timestamp) {
    return null;
  }

  const coveredDays = Math.max(1, Math.round((latest.timestamp - baseline.timestamp) / DAY_MS));
  const change = round(latest.value - baseline.value);
  const percentBase =
    baseline.value > 0 ? Math.max(baseline.value, MIN_PERCENT_BASE_VALUE) : null;
  const changePct = percentBase ? round((change / percentBase) * 100, 1) : null;

  return {
    change,
    changePct,
    coveredDays,
  };
}

function computeMetricFromBaseline(
  currentValue: number,
  currentAt: Date | string,
  baselineValue: number | null,
  baselineAt: Date | string | null | undefined
): MoverWindowMetric | null {
  if (baselineValue == null || !baselineAt) {
    return null;
  }

  const latestTimestamp = new Date(currentAt).getTime();
  const baselineTimestamp = new Date(baselineAt).getTime();

  if (!Number.isFinite(latestTimestamp) || !Number.isFinite(baselineTimestamp)) {
    return null;
  }

  const coveredDays = Math.max(1, Math.round((latestTimestamp - baselineTimestamp) / DAY_MS));
  const change = round(currentValue - baselineValue);
  const percentBase = baselineValue > 0 ? Math.max(baselineValue, MIN_PERCENT_BASE_VALUE) : null;
  const changePct = percentBase ? round((change / percentBase) * 100, 1) : null;

  return {
    change,
    changePct,
    coveredDays,
  };
}

function computeGapToPeakMetric(
  currentValue: number,
  peakValue: number | null
): PeakGapMetric | null {
  if (peakValue == null) {
    return null;
  }

  const change = round(currentValue - peakValue);
  const changePct =
    peakValue > 0 ? round((change / Math.max(peakValue, MIN_PERCENT_BASE_VALUE)) * 100, 1) : null;

  return {
    change,
    changePct,
  };
}

function getRarityWeight(rarity: string | null): number {
  const normalized = normalizeRarityLabel(rarity);
  if (!normalized) {
    return 1;
  }

  const index = KNOWN_RARITY_ORDER.indexOf(normalized as (typeof KNOWN_RARITY_ORDER)[number]);
  if (index === -1) {
    return 1.08;
  }

  return round(0.7 + (index / Math.max(KNOWN_RARITY_ORDER.length - 1, 1)) * 1.45, 2);
}

function getCheapnessWeight(currentPrice: number): number {
  // Bulk cards under 1 EUR/USD are usually too noisy to deserve the strongest cheapness boost.
  if (currentPrice <= 0.25) return 0.82;
  if (currentPrice <= 0.5) return 0.94;
  if (currentPrice <= 1) return 1.06;
  if (currentPrice <= 3) return 1.34;
  if (currentPrice <= 5) return 1.5;
  if (currentPrice <= 10) return 1.42;
  if (currentPrice <= 20) return 1.3;
  if (currentPrice <= 40) return 1.16;
  if (currentPrice <= 75) return 1.03;
  if (currentPrice <= 120) return 0.9;
  return 0.8;
}

function getMomentumScore(
  change7d: MoverWindowMetric | null,
  change30d: MoverWindowMetric | null
): number {
  const sevenDayCoverage = change7d ? Math.min(change7d.coveredDays / 7, 1) : 0;
  const thirtyDayCoverage = change30d ? Math.min(change30d.coveredDays / 30, 1) : 0;
  const sevenDayPercent = change7d?.changePct ?? 0;
  const thirtyDayPercent = change30d?.changePct ?? 0;
  const sevenDayAbsolute = change7d?.change ?? 0;
  const thirtyDayAbsolute = change30d?.change ?? 0;

  return (
    sevenDayPercent * 0.78 * sevenDayCoverage +
    thirtyDayPercent * 0.34 * thirtyDayCoverage +
    sevenDayAbsolute * 2.4 +
    thirtyDayAbsolute * 1.15
  );
}

function getLifetimeScore(
  lifetime: LifetimeMoverMetrics,
  recentPositive: boolean
): number {
  const trackedCoverage =
    lifetime.changeSinceTracked ? Math.min(lifetime.changeSinceTracked.coveredDays / 180, 1) : 0;
  const sinceTrackedPct = clamp(lifetime.changeSinceTracked?.changePct ?? 0, -120, 280);
  const sinceTrackedAbs = lifetime.changeSinceTracked?.change ?? 0;
  const fromLowPct = clamp(lifetime.changeFromLow?.changePct ?? 0, 0, 260);
  const gapBelowPeakPct =
    lifetime.gapToPeak?.changePct != null && lifetime.gapToPeak.changePct < 0
      ? Math.min(Math.abs(lifetime.gapToPeak.changePct), 70)
      : 0;

  return (
    sinceTrackedPct * 0.07 * trackedCoverage +
    sinceTrackedAbs * 0.55 * trackedCoverage +
    fromLowPct * 0.025 +
    gapBelowPeakPct * (recentPositive ? 0.03 : 0.01)
  );
}

function hasMeaningfulMove(
  change7d: MoverWindowMetric | null,
  change30d: MoverWindowMetric | null
): boolean {
  const biggestPercent = Math.max(
    Math.abs(change7d?.changePct ?? 0),
    Math.abs(change30d?.changePct ?? 0)
  );
  const biggestAbsolute = Math.max(
    Math.abs(change7d?.change ?? 0),
    Math.abs(change30d?.change ?? 0)
  );
  return biggestPercent >= 4 || biggestAbsolute >= 0.75;
}

function buildLifetimeMetrics(
  currentPrice: number,
  currentAt: Date | string,
  summary: AllTimeSourceSummary
): LifetimeMoverMetrics {
  const changeSinceTracked = computeMetricFromBaseline(
    currentPrice,
    currentAt,
    summary.firstValue,
    summary.firstFetchedAt
  );
  const changeFromLow = computeMetricFromBaseline(
    currentPrice,
    currentAt,
    summary.lowValue,
    summary.lowFetchedAt
  );
  const gapToPeak = computeGapToPeakMetric(currentPrice, summary.highValue);
  const trackedDays = summary.firstFetchedAt
    ? Math.max(
        1,
        Math.round(
          (new Date(currentAt).getTime() - new Date(summary.firstFetchedAt).getTime()) / DAY_MS
        )
      )
    : null;

  return {
    firstTrackedAt: toIsoOrNull(summary.firstFetchedAt),
    firstPrice: summary.firstValue != null ? round(summary.firstValue) : null,
    lowAt: toIsoOrNull(summary.lowFetchedAt),
    lowPrice: summary.lowValue != null ? round(summary.lowValue) : null,
    highAt: toIsoOrNull(summary.highFetchedAt),
    highPrice: summary.highValue != null ? round(summary.highValue) : null,
    trackedDays,
    lifetimeHistoryPoints: summary.historyPoints,
    changeSinceTracked,
    changeFromLow,
    gapToPeak,
  };
}

function evaluateSource(
  latestPrice: LatestPriceSnapshot | null,
  historyPoints: CardPriceHistoryPoint[],
  source: MoverSource,
  allTimeSummary: AllTimeSourceSummary
): EvaluatedMoverSource | null {
  const currentPrice = getCurrentSourceValue(latestPrice, source);
  if (currentPrice == null) {
    return null;
  }

  const series = buildSeries(historyPoints, latestPrice, source);
  if (series.length < 2) {
    return null;
  }

  return {
    key: source,
    label: source === "tcgplayer" ? "TCGPlayer" : "CardMarket",
    currency: source === "tcgplayer" ? "USD" : "EUR",
    currentPrice,
    historyPoints: series.length,
    series,
    change7d: computeWindowMetric(series, 7),
    change30d: computeWindowMetric(series, 30),
    lifetime: buildLifetimeMetrics(currentPrice, latestPrice?.fetched_at ?? new Date(), allTimeSummary),
  };
}

function resolveBestSource(
  latestPrice: LatestPriceSnapshot | null,
  historyPoints: CardPriceHistoryPoint[],
  preferredSource: PriceSource,
  allTimeSummaries: Record<MoverSource, AllTimeSourceSummary>
): EvaluatedMoverSource | null {
  const sourceOrder: MoverSource[] =
    preferredSource === "tcp"
      ? ["tcgplayer", "cardmarket"]
      : ["cardmarket", "tcgplayer"];

  const evaluated = sourceOrder
    .map((source) => evaluateSource(latestPrice, historyPoints, source, allTimeSummaries[source]))
    .filter((value): value is EvaluatedMoverSource => Boolean(value));

  if (evaluated.length === 0) {
    return null;
  }

  return (
    evaluated.find((entry) => entry.change7d != null || entry.change30d != null) ?? evaluated[0]
  );
}

async function fetchOwnedCards(): Promise<OwnedCardRecord[]> {
  const records: OwnedCollectionCardRow[] = [];
  let skip = 0;

  while (true) {
    const page = await db.collectionCard.findMany({
      orderBy: [{ id: "asc" }],
      skip,
      take: SQLITE_SAFE_CHUNK_SIZE,
      select: {
        card: {
          select: {
            id: true,
            name: true,
            card_number: true,
            rarity: true,
            image_url: true,
            episode: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            prices: {
              orderBy: {
                fetched_at: "desc",
              },
              take: 1,
              select: {
                fetched_at: true,
                cm_en_lowest_nm: true,
                cm_de_lowest_nm: true,
                cm_fr_lowest_nm: true,
                cm_es_lowest_nm: true,
                cm_it_lowest_nm: true,
                tcp_market: true,
                cm_en_avg_7d: true,
                cm_en_avg_30d: true,
              },
            },
          },
        },
      },
    });

    records.push(...(page as OwnedCollectionCardRow[]));

    if (page.length < SQLITE_SAFE_CHUNK_SIZE) {
      break;
    }

    skip += page.length;
  }

  const byCardId = new Map<string, OwnedCardRecord>();

  for (const record of records) {
    const existing = byCardId.get(record.card.id);

    if (existing) {
      existing.ownedCount += 1;
      continue;
    }

    byCardId.set(record.card.id, {
      id: record.card.id,
      name: record.card.name,
      card_number: record.card.card_number,
      rarity: record.card.rarity,
      image_url: record.card.image_url,
      episode: {
        id: record.card.episode.id,
        name: record.card.episode.name,
        code: record.card.episode.code,
      },
      prices: record.card.prices,
      ownedCount: 1,
    });
  }

  return [...byCardId.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

export async function getCollectionMovers(
  preferredSource: PriceSource
): Promise<CollectionMoversData> {
  const timer = startPerformanceTimer("movers.collection", { preferredSource });
  const historyCutoff = new Date(Date.now() - HISTORY_LOOKBACK_DAYS * DAY_MS);

  const [ownedCards, recentHistoryRows, allTimeHistorySummaries] = await Promise.all([
    fetchOwnedCards(),
    db.$queryRaw<RecentHistoryRow[]>`
      WITH owned_cards AS (
        SELECT DISTINCT card_id
        FROM "CollectionCard"
      )
      SELECT
        card_id,
        fetched_at,
        cm_en_lowest_nm,
        cm_de_lowest_nm,
        cm_fr_lowest_nm,
        cm_es_lowest_nm,
        cm_it_lowest_nm,
        tcp_market,
        cm_en_avg_7d,
        cm_en_avg_30d
      FROM (
        SELECT
          p.card_id,
          p.fetched_at,
          p.cm_en_lowest_nm,
          p.cm_de_lowest_nm,
          p.cm_fr_lowest_nm,
          p.cm_es_lowest_nm,
          p.cm_it_lowest_nm,
          p.tcp_market,
          p.cm_en_avg_7d,
          p.cm_en_avg_30d,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id, DATE(p.fetched_at)
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS row_num
        FROM "Price" p
        INNER JOIN owned_cards oc ON oc.card_id = p.card_id
        WHERE p.fetched_at >= ${historyCutoff}
      )
      WHERE row_num = 1
      ORDER BY card_id ASC, fetched_at ASC
    `,
    db.$queryRaw<AllTimeHistorySummaryRow[]>`
      WITH owned_cards AS (
        SELECT DISTINCT card_id
        FROM "CollectionCard"
      ),
      price_points AS (
        SELECT
          p.card_id,
          p.id,
          p.fetched_at,
          COALESCE(
            p.cm_en_lowest_nm,
            p.cm_de_lowest_nm,
            p.cm_fr_lowest_nm,
            p.cm_es_lowest_nm,
            p.cm_it_lowest_nm
          ) AS cm_market,
          p.tcp_market
        FROM "Price" p
        INNER JOIN owned_cards oc ON oc.card_id = p.card_id
      ),
      cm_points AS (
        SELECT *
        FROM price_points
        WHERE cm_market IS NOT NULL
      ),
      cm_first AS (
        SELECT card_id, fetched_at AS cm_first_fetched_at, cm_market AS cm_first_value
        FROM (
          SELECT
            card_id,
            fetched_at,
            cm_market,
            ROW_NUMBER() OVER (
              PARTITION BY card_id
              ORDER BY fetched_at ASC, id ASC
            ) AS row_num
          FROM cm_points
        )
        WHERE row_num = 1
      ),
      cm_low AS (
        SELECT card_id, fetched_at AS cm_low_fetched_at, cm_market AS cm_low_value
        FROM (
          SELECT
            card_id,
            fetched_at,
            cm_market,
            ROW_NUMBER() OVER (
              PARTITION BY card_id
              ORDER BY cm_market ASC, fetched_at ASC, id ASC
            ) AS row_num
          FROM cm_points
        )
        WHERE row_num = 1
      ),
      cm_high AS (
        SELECT card_id, fetched_at AS cm_high_fetched_at, cm_market AS cm_high_value
        FROM (
          SELECT
            card_id,
            fetched_at,
            cm_market,
            ROW_NUMBER() OVER (
              PARTITION BY card_id
              ORDER BY cm_market DESC, fetched_at ASC, id ASC
            ) AS row_num
          FROM cm_points
        )
        WHERE row_num = 1
      ),
      cm_counts AS (
        SELECT
          card_id,
          COUNT(DISTINCT DATE(fetched_at)) AS cm_history_points
        FROM cm_points
        GROUP BY card_id
      ),
      tcp_points AS (
        SELECT *
        FROM price_points
        WHERE tcp_market IS NOT NULL
      ),
      tcp_first AS (
        SELECT card_id, fetched_at AS tcp_first_fetched_at, tcp_market AS tcp_first_value
        FROM (
          SELECT
            card_id,
            fetched_at,
            tcp_market,
            ROW_NUMBER() OVER (
              PARTITION BY card_id
              ORDER BY fetched_at ASC, id ASC
            ) AS row_num
          FROM tcp_points
        )
        WHERE row_num = 1
      ),
      tcp_low AS (
        SELECT card_id, fetched_at AS tcp_low_fetched_at, tcp_market AS tcp_low_value
        FROM (
          SELECT
            card_id,
            fetched_at,
            tcp_market,
            ROW_NUMBER() OVER (
              PARTITION BY card_id
              ORDER BY tcp_market ASC, fetched_at ASC, id ASC
            ) AS row_num
          FROM tcp_points
        )
        WHERE row_num = 1
      ),
      tcp_high AS (
        SELECT card_id, fetched_at AS tcp_high_fetched_at, tcp_market AS tcp_high_value
        FROM (
          SELECT
            card_id,
            fetched_at,
            tcp_market,
            ROW_NUMBER() OVER (
              PARTITION BY card_id
              ORDER BY tcp_market DESC, fetched_at ASC, id ASC
            ) AS row_num
          FROM tcp_points
        )
        WHERE row_num = 1
      ),
      tcp_counts AS (
        SELECT
          card_id,
          COUNT(DISTINCT DATE(fetched_at)) AS tcp_history_points
        FROM tcp_points
        GROUP BY card_id
      )
      SELECT
        oc.card_id,
        cm_first.cm_first_fetched_at,
        cm_first.cm_first_value,
        cm_low.cm_low_fetched_at,
        cm_low.cm_low_value,
        cm_high.cm_high_fetched_at,
        cm_high.cm_high_value,
        cm_counts.cm_history_points,
        tcp_first.tcp_first_fetched_at,
        tcp_first.tcp_first_value,
        tcp_low.tcp_low_fetched_at,
        tcp_low.tcp_low_value,
        tcp_high.tcp_high_fetched_at,
        tcp_high.tcp_high_value,
        tcp_counts.tcp_history_points
      FROM owned_cards oc
      LEFT JOIN cm_first ON cm_first.card_id = oc.card_id
      LEFT JOIN cm_low ON cm_low.card_id = oc.card_id
      LEFT JOIN cm_high ON cm_high.card_id = oc.card_id
      LEFT JOIN cm_counts ON cm_counts.card_id = oc.card_id
      LEFT JOIN tcp_first ON tcp_first.card_id = oc.card_id
      LEFT JOIN tcp_low ON tcp_low.card_id = oc.card_id
      LEFT JOIN tcp_high ON tcp_high.card_id = oc.card_id
      LEFT JOIN tcp_counts ON tcp_counts.card_id = oc.card_id
      ORDER BY oc.card_id ASC
    `,
  ]);

  const historyRowsByCardId = new Map<string, CardPriceHistorySnapshot[]>();
  for (const row of recentHistoryRows) {
    const existing = historyRowsByCardId.get(row.card_id);
    if (existing) {
      existing.push(row);
    } else {
      historyRowsByCardId.set(row.card_id, [row]);
    }
  }

  const allTimeSummariesByCardId = new Map<
    string,
    Record<MoverSource, AllTimeSourceSummary>
  >();
  for (const row of allTimeHistorySummaries) {
    allTimeSummariesByCardId.set(row.card_id, {
      cardmarket: {
        firstFetchedAt: row.cm_first_fetched_at,
        firstValue: row.cm_first_value,
        lowFetchedAt: row.cm_low_fetched_at,
        lowValue: row.cm_low_value,
        highFetchedAt: row.cm_high_fetched_at,
        highValue: row.cm_high_value,
        historyPoints: Number(row.cm_history_points ?? 0),
      },
      tcgplayer: {
        firstFetchedAt: row.tcp_first_fetched_at,
        firstValue: row.tcp_first_value,
        lowFetchedAt: row.tcp_low_fetched_at,
        lowValue: row.tcp_low_value,
        highFetchedAt: row.tcp_high_fetched_at,
        highValue: row.tcp_high_value,
        historyPoints: Number(row.tcp_history_points ?? 0),
      },
    });
  }

  const movers: CollectionMoverItem[] = [];

  for (const card of ownedCards as OwnedCardRecord[]) {
    const latestPrice = card.prices[0] ?? null;
    const historyPoints = buildCardPriceHistory(historyRowsByCardId.get(card.id) ?? []);
    const allTimeSummary =
      allTimeSummariesByCardId.get(card.id) ??
      ({
        cardmarket: {
          firstFetchedAt: null,
          firstValue: null,
          lowFetchedAt: null,
          lowValue: null,
          highFetchedAt: null,
          highValue: null,
          historyPoints: 0,
        },
        tcgplayer: {
          firstFetchedAt: null,
          firstValue: null,
          lowFetchedAt: null,
          lowValue: null,
          highFetchedAt: null,
          highValue: null,
          historyPoints: 0,
        },
      } satisfies Record<MoverSource, AllTimeSourceSummary>);
    const resolvedSource = resolveBestSource(
      latestPrice,
      historyPoints,
      preferredSource,
      allTimeSummary
    );

    if (!resolvedSource) {
      continue;
    }

    if (!hasMeaningfulMove(resolvedSource.change7d, resolvedSource.change30d)) {
      continue;
    }

    const rarityWeight = getRarityWeight(card.rarity);
    const cheapnessWeight = getCheapnessWeight(resolvedSource.currentPrice);
    const cardmarketPrice = getCurrentSourceValue(latestPrice, "cardmarket");
    const tcgplayerPrice = getCurrentSourceValue(latestPrice, "tcgplayer");
    const recentPositive =
      (resolvedSource.change7d?.change ?? 0) > 0 || (resolvedSource.change30d?.change ?? 0) > 0;
    const moverScore = round(
      (getMomentumScore(resolvedSource.change7d, resolvedSource.change30d) +
        getLifetimeScore(resolvedSource.lifetime, recentPositive)) *
        rarityWeight *
        cheapnessWeight
    );

    movers.push({
      cardId: card.id,
      name: card.name,
      imageUrl: card.image_url,
      cardNumber: card.card_number,
      rarity: card.rarity,
      normalizedRarity: normalizeRarityLabel(card.rarity),
      episodeId: card.episode.id,
      episodeName: card.episode.name,
      episodeCode: card.episode.code,
      ownedCount: card.ownedCount,
      source: resolvedSource.key,
      sourceLabel: resolvedSource.label,
      currency: resolvedSource.currency,
      currentPrice: round(resolvedSource.currentPrice),
      cardmarketPrice: cardmarketPrice != null ? round(cardmarketPrice) : null,
      tcgplayerPrice: tcgplayerPrice != null ? round(tcgplayerPrice) : null,
      latestFetchedAt: latestPrice
        ? new Date(latestPrice.fetched_at).toISOString()
        : new Date().toISOString(),
      historyPoints: resolvedSource.historyPoints,
      cardmarketHistoryPoints: allTimeSummary.cardmarket.historyPoints,
      tcgplayerHistoryPoints: allTimeSummary.tcgplayer.historyPoints,
      lifetimeHistoryPoints: resolvedSource.lifetime.lifetimeHistoryPoints,
      recentPriceSeries: buildRecentPriceSeries(resolvedSource.series),
      trackedDays: resolvedSource.lifetime.trackedDays,
      change7d: resolvedSource.change7d?.change ?? null,
      change7dPct: resolvedSource.change7d?.changePct ?? null,
      change7dCoveredDays: resolvedSource.change7d?.coveredDays ?? null,
      change30d: resolvedSource.change30d?.change ?? null,
      change30dPct: resolvedSource.change30d?.changePct ?? null,
      change30dCoveredDays: resolvedSource.change30d?.coveredDays ?? null,
      changeSinceTracked: resolvedSource.lifetime.changeSinceTracked?.change ?? null,
      changeSinceTrackedPct: resolvedSource.lifetime.changeSinceTracked?.changePct ?? null,
      changeSinceTrackedCoveredDays: resolvedSource.lifetime.changeSinceTracked?.coveredDays ?? null,
      changeFromLow: resolvedSource.lifetime.changeFromLow?.change ?? null,
      changeFromLowPct: resolvedSource.lifetime.changeFromLow?.changePct ?? null,
      changeFromLowCoveredDays: resolvedSource.lifetime.changeFromLow?.coveredDays ?? null,
      gapToPeak: resolvedSource.lifetime.gapToPeak?.change ?? null,
      gapToPeakPct: resolvedSource.lifetime.gapToPeak?.changePct ?? null,
      firstTrackedAt: resolvedSource.lifetime.firstTrackedAt,
      firstPrice: resolvedSource.lifetime.firstPrice,
      lowAt: resolvedSource.lifetime.lowAt,
      lowPrice: resolvedSource.lifetime.lowPrice,
      highAt: resolvedSource.lifetime.highAt,
      highPrice: resolvedSource.lifetime.highPrice,
      rarityWeight,
      cheapnessWeight,
      moverScore,
    });
  }

  const sortedMovers = [...movers].sort((a, b) => {
    if (b.moverScore !== a.moverScore) {
      return b.moverScore - a.moverScore;
    }

    const changeDiff = (b.change7dPct ?? b.change30dPct ?? -Infinity) -
      (a.change7dPct ?? a.change30dPct ?? -Infinity);
    if (changeDiff !== 0) {
      return changeDiff;
    }

    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  const topOpportunities = sortedMovers
    .filter((item) => item.moverScore > 0 && item.currentPrice <= 60 && item.rarityWeight >= 1.15)
    .slice(0, 12);
  const cheapestHighRarityMovers = sortedMovers
    .filter((item) => item.moverScore > 0 && item.currentPrice <= 25 && item.rarityWeight >= 1.15)
    .slice(0, 16);
  const discountedHighRarity = [...sortedMovers]
    .filter((item) => {
      const hasDeepDiscount = (item.gapToPeakPct ?? 0) <= -25;
      const hasRecentWeakness =
        (item.change7dPct ?? 0) < 0 || (item.change30dPct ?? 0) < 0 || item.moverScore < 0;

      return (
        item.rarityWeight >= 1.15 &&
        item.currentPrice <= 50 &&
        hasDeepDiscount &&
        hasRecentWeakness
      );
    })
    .sort((a, b) => {
      const peakGapDiff = (a.gapToPeakPct ?? 0) - (b.gapToPeakPct ?? 0);
      if (peakGapDiff !== 0) {
        return peakGapDiff;
      }

      if (a.currentPrice !== b.currentPrice) {
        return a.currentPrice - b.currentPrice;
      }

      if (a.moverScore !== b.moverScore) {
        return a.moverScore - b.moverScore;
      }

      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  const strongest7d =
    [...sortedMovers]
      .filter((item) => (item.change7dPct ?? 0) > 0)
      .sort((a, b) => (b.change7dPct ?? 0) - (a.change7dPct ?? 0))[0] ?? null;
  const strongest30d =
    [...sortedMovers]
      .filter((item) => (item.change30dPct ?? 0) > 0)
      .sort((a, b) => (b.change30dPct ?? 0) - (a.change30dPct ?? 0))[0] ?? null;

  const result = {
    preferredSource,
    trackedCards: ownedCards.length,
    eligibleCards: sortedMovers.length,
    movers: sortedMovers,
    topOpportunities,
    cheapestHighRarityMovers,
    discountedHighRarity,
    strongest7d,
    strongest30d,
  };

  timer.finish({
    trackedCards: result.trackedCards,
    eligibleCards: result.eligibleCards,
    historyRows: recentHistoryRows.length,
  });

  return result;
}
