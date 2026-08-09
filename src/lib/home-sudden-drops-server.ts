import { db } from "@/lib/db";
import {
  ALL_GAMES,
  ONE_PIECE_GAME,
  POKEMON_GAME,
  type TradingCardGame,
  type TradingCardGameFilter,
} from "@/lib/games";
import type {
  HomeSuddenDropPreviewItem,
  HomeSuddenDropsResponse,
} from "@/lib/home-sudden-drops";
import { HOME_SUDDEN_DROP_PREVIEW_SIZE } from "@/lib/home-sudden-drops";
import {
  SUDDEN_DROP_DEAL_MAX_CURRENT_PRICE,
  type CollectionMoverItem,
} from "@/lib/movers";
import type { MoverPriceQuality } from "@/lib/mover-scoring";
import { normalizeRarityLabel } from "@/lib/rarity";
import type { PriceSource } from "@/lib/user-settings";

export const FAST_SUDDEN_DROP_FEED_LIMIT = 500;
export const FAST_SUDDEN_DROP_LATEST_WINDOW_DAYS = 1;
export const FAST_SUDDEN_DROP_WINDOW_HOURS = 24;
export const FAST_SUDDEN_DROP_MIN_AMOUNT = 5;
export const FAST_SUDDEN_DROP_STRONG_AMOUNT = 25;
export const FAST_SUDDEN_DROP_MIN_PERCENT = 10;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.25;
type FastSuddenDropSnapshotPrefix = "latest" | "anchor";

export interface FastSuddenDropQueryOptions {
  minimumAmount?: number;
  minimumPercent?: number | null;
  percentBypassAmount?: number;
}

interface FastSuddenDropThresholds {
  minimumAmount: number;
  minimumPercent: number | null;
  percentBypassAmount: number;
}

interface FastSuddenDropRow {
  card_id: string;
  name: string;
  image_url: string | null;
  card_number: string | null;
  rarity: string | null;
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  episode_release_date: string | null;
  current_price: number;
  cardmarket_price: number | null;
  tcgplayer_price: number | null;
  old7_price: number | null;
  old30_price: number | null;
  latest_cm_en_lowest_nm: number | null;
  latest_cm_de_lowest_nm: number | null;
  latest_cm_fr_lowest_nm: number | null;
  latest_cm_es_lowest_nm: number | null;
  latest_cm_it_lowest_nm: number | null;
  latest_cm_jp_lowest_nm: number | null;
  latest_cm_en_avg_7d: number | null;
  latest_cm_en_avg_30d: number | null;
  anchor_cm_en_lowest_nm: number | null;
  anchor_cm_de_lowest_nm: number | null;
  anchor_cm_fr_lowest_nm: number | null;
  anchor_cm_es_lowest_nm: number | null;
  anchor_cm_it_lowest_nm: number | null;
  anchor_cm_jp_lowest_nm: number | null;
  anchor_cm_en_avg_7d: number | null;
  anchor_cm_en_avg_30d: number | null;
  latest_fetched_at: string;
  latest_changed_at: string | null;
  anchor_fetched_at: string | null;
  history_points: number | null;
  drop_amount: number;
  drop_percent: number | null;
  total_count: number;
}

export interface FastSuddenDropsData {
  items: CollectionMoverItem[];
  preview: HomeSuddenDropsResponse;
  refresh: FastSuddenDropRefreshMetadata | null;
}

export interface FastSuddenDropRefreshMetadata {
  startedAt: string;
  finishedAt: string | null;
  status: string;
}

export interface FastSuddenDropRefreshWindow {
  startedAt: Date;
  finishedAt: Date | null;
  status: string;
}

function priceExpression(alias: string, source: PriceSource): string {
  if (source === "tcp") {
    return `${alias}.tcp_market`;
  }

  return `${alias}.cm_en_lowest_nm`;
}

function getSourceLabel(source: PriceSource): "CardMarket" | "TCGPlayer" {
  return source === "tcp" ? "TCGPlayer" : "CardMarket";
}

