import "server-only";

import { db } from "@/lib/db";
import {
  ALL_GAMES,
  type TradingCardGameFilter,
} from "@/lib/games";
import { normalizeCardMarketListingValue } from "@/lib/price-history";
import {
  buildDailyMarketHistory,
  calculateRobustPriceTrend,
  type DailyMarketValue,
} from "@/lib/robust-price-history";
import {
  buildSealedSignalRadarScore,
  getSealedLifecycleLabel,
  type SealedSignalRadarData,
  type SealedSignalRadarItem,
} from "@/lib/sealed-signal-radar";
import {
  classifySealedProduct,
  getSealedCategoryLabel,
  type SealedProductPriceFields,
} from "@/lib/sealed-products";
import { createSwrCache } from "@/lib/server-swr-cache";
import type { SetLifecycleStatus } from "@/lib/set-lifecycle-core";

const DAY_MS = 24 * 60 * 60_000;
const HISTORY_LOOKBACK_DAYS = 210;
const SQLITE_PRODUCT_CHUNK_SIZE = 300;
const MAX_ESTABLISHED_OR_BUILDING_ITEMS = 24;
const MAX_LEARNING_ITEMS = 12;
const sealedRadarCache = createSwrCache<SealedSignalRadarData>(
  5 * 60_000,
  30 * 60_000,
  { maxEntries: 3 }
);

interface SealedSnapshotRow extends SealedProductPriceFields {
  product_id: string;
  fetched_at: Date;
}

function round(value: number, decimals = 1): number {
  return Number(value.toFixed(decimals));
}

function safeSealedEuPrice(value: SealedProductPriceFields): number | null {
  for (const candidate of [
    value.cm_lowest_eu,
    value.cm_lowest,
    value.cm_lowest_de,
    value.cm_lowest_fr,
    value.cm_lowest_es,
    value.cm_lowest_it,
  ]) {
    const normalized = normalizeCardMarketListingValue(candidate);
    if (normalized != null) return normalized;
  }
  return null;
}

function parseLifecycleStatus(value: string | null | undefined): SetLifecycleStatus | null {
  switch (value) {
    case "upcoming":
    case "launch_window":
    case "actively_supplied":
    case "supply_tightening":
    case "likely_out_of_print":
    case "confirmed_out_of_print":
    case "reprint_restock":
    case "unknown_historical":
      return value;
    default:
      return null;
  }
}

function releaseAgeDays(value: Date | string | null, now: Date): number | null {
  if (!value) return null;
  const release = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(release.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - release.getTime()) / DAY_MS));
}

function historySpanDays(history: readonly DailyMarketValue[]): number {
  const first = history[0];
  const last = history.at(-1);
  if (!first || !last) return 0;
  return Math.max(0, Math.round((last.day.getTime() - first.day.getTime()) / DAY_MS));
}

function calculateDailyVolatilityPct(history: readonly DailyMarketValue[]): number | null {
  if (history.length < 12) return null;
  const latest = history.at(-1);
  if (!latest) return null;
  const cutoff = latest.day.getTime() - 90 * DAY_MS;
  const window = history.filter((point) => point.day.getTime() >= cutoff);
  if (window.length < 12) return null;
  const returns: number[] = [];
  for (let index = 1; index < window.length; index += 1) {
    const previous = window[index - 1].value;
    if (previous <= 0) continue;
    returns.push(((window[index].value - previous) / previous) * 100);
  }
  if (returns.length < 2) return null;
  const average = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (returns.length - 1);
  return round(Math.sqrt(variance), 2);
}

function extremaMetrics(
  history: readonly DailyMarketValue[],
  currentPrice: number
): { gapToPeakPct: number | null; changeFromLowPct: number | null } {
  if (history.length === 0) return { gapToPeakPct: null, changeFromLowPct: null };
  const high = Math.max(...history.map((point) => point.value), currentPrice);
  const low = Math.min(...history.map((point) => point.value), currentPrice);
  return {
    gapToPeakPct: high > 0 ? round(((currentPrice - high) / high) * 100) : null,
    changeFromLowPct: low > 0 ? round(((currentPrice - low) / low) * 100) : null,
  };
}

