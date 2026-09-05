import "server-only";

import { loadSafeCardMarketHistoryRows } from "@/lib/card-market-history";
import { db } from "@/lib/db";
import {
  deriveEbayDemandIntelligence,
  type EbayDemandSignalSnapshot,
} from "@/lib/ebay-demand-signal";
import { EBAY_DEMAND_COHORT_REVISION_AT } from "@/lib/ebay-demand";
import { getEbayDemandRuntimeConfig } from "@/lib/ebay";
import {
  getEpisodeSetPriceSnapshotRows,
  type EpisodeSetPriceSnapshotRow,
} from "@/lib/episode-set-prices";
import { convertUsdToEur, getUsdToEurRate } from "@/lib/exchange-rates";
import { getExternalEntityKey } from "@/lib/external-event-candidates";
import {
  alignConfluenceWithScenario,
  alignOpportunityScoreWithScenario,
  buildPriceScenario,
  calculateGoldMineConfluence,
  calculateHypeResetSupport,
  calculateOpportunityScores,
  calculateScarcityScore,
  calculateSealedPressure,
  calculateSetRarityPosition,
  classifySealedProduct,
  countPsa10HistoryDays,
  getGradedSupplyLabel,
  hasActiveReprintRisk,
  type ExtendedPriceHistoryFeatures,
} from "@/lib/external-market-intelligence-core";
import type {
  ExternalCardSignal,
  ExternalGradedIntelligence,
  ExternalMarketIntelligence,
  ExternalSealedIntelligence,
} from "@/lib/external-signal-radar";
import type { TradingCardGame } from "@/lib/games";
import { normalizeRarityLabel } from "@/lib/rarity";
import { loadPostLaunchReratingMetrics } from "@/lib/post-launch-rerating-server";
import {
  buildDailyMarketHistory,
  calculateRobustPriceTrend,
  type DailyMarketValue,
} from "@/lib/robust-price-history";
import { createSwrCache } from "@/lib/server-swr-cache";
import type { SetLifecycleStatus } from "@/lib/set-lifecycle-core";

const DAY_MS = 86_400_000;
const CARD_CHUNK_SIZE = 50;
const marketIntelligenceCache = createSwrCache<ExternalCardSignal[]>(5 * 60_000, 30 * 60_000);
const FORECAST_MODEL_VERSION = "signed-market-v8-evidence-quality";

const LIFECYCLE_COPY: Record<
  SetLifecycleStatus,
  { label: string; summary: string }
> = {
  upcoming: {
    label: "Upcoming",
    summary: "This set has not released yet, so supply signals are still provisional.",
  },
  launch_window: {
    label: "Launch window",
    summary: "Launch supply is still settling; temporary shortages are not treated as out of print.",
  },
  actively_supplied: {
    label: "Actively supplied",
    summary: "Recent product observations still show active set supply.",
  },
  supply_tightening: {
    label: "Supply tightening",
    summary: "Observed sealed supply is tightening, but out-of-print status is not confirmed.",
  },
  likely_out_of_print: {
    label: "Likely out of print",
    summary: "Multiple set-level observations point to an ended print cycle; no official confirmation was found.",
  },
  confirmed_out_of_print: {
    label: "Confirmed out of print",
    summary: "An authoritative source explicitly indicates that this set is out of print.",
  },
  reprint_restock: {
    label: "Reprint / restock",
    summary: "A recent reprint or meaningful restock indicates renewed supply.",
  },
  unknown_historical: {
    label: "History incomplete",
    summary: "There is not enough fresh set-level supply history for a reliable lifecycle call yet.",
  },
};

function parseLifecycleStatus(value: string): SetLifecycleStatus | null {
  return Object.prototype.hasOwnProperty.call(LIFECYCLE_COPY, value)
    ? (value as SetLifecycleStatus)
    : null;
}

function lifecycleCopyFromEvidence(value: string | null): {
  label: string;
  summary: string;
} | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as {
      assessment?: { label?: unknown; summary?: unknown };
    };
    const label = parsed.assessment?.label;
    const summary = parsed.assessment?.summary;
    return typeof label === "string" && typeof summary === "string"
      ? { label, summary }
      : null;
  } catch {
    return null;
  }
}

function lifecycleFields(
  observation:
    | {
        status: string;
        oop_probability: number;
        confidence: number;
        observed_at: Date;
        evidence_json: string | null;
      }
    | null
    | undefined
): Pick<
  ExternalSealedIntelligence,
  | "lifecycleStatus"
  | "lifecycleLabel"
  | "lifecycleConfidence"
  | "lifecycleOopProbability"
  | "lifecycleAsOf"
  | "lifecycleSummary"
> {
  const status = observation ? parseLifecycleStatus(observation.status) : null;
  if (!observation || !status) {
    return {
      lifecycleStatus: null,
      lifecycleLabel: null,
      lifecycleConfidence: null,
      lifecycleOopProbability: null,
      lifecycleAsOf: null,
      lifecycleSummary: null,
    };
  }
  const copy = lifecycleCopyFromEvidence(observation.evidence_json) ?? LIFECYCLE_COPY[status];
  const confidence = Math.round(observation.confidence);
  return {
    lifecycleStatus: status,
    lifecycleLabel: copy.label,
    lifecycleConfidence: confidence,
    // A low-confidence historical prior is not an actionable probability.
    // Keep the honest lifecycle label, but show "Learning" instead of a
    // precise percentage until the observation has enough evidence.
    lifecycleOopProbability:
      confidence >= 45 ? Math.round(observation.oop_probability) : null,
    lifecycleAsOf: observation.observed_at.toISOString(),
    lifecycleSummary: copy.summary,
  };
}