function resolveFastSuddenDropThresholds(
  options?: FastSuddenDropQueryOptions
): FastSuddenDropThresholds {
  const minimumAmount =
    options?.minimumAmount != null && Number.isFinite(options.minimumAmount)
      ? Math.max(options.minimumAmount, 0)
      : FAST_SUDDEN_DROP_MIN_AMOUNT;
  const minimumPercent =
    options?.minimumPercent === null
      ? null
      : options?.minimumPercent != null && Number.isFinite(options.minimumPercent)
        ? Math.max(options.minimumPercent, 0)
        : FAST_SUDDEN_DROP_MIN_PERCENT;
  const percentBypassAmount =
    options?.percentBypassAmount != null && Number.isFinite(options.percentBypassAmount)
      ? Math.max(options.percentBypassAmount, minimumAmount)
      : Math.max(FAST_SUDDEN_DROP_STRONG_AMOUNT, minimumAmount);

  return { minimumAmount, minimumPercent, percentBypassAmount };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function getCardMarketListingReference(
  row: FastSuddenDropRow,
  prefix: FastSuddenDropSnapshotPrefix
): number | null {
  const otherLanguages = ["de", "fr", "es", "it", "jp"]
    .map((language) => row[`${prefix}_cm_${language}_lowest_nm` as keyof FastSuddenDropRow])
    .filter((value): value is number => typeof value === "number" && value > 0);
  const languageReference = median(otherLanguages);
  if (languageReference != null) return languageReference;

  const averages = [row[`${prefix}_cm_en_avg_30d`], row[`${prefix}_cm_en_avg_7d`]]
    .filter((value): value is number => typeof value === "number" && value > 0);
  return median(averages);
}

function isSuspiciousCardMarketListing(price: number | null, reference: number | null): boolean {
  if (price == null || reference == null || price <= 0 || reference <= 0) return false;

  const suspiciousHigh =
    price >= 300 && price - reference >= 250 && price / reference >= 8;
  const suspiciousLow =
    reference >= 50 && reference - price >= 50 && price <= reference * 0.15;

  return suspiciousHigh || suspiciousLow;
}

function getDropMetrics(input: {
  currentPrice: number;
  old7Price: number | null;
  old30Price: number | null;
}): { dropAmount: number; dropPercent: number | null } {
  const drop7 =
    input.old7Price != null && input.old7Price > input.currentPrice
      ? input.old7Price - input.currentPrice
      : 0;
  const drop30 =
    input.old30Price != null && input.old30Price > input.currentPrice
      ? input.old30Price - input.currentPrice
      : 0;
  const dropAmount = Number(Math.max(drop7, drop30).toFixed(2));
  const baseline = drop7 >= drop30 ? input.old7Price : input.old30Price;
  const dropPercent =
    baseline != null && baseline > 0 && dropAmount > 0
      ? Number(((input.currentPrice - baseline) / baseline * 100).toFixed(1))
      : null;

  return { dropAmount, dropPercent };
}

export function getFastSuddenDropCoveredDays(
  latestFetchedAt: Date | string | null | undefined,
  anchorFetchedAt: Date | string | null | undefined
): number | null {
  if (!latestFetchedAt || !anchorFetchedAt) return null;

  const latestTime = new Date(latestFetchedAt).getTime();
  const anchorTime = new Date(anchorFetchedAt).getTime();
  if (!Number.isFinite(latestTime) || !Number.isFinite(anchorTime) || latestTime < anchorTime) {
    return null;
  }

  return Math.max(1, Math.round((latestTime - anchorTime) / MS_PER_DAY));
}

export function getFastSuddenDropRollingWindow(
  now = new Date()
): FastSuddenDropRefreshWindow {
  return {
    startedAt: new Date(now.getTime() - FAST_SUDDEN_DROP_WINDOW_HOURS * 60 * 60 * 1000),
    finishedAt: now,
    status: "rolling",
  };
}

function toRefreshMetadata(
  refresh: FastSuddenDropRefreshWindow | null
): FastSuddenDropRefreshMetadata | null {
  if (!refresh) return null;

  return {
    startedAt: refresh.startedAt.toISOString(),
    finishedAt: refresh.finishedAt?.toISOString() ?? null,
    status: refresh.status,
  };
}

function normalizeDropRow(
  row: FastSuddenDropRow,
  source: PriceSource,
  thresholds: FastSuddenDropThresholds
): FastSuddenDropRow | null {
  const currentPrice =
    source === "tcp"
      ? row.current_price
      : row.latest_cm_en_lowest_nm;
  if (
    currentPrice == null ||
    currentPrice < 3 ||
    currentPrice > SUDDEN_DROP_DEAL_MAX_CURRENT_PRICE
  ) {
    return null;
  }

  const anchorPrice =
    source === "tcp"
      ? row.old7_price
      : row.anchor_cm_en_lowest_nm;
  const { dropAmount, dropPercent } = getDropMetrics({
    currentPrice,
    old7Price: anchorPrice,
    old30Price: null,
  });

  if (
    dropAmount < thresholds.minimumAmount ||
    (thresholds.minimumPercent != null &&
      dropAmount < thresholds.percentBypassAmount &&
      Math.abs(dropPercent ?? 0) < thresholds.minimumPercent)
  ) {
    return null;
  }

  return {
    ...row,
    current_price: currentPrice,
    cardmarket_price:
      source === "tcp" ? row.latest_cm_en_lowest_nm : currentPrice,
    old7_price: anchorPrice,
    old30_price: null,
    drop_amount: dropAmount,
    drop_percent: dropPercent,
  };
}

function getReleaseAgeYears(releaseDate: string | null): number | null {
  if (!releaseDate) return null;
  const timestamp = new Date(releaseDate).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Number(((Date.now() - timestamp) / MS_PER_YEAR).toFixed(1)));
}