async function loadSnapshotRows(productIds: string[], cutoff: Date): Promise<SealedSnapshotRow[]> {
  const rows: SealedSnapshotRow[] = [];
  for (let index = 0; index < productIds.length; index += SQLITE_PRODUCT_CHUNK_SIZE) {
    rows.push(
      ...(await db.sealedPriceSnapshot.findMany({
        where: {
          product_id: { in: productIds.slice(index, index + SQLITE_PRODUCT_CHUNK_SIZE) },
          fetched_at: { gte: cutoff },
          OR: [
            { cm_lowest_eu: { not: null } },
            { cm_lowest: { not: null } },
            { cm_lowest_de: { not: null } },
            { cm_lowest_fr: { not: null } },
            { cm_lowest_es: { not: null } },
            { cm_lowest_it: { not: null } },
          ],
        },
        orderBy: [{ product_id: "asc" }, { fetched_at: "asc" }],
        select: {
          product_id: true,
          fetched_at: true,
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
  return rows;
}

export async function getSealedSignalRadarData(
  gameFilter: TradingCardGameFilter,
  now = new Date()
): Promise<SealedSignalRadarData> {
  const products = await db.sealedProduct.findMany({
    where: gameFilter === ALL_GAMES ? undefined : { game: gameFilter },
    orderBy: [{ synced_at: "desc" }, { id: "asc" }],
    select: {
      id: true,
      game: true,
      name: true,
      image_url: true,
      tcggo_url: true,
      cardmarket_url: true,
      cardmarket_id: true,
      cm_lowest: true,
      cm_lowest_eu: true,
      cm_lowest_de: true,
      cm_lowest_fr: true,
      cm_lowest_es: true,
      cm_lowest_it: true,
      cm_avg_7d: true,
      cm_avg_30d: true,
      release_date: true,
      release_date_source: true,
      release_date_source_url: true,
      release_date_confidence: true,
      synced_at: true,
      episode: {
        select: {
          id: true,
          name: true,
          code: true,
          release_date: true,
        },
      },
    },
  });
  const candidates = products
    .map((product) => ({
      product,
      currentPrice: safeSealedEuPrice(product),
      category: classifySealedProduct(product.name),
    }))
    .filter(
      (entry): entry is typeof entry & { currentPrice: number } =>
        entry.currentPrice != null && entry.category !== "playmat"
    );
  const productIds = candidates.map((entry) => entry.product.id);
  const episodeIds = [...new Set(candidates.map((entry) => entry.product.episode.id))];
  const [snapshots, lifecycleRows] = await Promise.all([
    loadSnapshotRows(productIds, new Date(now.getTime() - HISTORY_LOOKBACK_DAYS * DAY_MS)),
    episodeIds.length
      ? db.setLifecycleObservation.findMany({
          where: { episode_id: { in: episodeIds } },
          orderBy: [{ observed_at: "desc" }, { id: "desc" }],
          select: {
            episode_id: true,
            status: true,
            oop_probability: true,
            confidence: true,
          },
        })
      : Promise.resolve([]),
  ]);
  const snapshotsByProduct = new Map<string, SealedSnapshotRow[]>();
  for (const snapshot of snapshots) {
    const bucket = snapshotsByProduct.get(snapshot.product_id) ?? [];
    bucket.push(snapshot);
    snapshotsByProduct.set(snapshot.product_id, bucket);
  }
  const lifecycleByEpisode = new Map<string, (typeof lifecycleRows)[number]>();
  for (const row of lifecycleRows) {
    if (!lifecycleByEpisode.has(row.episode_id)) lifecycleByEpisode.set(row.episode_id, row);
  }

  const allItems = candidates.map(({ product, currentPrice, category }) => {
    const productSnapshots = snapshotsByProduct.get(product.id) ?? [];
    const latestSnapshotAt = productSnapshots.at(-1)?.fetched_at ?? product.synced_at;
    const latestObservedAt =
      latestSnapshotAt > product.synced_at ? latestSnapshotAt : product.synced_at;
    const history = buildDailyMarketHistory([
      ...productSnapshots.map((snapshot) => ({
        observedAt: snapshot.fetched_at,
        primaryValue: safeSealedEuPrice(snapshot),
      })),
      { observedAt: product.synced_at, primaryValue: currentPrice },
    ]);
    const trend30dPct = calculateRobustPriceTrend(history, 30)?.percent ?? null;
    const trend90dPct = calculateRobustPriceTrend(history, 90)?.percent ?? null;
    const spanDays = historySpanDays(history);
    const extrema = extremaMetrics(history, currentPrice);
    const lifecycle = lifecycleByEpisode.get(product.episode.id);
    const lifecycleStatus = parseLifecycleStatus(lifecycle?.status);
    const lifecycleConfidence = lifecycle ? round(lifecycle.confidence, 0) : null;
    const lifecycleOopProbability =
      lifecycle && lifecycle.confidence >= 45
        ? round(lifecycle.oop_probability, 0)
        : null;
    const staleDays = Math.max(
      0,
      Math.floor((now.getTime() - latestObservedAt.getTime()) / DAY_MS)
    );
    const score = buildSealedSignalRadarScore({
      currentPrice,
      category,
      trend30dPct,
      trend90dPct,
      historyDays: history.length,
      historySpanDays: spanDays,
      gapToPeakPct: extrema.gapToPeakPct,
      changeFromLowPct: extrema.changeFromLowPct,
      volatilityDaily90Pct: calculateDailyVolatilityPct(history),
      releaseAgeDays: releaseAgeDays(product.release_date ?? product.episode.release_date, now),
      staleDays,
      lifecycleStatus,
      lifecycleConfidence,
      lifecycleOopProbability,
    });
    return {
      rank: 0,
      productId: product.id,
      game: product.game,
      name: product.name,
      imageUrl: product.image_url,
      episodeId: product.episode.id,
      episodeName: product.episode.name,
      episodeCode: product.episode.code,
      category,
      categoryLabel: getSealedCategoryLabel(category),
      currentPrice: round(currentPrice, 2),
      currency: "EUR" as const,
      latestObservedAt: latestObservedAt.toISOString(),
      trend30dPct,
      trend90dPct,
      historyDays: history.length,
      historySpanDays: spanDays,
      gapToPeakPct: extrema.gapToPeakPct,
      changeFromLowPct: extrema.changeFromLowPct,
      lifecycleStatus,
      lifecycleLabel: getSealedLifecycleLabel(lifecycleStatus),
      lifecycleConfidence,
      modalProduct: {
        id: product.id,
        name: product.name,
        image_url: product.image_url,
        tcggo_url: product.tcggo_url,
        cardmarket_url: product.cardmarket_url,
        cardmarket_id: product.cardmarket_id,
        release_date: product.release_date?.toISOString() ?? null,
        release_date_source: product.release_date_source,
        release_date_source_url: product.release_date_source_url,
        release_date_confidence: product.release_date_confidence,
        price: {
          cm_lowest: product.cm_lowest,
          cm_lowest_eu: product.cm_lowest_eu,
          cm_lowest_de: product.cm_lowest_de,
          cm_lowest_fr: product.cm_lowest_fr,
          cm_lowest_es: product.cm_lowest_es,
          cm_lowest_it: product.cm_lowest_it,
          cm_avg_7d: product.cm_avg_7d,
          cm_avg_30d: product.cm_avg_30d,
        },
        episode: {
          id: product.episode.id,
          name: product.episode.name,
          code: product.episode.code,
          release_date: product.episode.release_date,
        },
      },
      ...score,
    } satisfies SealedSignalRadarItem;
  });
  const scoreSort = (left: SealedSignalRadarItem, right: SealedSignalRadarItem) =>
    right.score - left.score ||
    (right.trend90dPct ?? Number.NEGATIVE_INFINITY) -
      (left.trend90dPct ?? Number.NEGATIVE_INFINITY) ||
    left.name.localeCompare(right.name, "en", { sensitivity: "base", numeric: true });
  const establishedOrBuilding = allItems
    .filter((item) => item.historyStatus !== "learning" && item.score >= 45)
    .sort(scoreSort)
    .slice(0, MAX_ESTABLISHED_OR_BUILDING_ITEMS);
  const learning = allItems
    .filter((item) => item.historyStatus === "learning" && item.score >= 38)
    .sort(scoreSort)
    .slice(0, MAX_LEARNING_ITEMS);
  const items = [...establishedOrBuilding, ...learning]
    .sort(scoreSort)
    .map((item, index) => ({ ...item, rank: index + 1 }));
  const updatedAt = allItems
    .map((item) => item.latestObservedAt)
    .sort()
    .at(-1) ?? null;

  return {
    generatedAt: now.toISOString(),
    items,
    trackedProducts: products.length,
    eligibleProducts: allItems.length,
    establishedProducts: allItems.filter((item) => item.historyStatus === "established").length,
    buildingProducts: allItems.filter((item) => item.historyStatus === "building").length,
    learningProducts: allItems.filter((item) => item.historyStatus === "learning").length,
    ready90dProducts: allItems.filter((item) => item.trend90dPct != null).length,
    updatedAt,
  };
}

export function getSharedSealedSignalRadarData(
  gameFilter: TradingCardGameFilter
): Promise<SealedSignalRadarData> {
  return sealedRadarCache.get(gameFilter, () => getSealedSignalRadarData(gameFilter));
}

export function clearSharedSealedSignalRadarCache(): void {
  sealedRadarCache.clear();
}
