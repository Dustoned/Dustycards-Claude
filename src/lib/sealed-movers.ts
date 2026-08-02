import { db } from "@/lib/db";
import {
  buildMoverScores,
  type MoverPriceQuality,
} from "@/lib/mover-scoring";
import { startPerformanceTimer } from "@/lib/performance-timing";
import {
  ALL_GAMES,
  ONE_PIECE_GAME,
  POKEMON_GAME,
  type TradingCardGameFilter,
} from "@/lib/games";
import {
  classifySealedProduct,
  getSealedCategoryLabel,
  getSealedEuMarketPrice,
  type SealedCategory,
} from "@/lib/sealed-products";
import type { MoversItemScope } from "@/lib/movers";
import type { Prisma } from "@/generated/prisma";

const DAY_MS = 1000 * 60 * 60 * 24;
const HISTORY_LOOKBACK_DAYS = 45;
const MIN_PERCENT_BASE_VALUE = 1;
const RECENT_PRICE_SERIES_POINT_LIMIT = 16;
const MAX_SEALED_MOVERS = 500;
const PRICE_SNAPSHOT_PRODUCT_ID_BATCH_SIZE = 400;
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
});
const dateLabelCache = new Map<string, string>();

interface SealedPriceFields {
  cm_lowest: number | null;
  cm_lowest_eu: number | null;
  cm_lowest_de: number | null;
  cm_lowest_fr: number | null;
  cm_lowest_es: number | null;
  cm_lowest_it: number | null;
}

interface SealedPriceEvent {
  fetchedAt: Date;
  price: number;
}

interface SealedSnapshotRow extends SealedPriceFields {
  product_id: string;
  fetched_at: Date;
}

interface SealedSeriesPoint {
  date: string;
  timestamp: number;
  value: number;
}

interface SealedWindowMetric {
  change: number;
  changePct: number | null;
  coveredDays: number;
}

interface SealedPeakGapMetric {
  change: number;
  changePct: number | null;
}

interface SealedLifetimeMetrics {
  firstTrackedAt: string | null;
  firstPrice: number | null;
  lowAt: string | null;
  lowPrice: number | null;
  highAt: string | null;
  highPrice: number | null;
  trackedDays: number | null;
  lifetimeHistoryPoints: number;
  changeSinceTracked: SealedWindowMetric | null;
  changeFromLow: SealedWindowMetric | null;
  gapToPeak: SealedPeakGapMetric | null;
}

export interface SealedMoverRecentPricePoint {
  date: string;
  label: string;
  value: number;
}

export interface SealedMoverItem {
  productId: string;
  name: string;
  imageUrl: string | null;
  episodeId: string;
  episodeName: string;
  episodeCode: string | null;
  category: SealedCategory;
  categoryLabel: string;
  ownedCount: number;
  currency: "EUR";
  currentPrice: number;
  latestFetchedAt: string;
  historyPoints: number;
  lifetimeHistoryPoints: number;
  recentPriceSeries: SealedMoverRecentPricePoint[];
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
  movementScore: number;
  opportunityScore: number;
  rankingScore: number;
  priceQuality: MoverPriceQuality;
  moverScore: number;
}

export interface UpcomingSealedRelease {
  id: string;
  kind: "product";
  name: string;
  imageUrl: string | null;
  releaseDate: string;
  daysUntil: number;
  sourceName: string;
  sourceUrl: string | null;
  confidence: number | null;
  productId: string | null;
  episodeId: string | null;
  episodeName: string | null;
  episodeCode: string | null;
}

export interface SealedMoversData {
  scope: "sealed";
  itemScope: MoversItemScope;
  trackedProducts: number;
  eligibleProducts: number;
  movers: SealedMoverItem[];
  cheapestMovers: SealedMoverItem[];
  strongest7d: SealedMoverItem | null;
  strongest30d: SealedMoverItem | null;
  updatedAt: string | null;
  upcomingReleases: UpcomingSealedRelease[];
}

function round(value: number, decimals = 2): number {
  return Number(value.toFixed(decimals));
}