function getQuickRarityWeight(normalizedRarity: string | null): number {
  if (!normalizedRarity) return 1;
  const rarity = normalizedRarity.toLowerCase();

  if (rarity.includes("manga") || rarity.includes("star")) return 1.65;
  if (rarity.includes("special") || rarity.includes("secret")) return 1.45;
  if (rarity.includes("alternate") || rarity.includes("rare ultra")) return 1.3;
  if (rarity.includes("super") || rarity.includes("holo")) return 1.15;
  return 1;
}

function getPriceQuality(row: FastSuddenDropRow, source: PriceSource): MoverPriceQuality {
  const percent = Math.abs(row.drop_percent ?? 0);
  const historyPoints = Number(row.history_points ?? 0);

  if (
    source === "cm_en" &&
    (isSuspiciousCardMarketListing(
      row.latest_cm_en_lowest_nm,
      getCardMarketListingReference(row, "latest")
    ) ||
      isSuspiciousCardMarketListing(
        row.anchor_cm_en_lowest_nm,
        getCardMarketListingReference(row, "anchor")
      ))
  ) {
    return { status: "suspicious", reason: "Outlier listing ignored" };
  }

  if (percent >= 1000 && row.drop_amount >= 25) {
    return { status: "suspicious", reason: "Outlier ignored" };
  }

  if (percent >= 400 && row.drop_amount >= 100 && historyPoints < 6) {
    return { status: "suspicious", reason: "Outlier ignored" };
  }

  if (historyPoints < 3) {
    return { status: "thin_history", reason: "Thin history" };
  }

  return { status: "ok", reason: null };
}

function toPreviewItem(
  item: CollectionMoverItem,
  dropAmount: number,
  dropPercent: number | null
): HomeSuddenDropPreviewItem {
  return {
    cardId: item.cardId,
    name: item.name,
    imageUrl: item.imageUrl,
    cardNumber: item.cardNumber,
    episodeName: item.episodeName,
    episodeCode: item.episodeCode,
    source: item.source,
    sourceLabel: item.sourceLabel,
    currentPrice: item.currentPrice,
    currency: item.currency,
    dropAmount,
    dropPercent,
    coveredDays: item.change7dCoveredDays ?? item.change30dCoveredDays ?? null,
  };
}