async function loadEbayDemandCacheVersion(cardIds: string[]): Promise<string> {
  if (cardIds.length === 0) return "none";
  const marketplaceId = getEbayDemandRuntimeConfig().marketplaceId;
  const rows = await db.cardEbayDemandSnapshot.findMany({
    where: {
      card_id: { in: cardIds },
      marketplace_id: marketplaceId,
      mode: { in: ["raw", "graded"] },
      updated_at: { gte: EBAY_DEMAND_COHORT_REVISION_AT },
    },
    orderBy: [{ updated_at: "desc" }, { id: "desc" }],
    select: { card_id: true, mode: true, updated_at: true },
  });
  const latestByCard = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.card_id}:${row.mode}`;
    if (!latestByCard.has(key)) latestByCard.set(key, row.updated_at.getTime());
  }
  return [...latestByCard]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([cardId, updatedAt]) => `${cardId}:${updatedAt}`)
    .join("|") || "none";
}

function firstPositive(values: Array<number | null | undefined>): number | null {
  return values.find((value): value is number => value != null && Number.isFinite(value) && value > 0) ?? null;
}

function sealedValue(product: {
  cm_avg_7d: number | null;
  cm_lowest: number | null;
  cm_lowest_eu: number | null;
  cm_lowest_de: number | null;
  cm_lowest_fr: number | null;
  cm_lowest_es: number | null;
  cm_lowest_it: number | null;
}): number | null {
  return firstPositive([
    product.cm_avg_7d,
    product.cm_lowest,
    product.cm_lowest_eu,
    product.cm_lowest_de,
    product.cm_lowest_fr,
    product.cm_lowest_es,
    product.cm_lowest_it,
  ]);
}

function releaseAgeYears(value: string | null, now: Date): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Number((Math.max(0, now.getTime() - timestamp) / (DAY_MS * 365.25)).toFixed(1));
}

function isUsableMarketValue(value: number | null): value is number {
  return value != null && Number.isFinite(value) && value > 0 && value !== 9001;
}

function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/** Sample stdev of day-over-day pct returns over the trailing 90 days. */
function calculateDailyVolatilityPct(
  history: readonly DailyMarketValue[]
): number | null {
  const latest = history.at(-1);
  if (!latest) return null;
  const cutoff = latest.day.getTime() - 90 * DAY_MS;
  const window = history.filter((point) => point.day.getTime() >= cutoff);
  if (window.length < 20) return null;
  const returns: number[] = [];
  for (let index = 1; index < window.length; index += 1) {
    returns.push(((window[index].value - window[index - 1].value) / window[index - 1].value) * 100);
  }
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (returns.length - 1);
  return Number(Math.sqrt(variance).toFixed(2));
}

function calculateAthDistancePct(
  history: readonly DailyMarketValue[]
): number | null {
  if (history.length < 60) return null;
  const current = history[history.length - 1].value;
  let allTimeHigh = 0;
  for (const point of history) allTimeHigh = Math.max(allTimeHigh, point.value);
  if (allTimeHigh <= 0) return null;
  return Number((((current - allTimeHigh) / allTimeHigh) * 100).toFixed(1));
}

// Mirrors calculateRobustPriceTrend for a 365d window; the shared helper only
// accepts the 30/90/180 horizons, so the long-horizon coverage gates (same
// span/unique-days progression) live here.
const MOMENTUM_365_COVERAGE = { spanDays: 240, uniqueDays: 24 };

function calculateMomentum365Pct(
  history: readonly DailyMarketValue[]
): number | null {
  const latest = history.at(-1);
  if (!latest || history.length < MOMENTUM_365_COVERAGE.uniqueDays) return null;
  const cutoff = latest.day.getTime() - 365 * DAY_MS;
  const window = history.filter((point) => point.day.getTime() >= cutoff);
  if (window.length < MOMENTUM_365_COVERAGE.uniqueDays) return null;
  const spanDays = Math.round((latest.day.getTime() - window[0].day.getTime()) / DAY_MS);
  if (spanDays < MOMENTUM_365_COVERAGE.spanDays) return null;
  const endpointSize = Math.min(5, Math.max(2, Math.floor(window.length / 4)));
  const startValue = medianOf(window.slice(0, endpointSize).map((point) => point.value));
  const endValue = medianOf(window.slice(-endpointSize).map((point) => point.value));
  if (startValue == null || endValue == null || startValue <= 0) return null;
  const percent = ((endValue - startValue) / startValue) * 100;
  return Number.isFinite(percent) && Math.abs(percent) <= 300
    ? Number(percent.toFixed(1))
    : null;
}

/**
 * 90d trend of the set's daily price index with median-smoothed endpoints.
 * The index is the per-card average of that day's EN-NM floors: a partially
 * synced day covers fewer cards, so a raw daily total would fake set moves.
 */
function calculateSetIndexTrend90Pct(
  rows: readonly EpisodeSetPriceSnapshotRow[]
): number | null {
  const byDay = new Map<string, { timestamp: number; sum: number; count: number }>();
  for (const row of rows) {
    if (!isUsableMarketValue(row.cm_en_lowest_nm)) continue;
    const dayKey = row.fetched_at.slice(0, 10);
    const bucket = byDay.get(dayKey) ?? {
      timestamp: Date.parse(`${dayKey}T00:00:00.000Z`),
      sum: 0,
      count: 0,
    };
    bucket.sum += row.cm_en_lowest_nm;
    bucket.count += 1;
    byDay.set(dayKey, bucket);
  }
  const series = [...byDay.values()]
    .filter((bucket) => Number.isFinite(bucket.timestamp) && bucket.count > 0)
    .map((bucket) => ({ day: bucket.timestamp, value: bucket.sum / bucket.count }))
    .sort((left, right) => left.day - right.day);
  const latest = series.at(-1);
  if (!latest) return null;
  const cutoff = latest.day - 90 * DAY_MS;
  const window = series.filter((point) => point.day >= cutoff);
  if (window.length < 12) return null;
  const spanDays = Math.round((latest.day - window[0].day) / DAY_MS);
  if (spanDays < 60) return null;
  const endpointSize = Math.min(5, Math.max(2, Math.floor(window.length / 4)));
  const startValue = medianOf(window.slice(0, endpointSize).map((point) => point.value));
  const endValue = medianOf(window.slice(-endpointSize).map((point) => point.value));
  if (startValue == null || endValue == null || startValue <= 0) return null;
  const percent = ((endValue - startValue) / startValue) * 100;
  return Number.isFinite(percent) && Math.abs(percent) <= 300
    ? Number(percent.toFixed(1))
    : null;
}

function chooseLatestGrade<T extends { company: string; grade: string; fetched_at: Date }>(
  rows: T[],
  grade: "9" | "10"
): T | null {
  return (
    rows
      .filter((row) => row.company.toUpperCase() === "PSA" && Number.parseFloat(row.grade) === Number(grade))
      .sort((left, right) => right.fetched_at.getTime() - left.fetched_at.getTime())[0] ?? null
  );
}

function chooseCardMarketPsa10<T extends { label: string; fetched_at: Date }>(rows: T[]): T | null {
  return (
    rows
      .filter((row) => /\bPSA\s*10\b/i.test(row.label))
      .sort((left, right) => right.fetched_at.getTime() - left.fetched_at.getTime())[0] ?? null
  );
}

interface ArtistDemandRow {
  artist: string;
  priced_cards: number;
  average_value: number;
  valuable_cards: number;
}

async function loadArtistDemand(artists: string[]): Promise<Map<string, number>> {
  if (artists.length === 0) return new Map();
  const placeholders = artists.map(() => "?").join(",");
  const rows = await db.$queryRawUnsafe<ArtistDemandRow[]>(
    `
      WITH latest AS (
        SELECT
          c.id AS card_id,
          c.artist,
          p.cm_en_lowest_nm AS value,
          ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY p.fetched_at DESC, p.id DESC) AS row_number
        FROM "Card" c
        INNER JOIN "Price" p ON p.card_id = c.id
        WHERE c.artist IN (${placeholders})
          AND p.cm_en_lowest_nm > 0
          AND p.cm_en_lowest_nm <> 9001
      )
      SELECT
        artist,
        COUNT(*) AS priced_cards,
        AVG(value) AS average_value,
        SUM(CASE WHEN value >= 25 THEN 1 ELSE 0 END) AS valuable_cards
      FROM latest
      WHERE row_number = 1 AND value > 0
      GROUP BY artist
    `,
    ...artists
  );
  return new Map(
    rows.map((row) => [
      row.artist,
      Math.round(
        Math.min(
          100,
          25 +
            Math.log10(Number(row.average_value) + 1) * 24 +
            Math.min(20, Number(row.valuable_cards) * 2) +
            Math.min(8, Number(row.priced_cards) * 0.1)
        )
      ),
    ])
  );
}

interface CollectorDemandRow {
  game: string;
  name: string;
  value: number | null;
}

export async function loadCollectorDemandScores(
  games: TradingCardGame[]
): Promise<Map<string, number>> {
  if (games.length === 0) return new Map();
  const placeholders = games.map(() => "?").join(",");
  const rows = await db.$queryRawUnsafe<CollectorDemandRow[]>(
    `
      SELECT c.game, c.name,
        p.cm_en_lowest_nm AS value
      FROM "Card" c
      INNER JOIN "Price" p ON p.id = (
        SELECT latest.id FROM "Price" latest
        WHERE latest.card_id = c.id
          AND latest.cm_en_lowest_nm > 0
          AND latest.cm_en_lowest_nm <> 9001
        ORDER BY latest.fetched_at DESC, latest.id DESC LIMIT 1
      )
      WHERE c.game IN (${placeholders})
    `,
    ...games
  );
  const pricesByEntity = new Map<string, number[]>();
  for (const row of rows) {
    if (row.value == null || row.value <= 0) continue;
    const game: TradingCardGame = row.game === "one-piece" ? "one-piece" : "pokemon";
    const key = getExternalEntityKey(game, row.name);
    const prices = pricesByEntity.get(key) ?? [];
    prices.push(Number(row.value));
    pricesByEntity.set(key, prices);
  }
  return new Map(
    [...pricesByEntity].map(([key, prices]) => {
      prices.sort((left, right) => right - left);
      const top = prices.slice(0, 5);
      const topAverage = top.reduce((sum, value) => sum + value, 0) / top.length;
      const valuableVariants = prices.filter((value) => value >= 25).length;
      return [
        key,
        Math.round(Math.min(100, 12 + Math.log10(topAverage + 1) * 30 + Math.min(28, valuableVariants * 3.5))),
      ];
    })
  );
}

function emptySealed(
  ageYears: number | null,
  lifecycle: ReturnType<typeof lifecycleFields>
): ExternalSealedIntelligence {
  return {
    productCount: 0,
    packProductCount: 0,
    packName: null,
    packPrice: null,
    boxName: null,
    boxPrice: null,
    trend30dPct: null,
    trend90dPct: null,
    ageYears,
    pressureScore: 28,
    pressureLabel: "Low",
    ...lifecycle,
  };
}

export async function enrichSignalsWithMarketIntelligence(
  signals: ExternalCardSignal[],
  now = new Date()
): Promise<ExternalCardSignal[]> {
  const cardIds = [...new Set(signals.map((signal) => signal.cardId))];
  const ebayDemandVersion = await loadEbayDemandCacheVersion(cardIds);
  const cacheKey = signals
    .map(
      (signal) =>
        `${signal.cardId}:${signal.externalScore}:${signal.competitiveScore ?? "none"}:${signal.catalystScore ?? 0}:${signal.hypeScore ?? 0}:${signal.riskScore ?? 0}:${signal.currency}:${signal.currentPrice ?? "none"}`
    )
    .sort()
    .join("|") + `::ebay:${ebayDemandVersion}::model:${FORECAST_MODEL_VERSION}`;
  return marketIntelligenceCache.get(cacheKey, () =>
    enrichSignalsWithMarketIntelligenceUncached(signals, now)
  );
}

async function enrichSignalsWithMarketIntelligenceUncached(
  signals: ExternalCardSignal[],
  now: Date
): Promise<ExternalCardSignal[]> {
  if (signals.length === 0) return signals;
  const cardIds = [...new Set(signals.map((signal) => signal.cardId))];
  const cards = [] as Awaited<ReturnType<typeof loadCards>>;
  for (let index = 0; index < cardIds.length; index += CARD_CHUNK_SIZE) {
    cards.push(...(await loadCards(cardIds.slice(index, index + CARD_CHUNK_SIZE), now)));
  }
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const postLaunchByCard = await loadPostLaunchReratingMetrics(
    cards.filter((card) => card.game === "pokemon").map((card) => card.id),
    now
  );
  const episodeIds = [...new Set(cards.map((card) => card.episode.id))];
  const setCodes = [...new Set(cards.map((card) => card.episode.code).filter((code): code is string => Boolean(code)))];
  const artists = [...new Set(cards.map((card) => card.artist).filter((artist): artist is string => Boolean(artist)))];

  const games = [...new Set(signals.map((signal) => signal.game))];
  const ebayDemandMarketplaceId = getEbayDemandRuntimeConfig().marketplaceId;
  const demandHistoryStart = new Date(now.getTime() - 30 * DAY_MS);
  const [
    products,
    pullRates,
    artistDemand,
    collectorDemand,
    episodeRarities,
    ebayDemandSnapshots,
    lifecycleObservations,
    usdToEurRate,
    episodeSetSnapshotEntries,
  ] = await Promise.all([
    db.sealedProduct.findMany({
      where: {
        OR: [
          { contentSets: { some: { episode_id: { in: episodeIds } } } },
          { includedCards: { some: { card_id: { in: cardIds } } } },
        ],
      },
      select: {
        id: true,
        name: true,
        cm_avg_7d: true,
        cm_lowest: true,
        cm_lowest_eu: true,
        cm_lowest_de: true,
        cm_lowest_fr: true,
        cm_lowest_es: true,
        cm_lowest_it: true,
        contentSets: { select: { episode_id: true } },
        includedCards: { select: { card_id: true } },
      },
    }),
    setCodes.length
      ? db.setPullRateRarity.findMany({
          where: { set_code: { in: setCodes.map((code) => code.toUpperCase()) } },
          orderBy: { imported_at: "desc" },
          select: {
            source: true,
            set_code: true,
            normalized_rarity: true,
            pull_rate_odds: true,
            specific_pull_denominator: true,
            psa_avg_gem_pct: true,
          },
        })
      : Promise.resolve([]),
    loadArtistDemand(artists),
    loadCollectorDemandScores(games),
    db.card.groupBy({
      by: ["episode_id", "rarity"],
      where: { episode_id: { in: episodeIds }, rarity: { not: null } },
    }),
    db.cardEbayDemandSnapshot.findMany({
      where: {
        card_id: { in: cardIds },
        marketplace_id: ebayDemandMarketplaceId,
        mode: { in: ["raw", "graded"] },
        snapshot_date: { gte: demandHistoryStart },
        updated_at: { gte: EBAY_DEMAND_COHORT_REVISION_AT },
      },
      orderBy: [{ card_id: "asc" }, { snapshot_date: "asc" }, { updated_at: "asc" }],
      select: {
        card_id: true,
        mode: true,
        snapshot_date: true,
        updated_at: true,
        capped: true,
        observed_count: true,
        clean_count: true,
        active_count: true,
        new_count: true,
        removed_count: true,
        median_ask_eur: true,
        lowest_ask_eur: true,
      },
    }),
    db.setLifecycleObservation.findMany({
      where: { episode_id: { in: episodeIds } },
      orderBy: [{ observed_at: "desc" }, { created_at: "desc" }],
      select: {
        episode_id: true,
        status: true,
        oop_probability: true,
        confidence: true,
        observed_at: true,
        evidence_json: true,
      },
    }),
    getUsdToEurRate(),
    // Loads each distinct set once per enrichment run; the loader itself is
    // SWR-cached. A failed set load only nulls the relative-strength feature.
    Promise.all(
      episodeIds.map((episodeId) =>
        getEpisodeSetPriceSnapshotRows(episodeId)
          .then((rows) => [episodeId, rows] as const)
          .catch(() => [episodeId, [] as EpisodeSetPriceSnapshotRow[]] as const)
      )
    ),
  ]);

  // One set-index trend per distinct set; every card in the set shares it.
  const setIndexTrend90ByEpisode = new Map<string, number | null>(
    episodeSetSnapshotEntries.map(
      ([episodeId, rows]) => [episodeId, calculateSetIndexTrend90Pct(rows)] as const
    )
  );

  const lifecycleByEpisode = new Map<
    string,
    (typeof lifecycleObservations)[number]
  >();
  for (const observation of lifecycleObservations) {
    if (!lifecycleByEpisode.has(observation.episode_id)) {
      lifecycleByEpisode.set(observation.episode_id, observation);
    }
  }

  const rawEbayDemandByCard = new Map<string, EbayDemandSignalSnapshot[]>();
  const gradedEbayDemandByCard = new Map<string, EbayDemandSignalSnapshot[]>();
  for (const snapshot of ebayDemandSnapshots) {
    const demandByCard =
      snapshot.mode === "graded" ? gradedEbayDemandByCard : rawEbayDemandByCard;
    const rows = demandByCard.get(snapshot.card_id) ?? [];
    rows.push({
      snapshotDate: snapshot.snapshot_date,
      updatedAt: snapshot.updated_at,
      capped: snapshot.capped,
      observedCount: snapshot.observed_count,
      cleanCount: snapshot.clean_count,
      activeCount: snapshot.active_count,
      newCount: snapshot.new_count,
      removedCount: snapshot.removed_count,
      medianAskEur: snapshot.median_ask_eur,
      lowestAskEur: snapshot.lowest_ask_eur,
    });
    demandByCard.set(snapshot.card_id, rows);
  }

  const productIds = products.map((product) => product.id);
  const sealedSnapshots = [] as Array<{
    product_id: string;
    fetched_at: Date;
    cm_avg_7d: number | null;
    cm_lowest: number | null;
    cm_lowest_eu: number | null;
    cm_lowest_de: number | null;
    cm_lowest_fr: number | null;
    cm_lowest_es: number | null;
    cm_lowest_it: number | null;
  }>;
  for (let index = 0; index < productIds.length; index += 200) {
    sealedSnapshots.push(
      ...(await db.sealedPriceSnapshot.findMany({
        where: { product_id: { in: productIds.slice(index, index + 200) } },
        orderBy: { fetched_at: "desc" },
        select: {
          product_id: true,
          fetched_at: true,
          cm_avg_7d: true,
          cm_lowest: true,
          cm_lowest_eu: true,
          cm_lowest_de: true,
          cm_lowest_fr: true,
          cm_lowest_es: true,
          cm_lowest_it: true,
        },
      }))
    );
  }
  const snapshotsByProduct = new Map<string, typeof sealedSnapshots>();
  for (const snapshot of sealedSnapshots) {
    const existing = snapshotsByProduct.get(snapshot.product_id) ?? [];
    existing.push(snapshot);
    snapshotsByProduct.set(snapshot.product_id, existing);
  }
  const pullByKey = new Map<string, (typeof pullRates)[number]>();
  for (const pull of pullRates) {
    const key = `${pull.set_code.toUpperCase()}::${pull.normalized_rarity}`;
    if (!pullByKey.has(key) || pull.source === "pricedex") pullByKey.set(key, pull);
  }
  const raritiesByEpisode = new Map<string, string[]>();
  for (const row of episodeRarities) {
    if (!row.rarity) continue;
    const rarities = raritiesByEpisode.get(row.episode_id) ?? [];
    rarities.push(row.rarity);
    raritiesByEpisode.set(row.episode_id, rarities);
  }

  return signals.map((signal) => {
    const card = cardById.get(signal.cardId);
    if (!card) return signal;
    const ageYears = releaseAgeYears(card.episode.release_date, now);
    const relevantProducts = products.filter(
      (product) =>
        product.contentSets.some((set) => set.episode_id === card.episode.id) ||
        product.includedCards.some((included) => included.card_id === card.id)
    );
    const pricedProducts = relevantProducts
      .map((product) => ({ product, value: sealedValue(product), kind: classifySealedProduct(product.name) }))
      .filter((item): item is typeof item & { value: number } => item.value != null)
      .sort((left, right) => left.value - right.value);
    const pack = pricedProducts.find((item) => item.kind === "pack") ?? null;
    const box = pricedProducts.find((item) => item.kind === "box") ?? null;
    const representative = pack ?? box ?? pricedProducts[0] ?? null;
    // The sealed series gets the same robust daily-median treatment as the
    // card series; a raw two-point trend amplified single-snapshot outliers.
    const representativeHistory = representative
      ? buildDailyMarketHistory(
          (snapshotsByProduct.get(representative.product.id) ?? []).map((snapshot) => ({
            observedAt: snapshot.fetched_at,
            primaryValue: sealedValue(snapshot),
          }))
        )
      : [];
    const trend30dPct = calculateRobustPriceTrend(representativeHistory, 30)?.percent ?? null;
    const trend90dPct = calculateRobustPriceTrend(representativeHistory, 90)?.percent ?? null;
    const lifecycle = lifecycleFields(lifecycleByEpisode.get(card.episode.id));
    const hasReprintRisk = hasActiveReprintRisk(signal.catalysts ?? []);
    const sealedPressure = calculateSealedPressure({
      ageYears,
      packPrice: pack?.value ?? null,
      rawCardPrice: signal.currency === "EUR" ? signal.currentPrice : null,
      trend30dPct,
      trend90dPct,
      packProductCount: pricedProducts.filter((item) => item.kind === "pack").length,
      hasReprintRisk,
      lifecycleOopProbability: lifecycle.lifecycleOopProbability,
      lifecycleConfidence: lifecycle.lifecycleConfidence,
    });
    const sealed: ExternalSealedIntelligence = representative
      ? {
          productCount: relevantProducts.length,
          packProductCount: pricedProducts.filter((item) => item.kind === "pack").length,
          packName: pack?.product.name ?? null,
          packPrice: pack?.value ?? null,
          boxName: box?.product.name ?? null,
          boxPrice: box?.value ?? null,
          trend30dPct,
          trend90dPct,
          ageYears,
          ...sealedPressure,
          ...lifecycle,
        }
      : {
          ...emptySealed(ageYears, lifecycle),
          ...sealedPressure,
        };

    const normalizedRarity = normalizeRarityLabel(card.rarity);
    const setRarity = calculateSetRarityPosition(
      card.rarity,
      raritiesByEpisode.get(card.episode.id) ?? []
    );
    const pull =
      card.episode.code && normalizedRarity
        ? pullByKey.get(`${card.episode.code.toUpperCase()}::${normalizedRarity}`) ?? null
        : null;
    const gemRatePct =
      pull?.psa_avg_gem_pct == null
        ? null
        : pull.psa_avg_gem_pct <= 1
          ? Number((pull.psa_avg_gem_pct * 100).toFixed(1))
          : Number(pull.psa_avg_gem_pct.toFixed(1));
    const usableSoldPrices = card.ebaySoldGradedPrices.filter((price) =>
      ["EUR", "USD"].includes(price.currency.trim().toUpperCase()) &&
      Number.isFinite(price.median_price) && price.median_price > 0
    );
    let psa10 = chooseLatestGrade(usableSoldPrices, "10");
    let psa9 = chooseLatestGrade(usableSoldPrices, "9");
    // Sanity guard: a PSA 9 median above the PSA 10 median is an inverted
    // grade ladder (tiny eBay samples produce these). The side with the
    // smaller sample is treated as noise so it cannot poison the grade
    // premium or the graded scenario.
    if (
      psa10 != null &&
      psa9 != null &&
      psa10.currency === psa9.currency &&
      psa9.median_price > psa10.median_price
    ) {
      const psa10Sample = psa10.sample_size ?? 0;
      const psa9Sample = psa9.sample_size ?? 0;
      if (psa10Sample >= psa9Sample) {
        psa9 = null;
      } else {
        psa10 = null;
      }
    }
    const cardMarketPsa10 = chooseCardMarketPsa10(card.gradedPrices);
    const gradedCurrent = psa10?.median_price ?? cardMarketPsa10?.price ?? null;
    const gradedCurrency = psa10 ? (psa10.currency.trim().toUpperCase() === "EUR" ? "EUR" : "USD") : "EUR";
    // Compare graded vs raw in one currency. On a mismatch the USD side is
    // converted with the 12h-cached USD->EUR rate (values below are marked
    // FX-converted and used only for this ratio; displayed graded prices keep
    // their source currency) instead of silently dropping the premium.
    const comparablePair =
      gradedCurrent == null || signal.currentPrice == null
        ? null
        : signal.currency === gradedCurrency
          ? { graded: gradedCurrent, raw: signal.currentPrice }
          : {
              graded:
                gradedCurrency === "USD"
                  ? convertUsdToEur(gradedCurrent, usdToEurRate)
                  : gradedCurrent,
              raw:
                signal.currency === "USD"
                  ? convertUsdToEur(signal.currentPrice, usdToEurRate)
                  : signal.currentPrice,
            };
    const gradePremiumPct =
      comparablePair != null &&
      comparablePair.graded != null &&
      comparablePair.raw != null &&
      comparablePair.raw > 0
        ? Number(
            (((comparablePair.graded - comparablePair.raw) / comparablePair.raw) * 100).toFixed(1)
          )
        : null;
    const graded: ExternalGradedIntelligence = {
      available: gradedCurrent != null,
      label: psa10?.label ?? cardMarketPsa10?.label ?? null,
      currentPrice: gradedCurrent,
      currentPriceEur: gradedCurrent == null || gradedCurrency === "EUR"
        ? gradedCurrent : convertUsdToEur(gradedCurrent, usdToEurRate),
      currency: gradedCurrency,
      sampleSize: psa10?.sample_size ?? null,
      psa9Price: psa9?.median_price ?? null,
      psa10Price: psa10?.median_price ?? cardMarketPsa10?.price ?? null,
      gradePremiumPct,
      gemRatePct,
      population10: null,
      populationTotal: null,
      populationStatus: gemRatePct == null ? "unavailable" : "set-rarity-estimate",
      supplyLabel: getGradedSupplyLabel(psa10?.sample_size ?? null),
    };

    const rawHistory = buildDailyMarketHistory(
      card.prices.map((price) => ({
        observedAt: price.fetched_at,
        // A trend must stay inside one market series. Mixing CardMarket's
        // 7-day average with the English-NM floor on sparse days fabricated
        // large jumps (for example 20 -> 36.78) that were never in the chart.
        primaryValue:
          signal.currency === "EUR" ? price.cm_en_lowest_nm : price.tcp_market,
        fallbackValues:
          signal.currency === "EUR"
            ? []
            : [price.tcp_mid, price.tcp_low],
      }))
    );
    const rawTrend30dPct = calculateRobustPriceTrend(rawHistory, 30)?.percent ?? null;
    const rawTrend90dPct = calculateRobustPriceTrend(rawHistory, 90)?.percent ?? null;
    const rawTrend180dPct = calculateRobustPriceTrend(rawHistory, 180)?.percent ?? null;
    const latestRaw = card.prices[0];
    const rawQuoteAt = card.prices.find((price) => isUsableMarketValue(
      signal.currency === "EUR" ? price.cm_en_lowest_nm : price.tcp_market
    ))?.fetched_at;
    const gradedQuoteAt = psa10?.fetched_at ?? cardMarketPsa10?.fetched_at;
    const latestRawDay = rawHistory.at(-1)?.day.getTime() ?? null;
    const recentEnglishNmValues =
      latestRawDay == null
        ? []
        : rawHistory
            .filter((point) => point.day.getTime() >= latestRawDay - 30 * DAY_MS)
            .map((point) => point.value);
    const englishNmAverage30d =
      recentEnglishNmValues.length >= 3
        ? recentEnglishNmValues.reduce((sum, value) => sum + value, 0) /
          recentEnglishNmValues.length
        : null;
    const currentVsEnglishNmAverage30dPct =
      signal.currency === "EUR" &&
      signal.currentPrice != null &&
      englishNmAverage30d != null &&
      englishNmAverage30d > 0
        ? Number(
            (
              ((signal.currentPrice - englishNmAverage30d) /
                englishNmAverage30d) *
              100
            ).toFixed(1)
          )
        : null;
    // Extended long-window features are anchored on the EN-NM daily median
    // series; for EUR signals that is exactly rawHistory, so reuse it.
    const englishNmHistory =
      signal.currency === "EUR"
        ? rawHistory
        : buildDailyMarketHistory(
            card.prices.map((price) => ({
              observedAt: price.fetched_at,
              primaryValue: price.cm_en_lowest_nm,
            }))
          );
    const englishNmTrend90dPct =
      signal.currency === "EUR"
        ? rawTrend90dPct
        : calculateRobustPriceTrend(englishNmHistory, 90)?.percent ?? null;
    const japaneseHistory = buildDailyMarketHistory(
      card.prices.map((price) => ({
        observedAt: price.fetched_at,
        primaryValue: price.cm_jp_lowest_nm,
      }))
    );
    // The robust helper anchors its window on the series' own latest day; a
    // JP series that stopped updating must not be compared to a current EN one.
    const japaneseLatestDay = japaneseHistory.at(-1)?.day.getTime() ?? null;
    const englishLatestDay = englishNmHistory.at(-1)?.day.getTime() ?? null;
    const japaneseFresh =
      japaneseLatestDay != null &&
      englishLatestDay != null &&
      englishLatestDay - japaneseLatestDay <= 14 * DAY_MS;
    const japaneseTrend90dPct = japaneseFresh
      ? calculateRobustPriceTrend(japaneseHistory, 90)?.percent ?? null
      : null;
    const setIndexTrend90dPct = setIndexTrend90ByEpisode.get(card.episode.id) ?? null;
    const latestEnglishNmFloor =
      card.prices.find((price) => isUsableMarketValue(price.cm_en_lowest_nm))
        ?.cm_en_lowest_nm ?? null;
    const latestEnglishAvg30 =
      card.prices.find((price) => isUsableMarketValue(price.cm_en_avg_30d))
        ?.cm_en_avg_30d ?? null;
    const extendedHistory: ExtendedPriceHistoryFeatures = {
      volatilityDaily90Pct: calculateDailyVolatilityPct(englishNmHistory),
      athDistancePct: calculateAthDistancePct(englishNmHistory),
      momentum365Pct: calculateMomentum365Pct(englishNmHistory),
      jpLeadLagPct:
        japaneseTrend90dPct != null && englishNmTrend90dPct != null
          ? Number((japaneseTrend90dPct - englishNmTrend90dPct).toFixed(1))
          : null,
      setRelativeStrength90Pct:
        englishNmTrend90dPct != null && setIndexTrend90dPct != null
          ? Number((englishNmTrend90dPct - setIndexTrend90dPct).toFixed(1))
          : null,
      avg30AnchorGapPct:
        latestEnglishNmFloor != null && latestEnglishAvg30 != null && latestEnglishAvg30 > 0
          ? Number(
              (((latestEnglishNmFloor - latestEnglishAvg30) / latestEnglishAvg30) * 100).toFixed(1)
            )
          : null,
      hypeReset: calculateHypeResetSupport(englishNmHistory),
    };
    const rawMarketBreadth = latestRaw
      ? [
          latestRaw.cm_en_lowest_nm,
          latestRaw.cm_de_lowest_nm,
          latestRaw.cm_fr_lowest_nm,
          latestRaw.cm_es_lowest_nm,
          latestRaw.cm_it_lowest_nm,
          latestRaw.tcp_market,
        ].filter((value) => value != null && value > 0).length
      : 0;
    const ebayDemand = deriveEbayDemandIntelligence({
      marketplaceId: ebayDemandMarketplaceId,
      snapshots: rawEbayDemandByCard.get(signal.cardId) ?? [],
      currentMarketPriceEur: signal.currency === "EUR" ? signal.currentPrice : null,
      now,
    });
    const gradedEbayDemand = deriveEbayDemandIntelligence({
      marketplaceId: ebayDemandMarketplaceId,
      snapshots: gradedEbayDemandByCard.get(signal.cardId) ?? [],
      currentMarketPriceEur:
        graded.currency === "EUR" ? graded.currentPrice : null,
      now,
    });
    const artistScore = card.artist ? artistDemand.get(card.artist) ?? null : null;
    const collectorScore = collectorDemand.get(getExternalEntityKey(signal.game, signal.name)) ?? 50;
    const scarcityBase = calculateScarcityScore({
      ageYears,
      specificPullDenominator: pull?.specific_pull_denominator ?? null,
      gemRatePct,
      rawMarketBreadth,
      verifiedActiveListings:
        ebayDemand.status === "ready" || ebayDemand.status === "learning"
          ? ebayDemand.activeCount
          : null,
      sealedPressureScore: sealed.pressureScore,
      artistDemandScore: artistScore,
      setRarityScore: setRarity.setRarityScore,
    });
    const scarcity = {
      ...scarcityBase,
      ...setRarity,
      pullOdds: pull?.pull_rate_odds ?? null,
      specificPullDenominator: pull?.specific_pull_denominator ?? null,
      rawMarketBreadth,
      rawTrend90dPct,
      artist: card.artist,
      artistDemandScore: artistScore,
      collectorDemandScore: collectorScore,
    };
    const hasFreshChaseCatalyst = (signal.catalysts ?? []).some(
      (catalyst) =>
        catalyst.direction === "positive" &&
        ["reveal", "product", "localization", "hype"].includes(catalyst.kind)
    );
    const structuralConfluence = calculateGoldMineConfluence({
      artistDemandScore: artistScore,
      collectorDemandScore: collectorScore,
      specificPullDenominator: pull?.specific_pull_denominator ?? null,
      scarcityScore: scarcity.score,
      gemRatePct,
      hasFreshChaseCatalyst,
      ageYears,
    });
    const structuralOpportunity = calculateOpportunityScores({
      externalScore: signal.externalScore,
      sealedPressureScore: sealed.pressureScore,
      scarcityScore: scarcity.score,
      confluenceScore: structuralConfluence.score,
      rawEbayDemandAdjustment: ebayDemand.scoreAdjustment,
      gradedEbayDemandAdjustment: gradedEbayDemand.scoreAdjustment,
      rawTrend90dPct,
      gradePremiumPct,
      gemRatePct,
      gradedAvailable: graded.available,
      riskScore: signal.riskScore ?? 0,
      setRarityScore: setRarity.setRarityScore,
      hypeResetScore: extendedHistory.hypeReset?.score ?? null,
    });
    const sharedEvidenceCount =
      signal.evidence.length +
      new Set((signal.catalysts ?? []).map((item) => item.sourceUrl)).size;
    const rawEvidenceCount =
      sharedEvidenceCount + (ebayDemand.status === "ready" ? 1 : 0);
    const gradedEvidenceCount =
      sharedEvidenceCount + (gradedEbayDemand.status === "ready" ? 1 : 0);
    const rawScenario = buildPriceScenario({
      marketMode: "raw",
      currentPrice: signal.currentPrice,
      currency: signal.currency,
      ageYears,
      opportunityScore: structuralOpportunity.raw,
      sealedTrendPct: sealed.trend30dPct ?? sealed.trend90dPct,
      rawTrend30dPct,
      rawTrend90dPct,
      rawTrend180dPct,
      scarcityScore: scarcity.score,
      gemRatePct,
      riskScore: signal.riskScore ?? 0,
      evidenceCount: rawEvidenceCount,
      historyPoints: rawHistory.length,
      priceAgeDays: rawQuoteAt ? (now.getTime() - rawQuoteAt.getTime()) / DAY_MS : null,
      ebayDemandAdjustment: ebayDemand.scoreAdjustment,
      competitiveScore:
        signal.sourceMode === "competitive" || signal.sourceMode === "hybrid"
          ? signal.competitiveScore ?? null
          : null,
      catalystScore: signal.catalystScore ?? null,
      hypeScore: signal.hypeScore ?? null,
      setRarityScore: setRarity.setRarityScore,
      confluenceScore: structuralConfluence.score,
      artistDemandScore: artistScore,
      collectorDemandScore: collectorScore,
      lifecycleStatus: sealed.lifecycleStatus,
      lifecycleConfidence: sealed.lifecycleConfidence,
      lifecycleOopProbability: sealed.lifecycleOopProbability,
      currentVsEnglishNmAverage30dPct,
      extendedHistory,
    });
    const gradedScenario = buildPriceScenario({
      marketMode: "graded",
      currentPrice: graded.currentPrice,
      currency: graded.currency,
      ageYears,
      opportunityScore: structuralOpportunity.graded,
      sealedTrendPct: sealed.trend30dPct ?? sealed.trend90dPct,
      rawTrend30dPct,
      rawTrend90dPct,
      rawTrend180dPct,
      scarcityScore: scarcity.score,
      gemRatePct,
      riskScore: signal.riskScore ?? 0,
      evidenceCount: gradedEvidenceCount + ((graded.sampleSize ?? 0) >= 2 ? 1 : 0),
      historyPoints: psa10 ? countPsa10HistoryDays(card.ebaySoldGradedPriceSnapshots, graded.currency, now) : 0,
      priceAgeDays: gradedQuoteAt ? (now.getTime() - gradedQuoteAt.getTime()) / DAY_MS : null,
      ebayDemandAdjustment: gradedEbayDemand.scoreAdjustment,
      competitiveScore:
        signal.sourceMode === "competitive" || signal.sourceMode === "hybrid"
          ? signal.competitiveScore ?? null
          : null,
      catalystScore: signal.catalystScore ?? null,
      hypeScore: signal.hypeScore ?? null,
      setRarityScore: setRarity.setRarityScore,
      confluenceScore: structuralConfluence.score,
      artistDemandScore: artistScore,
      collectorDemandScore: collectorScore,
      lifecycleStatus: sealed.lifecycleStatus,
      lifecycleConfidence: sealed.lifecycleConfidence,
      lifecycleOopProbability: sealed.lifecycleOopProbability,
      extendedHistory,
    });
    const rawOpportunity = alignOpportunityScoreWithScenario(
      structuralOpportunity.raw,
      rawScenario
    );
    const gradedOpportunity =
      structuralOpportunity.graded == null
        ? null
        : alignOpportunityScoreWithScenario(structuralOpportunity.graded, gradedScenario);
    const rawConfluence = alignConfluenceWithScenario(structuralConfluence, rawScenario);
    const gradedConfluence = graded.available
      ? alignConfluenceWithScenario(structuralConfluence, gradedScenario)
      : null;
    const intelligence: ExternalMarketIntelligence = {
      rawOpportunityScore: rawOpportunity,
      gradedOpportunityScore: gradedOpportunity,
      hypeReset: extendedHistory.hypeReset,
      postLaunch: postLaunchByCard.get(card.id) ?? null,
      ebayDemand,
      gradedEbayDemand,
      sealed,
      graded,
      scarcity,
      rawConfluence,
      gradedConfluence,
      // Backwards-compatible default for persisted payloads and raw-only UI.
      confluence: rawConfluence,
      rawScenario,
      gradedScenario,
    };
    return { ...signal, marketIntelligence: intelligence,
      currentPriceEur: signal.currentPrice == null || signal.currency === "EUR"
        ? signal.currentPrice : convertUsdToEur(signal.currentPrice, usdToEurRate),
    };
  });
}

async function loadCards(cardIds: string[], now: Date) {
  // Fetch by calendar range rather than by refresh-row count: some cards have
  // many observations per day, so `take: 40` could represent less than a
  // month and was incorrectly presented as a 90-day history. The long window
  // feeds the extended features (ATH distance, 365d momentum).
  const historyStart = new Date(now.getTime() - 1100 * DAY_MS);
  const cards = await db.card.findMany({
    where: { id: { in: cardIds } },
    select: {
      id: true,
      game: true,
      episode_id: true,
      name: true,
      card_number: true,
      printed_card_number: true,
      cardmarket_id: true,
      cardmarket_url: true,
      rarity: true,
      artist: true,
      episode: { select: { id: true, code: true, release_date: true } },
      gradedPrices: {
        select: { label: true, price: true, fetched_at: true },
      },
      ebaySoldGradedPrices: {
        select: {
          label: true,
          company: true,
          grade: true,
          median_price: true,
          currency: true,
          sample_size: true,
          fetched_at: true,
        },
      },
      ebaySoldGradedPriceSnapshots: {
        orderBy: { fetched_at: "desc" },
        take: 60,
        select: { fetched_at: true, company: true, grade: true, currency: true, median_price: true },
      },
    },
  });
  const historyByCardId = await loadSafeCardMarketHistoryRows(
    cards.map((card) => ({
      id: card.id,
      game: card.game,
      episodeId: card.episode_id,
      name: card.name,
      cardNumber: card.card_number,
      printedCardNumber: card.printed_card_number,
      cardmarketId: card.cardmarket_id,
      cardmarketUrl: card.cardmarket_url,
    })),
    { fetchedAtGte: historyStart }
  );

  // Rows beyond every trend horizon only feed the EN-NM series (ATH distance,
  // 365d momentum); drop the other columns there to keep the window light.
  const slimCutoff = now.getTime() - 400 * DAY_MS;
  return cards.map((card) => ({
    ...card,
    prices: [...(historyByCardId.get(card.id) ?? [])]
      .sort((left, right) => right.fetched_at.getTime() - left.fetched_at.getTime())
      .map((row) =>
        row.fetched_at.getTime() >= slimCutoff
          ? row
          : {
              ...row,
              cm_de_lowest_nm: null,
              cm_fr_lowest_nm: null,
              cm_es_lowest_nm: null,
              cm_it_lowest_nm: null,
              cm_jp_lowest_nm: null,
              cm_en_avg_7d: null,
              cm_en_avg_30d: null,
              tcp_market: null,
              tcp_mid: null,
              tcp_low: null,
            }
      ),
  }));
}