function toDateKey(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function toDateLabel(dateKey: string): string {
  const cached = dateLabelCache.get(dateKey);
  if (cached) return cached;

  const label = SHORT_DATE_FORMATTER.format(new Date(`${dateKey}T00:00:00.000Z`));
  dateLabelCache.set(dateKey, label);
  return label;
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

function getSealedPrice(value: SealedPriceFields): number | null {
  const price = getSealedEuMarketPrice(value);

  return price != null && price > 0 ? price : null;
}

function computeWindowMetric(
  series: SealedSeriesPoint[],
  desiredDays: number
): SealedWindowMetric | null {
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

  return { change, changePct, coveredDays };
}

function computeMetricFromBaseline(
  currentValue: number,
  currentAt: Date | string,
  baselineValue: number | null,
  baselineAt: Date | string | null | undefined
): SealedWindowMetric | null {
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

  return { change, changePct, coveredDays };
}

function computeGapToPeakMetric(
  currentValue: number,
  peakValue: number | null
): SealedPeakGapMetric | null {
  if (peakValue == null || peakValue <= 0) {
    return null;
  }

  const change = round(currentValue - peakValue);
  return {
    change,
    changePct: round((change / Math.max(peakValue, MIN_PERCENT_BASE_VALUE)) * 100, 1),
  };
}

function buildSeries(events: SealedPriceEvent[]): SealedSeriesPoint[] {
  const byDay = new Map<string, SealedSeriesPoint>();

  for (const event of events) {
    const date = toDateKey(event.fetchedAt);
    const timestamp = new Date(event.fetchedAt).getTime();
    const existing = byDay.get(date);
    if (existing && existing.timestamp > timestamp) {
      continue;
    }

    byDay.set(date, {
      date,
      timestamp: new Date(`${date}T00:00:00.000Z`).getTime(),
      value: event.price,
    });
  }

  return [...byDay.values()].sort((a, b) => a.timestamp - b.timestamp);
}

function buildRecentPriceSeries(series: SealedSeriesPoint[]): SealedMoverRecentPricePoint[] {
  return series.slice(-RECENT_PRICE_SERIES_POINT_LIMIT).map((point) => ({
    date: point.date,
    label: toDateLabel(point.date),
    value: round(point.value),
  }));
}

function buildLifetimeMetrics(
  currentPrice: number,
  currentAt: Date,
  events: SealedPriceEvent[]
): SealedLifetimeMetrics {
  const sorted = [...events].sort((a, b) => a.fetchedAt.getTime() - b.fetchedAt.getTime());
  const first = sorted[0] ?? null;
  const low = sorted.reduce<SealedPriceEvent | null>(
    (best, event) => (!best || event.price < best.price ? event : best),
    null
  );
  const high = sorted.reduce<SealedPriceEvent | null>(
    (best, event) => (!best || event.price > best.price ? event : best),
    null
  );

  const changeSinceTracked = computeMetricFromBaseline(
    currentPrice,
    currentAt,
    first?.price ?? null,
    first?.fetchedAt
  );
  const changeFromLow = computeMetricFromBaseline(
    currentPrice,
    currentAt,
    low?.price ?? null,
    low?.fetchedAt
  );
  const gapToPeak = computeGapToPeakMetric(currentPrice, high?.price ?? null);
  const trackedDays = first
    ? Math.max(1, Math.round((currentAt.getTime() - first.fetchedAt.getTime()) / DAY_MS))
    : null;

  return {
    firstTrackedAt: toIsoOrNull(first?.fetchedAt),
    firstPrice: first ? round(first.price) : null,
    lowAt: toIsoOrNull(low?.fetchedAt),
    lowPrice: low ? round(low.price) : null,
    highAt: toIsoOrNull(high?.fetchedAt),
    highPrice: high ? round(high.price) : null,
    trackedDays,
    lifetimeHistoryPoints: sorted.length,
    changeSinceTracked,
    changeFromLow,
    gapToPeak,
  };
}

function pickStrongestMover(
  movers: SealedMoverItem[],
  metric: "change7dPct" | "change30dPct"
): SealedMoverItem | null {
  return (
    [...movers]
      .filter((item) => item.priceQuality.status !== "suspicious" && item[metric] != null)
      .sort((a, b) => (b[metric] ?? Number.NEGATIVE_INFINITY) - (a[metric] ?? Number.NEGATIVE_INFINITY))[0] ??
    null
  );
}

function combineSealedMoversData(results: SealedMoversData[]): SealedMoversData {
  const sourceResult = results[0];
  const movers = results
    .flatMap((result) => result.movers)
    .sort((a, b) => b.rankingScore - a.rankingScore || a.name.localeCompare(b.name, "en", { numeric: true }))
    .slice(0, MAX_SEALED_MOVERS);
  const cheapestMovers = results
    .flatMap((result) => result.cheapestMovers)
    .sort((a, b) => a.currentPrice - b.currentPrice || b.rankingScore - a.rankingScore)
    .slice(0, 12);
  const upcomingReleases = [...new Map(
    results.flatMap((result) => result.upcomingReleases).map((release) => [release.id, release])
  ).values()]
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate) || a.name.localeCompare(b.name))
    .slice(0, 60);

  return {
    scope: "sealed",
    itemScope: sourceResult?.itemScope ?? "all",
    trackedProducts: results.reduce((total, result) => total + result.trackedProducts, 0),
    eligibleProducts: results.reduce((total, result) => total + result.eligibleProducts, 0),
    movers,
    cheapestMovers,
    strongest7d: pickStrongestMover(movers, "change7dPct"),
    strongest30d: pickStrongestMover(movers, "change30dPct"),
    updatedAt:
      [...results]
        .map((result) => result.updatedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null,
    upcomingReleases,
  };
}

async function getUpcomingSealedReleases(
  game: Exclude<TradingCardGameFilter, typeof ALL_GAMES>
): Promise<UpcomingSealedRelease[]> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const watchedProducts = await db.sealedReleaseWatch.findMany({
    where: { game, release_date: { gte: today } },
    orderBy: [{ release_date: "asc" }, { name: "asc" }],
    take: 60,
  });

  const matchedProductIds = watchedProducts
    .map((release) => release.matched_product_id)
    .filter((id): id is string => Boolean(id));
  const matchedProducts = matchedProductIds.length
    ? await db.sealedProduct.findMany({
        where: { id: { in: matchedProductIds } },
        select: {
          id: true,
          episode: { select: { id: true, name: true, code: true } },
        },
      })
    : [];
  const matchedById = new Map(matchedProducts.map((product) => [product.id, product]));

  return watchedProducts.map((release): UpcomingSealedRelease => {
    const matched = release.matched_product_id
      ? matchedById.get(release.matched_product_id) ?? null
      : null;
    return {
      id: `product:${release.id}`,
      kind: "product",
      name: release.name,
      imageUrl: release.image_url,
      releaseDate: release.release_date.toISOString(),
      daysUntil: Math.max(0, Math.ceil((release.release_date.getTime() - today.getTime()) / DAY_MS)),
      sourceName: release.source_name,
      sourceUrl: release.source_url,
      confidence: release.confidence,
      productId: matched?.id ?? null,
      episodeId: matched?.episode.id ?? null,
      episodeName: matched?.episode.name ?? null,
      episodeCode: matched?.episode.code ?? null,
    };
  });
}