function toMoverItem(row: FastSuddenDropRow, source: PriceSource): CollectionMoverItem {
  const sourceLabel = getSourceLabel(source);
  const currency = source === "tcp" ? "USD" : "EUR";
  const currentPrice = Number(row.current_price.toFixed(2));
  const anchorPrice = row.old7_price ?? null;
  const change7d =
    anchorPrice != null ? Number((currentPrice - anchorPrice).toFixed(2)) : null;
  const change30d: number | null = null;
  const change7dPct =
    anchorPrice != null && anchorPrice > 0
      ? Number((((currentPrice - anchorPrice) / anchorPrice) * 100).toFixed(1))
      : null;
  const change30dPct: number | null = null;
  const coveredDays =
    getFastSuddenDropCoveredDays(row.latest_fetched_at, row.anchor_fetched_at) ??
    FAST_SUDDEN_DROP_LATEST_WINDOW_DAYS;
  const normalizedRarity = normalizeRarityLabel(row.rarity);
  const rarityWeight = getQuickRarityWeight(normalizedRarity);
  const releaseAgeYears = getReleaseAgeYears(row.episode_release_date);
  const priceQuality = getPriceQuality(row, source);
  const movementScore = Number((-row.drop_amount).toFixed(2));
  const rankingScore = Number((row.drop_amount * rarityWeight).toFixed(2));

  return {
    cardId: row.card_id,
    name: row.name,
    imageUrl: row.image_url,
    cardNumber: row.card_number,
    rarity: row.rarity,
    normalizedRarity,
    episodeId: row.episode_id,
    episodeName: row.episode_name,
    episodeCode: row.episode_code,
    episodeReleaseDate: row.episode_release_date,
    releaseAgeYears,
    ownedCount: 0,
    source: source === "tcp" ? "tcgplayer" : "cardmarket",
    sourceLabel,
    currency,
    currentPrice,
    cardmarketPrice: row.cardmarket_price,
    tcgplayerPrice: row.tcgplayer_price,
    gradedLabel: null,
    gradedPrices: [],
    grading: null,
    latestFetchedAt: new Date(row.latest_fetched_at).toISOString(),
    historyPoints: Number(row.history_points ?? 0),
    cardmarketHistoryPoints: source === "tcp" ? 0 : Number(row.history_points ?? 0),
    tcgplayerHistoryPoints: source === "tcp" ? Number(row.history_points ?? 0) : 0,
    lifetimeHistoryPoints: Number(row.history_points ?? 0),
    recentPriceSeries: [],
    trackedDays: null,
    change7d,
    change7dPct,
    change7dCoveredDays: change7d == null ? null : coveredDays,
    change30d,
    change30dPct,
    change30dCoveredDays: null,
    changeSinceTracked: null,
    changeSinceTrackedPct: null,
    changeSinceTrackedCoveredDays: null,
    changeFromLow: null,
    changeFromLowPct: null,
    changeFromLowCoveredDays: null,
    gapToPeak: null,
    gapToPeakPct: null,
    firstTrackedAt: null,
    firstPrice: null,
    lowAt: null,
    lowPrice: null,
    highAt: null,
    highPrice: null,
    rarityWeight,
    pullRateOdds: null,
    specificPullOdds: null,
    pullRateWeight: null,
    pullRateSource: null,
    cheapnessWeight: currentPrice <= 120 ? 1 : 0,
    ageWeight: releaseAgeYears != null && releaseAgeYears >= 3 ? 1.15 : 1,
    olderValueScore: 0,
    tcggoScore: null,
    movementScore,
    opportunityScore: currentPrice <= 120 ? 2 : 0,
    rankingScore,
    priceQuality,
    buySignal: null,
    moverScore: rankingScore,
  };
}

function compareFastSuddenDrops(a: CollectionMoverItem, b: CollectionMoverItem): number {
  const dropDiff =
    Math.max(Math.abs(a.change7d ?? 0), Math.abs(a.change30d ?? 0)) -
    Math.max(Math.abs(b.change7d ?? 0), Math.abs(b.change30d ?? 0));
  if (dropDiff !== 0) return -dropDiff;

  const percentDiff =
    Math.max(Math.abs(a.change7dPct ?? 0), Math.abs(a.change30dPct ?? 0)) -
    Math.max(Math.abs(b.change7dPct ?? 0), Math.abs(b.change30dPct ?? 0));
  if (percentDiff !== 0) return -percentDiff;

  return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
}

async function getFastSuddenDropRows(
  source: PriceSource,
  game: TradingCardGame,
  limit: number,
  refresh: FastSuddenDropRefreshWindow,
  thresholds: FastSuddenDropThresholds
): Promise<FastSuddenDropRow[]> {
  const selectedPrice = priceExpression("latest", source);
  const selectedPriceAnchor = priceExpression("anchor", source);
  const selectedPriceSubquery = priceExpression("p", source);
  const selectedPriceNewer = priceExpression("newer", source);
  const cmCurrent = priceExpression("latest", "cm_en");
  const tcpCurrent = priceExpression("latest", "tcp");
  const refreshStartedAt = refresh.startedAt.toISOString();
  const refreshEndedAt = (refresh.finishedAt ?? new Date()).toISOString();

  return db.$queryRawUnsafe<FastSuddenDropRow[]>(
    `
    WITH latest AS (
      SELECT
        latest.id AS latest_price_id,
        c.id AS card_id,
        c.name,
        c.image_url,
        c.card_number,
        c.rarity,
        e.id AS episode_id,
        e.name AS episode_name,
        e.code AS episode_code,
        e.release_date AS episode_release_date,
        ${selectedPrice} AS current_price,
        ${cmCurrent} AS cardmarket_price,
        ${tcpCurrent} AS tcgplayer_price,
        latest.cm_en_lowest_nm AS latest_cm_en_lowest_nm,
        latest.cm_de_lowest_nm AS latest_cm_de_lowest_nm,
        latest.cm_fr_lowest_nm AS latest_cm_fr_lowest_nm,
        latest.cm_es_lowest_nm AS latest_cm_es_lowest_nm,
        latest.cm_it_lowest_nm AS latest_cm_it_lowest_nm,
        latest.cm_jp_lowest_nm AS latest_cm_jp_lowest_nm,
        latest.cm_en_avg_7d AS latest_cm_en_avg_7d,
        latest.cm_en_avg_30d AS latest_cm_en_avg_30d,
        latest.fetched_at AS latest_fetched_at,
        latest.changed_at AS latest_changed_at,
        3 AS history_points
      FROM "Price" latest
      INNER JOIN "Card" c ON c.id = latest.card_id
      INNER JOIN "Episode" e ON e.id = c.episode_id
      WHERE c.game = ?
        AND latest.fetched_at >= ?
        AND latest.fetched_at <= ?
        AND latest.changed_at >= ?
        AND latest.changed_at <= ?
        AND ${selectedPrice} BETWEEN 3 AND ?
        AND NOT EXISTS (
          SELECT 1
          FROM "Price" newer
          WHERE newer.card_id = latest.card_id
            AND ${selectedPriceNewer} >= 3
            AND newer.fetched_at >= ?
            AND newer.fetched_at <= ?
            AND (
              newer.fetched_at > latest.fetched_at
              OR (newer.fetched_at = latest.fetched_at AND newer.id > latest.id)
            )
          LIMIT 1
        )
    ),
    raw AS (
      SELECT
        latest.*,
        ${selectedPriceAnchor} AS old7_price,
        anchor.cm_en_lowest_nm AS anchor_cm_en_lowest_nm,
        anchor.cm_de_lowest_nm AS anchor_cm_de_lowest_nm,
        anchor.cm_fr_lowest_nm AS anchor_cm_fr_lowest_nm,
        anchor.cm_es_lowest_nm AS anchor_cm_es_lowest_nm,
        anchor.cm_it_lowest_nm AS anchor_cm_it_lowest_nm,
        anchor.cm_jp_lowest_nm AS anchor_cm_jp_lowest_nm,
        anchor.cm_en_avg_7d AS anchor_cm_en_avg_7d,
        anchor.cm_en_avg_30d AS anchor_cm_en_avg_30d,
        anchor.fetched_at AS anchor_fetched_at,
        NULL AS old30_price
      FROM latest
      LEFT JOIN "Price" anchor ON anchor.id = (
        SELECT p.id
        FROM "Price" p
        WHERE p.card_id = latest.card_id
          AND ${selectedPriceSubquery} IS NOT NULL
          AND (
            p.fetched_at < latest.latest_fetched_at
            OR (p.fetched_at = latest.latest_fetched_at AND p.id < latest.latest_price_id)
          )
        ORDER BY p.fetched_at DESC, p.id DESC
        LIMIT 1
      )
    ),
    scored AS (
      SELECT
        *,
        CASE WHEN old7_price > current_price THEN old7_price - current_price ELSE 0 END AS drop_amount,
        CASE
          WHEN old7_price > current_price
            THEN ((current_price - old7_price) / old7_price) * 100
          ELSE NULL
        END AS drop_percent
      FROM raw
    ),
    filtered AS (
      SELECT *
      FROM scored
      WHERE drop_amount >= ?
        AND (? IS NULL OR drop_amount >= ? OR ABS(COALESCE(drop_percent, 0)) >= ?)
    )
    SELECT *, COUNT(*) OVER() AS total_count
    FROM filtered
    ORDER BY drop_amount DESC, current_price ASC, name ASC
    LIMIT ?
  `,
    game,
    refreshStartedAt,
    refreshEndedAt,
    refreshStartedAt,
    refreshEndedAt,
    SUDDEN_DROP_DEAL_MAX_CURRENT_PRICE,
    refreshStartedAt,
    refreshEndedAt,
    thresholds.minimumAmount,
    thresholds.minimumPercent,
    thresholds.percentBypassAmount,
    thresholds.minimumPercent,
    limit
  );
}