function getPricePresenceWhere(): Prisma.SealedPriceSnapshotWhereInput["OR"] {
  return [
    { cm_lowest: { not: null } },
    { cm_lowest_eu: { not: null } },
    { cm_lowest_de: { not: null } },
    { cm_lowest_fr: { not: null } },
    { cm_lowest_es: { not: null } },
    { cm_lowest_it: { not: null } },
  ];
}

function chunkProductIds(productIds: string[]): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < productIds.length; index += PRICE_SNAPSHOT_PRODUCT_ID_BATCH_SIZE) {
    chunks.push(productIds.slice(index, index + PRICE_SNAPSHOT_PRODUCT_ID_BATCH_SIZE));
  }
  return chunks;
}

async function fetchSealedSnapshotRows(input: {
  productIds: string[];
  allProducts: boolean;
  fetchedAtGte?: Date;
}): Promise<SealedSnapshotRow[]> {
  if (input.productIds.length === 0) {
    return [];
  }

  const batches = input.allProducts ? [null] : chunkProductIds(input.productIds);
  const rows: SealedSnapshotRow[] = [];

  for (const batch of batches) {
    const where: Prisma.SealedPriceSnapshotWhereInput = {
      OR: getPricePresenceWhere(),
    };

    if (batch) {
      where.product_id = { in: batch };
    }

    if (input.fetchedAtGte) {
      where.fetched_at = { gte: input.fetchedAtGte };
    }

    rows.push(
      ...(await db.sealedPriceSnapshot.findMany({
        where,
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

export async function getSealedMovers(
  itemScope: MoversItemScope = "all",
  userId: string,
  game: TradingCardGameFilter = POKEMON_GAME
): Promise<SealedMoversData> {
  if (game === ALL_GAMES) {
    return combineSealedMoversData(
      await Promise.all([
        getSealedMovers(itemScope, userId, POKEMON_GAME),
        getSealedMovers(itemScope, userId, ONE_PIECE_GAME),
      ])
    );
  }

  const timer = startPerformanceTimer("movers.sealed", { itemScope, game });
  const upcomingReleasesPromise = getUpcomingSealedReleases(game);
  const productWhere =
    itemScope === "collection"
      ? {
          game,
          collectionItems: {
            some: { user_id: userId },
          },
        }
      : { game };

  const products = await db.sealedProduct.findMany({
    where: productWhere,
    orderBy: [{ synced_at: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      image_url: true,
      synced_at: true,
      cm_lowest: true,
      cm_lowest_eu: true,
      cm_lowest_de: true,
      cm_lowest_fr: true,
      cm_lowest_es: true,
      cm_lowest_it: true,
      episode: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      collectionItems: {
        where: { user_id: userId },
        select: { quantity: true },
      },
    },
  });

  const productIds = products.map((product) => product.id);
  const historyCutoff = new Date(Date.now() - HISTORY_LOOKBACK_DAYS * DAY_MS);
  const [recentSnapshots, allSnapshots] =
    productIds.length === 0
      ? [[], []]
      : await Promise.all([
          fetchSealedSnapshotRows({
            productIds,
            allProducts: itemScope === "all",
            fetchedAtGte: historyCutoff,
          }),
          fetchSealedSnapshotRows({
            productIds,
            allProducts: itemScope === "all",
          }),
        ]);

  const recentByProductId = new Map<string, SealedPriceEvent[]>();
  const allByProductId = new Map<string, SealedPriceEvent[]>();

  for (const snapshot of recentSnapshots) {
    const price = getSealedPrice(snapshot);
    if (price == null) continue;
    const events = recentByProductId.get(snapshot.product_id) ?? [];
    events.push({ fetchedAt: snapshot.fetched_at, price });
    recentByProductId.set(snapshot.product_id, events);
  }

  for (const snapshot of allSnapshots) {
    const price = getSealedPrice(snapshot);
    if (price == null) continue;
    const events = allByProductId.get(snapshot.product_id) ?? [];
    events.push({ fetchedAt: snapshot.fetched_at, price });
    allByProductId.set(snapshot.product_id, events);
  }

  const movers = products
    .map((product): SealedMoverItem | null => {
      const currentPrice = getSealedPrice(product);
      if (currentPrice == null) return null;

      const currentEvent = {
        fetchedAt: product.synced_at,
        price: currentPrice,
      };
      const recentEvents = [...(recentByProductId.get(product.id) ?? []), currentEvent];
      const allEvents = [...(allByProductId.get(product.id) ?? []), currentEvent];
      const series = buildSeries(recentEvents);
      const change7d = computeWindowMetric(series, 7);
      const change30d = computeWindowMetric(series, 30);
      const lifetime = buildLifetimeMetrics(currentPrice, product.synced_at, allEvents);
      const category = classifySealedProduct(product.name);
      const ownedCount = product.collectionItems.reduce(
        (sum, item) => sum + Math.max(0, item.quantity),
        0
      );
      const scores = buildMoverScores({
        kind: "sealed",
        currentPrice,
        change7d,
        change30d,
        changeSinceTrackedPct: lifetime.changeSinceTracked?.changePct ?? null,
        changeFromLowPct: lifetime.changeFromLow?.changePct ?? null,
        gapToPeakPct: lifetime.gapToPeak?.changePct ?? null,
        historyPoints: series.length,
        lifetimeHistoryPoints: lifetime.lifetimeHistoryPoints,
      });

      return {
        productId: product.id,
        name: product.name,
        imageUrl: product.image_url,
        episodeId: product.episode.id,
        episodeName: product.episode.name,
        episodeCode: product.episode.code,
        category,
        categoryLabel: getSealedCategoryLabel(category),
        ownedCount,
        currency: "EUR",
        currentPrice: round(currentPrice),
        latestFetchedAt: product.synced_at.toISOString(),
        historyPoints: series.length,
        lifetimeHistoryPoints: lifetime.lifetimeHistoryPoints,
        recentPriceSeries: buildRecentPriceSeries(series),
        trackedDays: lifetime.trackedDays,
        change7d: change7d?.change ?? null,
        change7dPct: change7d?.changePct ?? null,
        change7dCoveredDays: change7d?.coveredDays ?? null,
        change30d: change30d?.change ?? null,
        change30dPct: change30d?.changePct ?? null,
        change30dCoveredDays: change30d?.coveredDays ?? null,
        changeSinceTracked: lifetime.changeSinceTracked?.change ?? null,
        changeSinceTrackedPct: lifetime.changeSinceTracked?.changePct ?? null,
        changeSinceTrackedCoveredDays: lifetime.changeSinceTracked?.coveredDays ?? null,
        changeFromLow: lifetime.changeFromLow?.change ?? null,
        changeFromLowPct: lifetime.changeFromLow?.changePct ?? null,
        changeFromLowCoveredDays: lifetime.changeFromLow?.coveredDays ?? null,
        gapToPeak: lifetime.gapToPeak?.change ?? null,
        gapToPeakPct: lifetime.gapToPeak?.changePct ?? null,
        firstTrackedAt: lifetime.firstTrackedAt,
        firstPrice: lifetime.firstPrice,
        lowAt: lifetime.lowAt,
        lowPrice: lifetime.lowPrice,
        highAt: lifetime.highAt,
        highPrice: lifetime.highPrice,
        movementScore: scores.movementScore,
        opportunityScore: scores.opportunityScore,
        rankingScore: scores.rankingScore,
        priceQuality: scores.priceQuality,
        moverScore: scores.rankingScore,
      };
    })
    .filter((item): item is SealedMoverItem => Boolean(item))
    .sort((a, b) => b.rankingScore - a.rankingScore || a.name.localeCompare(b.name, "en", { numeric: true }))
    .slice(0, MAX_SEALED_MOVERS);

  const cheapestMovers = movers
    .filter((item) => item.currentPrice <= 75 && item.rankingScore > 0)
    .sort((a, b) => a.currentPrice - b.currentPrice || b.rankingScore - a.rankingScore)
    .slice(0, 12);

  const result: SealedMoversData = {
    scope: "sealed",
    itemScope,
    trackedProducts: products.length,
    eligibleProducts: movers.length,
    movers,
    cheapestMovers,
    strongest7d: pickStrongestMover(movers, "change7dPct"),
    strongest30d: pickStrongestMover(movers, "change30dPct"),
    updatedAt: movers[0]?.latestFetchedAt ?? null,
    upcomingReleases: await upcomingReleasesPromise,
  };

  timer.finish({
    trackedProducts: result.trackedProducts,
    eligibleProducts: result.eligibleProducts,
    recentRows: recentSnapshots.length,
    allRows: allSnapshots.length,
  });

  return result;
}