function getDropAmount(item: CollectionMoverItem): number {
  return Math.max(
    item.change7d != null && item.change7d < 0 ? Math.abs(item.change7d) : 0,
    item.change30d != null && item.change30d < 0 ? Math.abs(item.change30d) : 0
  );
}

function getDropPercent(item: CollectionMoverItem): number | null {
  const candidates = [
    { change: item.change7d, percent: item.change7dPct },
    { change: item.change30d, percent: item.change30dPct },
  ]
    .filter(
      (candidate): candidate is { change: number; percent: number | null } =>
        candidate.change != null && candidate.change < 0
    )
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  return candidates[0]?.percent ?? null;
}

function buildFastSuddenDropsData(
  items: CollectionMoverItem[],
  limit: number,
  refresh: FastSuddenDropRefreshWindow | null,
  thresholds: FastSuddenDropThresholds,
  totalMatches = items.length
): FastSuddenDropsData {
  const refreshMetadata = toRefreshMetadata(refresh);

  return {
    items,
    refresh: refreshMetadata,
    preview: {
      items: items
        .slice(0, HOME_SUDDEN_DROP_PREVIEW_SIZE)
        .map((item) => toPreviewItem(item, getDropAmount(item), getDropPercent(item))),
      total: totalMatches,
      threshold: thresholds.minimumAmount,
      windowDays: FAST_SUDDEN_DROP_LATEST_WINDOW_DAYS,
      limit,
      refreshStartedAt: refreshMetadata?.startedAt ?? null,
      refreshFinishedAt: refreshMetadata?.finishedAt ?? null,
      refreshStatus: refreshMetadata?.status ?? null,
    },
  };
}

async function getFastSuddenDropsForRefresh(
  source: PriceSource,
  game: TradingCardGameFilter,
  limit: number,
  refresh: FastSuddenDropRefreshWindow | null,
  thresholds: FastSuddenDropThresholds
): Promise<FastSuddenDropsData> {
  if (!refresh) {
    return buildFastSuddenDropsData([], limit, null, thresholds, 0);
  }

  if (game === ALL_GAMES) {
    const [pokemon, onePiece] = await Promise.all([
      getFastSuddenDropsForRefresh(source, POKEMON_GAME, limit, refresh, thresholds),
      getFastSuddenDropsForRefresh(source, ONE_PIECE_GAME, limit, refresh, thresholds),
    ]);
    const items = [...pokemon.items, ...onePiece.items]
      .sort(compareFastSuddenDrops)
      .slice(0, limit);

    return buildFastSuddenDropsData(
      items,
      limit,
      refresh,
      thresholds,
      pokemon.preview.total + onePiece.preview.total
    );
  }

  const rowLimit = Math.min(Math.max(limit * 50, 500), 2500);
  const rows = await getFastSuddenDropRows(source, game, rowLimit, refresh, thresholds);
  const filteredItems = rows
    .map((row) => normalizeDropRow(row, source, thresholds))
    .filter((row): row is FastSuddenDropRow => row !== null)
    .map((row) => toMoverItem(row, source))
    .filter((item) => item.priceQuality.status !== "suspicious")
    .sort(compareFastSuddenDrops);
  const items = filteredItems.slice(0, limit);

  return buildFastSuddenDropsData(
    items,
    limit,
    refresh,
    thresholds,
    filteredItems.length
  );
}

export async function getFastSuddenDropsData(
  source: PriceSource,
  game: TradingCardGameFilter,
  limit = FAST_SUDDEN_DROP_FEED_LIMIT,
  options?: FastSuddenDropQueryOptions
): Promise<FastSuddenDropsData> {
  const refresh = getFastSuddenDropRollingWindow();
  const thresholds = resolveFastSuddenDropThresholds(options);
  return getFastSuddenDropsForRefresh(source, game, limit, refresh, thresholds);
}

export const FAST_SEALED_SUDDEN_DROP_FEED_LIMIT = 120;

export interface FastSealedSuddenDropItem {
  productId: string;
  name: string;
  imageUrl: string | null;
  cardmarketUrl: string | null;
  episodeId: string;
  episodeName: string;
  episodeCode: string | null;
  currency: "EUR";
  currentPrice: number;
  previousPrice: number;
  dropAmount: number;
  dropPercent: number | null;
  latestFetchedAt: string;
}

export interface FastSealedSuddenDropsData {
  items: FastSealedSuddenDropItem[];
  total: number;
}

interface FastSealedSuddenDropRow {
  product_id: string;
  name: string;
  image_url: string | null;
  cardmarket_url: string | null;
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  current_price: number;
  old_price: number;
  drop_amount: number;
  drop_percent: number | null;
  latest_fetched_at: string;
  total_count: number;
}

async function getFastSealedSuddenDropRows(
  game: TradingCardGame,
  limit: number,
  refresh: FastSuddenDropRefreshWindow,
  thresholds: FastSuddenDropThresholds
): Promise<FastSealedSuddenDropRow[]> {
  const refreshStartedAt = refresh.startedAt.toISOString();
  const refreshEndedAt = (refresh.finishedAt ?? new Date()).toISOString();

  return db.$queryRawUnsafe<FastSealedSuddenDropRow[]>(
    `
    WITH latest AS (
      SELECT s.id AS snapshot_id, s.product_id, s.fetched_at, s.cm_lowest
      FROM "SealedPriceSnapshot" s
      WHERE s.fetched_at >= ?
        AND s.fetched_at <= ?
        AND s.cm_lowest >= 5
        AND NOT EXISTS (
          SELECT 1
          FROM "SealedPriceSnapshot" newer
          WHERE newer.product_id = s.product_id
            AND newer.cm_lowest >= 5
            AND newer.fetched_at >= ?
            AND newer.fetched_at <= ?
            AND (
              newer.fetched_at > s.fetched_at
              OR (newer.fetched_at = s.fetched_at AND newer.id > s.id)
            )
          LIMIT 1
        )
    ),
    raw AS (
      SELECT
        latest.product_id,
        p.name,
        p.image_url,
        p.cardmarket_url,
        p.episode_id,
        e.name AS episode_name,
        e.code AS episode_code,
        latest.cm_lowest AS current_price,
        latest.fetched_at AS latest_fetched_at,
        anchor.cm_lowest AS old_price
      FROM latest
      INNER JOIN "SealedProduct" p ON p.id = latest.product_id
      INNER JOIN "Episode" e ON e.id = p.episode_id
      LEFT JOIN "SealedPriceSnapshot" anchor ON anchor.id = (
        SELECT a.id
        FROM "SealedPriceSnapshot" a
        WHERE a.product_id = latest.product_id
          AND a.cm_lowest >= 5
          AND (
            a.fetched_at < latest.fetched_at
            OR (a.fetched_at = latest.fetched_at AND a.id < latest.snapshot_id)
          )
        ORDER BY a.fetched_at DESC, a.id DESC
        LIMIT 1
      )
      WHERE p.game = ?
    ),
    scored AS (
      SELECT
        *,
        CASE WHEN old_price > current_price THEN old_price - current_price ELSE 0 END AS drop_amount,
        CASE
          WHEN old_price > current_price
            THEN ((current_price - old_price) / old_price) * 100
          ELSE NULL
        END AS drop_percent
      FROM raw
      WHERE old_price IS NOT NULL
    ),
    filtered AS (
      SELECT *
      FROM scored
      WHERE drop_amount >= ?
        AND (? IS NULL OR drop_amount >= ? OR ABS(COALESCE(drop_percent, 0)) >= ?)
    )
    SELECT *, COUNT(*) OVER() AS total_count
    FROM filtered
    ORDER BY drop_amount DESC, current_price ASC, name ASC
    LIMIT ?
  `,
    refreshStartedAt,
    refreshEndedAt,
    refreshStartedAt,
    refreshEndedAt,
    game,
    thresholds.minimumAmount,
    thresholds.minimumPercent,
    thresholds.percentBypassAmount,
    thresholds.minimumPercent,
    limit
  );
}

function toSealedSuddenDropItem(row: FastSealedSuddenDropRow): FastSealedSuddenDropItem {
  return {
    productId: row.product_id,
    name: row.name,
    imageUrl: row.image_url,
    cardmarketUrl: row.cardmarket_url,
    episodeId: row.episode_id,
    episodeName: row.episode_name,
    episodeCode: row.episode_code,
    currency: "EUR",
    currentPrice: Number(row.current_price.toFixed(2)),
    previousPrice: Number(row.old_price.toFixed(2)),
    dropAmount: Number(row.drop_amount.toFixed(2)),
    dropPercent: row.drop_percent != null ? Number(row.drop_percent.toFixed(1)) : null,
    latestFetchedAt: new Date(row.latest_fetched_at).toISOString(),
  };
}

function compareSealedSuddenDrops(
  a: FastSealedSuddenDropItem,
  b: FastSealedSuddenDropItem
): number {
  if (a.dropAmount !== b.dropAmount) return b.dropAmount - a.dropAmount;
  if (a.currentPrice !== b.currentPrice) return a.currentPrice - b.currentPrice;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
}

export async function getFastSealedSuddenDropsData(
  game: TradingCardGameFilter,
  limit = FAST_SEALED_SUDDEN_DROP_FEED_LIMIT,
  options?: FastSuddenDropQueryOptions
): Promise<FastSealedSuddenDropsData> {
  const refresh = getFastSuddenDropRollingWindow();
  const thresholds = resolveFastSuddenDropThresholds(options);

  if (game === ALL_GAMES) {
    const [pokemon, onePiece] = await Promise.all([
      getFastSealedSuddenDropsData(POKEMON_GAME, limit, options),
      getFastSealedSuddenDropsData(ONE_PIECE_GAME, limit, options),
    ]);
    const items = [...pokemon.items, ...onePiece.items]
      .sort(compareSealedSuddenDrops)
      .slice(0, limit);

    return { items, total: pokemon.total + onePiece.total };
  }

  const rows = await getFastSealedSuddenDropRows(game, limit, refresh, thresholds);
  const items = rows.map(toSealedSuddenDropItem);

  return { items, total: Number(rows[0]?.total_count ?? items.length) };
}
