import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import type { CollectionCardViewItem, CollectionSealedViewItem } from "@/types/collection-view";
import {
  buildOwnedCardValueHistory,
  buildOwnedGradedCardValueHistory,
  buildOwnedSealedValueHistory,
  buildLinkedBinderCostBasis,
  combineValueHistories,
  type CollectionCostBasis,
  type CollectionCardValueLike,
  type CollectionSealedValueLike,
  getCollectionCardMarketValue,
  getCollectionCardValueInfo,
  getCollectionMatchedGradedPrice,
  getCollectionSealedMarketValue,
  sumCollectionPurchasePrices,
} from "@/lib/collection";
import { getEpisodeDisplayCardCount } from "@/lib/episodes";
import { getUsdToEurRate, type CurrencyExchangeRate } from "@/lib/exchange-rates";
import { getDisplayCardNumber } from "@/lib/card-number-display";
import { parseBgsSubgrades } from "@/lib/graded-slabs";
import {
  ALL_GAMES,
  getExpansionHref,
  isSpecificTradingCardGame,
  ONE_PIECE_GAME,
  POKEMON_GAME,
  type TradingCardGameFilter,
} from "@/lib/games";
import { startPerformanceTimer } from "@/lib/performance-timing";
import {
  getCardMarketValue,
  getSealedCardMarketValue,
  type EpisodePriceHistorySnapshot,
  type EpisodeSealedPriceHistorySnapshot,
} from "@/lib/price-history";
import { buildMoverScores } from "@/lib/mover-scoring";
import {
  buildBinderNextBuyRecommendations,
  type BinderNextBuyRecommendation,
} from "@/lib/binder-next-buy";
import { calculateSetRarityPosition } from "@/lib/external-market-intelligence-core";
import { WANT_SOURCE_BINDER_MISSING, syncMissingBinderWantsForUser } from "@/lib/wantlist-planner";

export interface CollectionSummaryMetric {
  investment: number;
  currentValue: number;
  pnl: number;
}

export const ACTIVE_COLLECTION_CARD_FILTER = {
  for_sale: false,
  sold_at: null,
} satisfies Prisma.CollectionCardWhereInput;

export interface CollectionValueDriverItem {
  id: string;
  kind: "card" | "sealed";
  cardId: string | null;
  productId: string | null;
  cardNumber: string | null;
  episodeId: string;
  episodeName: string;
  episodeCode: string | null;
  name: string;
  imageUrl: string | null;
  href: string;
  detail: string;
  quantity: number;
  previousValue: number;
  currentValue: number;
  change: number;
  changePct: number | null;
  currentSource: string;
  previousSource: string;
  latestSnapshotDate: string | null;
  stale: boolean;
}

export type CollectionValueDriversScope = "collection" | "all";

export interface CollectionValueDriverSourceTotal {
  source: string;
  change: number;
}

export interface CollectionValueDriversData {
  latestDate: string | null;
  latestLabel: string | null;
  previousDate: string | null;
  previousLabel: string | null;
  totalChange: number | null;
  gainsTotal: number;
  dropsTotal: number;
  sourceBreakdown: CollectionValueDriverSourceTotal[];
  gains: CollectionValueDriverItem[];
  drops: CollectionValueDriverItem[];
}

export interface CollectionOverviewData {
  overview: CollectionSummaryMetric & {
    totalCards: number;
    totalSealedUnits: number;
    totalBinders: number;
    chart: Array<{ date: string; label: string; value: number | null }>;
  };
  cards: CollectionCardViewItem[];
  looseSingles: CollectionCardViewItem[];
  binderCards: CollectionCardViewItem[];
  forSaleCards: CollectionCardViewItem[];
  soldCards: CollectionCardViewItem[];
  saleSummary: {
    soldTotal: number;
    soldCards: number;
    soldCost: number;
    soldFees: number;
    soldNet: number;
    soldPnl: number;
    soldNetPnl: number;
  };
  sealed: CollectionSealedViewItem[];
  valueDrivers: CollectionValueDriversData;
  binders: Array<{
    id: string;
    name: string;
    type: string;
    accent_color: string | null;
    icon_name: string | null;
    episode: {
      id: string;
      name: string;
      code: string | null;
      logo_url: string | null;
      series: string | null;
      card_count: number | null;
      _count: { cards: number };
    } | null;
    progressLabel: string;
    ownedCards: number;
    totalCards: number | null;
    completionPct: number | null;
    missingCards: number | null;
    currentValue: number;
    investment: number;
    pnl: number;
    recentChange: number | null;
    recentChangePct: number | null;
    recentChangeLabel: string | null;
    subtitle: string;
  }>;
}

export interface SocialCollectionData {
  cards: CollectionCardViewItem[];
  metrics: {
    totalCards: number;
    rawCards: number;
    gradedCards: number;
    totalBinders: number;
    totalSealedUnits: number;
    currentValue: number;
    pricedCards: number;
  };
}

export type CollectionPageTab =
  | "overview"
  | "complete"
  | "singles"
  | "cards"
  | "binders"
  | "sealed"
  | "graded"
  | "selling";

export type BinderHistoryRange = "recent" | "all";
export type CollectionHistoryRange = "recent" | "year" | "all";

export interface BinderPageData {
  binder: {
    id: string;
    name: string;
    type: string;
    accent_color: string | null;
    icon_name: string | null;
    base_purchase_price: number | null;
    episode: {
      id: string;
      name: string;
      code: string | null;
      logo_url: string | null;
      series: string | null;
      card_count: number | null;
      _count: { cards: number };
    } | null;
  };
  items: CollectionCardViewItem[];
  priceSnapshots: EpisodePriceHistorySnapshot[];
  chart: Array<{ date: string; label: string; value: number | null }>;
  metrics: CollectionSummaryMetric & {
    ownedCount: number;
    totalCards: number | null;
  };
}

export interface WantsPageData {
  items: CollectionCardViewItem[];
  personalItems: CollectionCardViewItem[];
  plannerGroups: WantPlannerGroup[];
  needsPlannerSync: boolean;
  chart: Array<{ date: string; label: string; value: number | null }>;
  totalCards: number;
  totalSets: number;
  pricedCards: number;
  estimatedValue: number;
  averageValue: number | null;
  buyNow: BinderNextBuyRecommendation[];
}

export interface WantBinderPageData {
  binder: {
    id: string;
    name: string;
    type: string;
    accent_color: string | null;
    icon_name: string | null;
    episode: {
      id: string;
      name: string;
      code: string | null;
      logo_url: string | null;
      series: string | null;
      card_count: number | null;
      _count: { cards: number };
    };
  };
  items: CollectionCardViewItem[];
  chart: Array<{ date: string; label: string; value: number | null }>;
  metrics: {
    ownedCount: number;
    totalCards: number;
    missingCards: number;
    visibleMissingCards: number;
    hiddenCards: number;
    pricedCards: number;
    estimatedCost: number;
    averageCost: number | null;
  };
  nextBuys: BinderNextBuyRecommendation[];
}

export interface WantPlannerGroup {
  binderId: string;
  episodeId: string;
  name: string;
  subtitle: string;
  logoUrl: string | null;
  accentColor: string | null;
  iconName: string | null;
  progressLabel: string;
  ownedCards: number;
  totalCards: number;
  visibleMissingCards: number;
  totalMissingCards: number;
  hiddenCards: number;
  pricedCards: number;
  estimatedCost: number;
  items: CollectionCardViewItem[];
}

const collectionCardSelect = {
  id: true,
  binder_id: true,
  for_sale: true,
  sale_price: true,
  sale_fee_eur: true,
  sale_platform: true,
  sold_at: true,
  purchase_price: true,
  condition: true,
  language: true,
  notes: true,
  grading_company: true,
  grading_grade: true,
  grading_subgrades_json: true,
  tags: {
    select: {
      label: true,
    },
  },
  binder: {
    select: {
      name: true,
      type: true,
    },
  },
  card: {
    select: {
      id: true,
      name: true,
      image_url: true,
      card_number: true,
      printed_card_number: true,
      version: true,
      rarity: true,
      supertype: true,
      market_score: true,
      tcggo_score: true,
      tcggo_score_tier: true,
      episode_id: true,
      prices: {
        where: { cm_en_lowest_nm: { gt: 0, not: 9001 } },
        orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          cm_en_lowest_nm: true,
          cm_de_lowest_nm: true,
          cm_fr_lowest_nm: true,
          cm_es_lowest_nm: true,
          cm_it_lowest_nm: true,
          cm_jp_lowest_nm: true,
          tcp_market: true,
        },
      },
      gradedPrices: {
        orderBy: [{ price: "desc" }, { label: "asc" }],
        select: {
          label: true,
          price: true,
        },
      },
      ebaySoldGradedPrices: {
        orderBy: [{ median_price: "desc" }, { label: "asc" }],
        select: {
          label: true,
          company: true,
          grade: true,
          median_price: true,
          currency: true,
        },
      },
      episode: {
        select: {
          id: true,
          name: true,
          code: true,
          series: true,
          release_date: true,
        },
      },
    },
  },
} satisfies Prisma.CollectionCardSelect;

const collectionCardMetricSelect = {
  id: true,
  binder_id: true,
  for_sale: true,
  sale_price: true,
  sale_fee_eur: true,
  sale_platform: true,
  sold_at: true,
  purchase_price: true,
  grading_company: true,
  grading_grade: true,
  grading_subgrades_json: true,
  card: {
    select: {
      id: true,
      episode_id: true,
      prices: {
        where: { cm_en_lowest_nm: { gt: 0, not: 9001 } },
        orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          cm_en_lowest_nm: true,
          cm_de_lowest_nm: true,
          cm_fr_lowest_nm: true,
          cm_es_lowest_nm: true,
          cm_it_lowest_nm: true,
          cm_jp_lowest_nm: true,
          tcp_market: true,
        },
      },
      gradedPrices: {
        orderBy: [{ price: "desc" }, { label: "asc" }],
        select: {
          label: true,
          price: true,
        },
      },
      ebaySoldGradedPrices: {
        orderBy: [{ median_price: "desc" }, { label: "asc" }],
        select: {
          label: true,
          company: true,
          grade: true,
          median_price: true,
          currency: true,
        },
      },
    },
  },
} satisfies Prisma.CollectionCardSelect;

const collectionWantSelect = {
  id: true,
  source: true,
  source_episode_id: true,
  dismissed_at: true,
  created_at: true,
  card: {
    select: {
      id: true,
      name: true,
      image_url: true,
      card_number: true,
      printed_card_number: true,
      version: true,
      rarity: true,
      supertype: true,
      market_score: true,
      tcggo_score: true,
      tcggo_score_tier: true,
      prices: {
        where: { cm_en_lowest_nm: { gt: 0, not: 9001 } },
        orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          cm_en_lowest_nm: true,
          cm_de_lowest_nm: true,
          cm_fr_lowest_nm: true,
          cm_es_lowest_nm: true,
          cm_it_lowest_nm: true,
          cm_jp_lowest_nm: true,
          tcp_market: true,
        },
      },
      gradedPrices: {
        orderBy: [{ price: "desc" }, { label: "asc" }],
        select: {
          label: true,
          price: true,
        },
      },
      ebaySoldGradedPrices: {
        orderBy: [{ median_price: "desc" }, { label: "asc" }],
        select: {
          label: true,
          company: true,
          grade: true,
          median_price: true,
          currency: true,
        },
      },
      episode: {
        select: {
          id: true,
          name: true,
          code: true,
          series: true,
          release_date: true,
        },
      },
    },
  },
} satisfies Prisma.CollectionWantSelect;

const collectionSealedSelect = {
  id: true,
  quantity: true,
  purchase_price_per_item: true,
  product: {
    select: {
      id: true,
      name: true,
      image_url: true,
      cardmarket_url: true,
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
    },
  },
} satisfies Prisma.CollectionSealedSelect;

const collectionSealedMetricSelect = {
  id: true,
  quantity: true,
  purchase_price_per_item: true,
  product: {
    select: {
      id: true,
      cm_lowest: true,
      cm_lowest_eu: true,
      cm_lowest_de: true,
      cm_lowest_fr: true,
      cm_lowest_es: true,
      cm_lowest_it: true,
    },
  },
} satisfies Prisma.CollectionSealedSelect;

const collectionBinderSelect = {
  id: true,
  name: true,
  type: true,
  episode_id: true,
  accent_color: true,
  icon_name: true,
  base_purchase_price: true,
  episode: {
    select: {
      id: true,
      name: true,
      code: true,
      logo_url: true,
      series: true,
      card_count: true,
      _count: { select: { cards: true } },
    },
  },
} satisfies Prisma.CollectionBinderSelect;

const collectionBinderMetricSelect = {
  id: true,
  type: true,
  episode_id: true,
  base_purchase_price: true,
} satisfies Prisma.CollectionBinderSelect;

const SQLITE_SAFE_CHUNK_SIZE = 250;
const COLLECTION_OVERVIEW_CHART_DAYS = 120;
export const BINDER_HISTORY_RECENT_DAYS = COLLECTION_OVERVIEW_CHART_DAYS;
const COLLECTION_VALUE_DRIVER_LIMIT = 24;
export const COLLECTION_VALUE_DRIVER_WINDOW_DAYS = 7;
const COLLECTION_VALUE_DRIVER_STALE_DAYS = 2;
const COLLECTION_VALUE_DRIVER_ANCHOR_TOLERANCE_DAYS = 2;
// How far before the baseline date a card's baseline snapshot may sit and still
// count as a genuine window-length move (see isValueDriverBaselineTooOld).
const COLLECTION_VALUE_DRIVER_BASELINE_MAX_AGE_DAYS = 2;
const EMPTY_COLLECTION_VALUE_DRIVERS: CollectionValueDriversData = {
  latestDate: null,
  latestLabel: null,
  previousDate: null,
  previousLabel: null,
  totalChange: null,
  gainsTotal: 0,
  dropsTotal: 0,
  sourceBreakdown: [],
  gains: [],
  drops: [],
};

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

export function buildValueDriverSourceBreakdown(
  drivers: Array<Pick<CollectionValueDriverItem, "currentSource" | "change">>
): CollectionValueDriverSourceTotal[] {
  const totals = new Map<string, number>();
  for (const item of drivers) {
    totals.set(item.currentSource, (totals.get(item.currentSource) ?? 0) + item.change);
  }

  return [...totals.entries()]
    .map(([source, change]) => ({ source, change: roundCurrency(change) }))
    .filter((entry) => Math.abs(entry.change) >= 0.01)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

function mergeValueDriverSourceBreakdowns(
  breakdowns: CollectionValueDriverSourceTotal[][]
): CollectionValueDriverSourceTotal[] {
  return buildValueDriverSourceBreakdown(
    breakdowns.flat().map((entry) => ({ currentSource: entry.source, change: entry.change }))
  );
}

function toHistoryDateKey(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function toHistoryMillis(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function shiftHistoryDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function pickValueDriverWindowStartDate(
  dates: readonly string[],
  latestDate: string,
  windowDays = COLLECTION_VALUE_DRIVER_WINDOW_DAYS,
  toleranceDays = COLLECTION_VALUE_DRIVER_ANCHOR_TOLERANCE_DAYS
): string | null {
  if (!latestDate || windowDays <= 0) return null;

  const windowStartDate = shiftHistoryDateKey(latestDate, -windowDays);
  const latestAllowedDate = shiftHistoryDateKey(
    latestDate,
    -Math.max(windowDays - Math.max(toleranceDays, 0), 1)
  );

  return (
    dates
      .filter(
        (date) =>
          date < latestDate && date >= windowStartDate && date <= latestAllowedDate
      )
      .sort((left, right) => left.localeCompare(right))[0] ?? null
  );
}

function getValueDriverStaleBeforeDate(maxAgeDays = COLLECTION_VALUE_DRIVER_STALE_DAYS): string {
  return shiftHistoryDateKey(toHistoryDateKey(new Date()), -Math.max(maxAgeDays, 0));
}

function isValueDriverSnapshotStale(
  latestSnapshotDate: string | null | undefined,
  staleBeforeDate: string
): boolean {
  return !latestSnapshotDate || latestSnapshotDate < staleBeforeDate;
}

// A card only counts as a window-length mover when we actually have a baseline
// snapshot near the window start. If the newest snapshot at or before the
// baseline date is older than this, the "change" really spans a longer, unknown
// period (the card simply was not refreshed in between), so we exclude it â€” that
// is what kept stale moves pinned to the panel for days instead of dropping off
// after the window passed.
export function isValueDriverBaselineTooOld(
  baselineDate: string | null | undefined,
  minBaselineDate: string
): boolean {
  return !baselineDate || baselineDate < minBaselineDate;
}

function toValueDriverDateLabel(dateKey: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${dateKey}T00:00:00.000Z`));
}

function getHistoryCutoffDate(days = COLLECTION_OVERVIEW_CHART_DAYS) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff.toISOString();
}

async function fetchCollectionCardsPage(
  options: {
    userId: string;
    game?: TradingCardGameFilter;
    binderId?: string;
    forSale?: boolean;
    sold?: boolean;
    skip?: number;
    take?: number;
    detail?: boolean;
  }
) {
  return db.collectionCard.findMany({
    where: {
      user_id: options.userId,
      for_sale: options.forSale ?? false,
      sold_at: options.forSale && options.sold ? { not: null } : null,
      ...(isSpecificTradingCardGame(options.game) ? { card: { game: options.game } } : {}),
      ...(options.binderId ? { binder_id: options.binderId } : {}),
    },
    orderBy: options.sold ? [{ sold_at: "desc" }, { added_at: "desc" }] : { added_at: "desc" },
    skip: options.skip,
    take: options.take,
    select: options.detail ? collectionCardSelect : collectionCardMetricSelect,
  });
}

async function fetchCollectionCards(options: {
  userId: string;
  game?: TradingCardGameFilter;
  binderId?: string;
  forSale?: boolean;
  sold?: boolean;
  detail?: boolean;
}) {
  const pageSize = 200;
  const records: Awaited<ReturnType<typeof fetchCollectionCardsPage>> = [];
  let skip = 0;

  while (true) {
    const page = await fetchCollectionCardsPage({
      userId: options.userId,
      game: options.game,
      binderId: options.binderId,
      forSale: options.forSale,
      sold: options.sold,
      skip,
      take: pageSize,
      detail: options.detail,
    });

    records.push(...page);

    if (page.length < pageSize) {
      break;
    }

    skip += pageSize;
  }

  return records;
}

type CollectionCardMetricRecord = {
  id: string;
  binder_id: string | null;
  for_sale: boolean;
  sale_price: number | null;
  sale_fee_eur: number | null;
  sale_platform: string | null;
  sold_at: Date | null;
  purchase_price: number | null;
  grading_company: string | null;
  grading_grade: string | null;
  grading_subgrades_json?: string | null;
  card: CollectionCardValueLike & {
    id: string;
    episode_id: string;
    prices: Array<{
      cm_en_lowest_nm: number | null;
      cm_de_lowest_nm: number | null;
      cm_fr_lowest_nm: number | null;
      cm_es_lowest_nm: number | null;
      cm_it_lowest_nm: number | null;
      cm_jp_lowest_nm: number | null;
      tcp_market: number | null;
    }>;
    gradedPrices: Array<{
      label: string;
      price: number;
    }>;
    ebaySoldGradedPrices: Array<{
      label: string;
      company: string;
      grade: string;
      median_price: number;
      currency: string;
    }>;
  };
};

type CollectionCardRecord = CollectionCardMetricRecord & {
  condition: string | null;
  language: string | null;
  notes: string | null;
  tags: Array<{ label: string }>;
  binder: {
    name: string;
    type: string;
  } | null;
  card: CollectionCardMetricRecord["card"] & {
    name: string;
    image_url: string | null;
    card_number: string | null;
    printed_card_number: string | null;
    version: string | null;
    rarity: string | null;
    supertype: string | null;
    episode: {
      id: string;
      name: string;
      code: string | null;
      series: string | null;
      release_date: string | null;
    };
  };
};

type CollectionWantRecord = {
  id: string;
  source: string;
  source_episode_id: string | null;
  dismissed_at: Date | null;
  created_at: Date;
  card: CollectionCardValueLike & {
    id: string;
    name: string;
    image_url: string | null;
    card_number: string | null;
    printed_card_number: string | null;
    version: string | null;
    rarity: string | null;
    supertype: string | null;
    market_score: number | null;
    tcggo_score: number | null;
    tcggo_score_tier: string | null;
    prices: Array<{
      cm_en_lowest_nm: number | null;
      cm_de_lowest_nm: number | null;
      cm_fr_lowest_nm: number | null;
      cm_es_lowest_nm: number | null;
      cm_it_lowest_nm: number | null;
      cm_jp_lowest_nm: number | null;
      tcp_market: number | null;
    }>;
    gradedPrices: Array<{
      label: string;
      price: number;
    }>;
    ebaySoldGradedPrices: Array<{
      label: string;
      company: string;
      grade: string;
      median_price: number;
      currency: string;
    }>;
    episode: {
      id: string;
      name: string;
      code: string | null;
      series: string | null;
      release_date: string | null;
    };
  };
};

type CollectionSealedMetricRecord = {
  id: string;
  quantity: number;
  purchase_price_per_item: number | null;
  product: CollectionSealedValueLike & {
    id: string;
  };
};

type CollectionSealedRecord = CollectionSealedMetricRecord & {
  product: CollectionSealedMetricRecord["product"] & {
    name: string;
    image_url: string | null;
    cardmarket_url: string | null;
    episode: {
      id: string;
      name: string;
      code: string | null;
    };
  };
};

type CollectionBinderRecord = {
  id: string;
  name: string;
  type: string;
  episode_id: string | null;
  accent_color: string | null;
  icon_name: string | null;
  base_purchase_price: number | null;
  episode: {
    id: string;
    name: string;
    code: string | null;
    logo_url: string | null;
    series: string | null;
    card_count: number | null;
    _count: { cards: number };
  } | null;
};

type CollectionBinderCostBasisRecord = {
  id: string;
  type: string;
  episode_id: string | null;
  base_purchase_price: number | null;
};

async function getCollectionCards(options: {
  userId: string;
  game?: TradingCardGameFilter;
  binderId?: string;
}) {
  return fetchCollectionCards({ ...options, detail: true });
}

async function getCollectionCardMetrics(userId: string, game: TradingCardGameFilter = POKEMON_GAME) {
  const records = await fetchCollectionCards({ userId, game, detail: false });
  return records as CollectionCardMetricRecord[];
}

async function getForSaleCollectionCards(options: {
  userId: string;
  game?: TradingCardGameFilter;
}) {
  return fetchCollectionCards({
    userId: options.userId,
    game: options.game,
    forSale: true,
    sold: false,
    detail: true,
  });
}

async function getSoldCollectionCards(options: {
  userId: string;
  game?: TradingCardGameFilter;
}) {
  return fetchCollectionCards({
    userId: options.userId,
    game: options.game,
    forSale: true,
    sold: true,
    detail: true,
  });
}

async function getCollectionWants(userId: string, game: TradingCardGameFilter = POKEMON_GAME) {
  return db.collectionWant.findMany({
    where: {
      user_id: userId,
      dismissed_at: null,
      card: {
        ...(isSpecificTradingCardGame(game) ? { game } : {}),
        collectionItems: {
          none: { user_id: userId, ...ACTIVE_COLLECTION_CARD_FILTER },
        },
      },
    },
    orderBy: { created_at: "desc" },
    select: collectionWantSelect,
  });
}

async function getCollectionSealedItems(
  userId: string,
  detail = true,
  game: TradingCardGameFilter = POKEMON_GAME
) {
  return db.collectionSealed.findMany({
    where: {
      user_id: userId,
      ...(isSpecificTradingCardGame(game) ? { product: { game } } : {}),
    },
    orderBy: { added_at: "desc" },
    select: detail ? collectionSealedSelect : collectionSealedMetricSelect,
  });
}

async function getCollectionSealedMetrics(userId: string, game: TradingCardGameFilter = POKEMON_GAME) {
  const records = await getCollectionSealedItems(userId, false, game);
  return records as CollectionSealedMetricRecord[];
}

function buildCollectionBinderGameWhere(
  userId: string,
  game: TradingCardGameFilter
): Prisma.CollectionBinderWhereInput {
  if (!isSpecificTradingCardGame(game)) {
    return { user_id: userId };
  }

  const gameConditions: Prisma.CollectionBinderWhereInput[] = [
    { episode: { game } },
    { cards: { some: { ...ACTIVE_COLLECTION_CARD_FILTER, card: { game } } } },
  ];

  if (game === POKEMON_GAME) {
    gameConditions.push({ episode_id: null, cards: { none: ACTIVE_COLLECTION_CARD_FILTER } });
  }

  return {
    user_id: userId,
    OR: gameConditions,
  };
}

async function getCollectionBinders(
  userId: string,
  detail = true,
  game: TradingCardGameFilter = POKEMON_GAME
) {
  return db.collectionBinder.findMany({
    where: buildCollectionBinderGameWhere(userId, game),
    orderBy: { updated_at: "desc" },
    select: detail ? collectionBinderSelect : collectionBinderMetricSelect,
  });
}

function chunkValues<T>(values: T[], size = SQLITE_SAFE_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function placeholdersFor(values: unknown[]): string {
  return values.map(() => "?").join(", ");
}

export async function getCardHistoryRows(cardIds: string[], since?: string) {
  if (cardIds.length === 0) return [];

  const rows = await Promise.all(
    chunkValues(cardIds).map((chunk) =>
      db.$queryRawUnsafe<EpisodePriceHistorySnapshot[]>(
        `SELECT
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
          WHERE p.card_id IN (${placeholdersFor(chunk)})
            AND p.cm_en_lowest_nm > 0
            AND p.cm_en_lowest_nm <> 9001
            ${since ? "AND p.fetched_at >= ?" : ""}
        )
        WHERE row_num = 1
        ORDER BY fetched_at ASC, card_id ASC`,
        ...chunk,
        ...(since ? [since] : [])
      )
    )
  );

  return rows.flat();
}

// Per-label graded price history for the user's graded cards, merged from the
// CardMarket-graded and eBay-sold snapshot tables. Used by the value drivers to
// measure a graded card's change against its OWN pricing source (graded vs
// graded), never against raw.
export interface GradedHistorySnapshotRow {
  card_id: string;
  label: string;
  company: string | null;
  grade: string | null;
  source: "cardmarket_graded" | "ebay_sold_graded";
  value: number;
  currency: string;
  fetched_at: Date | string;
}

export async function getGradedHistoryRows(
  cardIds: string[],
  since?: string
): Promise<GradedHistorySnapshotRow[]> {
  if (cardIds.length === 0) return [];
  const sinceDate = since ? new Date(since) : null;
  const where = (extra: object = {}) => ({
    card_id: { in: cardIds },
    ...(sinceDate ? { fetched_at: { gte: sinceDate } } : {}),
    ...extra,
  });
  const [cardmarketRows, ebayRows] = await Promise.all([
    db.cardGradedPriceSnapshot.findMany({
      where: where(),
      select: { card_id: true, label: true, price: true, fetched_at: true },
    }),
    db.cardEbaySoldGradedPriceSnapshot.findMany({
      where: where(),
      select: {
        card_id: true,
        label: true,
        company: true,
        grade: true,
        median_price: true,
        currency: true,
        fetched_at: true,
      },
    }),
  ]);

  return [
    ...cardmarketRows.map((row) => ({
      card_id: row.card_id,
      label: row.label,
      company: null,
      grade: null,
      source: "cardmarket_graded" as const,
      value: row.price,
      currency: "EUR",
      fetched_at: row.fetched_at,
    })),
    ...ebayRows.map((row) => ({
      card_id: row.card_id,
      label: row.label,
      company: row.company,
      grade: row.grade,
      source: "ebay_sold_graded" as const,
      value: row.median_price,
      currency: row.currency,
      fetched_at: row.fetched_at,
    })),
  ];
}

async function getSealedHistoryRows(productIds: string[], since?: string) {
  if (productIds.length === 0) return [];

  const rows = await Promise.all(
    chunkValues(productIds).map((chunk) =>
      db.$queryRawUnsafe<
        Array<{
          product_id: string;
          fetched_at: Date | string;
          cm_lowest: number | null;
          cm_lowest_eu: number | null;
          cm_lowest_de: number | null;
          cm_lowest_fr: number | null;
          cm_lowest_es: number | null;
          cm_lowest_it: number | null;
          cm_avg_7d: number | null;
          cm_avg_30d: number | null;
        }>
      >(
        `SELECT
          product_id,
          fetched_at,
          cm_lowest,
          cm_lowest_eu,
          cm_lowest_de,
          cm_lowest_fr,
          cm_lowest_es,
          cm_lowest_it,
          cm_avg_7d,
          cm_avg_30d
        FROM (
          SELECT
            s.product_id,
            s.fetched_at,
            s.cm_lowest,
            s.cm_lowest_eu,
            s.cm_lowest_de,
            s.cm_lowest_fr,
            s.cm_lowest_es,
            s.cm_lowest_it,
            s.cm_avg_7d,
            s.cm_avg_30d,
            ROW_NUMBER() OVER (
              PARTITION BY s.product_id, DATE(s.fetched_at)
              ORDER BY s.fetched_at DESC, s.id DESC
            ) AS row_num
          FROM "SealedPriceSnapshot" s
          WHERE s.product_id IN (${placeholdersFor(chunk)})
            ${since ? "AND s.fetched_at >= ?" : ""}
        )
        WHERE row_num = 1
        ORDER BY fetched_at ASC, product_id ASC`,
        ...chunk,
        ...(since ? [since] : [])
      )
    )
  );

  return rows.flat();
}

function buildDirectCostBasis(purchasePrice: number | null | undefined): CollectionCostBasis | null {
  return purchasePrice == null
    ? null
    : {
        value: purchasePrice,
        label: "Paid",
        source: "direct",
      };
}

function buildCostBasisFields(costBasis: CollectionCostBasis | null | undefined) {
  return {
    cost_basis_value: costBasis?.value ?? null,
    cost_basis_label: costBasis?.label ?? "Paid",
    cost_basis_source: costBasis?.source ?? "direct",
  } as const;
}

function buildCollectionCostBasisMap(
  records: CollectionCardMetricRecord[],
  binders: CollectionBinderCostBasisRecord[],
  options?: { usdToEurRate?: CurrencyExchangeRate | null }
): Map<string, CollectionCostBasis> {
  const allocations = new Map<string, CollectionCostBasis>();
  const recordsByBinderId = new Map<string, CollectionCardMetricRecord[]>();

  for (const record of records) {
    if (!record.binder_id) continue;
    const existing = recordsByBinderId.get(record.binder_id);
    if (existing) {
      existing.push(record);
    } else {
      recordsByBinderId.set(record.binder_id, [record]);
    }
  }

  for (const binder of binders) {
    if (binder.type !== "linked_set" || !binder.episode_id) continue;
    const binderRecords = recordsByBinderId.get(binder.id) ?? [];
    const binderAllocation = buildLinkedBinderCostBasis({
      binderType: binder.type,
      binderEpisodeId: binder.episode_id,
      binderBasePurchasePrice: binder.base_purchase_price,
      items: binderRecords.map((record) => ({
        itemId: record.id,
        episodeId: record.card.episode_id,
        directPurchasePrice: record.purchase_price,
        currentValue: getCollectionCardCurrentValue(record, options),
      })),
    });

    for (const [itemId, costBasis] of binderAllocation) {
      allocations.set(itemId, costBasis);
    }
  }

  return allocations;
}

function buildCardViewItem(
  record: CollectionCardRecord,
  costBasis?: CollectionCostBasis | null,
  options?: { usdToEurRate?: CurrencyExchangeRate | null }
): CollectionCardViewItem {
  const cmValue = getCollectionCardMarketValue(record.card);
  const tcpValue = record.card.prices[0]?.tcp_market ?? null;
  const valueInfo = getCollectionCardValueInfo(record.card, {
    gradingCompany: record.grading_company,
    gradingGrade: record.grading_grade,
    usdToEurRate: options?.usdToEurRate,
  });

  return {
    collection_item_id: record.id,
    collection_item_ids: [record.id],
    binder_id: record.binder_id,
    binder_name: record.binder?.name ?? null,
    binder_type: record.binder?.type ?? null,
    for_sale: record.for_sale,
    sale_price: record.sale_price,
    sale_fee_eur: record.sale_fee_eur,
    sale_platform: record.sale_platform,
    sold_at: record.sold_at ? record.sold_at.toISOString() : null,
    card_id: record.card.id,
    name: record.card.name,
    image_url: record.card.image_url,
    card_number: getDisplayCardNumber(record.card),
    version: record.card.version,
    rarity: record.card.rarity,
    supertype: record.card.supertype,
    episode_id: record.card.episode.id,
    episode_name: record.card.episode.name,
    episode_code: record.card.episode.code,
    episode_series: record.card.episode.series,
    episode_release_date: record.card.episode.release_date,
    cm_value: cmValue,
    tcp_value: tcpValue,
    current_value: valueInfo.value,
    current_value_label: valueInfo.label,
    purchase_price: record.purchase_price,
    ...buildCostBasisFields(costBasis ?? buildDirectCostBasis(record.purchase_price)),
    condition: record.condition,
    language: record.language,
    notes: record.notes,
    tags: record.tags.map((tag) => tag.label),
    grading_company: record.grading_company,
    grading_grade: record.grading_grade,
    grading_subgrades: parseBgsSubgrades(record.grading_subgrades_json),
    owned: true,
    owned_count: 1,
  };
}

function buildWantViewItem(record: CollectionWantRecord): CollectionCardViewItem {
  const cmValue = getCollectionCardMarketValue(record.card);
  const tcpValue = record.card.prices[0]?.tcp_market ?? null;

  return {
    collection_item_id: null,
    collection_item_ids: [],
    want_item_id: record.id,
    want_source: record.source,
    want_source_episode_id: record.source_episode_id,
    for_sale: false,
    card_id: record.card.id,
    name: record.card.name,
    image_url: record.card.image_url,
    card_number: getDisplayCardNumber(record.card),
    version: record.card.version,
    rarity: record.card.rarity,
    supertype: record.card.supertype,
    episode_id: record.card.episode.id,
    episode_name: record.card.episode.name,
    episode_code: record.card.episode.code,
    episode_series: record.card.episode.series,
    episode_release_date: record.card.episode.release_date,
    cm_value: cmValue,
    tcp_value: tcpValue,
    current_value: cmValue,
    current_value_label: null,
    signal_score: record.card.market_score ?? record.card.tcggo_score,
    signal_tier: record.card.tcggo_score_tier,
    purchase_price: null,
    cost_basis_value: null,
    cost_basis_label: "Paid",
    cost_basis_source: "direct",
    condition: null,
    language: null,
    notes: null,
    tags: [],
    grading_company: null,
    grading_grade: null,
    grading_subgrades: null,
    owned: false,
    owned_count: 0,
  };
}

function getCollectionCardCurrentValue(
  record: CollectionCardMetricRecord,
  options?: { usdToEurRate?: CurrencyExchangeRate | null }
): number | null {
  return getCollectionCardValueInfo(record.card, {
    gradingCompany: record.grading_company,
    gradingGrade: record.grading_grade,
    usdToEurRate: options?.usdToEurRate,
  }).value;
}

function buildSealedViewItem(record: CollectionSealedRecord): CollectionSealedViewItem {
  return {
    id: record.id,
    product_id: record.product.id,
    name: record.product.name,
    image_url: record.product.image_url,
    episode_id: record.product.episode.id,
    episode_name: record.product.episode.name,
    episode_code: record.product.episode.code,
    cardmarket_url: record.product.cardmarket_url,
    quantity: record.quantity,
    purchase_price_per_item: record.purchase_price_per_item,
    current_value_per_item: getCollectionSealedMarketValue(record.product),
  };
}

interface ValueDriverBaseline {
  value: number;
  date: string;
}

function buildCardBaselineValueMap(
  rows: EpisodePriceHistorySnapshot[],
  baselineDate: string
): Map<string, ValueDriverBaseline> {
  const values = new Map<string, ValueDriverBaseline>();
  const sorted = [...rows].sort((a, b) => toHistoryMillis(a.fetched_at) - toHistoryMillis(b.fetched_at));

  for (const row of sorted) {
    const dateKey = toHistoryDateKey(row.fetched_at);
    if (dateKey > baselineDate) {
      continue;
    }

    const value = getCardMarketValue(row);
    if (value == null) {
      values.delete(row.card_id);
    } else {
      values.set(row.card_id, { value, date: dateKey });
    }
  }

  return values;
}

function buildSealedBaselineValueMap(
  rows: EpisodeSealedPriceHistorySnapshot[],
  baselineDate: string
): Map<string, ValueDriverBaseline> {
  const values = new Map<string, ValueDriverBaseline>();
  const sorted = [...rows].sort((a, b) => toHistoryMillis(a.fetched_at) - toHistoryMillis(b.fetched_at));

  for (const row of sorted) {
    const dateKey = toHistoryDateKey(row.fetched_at);
    if (dateKey > baselineDate) {
      continue;
    }

    const value = getSealedCardMarketValue(row);
    if (value == null) {
      values.delete(row.product_id);
    } else {
      values.set(row.product_id, { value, date: dateKey });
    }
  }

  return values;
}

function buildLatestCardSnapshotDateMap(
  rows: EpisodePriceHistorySnapshot[]
): Map<string, string> {
  const values = new Map<string, string>();

  for (const row of rows) {
    if (getCardMarketValue(row) == null) continue;
    const dateKey = toHistoryDateKey(row.fetched_at);
    const existing = values.get(row.card_id);
    if (!existing || dateKey > existing) {
      values.set(row.card_id, dateKey);
    }
  }

  return values;
}

// Newest usable RAW snapshot value per card. Fallback for graded / eBay-sold
// cards without graded baseline history, so their underlying market move still
// shows raw-vs-raw (same source on both sides) instead of vanishing.
function buildLatestCardRawValueMap(
  rows: EpisodePriceHistorySnapshot[]
): Map<string, ValueDriverBaseline> {
  const values = new Map<string, ValueDriverBaseline>();
  const sorted = [...rows].sort((a, b) => toHistoryMillis(a.fetched_at) - toHistoryMillis(b.fetched_at));

  for (const row of sorted) {
    const value = getCardMarketValue(row);
    if (value == null) continue;
    values.set(row.card_id, { value, date: toHistoryDateKey(row.fetched_at) });
  }

  return values;
}

// Per card: a synthetic "card" whose graded/eBay-sold price arrays hold the
// newest snapshot per (source, label) INSIDE the baseline window. Feeding it to
// getCollectionMatchedGradedPrice reuses the exact same label matching the
// current value uses, so the baseline is guaranteed to be the same source the
// card is priced with today (graded vs graded, never graded vs raw).
function buildGradedBaselineCardMap(
  rows: GradedHistorySnapshotRow[],
  baselineDate: string,
  minBaselineDate: string
): Map<
  string,
  {
    gradedPrices: Array<{ label: string; price: number }>;
    ebaySoldGradedPrices: Array<{
      label: string;
      company: string;
      grade: string;
      median_price: number;
      currency: string;
    }>;
  }
> {
  const newestPerLabel = new Map<string, GradedHistorySnapshotRow>();
  for (const row of rows) {
    const dateKey = toHistoryDateKey(row.fetched_at);
    if (dateKey > baselineDate || dateKey < minBaselineDate) continue;
    const key = `${row.card_id}|${row.source}|${row.label}`;
    const existing = newestPerLabel.get(key);
    if (!existing || toHistoryMillis(row.fetched_at) > toHistoryMillis(existing.fetched_at)) {
      newestPerLabel.set(key, row);
    }
  }

  const cards = new Map<
    string,
    {
      gradedPrices: Array<{ label: string; price: number }>;
      ebaySoldGradedPrices: Array<{
        label: string;
        company: string;
        grade: string;
        median_price: number;
        currency: string;
      }>;
    }
  >();
  for (const row of newestPerLabel.values()) {
    const entry = cards.get(row.card_id) ?? { gradedPrices: [], ebaySoldGradedPrices: [] };
    if (row.source === "cardmarket_graded") {
      entry.gradedPrices.push({ label: row.label, price: row.value });
    } else {
      entry.ebaySoldGradedPrices.push({
        label: row.label,
        company: row.company ?? "",
        grade: row.grade ?? "",
        median_price: row.value,
        currency: row.currency,
      });
    }
    cards.set(row.card_id, entry);
  }

  return cards;
}

function buildGradedLatestSnapshotDateMap(rows: GradedHistorySnapshotRow[]): Map<string, string> {
  const values = new Map<string, string>();
  for (const row of rows) {
    const dateKey = toHistoryDateKey(row.fetched_at);
    const existing = values.get(row.card_id);
    if (!existing || dateKey > existing) {
      values.set(row.card_id, dateKey);
    }
  }
  return values;
}

function buildLatestSealedSnapshotDateMap(
  rows: EpisodeSealedPriceHistorySnapshot[]
): Map<string, string> {
  const values = new Map<string, string>();

  for (const row of rows) {
    if (getSealedCardMarketValue(row) == null) continue;
    const dateKey = toHistoryDateKey(row.fetched_at);
    const existing = values.get(row.product_id);
    if (!existing || dateKey > existing) {
      values.set(row.product_id, dateKey);
    }
  }

  return values;
}

function calculateChangePct(change: number, previousValue: number): number | null {
  if (previousValue <= 0) {
    return null;
  }

  return Number(((change / previousValue) * 100).toFixed(1));
}

function buildCardValueDriverDetail(item: CollectionCardViewItem): string {
  const number = item.card_number ? `#${item.card_number}` : null;
  const grading = item.grading_company
    ? [item.grading_company, item.grading_grade].filter(Boolean).join(" ")
    : null;

  return [number, grading].filter(Boolean).join(" / ");
}

function buildSealedValueDriverDetail(item: CollectionSealedViewItem): string {
  const episode = item.episode_code
    ? `${item.episode_name} (${item.episode_code})`
    : item.episode_name;

  return [`x${item.quantity}`, episode].filter(Boolean).join(" / ");
}

function pickCollectionValueDriverPreviousPoint(
  valuedPoints: Array<{ date: string; label: string; value: number }>,
  latestPoint: { date: string; label: string; value: number },
  windowDays: number | null
): { date: string; label: string; value: number } | null {
  const previousPoints = valuedPoints.filter((point) => point.date < latestPoint.date);

  if (previousPoints.length === 0) {
    return null;
  }

  if (windowDays == null || windowDays <= 0) {
    return previousPoints[previousPoints.length - 1] ?? null;
  }

  const previousDate = pickValueDriverWindowStartDate(
    previousPoints.map((point) => point.date),
    latestPoint.date,
    windowDays
  );

  return previousPoints.find((point) => point.date === previousDate) ?? null;
}

type CollectionValueDriverDraft = Omit<
  CollectionValueDriverItem,
  "previousValue" | "currentValue" | "change" | "changePct"
> & {
  previousValue: number;
  currentValue: number;
};

function addCollectionValueDriverDraft(
  drafts: Map<string, CollectionValueDriverDraft>,
  draft: CollectionValueDriverDraft
) {
  const existing = drafts.get(draft.id);
  if (!existing) {
    drafts.set(draft.id, draft);
    return;
  }

  existing.quantity += draft.quantity;
  existing.previousValue += draft.previousValue;
  existing.currentValue += draft.currentValue;
  if (
    draft.latestSnapshotDate &&
    (!existing.latestSnapshotDate || draft.latestSnapshotDate > existing.latestSnapshotDate)
  ) {
    existing.latestSnapshotDate = draft.latestSnapshotDate;
  }
  existing.stale = existing.stale && draft.stale;
}

function finalizeCollectionValueDriver(
  draft: CollectionValueDriverDraft
): CollectionValueDriverItem {
  const previousValue = roundCurrency(draft.previousValue);
  const currentValue = roundCurrency(draft.currentValue);
  const change = roundCurrency(currentValue - previousValue);

  return {
    ...draft,
    previousValue,
    currentValue,
    change,
    changePct: calculateChangePct(change, previousValue),
  };
}

function getCollectionValueDriverCardSource(item: CollectionCardViewItem): string {
  if (!item.current_value_label) {
    return "Raw";
  }

  return item.current_value_label.toLowerCase().includes("ebay sold")
    ? "eBay sold"
    : "Graded";
}

function buildCollectionValueDrivers({
  cards,
  sealed,
  cardHistory,
  sealedHistory,
  gradedHistory = [],
  usdToEurRate = null,
  chart,
  limit = COLLECTION_VALUE_DRIVER_LIMIT,
  windowDays = COLLECTION_VALUE_DRIVER_WINDOW_DAYS,
}: {
  cards: CollectionCardViewItem[];
  sealed: CollectionSealedViewItem[];
  cardHistory: EpisodePriceHistorySnapshot[];
  sealedHistory: EpisodeSealedPriceHistorySnapshot[];
  gradedHistory?: GradedHistorySnapshotRow[];
  usdToEurRate?: CurrencyExchangeRate | null;
  chart: Array<{ date: string; label: string; value: number | null }>;
  // currentValue is intentionally not used for the Net: see the return below.
  currentValue?: number;
  limit?: number | null;
  windowDays?: number | null;
}): CollectionValueDriversData {
  const valuedPoints = chart.filter(
    (point): point is { date: string; label: string; value: number } => point.value != null
  );
  const latestPoint = valuedPoints[valuedPoints.length - 1] ?? null;
  const previousPoint = latestPoint
    ? pickCollectionValueDriverPreviousPoint(valuedPoints, latestPoint, windowDays)
    : null;

  if (!latestPoint || !previousPoint) {
    return {
      ...EMPTY_COLLECTION_VALUE_DRIVERS,
      latestDate: latestPoint?.date ?? null,
      latestLabel: latestPoint?.label ?? null,
    };
  }

  const cardBaselineValues = buildCardBaselineValueMap(cardHistory, previousPoint.date);
  const sealedBaselineValues = buildSealedBaselineValueMap(sealedHistory, previousPoint.date);
  const cardLatestRawValues = buildLatestCardRawValueMap(cardHistory);
  const cardLatestSnapshotDates = buildLatestCardSnapshotDateMap(cardHistory);
  const sealedLatestSnapshotDates = buildLatestSealedSnapshotDateMap(sealedHistory);
  const staleBeforeDate = getValueDriverStaleBeforeDate();
  const minBaselineDate = shiftHistoryDateKey(
    previousPoint.date,
    -COLLECTION_VALUE_DRIVER_BASELINE_MAX_AGE_DAYS
  );
  const gradedBaselineCards = buildGradedBaselineCardMap(
    gradedHistory,
    previousPoint.date,
    minBaselineDate
  );
  const gradedLatestSnapshotDates = buildGradedLatestSnapshotDateMap(gradedHistory);
  const drafts = new Map<string, CollectionValueDriverDraft>();

  for (const item of cards) {
    const rawLatestDate = cardLatestSnapshotDates.get(item.card_id) ?? null;
    const rawBaseline = cardBaselineValues.get(item.card_id) ?? null;
    const rawPathUsable =
      !isValueDriverSnapshotStale(rawLatestDate, staleBeforeDate) &&
      rawBaseline != null &&
      !isValueDriverBaselineTooOld(rawBaseline.date, minBaselineDate);

    const currentSource = getCollectionValueDriverCardSource(item);
    let currentItemValue: number;
    let previousItemValue: number;
    let pillSource = currentSource;
    let latestSnapshotDate = rawLatestDate;

    if (currentSource === "Raw") {
      // Without a fresh baseline snapshot we cannot attribute the change to
      // this weekly window, so the card is left out (old moves age off).
      if (!rawPathUsable || item.current_value == null) continue;
      currentItemValue = item.current_value;
      previousItemValue = rawBaseline.value;
    } else {
      // Graded / eBay-sold cards are compared the way they are priced in the
      // collection: this week's graded value vs the SAME graded label + source
      // a week ago (never graded vs raw â€” that premium is a constant offset,
      // not a market move). The baseline reuses the exact label matching that
      // produces the current value, restricted to snapshots inside the window.
      const gradedLatestDate = gradedLatestSnapshotDates.get(item.card_id) ?? null;
      const baselineCard = gradedBaselineCards.get(item.card_id) ?? null;
      const baselineMatch = baselineCard
        ? getCollectionMatchedGradedPrice(baselineCard, {
            gradingCompany: item.grading_company,
            gradingGrade: item.grading_grade,
            usdToEurRate,
          })
        : null;
      const baselineBucket =
        baselineMatch == null
          ? null
          : baselineMatch.source === "ebay_sold_graded"
            ? "eBay sold"
            : "Graded";

      if (
        baselineMatch != null &&
        baselineBucket === currentSource &&
        item.current_value != null &&
        !isValueDriverSnapshotStale(gradedLatestDate, staleBeforeDate)
      ) {
        currentItemValue = item.current_value;
        previousItemValue = baselineMatch.price;
        latestSnapshotDate = gradedLatestDate;
      } else if (rawPathUsable) {
        // No graded baseline in the window: fall back to the card's raw
        // history so the underlying market move still shows (measured and
        // labeled as Raw on both sides).
        const latestRaw = cardLatestRawValues.get(item.card_id);
        if (!latestRaw) continue;
        currentItemValue = latestRaw.value;
        previousItemValue = rawBaseline.value;
        pillSource = "Raw";
      } else {
        continue;
      }
    }

    const key = `card:${item.card_id}:${pillSource === "Raw" ? "Raw" : "GradedOwn"}`;

    addCollectionValueDriverDraft(drafts, {
      id: key,
      kind: "card",
      cardId: item.card_id,
      productId: null,
      cardNumber: item.card_number,
      episodeId: item.episode_id,
      episodeName: item.episode_name,
      episodeCode: item.episode_code,
      name: item.name,
      imageUrl: item.image_url,
      href: `${getExpansionHref(item.episode_id)}?card=${encodeURIComponent(item.card_id)}`,
      detail: buildCardValueDriverDetail(item),
      quantity: 1,
      previousValue: previousItemValue,
      currentValue: currentItemValue,
      currentSource: pillSource,
      previousSource: pillSource,
      latestSnapshotDate,
      stale: false,
    });
  }

  for (const item of sealed) {
    const latestSnapshotDate = sealedLatestSnapshotDates.get(item.product_id) ?? null;
    if (isValueDriverSnapshotStale(latestSnapshotDate, staleBeforeDate)) continue;
    const baseline = sealedBaselineValues.get(item.product_id);
    if (!baseline || isValueDriverBaselineTooOld(baseline.date, minBaselineDate)) continue;
    if (item.current_value_per_item == null) continue;
    const currentItemValue = item.current_value_per_item * item.quantity;
    const previousItemValue = baseline.value * item.quantity;

    addCollectionValueDriverDraft(drafts, {
      id: `sealed:${item.product_id}`,
      kind: "sealed",
      cardId: null,
      productId: item.product_id,
      cardNumber: null,
      episodeId: item.episode_id,
      episodeName: item.episode_name,
      episodeCode: item.episode_code,
      name: item.name,
      imageUrl: item.image_url,
      href: getExpansionHref(item.episode_id),
      detail: buildSealedValueDriverDetail(item),
      quantity: item.quantity,
      previousValue: previousItemValue,
      currentValue: currentItemValue,
      currentSource: "Sealed",
      previousSource: "Sealed",
      latestSnapshotDate,
      stale: false,
    });
  }

  const drivers = [...drafts.values()]
    .map(finalizeCollectionValueDriver)
    .filter((item) => Math.abs(item.change) >= 0.01);
  const rankedGains = drivers
    .filter((item) => item.change > 0)
    .sort((a, b) => b.change - a.change || a.name.localeCompare(b.name));
  const rankedDrops = drivers
    .filter((item) => item.change < 0)
    .sort((a, b) => a.change - b.change || a.name.localeCompare(b.name));
  const gains = limit == null ? rankedGains : rankedGains.slice(0, limit);
  const drops = limit == null ? rankedDrops : rankedDrops.slice(0, limit);

  const gainsTotal = roundCurrency(
    drivers.reduce((total, item) => total + (item.change > 0 ? item.change : 0), 0)
  );
  const dropsTotal = roundCurrency(
    drivers.reduce((total, item) => total + (item.change < 0 ? item.change : 0), 0)
  );

  return {
    latestDate: latestPoint.date,
    latestLabel: latestPoint.label,
    previousDate: previousPoint.date,
    previousLabel: previousPoint.label,
    // Net must equal the drivers we actually show. Using the collection chart
    // delta (current total vs the weekly baseline) leaked the graded premium back in â€”
    // current value uses graded prices while the drivers are raw-only â€” so the
    // badge disagreed with the list and the source breakdown.
    totalChange: roundCurrency(gainsTotal + dropsTotal),
    gainsTotal,
    dropsTotal,
    sourceBreakdown: buildValueDriverSourceBreakdown(drivers),
    gains,
    drops,
  };
}

function sumCardCurrentValue(
  records: CollectionCardMetricRecord[],
  options?: { usdToEurRate?: CurrencyExchangeRate | null }
): number {
  return Number(
    records
      .reduce(
        (total, record) => total + (getCollectionCardCurrentValue(record, options) ?? 0),
        0
      )
      .toFixed(2)
  );
}

function sumSealedCurrentValue(records: CollectionSealedMetricRecord[]): number {
  return Number(
    records
      .reduce(
        (total, record) =>
          total + (getCollectionSealedMarketValue(record.product) ?? 0) * record.quantity,
        0
      )
      .toFixed(2)
  );
}

function hasUsdEbaySoldGradedPrices(records: CollectionCardMetricRecord[]): boolean {
  return records.some(
    (record) =>
      record.grading_company &&
      record.grading_grade &&
      record.card.ebaySoldGradedPrices.some(
        (price) => price.currency.toUpperCase() === "USD"
      )
  );
}

function buildCardQuantityMap(records: Array<{ card: { id: string } }>): Map<string, number> {
  const quantities = new Map<string, number>();
  for (const record of records) {
    quantities.set(record.card.id, (quantities.get(record.card.id) ?? 0) + 1);
  }
  return quantities;
}

function buildProductQuantityMap(
  records: Array<{ product: { id: string }; quantity: number }>
): Map<string, number> {
  const quantities = new Map<string, number>();
  for (const record of records) {
    quantities.set(record.product.id, (quantities.get(record.product.id) ?? 0) + record.quantity);
  }
  return quantities;
}

function buildBinderCardStats(
  records: CollectionCardMetricRecord[],
  options?: { usdToEurRate?: CurrencyExchangeRate | null }
) {
  const stats = new Map<
    string,
    {
      count: number;
      currentValue: number;
      investment: number;
      uniqueOwnedCardIds: Set<string>;
    }
  >();

  for (const record of records) {
    if (!record.binder_id) continue;

    const existing = stats.get(record.binder_id);
    if (existing) {
      existing.count += 1;
      existing.currentValue += getCollectionCardCurrentValue(record, options) ?? 0;
      existing.investment += record.purchase_price ?? 0;
      existing.uniqueOwnedCardIds.add(record.card.id);
    } else {
      stats.set(record.binder_id, {
        count: 1,
        currentValue: getCollectionCardCurrentValue(record, options) ?? 0,
        investment: record.purchase_price ?? 0,
        uniqueOwnedCardIds: new Set([record.card.id]),
      });
    }
  }

  return stats;
}

function buildBinderCardQuantities(records: CollectionCardMetricRecord[]) {
  const quantitiesByBinderId = new Map<string, Map<string, number>>();

  for (const record of records) {
    if (!record.binder_id) continue;

    const quantities = quantitiesByBinderId.get(record.binder_id) ?? new Map<string, number>();
    quantities.set(record.card.id, (quantities.get(record.card.id) ?? 0) + 1);
    quantitiesByBinderId.set(record.binder_id, quantities);
  }

  return quantitiesByBinderId;
}

function buildBinderTrendSummaries(
  records: CollectionCardMetricRecord[],
  cardHistory: EpisodePriceHistorySnapshot[]
) {
  const quantitiesByBinderId = buildBinderCardQuantities(records);
  const summaries = new Map<
    string,
    {
      recentChange: number | null;
      recentChangePct: number | null;
      recentChangeLabel: string | null;
    }
  >();

  for (const [binderId, quantities] of quantitiesByBinderId.entries()) {
    const valuedPoints = buildOwnedCardValueHistory(cardHistory, quantities).filter(
      (point) => point.total_market > 0
    );
    const latestPoint = valuedPoints[valuedPoints.length - 1] ?? null;
    const previousPoint = valuedPoints[valuedPoints.length - 2] ?? null;

    if (!latestPoint || !previousPoint) {
      summaries.set(binderId, {
        recentChange: null,
        recentChangePct: null,
        recentChangeLabel: latestPoint?.label ?? null,
      });
      continue;
    }

    const recentChange = roundCurrency(latestPoint.total_market - previousPoint.total_market);
    const recentChangePct =
      previousPoint.total_market > 0
        ? Number(((recentChange / previousPoint.total_market) * 100).toFixed(1))
        : null;

    summaries.set(binderId, {
      recentChange,
      recentChangePct,
      recentChangeLabel: `since ${previousPoint.label}`,
    });
  }

  return summaries;
}

function buildMetric(investment: number, currentValue: number): CollectionSummaryMetric {
  return {
    investment: Number(investment.toFixed(2)),
    currentValue: Number(currentValue.toFixed(2)),
    pnl: Number((currentValue - investment).toFixed(2)),
  };
}

function shouldLoadDetailedCards(activeTab: CollectionPageTab): boolean {
  return (
    activeTab === "overview" ||
    activeTab === "complete" ||
    activeTab === "singles" ||
    activeTab === "cards" ||
    activeTab === "graded" ||
    activeTab === "selling"
  );
}

function shouldLoadDetailedSealed(activeTab: CollectionPageTab): boolean {
  return activeTab === "overview" || activeTab === "complete" || activeTab === "cards" || activeTab === "sealed";
}

function shouldLoadDetailedBinders(activeTab: CollectionPageTab): boolean {
  return activeTab === "overview" || activeTab === "complete" || activeTab === "cards" || activeTab === "binders";
}

export async function getCollectionOverviewData(
  options: {
    userId: string;
    activeTab?: CollectionPageTab;
    game?: TradingCardGameFilter;
    /**
     * Keep the first document small when a client-owned view will request its
     * detailed rows after hydration. Aggregate collection metrics still load.
     */
    deferDetailedRows?: boolean;
    /** Load longer portfolio history only after the user explicitly asks for it. */
    historyRange?: CollectionHistoryRange;
  }
): Promise<CollectionOverviewData> {
  const activeTab = options?.activeTab ?? "overview";
  const game = options.game ?? POKEMON_GAME;
  const loadDetailedCards = !options.deferDetailedRows && shouldLoadDetailedCards(activeTab);
  const loadDetailedSealed = !options.deferDetailedRows && shouldLoadDetailedSealed(activeTab);
  // Binder metadata is tiny and keeps completion/progress accurate in the
  // first Home response. Expensive binder history still waits for the richer
  // follow-up payload when detailed rows are deferred.
  const loadDetailedBinders =
    shouldLoadDetailedBinders(activeTab) &&
    (!options.deferDetailedRows || activeTab === "overview");
  const loadSaleRows = activeTab === "selling";
  // The portfolio chart only exists on Overview. Other collection tabs use
  // current-value metrics and should not pay for tens of thousands of history
  // rows before their visible grid can render.
  const loadCollectionHistory = activeTab === "overview";
  const timer = startPerformanceTimer("collection.overview", {
    activeTab,
    game,
    detailedCards: loadDetailedCards,
    detailedSealed: loadDetailedSealed,
    detailedBinders: loadDetailedBinders,
    history: loadCollectionHistory,
  });

  const baseQueryTimer = startPerformanceTimer("collection.overview.base-query", {
    activeTab,
    game,
  });
  const [collectionCards, collectionSealed, binders, forSaleCards, soldCards] = await Promise.all([
    loadDetailedCards
      ? getCollectionCards({ userId: options.userId, game })
      : getCollectionCardMetrics(options.userId, game),
    loadDetailedSealed
      ? getCollectionSealedItems(options.userId, true, game)
      : getCollectionSealedMetrics(options.userId, game),
    getCollectionBinders(options.userId, loadDetailedBinders, game),
    loadSaleRows
      ? getForSaleCollectionCards({ userId: options.userId, game })
      : Promise.resolve([]),
    loadSaleRows
      ? getSoldCollectionCards({ userId: options.userId, game })
      : Promise.resolve([]),
  ]);
  baseQueryTimer.finish();

  const metricCards = collectionCards as CollectionCardMetricRecord[];
  const metricForSaleCards = forSaleCards as CollectionCardMetricRecord[];
  const metricSoldCards = soldCards as CollectionCardMetricRecord[];
  const metricSealed = collectionSealed as CollectionSealedMetricRecord[];
  const usdToEurRate = hasUsdEbaySoldGradedPrices([...metricCards, ...metricForSaleCards, ...metricSoldCards])
    ? await getUsdToEurRate()
    : null;
  const valueOptions = { usdToEurRate };
  const cardCurrentValue = sumCardCurrentValue(metricCards, valueOptions);
  const sealedCurrentValue = sumSealedCurrentValue(metricSealed);
  const cardInvestment = sumCollectionPurchasePrices(metricCards.map((item) => item.purchase_price));
  const sealedInvestment = sumCollectionPurchasePrices(
    metricSealed.map((item) => (item.purchase_price_per_item ?? 0) * item.quantity)
  );
  const binderBaseInvestment = sumCollectionPurchasePrices(
    binders.map((binder) => binder.base_purchase_price)
  );
  const overviewMetric = buildMetric(
    cardInvestment + sealedInvestment + binderBaseInvestment,
    cardCurrentValue + sealedCurrentValue
  );

  const cardQuantities = buildCardQuantityMap(metricCards);
  const sealedQuantities = buildProductQuantityMap(metricSealed);
  const historyRange = options.historyRange ?? "recent";
  const historyCutoff = loadCollectionHistory
    ? historyRange === "all"
      ? null
      : getHistoryCutoffDate(historyRange === "year" ? 365 : COLLECTION_OVERVIEW_CHART_DAYS)
    : null;
  const overviewGradedCardIds = [
    ...new Set(
      metricCards
        .filter((record) => record.grading_company)
        .map((record) => record.card.id)
    ),
  ];
  const historyQueryTimer = startPerformanceTimer("collection.overview.history-query", {
    activeTab,
  });
  const [cardHistory, sealedHistory, gradedHistory] = loadCollectionHistory
    ? await Promise.all([
        getCardHistoryRows([...cardQuantities.keys()], historyCutoff ?? undefined),
        getSealedHistoryRows([...sealedQuantities.keys()], historyCutoff ?? undefined),
        getGradedHistoryRows(overviewGradedCardIds, historyCutoff ?? undefined),
      ])
    : [[], [], []];
  historyQueryTimer.finish({
    cardRows: cardHistory.length,
    sealedRows: sealedHistory.length,
    gradedRows: gradedHistory.length,
  });

  // Same rule as the drivers: raw copies chart raw, graded copies chart their
  // own graded price history â€” chart, value tile and drivers stay in sync.
  const overviewRawChartQuantities = buildCardQuantityMap(
    metricCards.filter((record) => !record.grading_company)
  );
  const overviewGradedCopies = metricCards
    .filter((record) => record.grading_company)
    .map((record) => ({
      card_id: record.card.id,
      gradingCompany: record.grading_company,
      gradingGrade: record.grading_grade,
    }));
  const historyBuildTimer = startPerformanceTimer("collection.overview.history-build", {
    activeTab,
  });
  const combinedHistory = combineValueHistories(
    buildOwnedCardValueHistory(cardHistory, overviewRawChartQuantities),
    buildOwnedSealedValueHistory(sealedHistory, sealedQuantities),
    buildOwnedGradedCardValueHistory(
      gradedHistory,
      cardHistory,
      overviewGradedCopies,
      usdToEurRate
    )
  ).map((point) => ({
    date: point.date,
    label: point.label,
    value: point.total_market,
  }));
  historyBuildTimer.finish({ points: combinedHistory.length });
  const binderCardIds = loadDetailedBinders
    ? [...new Set(metricCards.filter((record) => record.binder_id).map((record) => record.card.id))]
    : [];
  const binderHistoryRows = loadDetailedBinders && !options.deferDetailedRows
    ? loadCollectionHistory
      ? cardHistory
      : await getCardHistoryRows(binderCardIds, getHistoryCutoffDate(45))
    : [];
  const binderTrendSummaries = loadDetailedBinders
    ? buildBinderTrendSummaries(metricCards, binderHistoryRows)
    : new Map<
        string,
        {
          recentChange: number | null;
          recentChangePct: number | null;
          recentChangeLabel: string | null;
        }
      >();
  const costBasisByItemId = loadDetailedCards
    ? buildCollectionCostBasisMap(
        metricCards,
        binders as CollectionBinderCostBasisRecord[],
        valueOptions
      )
    : new Map<string, CollectionCostBasis>();

  const collectionCardViewItems = loadDetailedCards
    ? (collectionCards as CollectionCardRecord[]).map((record) =>
        buildCardViewItem(record, costBasisByItemId.get(record.id), valueOptions)
      )
    : [];
  const forSaleCardViewItems = (forSaleCards as CollectionCardRecord[]).map((record) =>
    buildCardViewItem(record, null, valueOptions)
  );
  const soldCardViewItems = (soldCards as CollectionCardRecord[]).map((record) =>
    buildCardViewItem(record, null, valueOptions)
  );
  const soldTotal = roundCurrency(
    metricSoldCards.reduce((total, item) => total + (item.sale_price ?? 0), 0)
  );
  const soldCost = sumCollectionPurchasePrices(metricSoldCards.map((item) => item.purchase_price));
  const soldFees = roundCurrency(
    metricSoldCards.reduce((total, item) => total + (item.sale_fee_eur ?? 0), 0)
  );
  const soldNet = roundCurrency(soldTotal - soldFees);
  const saleSummary = {
    soldTotal,
    soldCards: metricSoldCards.length,
    soldCost,
    soldFees,
    soldNet,
    soldPnl: roundCurrency(soldTotal - soldCost),
    soldNetPnl: roundCurrency(soldNet - soldCost),
  };
  const looseSingleViewItems: CollectionCardViewItem[] = [];
  const binderCardViewItems: CollectionCardViewItem[] = [];

  if (
    activeTab === "overview" ||
    activeTab === "complete" ||
    activeTab === "singles" ||
    activeTab === "cards"
  ) {
    for (const item of collectionCardViewItems) {
      if (item.binder_id) {
        binderCardViewItems.push(item);
      } else {
        looseSingleViewItems.push(item);
      }
    }
  }

  const binderCardStats = loadDetailedBinders
    ? buildBinderCardStats(metricCards, valueOptions)
    : new Map<
        string,
        {
          count: number;
          currentValue: number;
          investment: number;
          uniqueOwnedCardIds: Set<string>;
        }
      >();

  const binderSummaries = loadDetailedBinders
    ? (binders as CollectionBinderRecord[])
        .map((binder) => {
          const binderStats = binderCardStats.get(binder.id);
          const currentValue = Number((binderStats?.currentValue ?? 0).toFixed(2));
          const baseInvestment = binderStats?.investment ?? 0;

          if (binder.type === "linked_set" && binder.episode) {
            const uniqueOwned = binderStats?.uniqueOwnedCardIds.size ?? 0;
            const investment = baseInvestment + (binder.base_purchase_price ?? 0);
            const totalCards = getEpisodeDisplayCardCount(binder.episode);
            const completionPct =
              totalCards > 0 ? Number(((uniqueOwned / totalCards) * 100).toFixed(1)) : null;
            const trend = binderTrendSummaries.get(binder.id) ?? null;

            return {
              id: binder.id,
              name: binder.name,
              type: binder.type,
              accent_color: binder.accent_color,
              icon_name: binder.icon_name,
              episode: binder.episode,
              progressLabel: `${uniqueOwned}/${totalCards}`,
              ownedCards: uniqueOwned,
              totalCards,
              completionPct,
              missingCards: Math.max(totalCards - uniqueOwned, 0),
              subtitle: `${binder.episode.series ?? "Set"} / ${binder.episode.name}`,
              recentChange: trend?.recentChange ?? null,
              recentChangePct: trend?.recentChangePct ?? null,
              recentChangeLabel: trend?.recentChangeLabel ?? null,
              ...buildMetric(investment, currentValue),
            };
          }

          const investment = baseInvestment + (binder.base_purchase_price ?? 0);
          const ownedCards = binderStats?.count ?? 0;
          const trend = binderTrendSummaries.get(binder.id) ?? null;

          return {
            id: binder.id,
            name: binder.name,
            type: binder.type,
            accent_color: binder.accent_color,
            icon_name: binder.icon_name,
            episode: null,
            progressLabel: `${ownedCards} cards`,
            ownedCards,
            totalCards: null,
            completionPct: null,
            missingCards: null,
            subtitle: "Custom binder",
            recentChange: trend?.recentChange ?? null,
            recentChangePct: trend?.recentChangePct ?? null,
            recentChangeLabel: trend?.recentChangeLabel ?? null,
            ...buildMetric(investment, currentValue),
          };
        })
        .sort((a, b) => {
          if (b.currentValue !== a.currentValue) {
            return b.currentValue - a.currentValue;
          }

          if (b.pnl !== a.pnl) {
            return b.pnl - a.pnl;
          }

          return a.name.localeCompare(b.name, undefined, {
            sensitivity: "base",
            numeric: true,
          });
        })
    : [];
  const sealedViewItems = loadDetailedSealed
    ? (collectionSealed as CollectionSealedRecord[]).map(buildSealedViewItem)
    : [];
  const valueDrivers =
    loadDetailedCards && loadDetailedSealed && loadCollectionHistory
      ? buildCollectionValueDrivers({
          cards: collectionCardViewItems,
          sealed: sealedViewItems,
          cardHistory,
          sealedHistory,
          gradedHistory,
          usdToEurRate,
          chart: combinedHistory,
          currentValue: overviewMetric.currentValue,
        })
      : EMPTY_COLLECTION_VALUE_DRIVERS;

  const result = {
    overview: {
      ...overviewMetric,
      totalCards: metricCards.length,
      totalSealedUnits: metricSealed.reduce((total, item) => total + item.quantity, 0),
      totalBinders: binders.length,
      chart: combinedHistory,
    },
    cards: collectionCardViewItems,
    looseSingles: looseSingleViewItems,
    binderCards: binderCardViewItems,
    forSaleCards: forSaleCardViewItems,
    soldCards: soldCardViewItems,
    saleSummary,
    sealed: sealedViewItems,
    valueDrivers,
    binders: binderSummaries,
  };

  timer.finish({
    cards: metricCards.length,
    forSaleCards: metricForSaleCards.length,
    soldCards: metricSoldCards.length,
    sealedItems: metricSealed.length,
    binders: binders.length,
    historyLoaded: loadCollectionHistory,
    historyPoints: combinedHistory.length,
  });

  return result;
}

interface SocialCollectionAccessOptions {
  fullAccess?: boolean;
}

function sanitizeSocialCollectionCard(
  item: CollectionCardViewItem,
  options: SocialCollectionAccessOptions = {}
): CollectionCardViewItem {
  const fullAccess = options.fullAccess === true;

  return {
    ...item,
    collection_item_id: null,
    collection_item_ids: [],
    binder_id: null,
    purchase_price: fullAccess ? item.purchase_price : null,
    cost_basis_value: fullAccess ? item.cost_basis_value : null,
    cost_basis_label: fullAccess ? item.cost_basis_label : "Paid",
    cost_basis_source: fullAccess ? item.cost_basis_source : "direct",
    notes: fullAccess ? item.notes ?? null : null,
    tags: fullAccess ? item.tags ?? [] : [],
  };
}

function sanitizeSocialCollectionOverviewData(
  data: CollectionOverviewData,
  options: SocialCollectionAccessOptions = {}
): CollectionOverviewData {
  const fullAccess = options.fullAccess === true;
  const sanitizeCards = (items: CollectionCardViewItem[]) =>
    items.map((item) => sanitizeSocialCollectionCard(item, options));

  return {
    ...data,
    overview: {
      ...data.overview,
      investment: fullAccess ? data.overview.investment : 0,
      pnl: fullAccess ? data.overview.pnl : 0,
    },
    cards: sanitizeCards(data.cards),
    looseSingles: sanitizeCards(data.looseSingles),
    binderCards: sanitizeCards(data.binderCards),
    forSaleCards: [],
    soldCards: [],
    saleSummary: {
      soldTotal: 0,
      soldCards: 0,
      soldCost: 0,
      soldFees: 0,
      soldNet: 0,
      soldPnl: 0,
      soldNetPnl: 0,
    },
    sealed: data.sealed.map((item) => ({
      ...item,
      purchase_price_per_item: fullAccess ? item.purchase_price_per_item : null,
    })),
    binders: data.binders.map((binder) => ({
      ...binder,
      investment: fullAccess ? binder.investment : 0,
      pnl: fullAccess ? binder.pnl : 0,
    })),
  };
}

export async function getSocialCollectionOverviewData(
  userId: string,
  game: TradingCardGameFilter = POKEMON_GAME,
  options: SocialCollectionAccessOptions = {}
): Promise<CollectionOverviewData> {
  const data = await getCollectionOverviewData({
    userId,
    activeTab: "overview",
    game,
  });

  return sanitizeSocialCollectionOverviewData(data, options);
}

export async function getSocialCollectionData(
  userId: string,
  game: TradingCardGameFilter = POKEMON_GAME
): Promise<SocialCollectionData> {
  const [collectionCards, collectionSealed, binders] = await Promise.all([
    getCollectionCards({ userId, game }),
    getCollectionSealedMetrics(userId, game),
    getCollectionBinders(userId, false, game),
  ]);
  const metricCards = collectionCards as CollectionCardMetricRecord[];
  const metricSealed = collectionSealed as CollectionSealedMetricRecord[];
  const usdToEurRate = hasUsdEbaySoldGradedPrices(metricCards)
    ? await getUsdToEurRate()
    : null;
  const valueOptions = { usdToEurRate };
  const cards = (collectionCards as CollectionCardRecord[]).map((record) =>
    sanitizeSocialCollectionCard(buildCardViewItem(record, null, valueOptions))
  );
  const rawCards = cards.filter((item) => !item.grading_company || !item.grading_grade).length;
  const gradedCards = cards.length - rawCards;
  const cardCurrentValue = sumCardCurrentValue(metricCards, valueOptions);
  const sealedCurrentValue = sumSealedCurrentValue(metricSealed);

  return {
    cards,
    metrics: {
      totalCards: metricCards.length,
      rawCards,
      gradedCards,
      totalBinders: binders.length,
      totalSealedUnits: metricSealed.reduce((total, item) => total + item.quantity, 0),
      currentValue: Number((cardCurrentValue + sealedCurrentValue).toFixed(2)),
      pricedCards: cards.filter((item) => item.current_value != null).length,
    },
  };
}

interface AllCardValueDriverRow {
  cardId: string;
  name: string;
  imageUrl: string | null;
  cardNumber: string | null;
  episodeId: string;
  episodeName: string;
  episodeCode: string | null;
  currentFetchedAt: Date | string | null;
  previousFetchedAt: Date | string | null;
  currentCmEnLowestNm: number | null;
  previousCmEnLowestNm: number | null;
  valueHistoryPoints: number;
}

function combineCollectionValueDriversData(
  results: CollectionValueDriversData[]
): CollectionValueDriversData {
  const drivers = results.flatMap((result) => [...result.gains, ...result.drops]);
  const gains = drivers
    .filter((item) => item.change > 0)
    .sort((a, b) => b.change - a.change || a.name.localeCompare(b.name));
  const drops = drivers
    .filter((item) => item.change < 0)
    .sort((a, b) => a.change - b.change || a.name.localeCompare(b.name));
  const latestResult =
    [...results]
      .filter((result) => result.latestDate)
      .sort((a, b) => String(b.latestDate).localeCompare(String(a.latestDate)))[0] ?? null;

  return {
    latestDate: latestResult?.latestDate ?? null,
    latestLabel: latestResult?.latestLabel ?? null,
    previousDate: latestResult?.previousDate ?? null,
    previousLabel: latestResult?.previousLabel ?? null,
    totalChange: roundCurrency(drivers.reduce((total, item) => total + item.change, 0)),
    gainsTotal: roundCurrency(gains.reduce((total, item) => total + item.change, 0)),
    dropsTotal: roundCurrency(drops.reduce((total, item) => total + item.change, 0)),
    sourceBreakdown: mergeValueDriverSourceBreakdowns(
      results.map((result) => result.sourceBreakdown)
    ),
    gains,
    drops,
  };
}

async function getAllCardValueDriversData(
  game: TradingCardGameFilter = POKEMON_GAME
): Promise<CollectionValueDriversData> {
  if (game === ALL_GAMES) {
    return combineCollectionValueDriversData(
      await Promise.all([
        getAllCardValueDriversData(POKEMON_GAME),
        getAllCardValueDriversData(ONE_PIECE_GAME),
      ])
    );
  }

  const timer = startPerformanceTimer("collection.value-drivers.all", { game });
  const dates = await db.$queryRaw<Array<{ date: string }>>`
    SELECT DATE(p.fetched_at) AS date
    FROM "Price" p
    INNER JOIN "Card" c ON c.id = p.card_id
    WHERE c.game = ${game}
      AND p.cm_en_lowest_nm > 0
      AND p.cm_en_lowest_nm <> 9001
    GROUP BY DATE(p.fetched_at)
    ORDER BY date DESC
    LIMIT ${COLLECTION_VALUE_DRIVER_WINDOW_DAYS + 2}
  `;
  const latestDate = dates[0]?.date ?? null;
  const previousDate = latestDate
    ? pickValueDriverWindowStartDate(
        dates.map((entry) => entry.date),
        latestDate
      )
    : null;

  if (!latestDate || !previousDate) {
    timer.finish({ historyDays: dates.length, drivers: 0 });
    return {
      ...EMPTY_COLLECTION_VALUE_DRIVERS,
      latestDate,
      latestLabel: latestDate ? toValueDriverDateLabel(latestDate) : null,
    };
  }

  const rows = await db.$queryRaw<AllCardValueDriverRow[]>`
    WITH current_prices AS (
      SELECT *
      FROM (
        SELECT
          p.card_id,
          p.fetched_at,
          p.cm_en_lowest_nm,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS row_num
        FROM "Price" p
        WHERE DATE(p.fetched_at) <= ${latestDate}
          AND p.cm_en_lowest_nm > 0
          AND p.cm_en_lowest_nm <> 9001
      )
      WHERE row_num = 1
    ),
    previous_prices AS (
      SELECT *
      FROM (
        SELECT
          p.card_id,
          p.fetched_at,
          p.cm_en_lowest_nm,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS row_num
        FROM "Price" p
        WHERE DATE(p.fetched_at) <= ${previousDate}
          AND p.cm_en_lowest_nm > 0
          AND p.cm_en_lowest_nm <> 9001
      )
      WHERE row_num = 1
    ),
    history_counts AS (
      SELECT
        card_id,
        COUNT(*) AS value_history_points
      FROM "Price"
      WHERE cm_en_lowest_nm > 0
        AND cm_en_lowest_nm <> 9001
      GROUP BY card_id
    )
    SELECT
      c.id AS "cardId",
      c.name AS "name",
      c.image_url AS "imageUrl",
      c.card_number AS "cardNumber",
      e.id AS "episodeId",
      e.name AS "episodeName",
      e.code AS "episodeCode",
      cp.fetched_at AS "currentFetchedAt",
      pp.fetched_at AS "previousFetchedAt",
      cp.cm_en_lowest_nm AS "currentCmEnLowestNm",
      pp.cm_en_lowest_nm AS "previousCmEnLowestNm",
      COALESCE(hc.value_history_points, 0) AS "valueHistoryPoints"
    FROM current_prices cp
    INNER JOIN previous_prices pp ON pp.card_id = cp.card_id
    INNER JOIN "Card" c ON c.id = cp.card_id
    INNER JOIN "Episode" e ON e.id = c.episode_id
    LEFT JOIN history_counts hc ON hc.card_id = c.id
    WHERE c.game = ${game}
  `;

  const drafts = new Map<string, CollectionValueDriverDraft>();
  const staleBeforeDate = getValueDriverStaleBeforeDate();
  const minBaselineDate = shiftHistoryDateKey(
    previousDate,
    -COLLECTION_VALUE_DRIVER_BASELINE_MAX_AGE_DAYS
  );

  for (const row of rows) {
    const latestSnapshotDate = row.currentFetchedAt ? toHistoryDateKey(row.currentFetchedAt) : null;
    if (!latestSnapshotDate || isValueDriverSnapshotStale(latestSnapshotDate, staleBeforeDate)) {
      continue;
    }
    const baselineDate = row.previousFetchedAt ? toHistoryDateKey(row.previousFetchedAt) : null;
    if (!baselineDate || isValueDriverBaselineTooOld(baselineDate, minBaselineDate)) continue;

    const currentValue = getCardMarketValue({
      cm_en_lowest_nm: row.currentCmEnLowestNm,
      cm_de_lowest_nm: null,
      cm_fr_lowest_nm: null,
      cm_es_lowest_nm: null,
      cm_it_lowest_nm: null,
    });
    const previousValue = getCardMarketValue({
      cm_en_lowest_nm: row.previousCmEnLowestNm,
      cm_de_lowest_nm: null,
      cm_fr_lowest_nm: null,
      cm_es_lowest_nm: null,
      cm_it_lowest_nm: null,
    });

    if (currentValue == null || previousValue == null || currentValue <= 0 || previousValue <= 0) {
      continue;
    }

    const change = roundCurrency(currentValue - previousValue);
    const changePct = calculateChangePct(change, previousValue);
    const coveredDays = Math.max(
      1,
      Math.round(
        (new Date(`${latestSnapshotDate}T00:00:00.000Z`).getTime() -
          new Date(`${baselineDate}T00:00:00.000Z`).getTime()) /
          (24 * 60 * 60 * 1000)
      )
    );
    const scores = buildMoverScores({
      kind: "raw",
      currentPrice: currentValue,
      change7d: { change, changePct, coveredDays },
      change30d: { change, changePct, coveredDays },
      historyPoints: Number(row.valueHistoryPoints ?? 0),
      lifetimeHistoryPoints: Number(row.valueHistoryPoints ?? 0),
      comparisonPrice: previousValue,
    });

    if (scores.priceQuality.status === "suspicious") {
      continue;
    }

    addCollectionValueDriverDraft(drafts, {
      id: `card:${row.cardId}:Raw`,
      kind: "card",
      cardId: row.cardId,
      productId: null,
      cardNumber: row.cardNumber,
      episodeId: row.episodeId,
      episodeName: row.episodeName,
      episodeCode: row.episodeCode,
      name: row.name,
      imageUrl: row.imageUrl,
      href: `${getExpansionHref(row.episodeId)}?card=${encodeURIComponent(row.cardId)}`,
      detail: row.cardNumber ? `#${row.cardNumber}` : "",
      quantity: 1,
      previousValue,
      currentValue,
      currentSource: "Raw",
      previousSource: "Raw",
      latestSnapshotDate,
      stale: false,
    });
  }

  const drivers = [...drafts.values()]
    .map(finalizeCollectionValueDriver)
    .filter((item) => Math.abs(item.change) >= 0.01);
  const gains = drivers
    .filter((item) => item.change > 0)
    .sort((a, b) => b.change - a.change || a.name.localeCompare(b.name));
  const drops = drivers
    .filter((item) => item.change < 0)
    .sort((a, b) => a.change - b.change || a.name.localeCompare(b.name));

  const result = {
    latestDate,
    latestLabel: toValueDriverDateLabel(latestDate),
    previousDate,
    previousLabel: toValueDriverDateLabel(previousDate),
    totalChange: roundCurrency(drivers.reduce((total, item) => total + item.change, 0)),
    gainsTotal: roundCurrency(
      drivers.reduce((total, item) => total + (item.change > 0 ? item.change : 0), 0)
    ),
    dropsTotal: roundCurrency(
      drivers.reduce((total, item) => total + (item.change < 0 ? item.change : 0), 0)
    ),
    sourceBreakdown: buildValueDriverSourceBreakdown(drivers),
    gains,
    drops,
  };

  timer.finish({
    historyDays: dates.length,
    cards: rows.length,
    drivers: result.gains.length + result.drops.length,
  });

  return result;
}

export async function getCollectionValueDriversData(
  userId: string,
  scope: CollectionValueDriversScope = "collection",
  game: TradingCardGameFilter = POKEMON_GAME
): Promise<CollectionValueDriversData> {
  if (scope === "all") {
    return getAllCardValueDriversData(game);
  }

  const timer = startPerformanceTimer("collection.value-drivers", { game });
  const [collectionCards, collectionSealed] = await Promise.all([
    getCollectionCards({ userId, game }),
    getCollectionSealedItems(userId, true, game),
  ]);
  const metricCards = collectionCards as CollectionCardMetricRecord[];
  const metricSealed = collectionSealed as CollectionSealedMetricRecord[];
  const cardQuantities = buildCardQuantityMap(metricCards);
  const sealedQuantities = buildProductQuantityMap(metricSealed);
  const gradedCardIds = [
    ...new Set(
      metricCards
        .filter((record) => record.grading_company)
        .map((record) => record.card.id)
    ),
  ];
  const [cardHistory, sealedHistory, gradedHistory] = await Promise.all([
    getCardHistoryRows([...cardQuantities.keys()], getHistoryCutoffDate()),
    getSealedHistoryRows([...sealedQuantities.keys()], getHistoryCutoffDate()),
    getGradedHistoryRows(gradedCardIds, getHistoryCutoffDate()),
  ]);
  const usdToEurRate = hasUsdEbaySoldGradedPrices(metricCards)
    ? await getUsdToEurRate()
    : null;
  const valueOptions = { usdToEurRate };
  // Graded copies chart via their own graded price history; only the raw
  // copies count in the raw series, so the chart tracks every card the way
  // the collection actually prices it (and matches the drivers).
  const rawChartQuantities = buildCardQuantityMap(
    metricCards.filter((record) => !record.grading_company)
  );
  const gradedCopies = metricCards
    .filter((record) => record.grading_company)
    .map((record) => ({
      card_id: record.card.id,
      gradingCompany: record.grading_company,
      gradingGrade: record.grading_grade,
    }));
  const combinedHistory = combineValueHistories(
    buildOwnedCardValueHistory(cardHistory, rawChartQuantities),
    buildOwnedSealedValueHistory(sealedHistory, sealedQuantities),
    buildOwnedGradedCardValueHistory(gradedHistory, cardHistory, gradedCopies, usdToEurRate)
  ).map((point) => ({
    date: point.date,
    label: point.label,
    value: point.total_market,
  }));
  const cardItems = (collectionCards as CollectionCardRecord[]).map((record) =>
    buildCardViewItem(record, undefined, valueOptions)
  );
  const sealedItems = (collectionSealed as CollectionSealedRecord[]).map(buildSealedViewItem);
  const currentValue = roundCurrency(
    sumCardCurrentValue(metricCards, valueOptions) + sumSealedCurrentValue(metricSealed)
  );
  const result = buildCollectionValueDrivers({
    cards: cardItems,
    sealed: sealedItems,
    cardHistory,
    sealedHistory,
    gradedHistory,
    usdToEurRate,
    chart: combinedHistory,
    currentValue,
  });

  timer.finish({
    cards: metricCards.length,
    sealedItems: metricSealed.length,
    historyPoints: combinedHistory.length,
    drivers: result.gains.length + result.drops.length,
  });

  return result;
}

function sortWantPlannerItems(items: CollectionCardViewItem[]) {
  return [...items].sort((a, b) => {
    const valueDiff = (b.current_value ?? -1) - (a.current_value ?? -1);
    if (valueDiff !== 0) return valueDiff;

    const numberDiff = (a.card_number ?? "").localeCompare(b.card_number ?? "", undefined, {
      numeric: true,
      sensitivity: "base",
    });
    if (numberDiff !== 0) return numberDiff;

    return a.name.localeCompare(b.name);
  });
}

async function addWantChasePosition(
  items: CollectionCardViewItem[]
): Promise<CollectionCardViewItem[]> {
  const episodeIds = [...new Set(items.map((item) => item.episode_id))];
  if (episodeIds.length === 0) return items;

  const cards = await db.$queryRaw<
    Array<{
      episode_id: string;
      rarity: string | null;
      cm_en_lowest_nm: number | null;
    }>
  >(Prisma.sql`
    SELECT
      c.episode_id,
      c.rarity,
      (
        SELECT p.cm_en_lowest_nm
        FROM Price p
        WHERE p.card_id = c.id
        ORDER BY p.fetched_at DESC, p.id DESC
        LIMIT 1
      ) AS cm_en_lowest_nm
    FROM Card c
    WHERE c.episode_id IN (${Prisma.join(episodeIds)})
  `);
  const raritiesByEpisode = new Map<string, Array<string | null>>();
  const pricesByEpisode = new Map<string, number[]>();
  for (const card of cards) {
    const rarities = raritiesByEpisode.get(card.episode_id) ?? [];
    rarities.push(card.rarity);
    raritiesByEpisode.set(card.episode_id, rarities);

    const price = card.cm_en_lowest_nm;
    if (price != null && Number.isFinite(price) && price > 0 && price !== 9001) {
      const prices = pricesByEpisode.get(card.episode_id) ?? [];
      prices.push(price);
      pricesByEpisode.set(card.episode_id, prices);
    }
  }

  for (const prices of pricesByEpisode.values()) prices.sort((a, b) => a - b);

  return items.map((item) => {
    const rarityPosition = calculateSetRarityPosition(
      item.rarity,
      raritiesByEpisode.get(item.episode_id) ?? []
    );
    const setPrices = pricesByEpisode.get(item.episode_id) ?? [];
    const currentPrice = item.current_value;
    const pricePercentile =
      currentPrice != null && currentPrice > 0 && setPrices.length > 0
        ? (setPrices.filter((price) => price <= currentPrice).length / setPrices.length) * 100
        : null;
    const absolutePriceStrength =
      currentPrice != null && currentPrice > 0
        ? Math.min(100, (Math.log10(currentPrice + 1) / Math.log10(101)) * 100)
        : null;
    const chaseScore =
      rarityPosition.setRarityScore == null
        ? null
        : pricePercentile == null || absolutePriceStrength == null
          ? rarityPosition.setRarityScore
          : Math.round(
              rarityPosition.setRarityScore * 0.45 +
                pricePercentile * 0.25 +
                absolutePriceStrength * 0.3
            );
    return {
      ...item,
      chase_score: chaseScore,
      chase_tier:
        chaseScore == null
          ? "Unknown"
          : chaseScore >= 85
            ? "Chase tier"
            : chaseScore >= 65
              ? "Upper tier"
              : chaseScore >= 40
                ? "Mid tier"
                : "Entry tier",
    };
  });
}

export async function getWantsPageData(
  userId: string,
  game: TradingCardGameFilter = POKEMON_GAME
): Promise<WantsPageData> {
  const timer = startPerformanceTimer("collection.wants", { game });
  const wants = (await getCollectionWants(userId, game)) as CollectionWantRecord[];
  const items = await addWantChasePosition(wants.map(buildWantViewItem));
  const linkedBinders = await db.collectionBinder.findMany({
    where: {
      user_id: userId,
      type: "linked_set",
      episode_id: { not: null },
      episode: {
        ...(isSpecificTradingCardGame(game) ? { game } : {}),
      },
    },
    orderBy: [{ updated_at: "desc" }, { created_at: "desc" }],
    select: {
      id: true,
      name: true,
      accent_color: true,
      icon_name: true,
      episode_id: true,
      episode: {
        select: {
          id: true,
          name: true,
          code: true,
          logo_url: true,
          series: true,
          card_count: true,
          _count: { select: { cards: true } },
        },
      },
    },
  });
  const linkedEpisodeIds = [
    ...new Set(
      linkedBinders
        .map((binder) => binder.episode_id)
        .filter((episodeId): episodeId is string => Boolean(episodeId))
    ),
  ];
  const [setCards, ownedCards, plannerWants] =
    linkedEpisodeIds.length > 0
      ? await Promise.all([
          db.card.findMany({
            where: { episode_id: { in: linkedEpisodeIds } },
            select: { id: true, episode_id: true },
          }),
          db.collectionCard.findMany({
            where: {
              user_id: userId,
              ...ACTIVE_COLLECTION_CARD_FILTER,
              card: { episode_id: { in: linkedEpisodeIds } },
            },
            select: { card_id: true },
          }),
          db.collectionWant.findMany({
            where: {
              user_id: userId,
              card: { episode_id: { in: linkedEpisodeIds } },
            },
            select: {
              id: true,
              card_id: true,
              source: true,
              source_episode_id: true,
              dismissed_at: true,
            },
          }),
        ])
      : ([[], [], []] as const);
  const ownedCardIds = new Set(ownedCards.map((card) => card.card_id));
  const setCardsByEpisodeId = new Map<string, string[]>();
  const allPlannerWantByCardId = new Map(plannerWants.map((want) => [want.card_id, want]));
  const activeItemsByEpisodeId = new Map<string, CollectionCardViewItem[]>();

  for (const card of setCards) {
    const episodeCards = setCardsByEpisodeId.get(card.episode_id) ?? [];
    episodeCards.push(card.id);
    setCardsByEpisodeId.set(card.episode_id, episodeCards);
  }

  for (const item of items) {
    if (!linkedEpisodeIds.includes(item.episode_id)) continue;
    const groupItems = activeItemsByEpisodeId.get(item.episode_id) ?? [];
    groupItems.push(item);
    activeItemsByEpisodeId.set(item.episode_id, groupItems);
  }

  let needsPlannerSync = false;
  const plannerGroups = linkedBinders
    .map((binder) => {
      if (!binder.episode || !binder.episode_id) return null;

      const setCardIds = setCardsByEpisodeId.get(binder.episode_id) ?? [];
      const missingCardIds = setCardIds.filter((cardId) => !ownedCardIds.has(cardId));
      const missingCardIdSet = new Set(missingCardIds);
      const activeItems = sortWantPlannerItems(
        (activeItemsByEpisodeId.get(binder.episode_id) ?? []).filter((item) =>
          missingCardIdSet.has(item.card_id)
        )
      );
      const hiddenCards = plannerWants.filter(
        (want) =>
          want.source === WANT_SOURCE_BINDER_MISSING &&
          want.dismissed_at &&
          (want.source_episode_id ?? binder.episode_id) === binder.episode_id &&
          missingCardIdSet.has(want.card_id)
      ).length;

      if (missingCardIds.some((cardId) => !allPlannerWantByCardId.has(cardId))) {
        needsPlannerSync = true;
      }

      if (missingCardIds.length === 0 && hiddenCards === 0 && activeItems.length === 0) {
        return null;
      }

      const totalCards = getEpisodeDisplayCardCount(binder.episode);
      const ownedCount = Math.max(totalCards - missingCardIds.length, 0);
      const estimatedCost = Number(
        activeItems.reduce((total, item) => total + (item.current_value ?? 0), 0).toFixed(2)
      );

      return {
        binderId: binder.id,
        episodeId: binder.episode_id,
        name: binder.name || binder.episode.name,
        subtitle: `${binder.episode.series ?? "Set"} / ${binder.episode.name}`,
        logoUrl: binder.episode.logo_url,
        accentColor: binder.accent_color,
        iconName: binder.icon_name,
        progressLabel: `${ownedCount}/${totalCards}`,
        ownedCards: ownedCount,
        totalCards,
        visibleMissingCards: activeItems.length,
        totalMissingCards: missingCardIds.length,
        hiddenCards,
        pricedCards: activeItems.filter((item) => item.current_value != null).length,
        estimatedCost,
        items: activeItems,
      } satisfies WantPlannerGroup;
    })
    .filter((group): group is WantPlannerGroup => Boolean(group));

  if (
    plannerWants.some(
      (want) =>
        want.source === WANT_SOURCE_BINDER_MISSING &&
        (ownedCardIds.has(want.card_id) ||
          !want.source_episode_id ||
          !linkedEpisodeIds.includes(want.source_episode_id))
    )
  ) {
    needsPlannerSync = true;
  }

  const plannerEpisodeIds = new Set(plannerGroups.map((group) => group.episodeId));
  const personalItems = items.filter((item) => !plannerEpisodeIds.has(item.episode_id));
  const pricedItems = items.filter((item) => item.current_value != null);
  const wantQuantities = buildCardQuantityMap(wants);
  const historyRows = await getCardHistoryRows(
    [...wantQuantities.keys()],
    getHistoryCutoffDate()
  );
  const chart = buildOwnedCardValueHistory(historyRows, wantQuantities).map((point) => ({
    date: point.date,
    label: point.label,
    value: point.total_market,
  }));
  const estimatedValue = Number(
    pricedItems.reduce((total, item) => total + (item.current_value ?? 0), 0).toFixed(2)
  );
  const buyNow = buildBinderNextBuyRecommendations({
    items,
    history: historyRows,
    ownedCount: 0,
    totalCards: items.length,
  });

  timer.finish({
    wants: items.length,
    priced: pricedItems.length,
    estimatedValue,
    historyPoints: chart.length,
    plannerGroups: plannerGroups.length,
    needsPlannerSync,
  });

  return {
    items,
    personalItems,
    plannerGroups,
    needsPlannerSync,
    chart,
    totalCards: items.length,
    totalSets: new Set(items.map((item) => item.episode_id)).size,
    pricedCards: pricedItems.length,
    estimatedValue,
    averageValue:
      pricedItems.length > 0 ? Number((estimatedValue / pricedItems.length).toFixed(2)) : null,
    buyNow,
  };
}

export async function getWantBinderPageData(
  binderId: string,
  userId: string
): Promise<WantBinderPageData | null> {
  const binder = await db.collectionBinder.findFirst({
    where: {
      id: binderId,
      user_id: userId,
      type: "linked_set",
      episode_id: { not: null },
      episode: { isNot: null },
    },
    select: {
      id: true,
      name: true,
      type: true,
      accent_color: true,
      icon_name: true,
      episode: {
        select: {
          id: true,
          game: true,
          name: true,
          code: true,
          logo_url: true,
          series: true,
          card_count: true,
          _count: { select: { cards: true } },
        },
      },
    },
  });

  if (!binder?.episode) return null;

  const binderGame: TradingCardGameFilter =
    binder.episode.game === ONE_PIECE_GAME ? ONE_PIECE_GAME : POKEMON_GAME;

  await syncMissingBinderWantsForUser(userId, { game: binderGame });

  const [wants, ownedCards, hiddenCards] = await Promise.all([
    db.collectionWant.findMany({
      where: {
        user_id: userId,
        dismissed_at: null,
        card: {
          episode_id: binder.episode.id,
          collectionItems: {
            none: { user_id: userId, ...ACTIVE_COLLECTION_CARD_FILTER },
          },
        },
      },
      orderBy: { created_at: "desc" },
      select: collectionWantSelect,
    }),
    db.collectionCard.findMany({
      where: {
        user_id: userId,
        ...ACTIVE_COLLECTION_CARD_FILTER,
        card: { episode_id: binder.episode.id },
      },
      select: { card_id: true },
    }),
    db.collectionWant.count({
      where: {
        user_id: userId,
        source: WANT_SOURCE_BINDER_MISSING,
        source_episode_id: binder.episode.id,
        dismissed_at: { not: null },
        card: {
          collectionItems: {
            none: { user_id: userId, ...ACTIVE_COLLECTION_CARD_FILTER },
          },
        },
      },
    }),
  ]);

  const items = sortWantPlannerItems(
    await addWantChasePosition((wants as CollectionWantRecord[]).map(buildWantViewItem))
  );
  const pricedItems = items.filter((item) => item.current_value != null);
  const wantQuantities = buildCardQuantityMap(wants as CollectionWantRecord[]);
  const historyRows = await getCardHistoryRows(
    [...wantQuantities.keys()],
    getHistoryCutoffDate()
  );
  const chart = buildOwnedCardValueHistory(historyRows, wantQuantities).map((point) => ({
    date: point.date,
    label: point.label,
    value: point.total_market,
  }));
  const totalCards = getEpisodeDisplayCardCount(binder.episode);
  const ownedCount = new Set(ownedCards.map((card) => card.card_id)).size;
  const missingCards = Math.max(totalCards - ownedCount, 0);
  const estimatedCost = Number(
    pricedItems.reduce((total, item) => total + (item.current_value ?? 0), 0).toFixed(2)
  );
  const nextBuys = buildBinderNextBuyRecommendations({
    items,
    history: historyRows,
    ownedCount,
    totalCards,
  });

  return {
    binder: {
      ...binder,
      episode: {
        id: binder.episode.id,
        name: binder.episode.name,
        code: binder.episode.code,
        logo_url: binder.episode.logo_url,
        series: binder.episode.series,
        card_count: binder.episode.card_count,
        _count: binder.episode._count,
      },
    },
    items,
    chart,
    metrics: {
      ownedCount,
      totalCards,
      missingCards,
      visibleMissingCards: items.length,
      hiddenCards,
      pricedCards: pricedItems.length,
      estimatedCost,
      averageCost:
        pricedItems.length > 0 ? Number((estimatedCost / pricedItems.length).toFixed(2)) : null,
    },
    nextBuys,
  };
}

export async function getBinderPageData(
  binderId: string,
  userId: string,
  options: { historyRange?: BinderHistoryRange } = {}
): Promise<BinderPageData | null> {
  const binder = await db.collectionBinder.findFirst({
    where: { id: binderId, user_id: userId },
    select: {
      id: true,
      name: true,
      type: true,
      accent_color: true,
      icon_name: true,
      base_purchase_price: true,
      episode: {
        select: {
          id: true,
          name: true,
          code: true,
          logo_url: true,
          series: true,
          card_count: true,
          _count: { select: { cards: true } },
        },
      },
    },
  });

  if (!binder) return null;

  const historySince =
    options.historyRange === "all" ? undefined : getHistoryCutoffDate(BINDER_HISTORY_RECENT_DAYS);

  if (binder.type === "linked_set" && binder.episode) {
    const [allSetCards, ownedCards] = await Promise.all([
      db.card.findMany({
        where: { episode_id: binder.episode.id },
        orderBy: [{ card_number: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          image_url: true,
          card_number: true,
          printed_card_number: true,
          version: true,
          rarity: true,
          supertype: true,
          episode_id: true,
          prices: {
            where: { cm_en_lowest_nm: { gt: 0, not: 9001 } },
            orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
            take: 1,
            select: {
              cm_en_lowest_nm: true,
              cm_de_lowest_nm: true,
              cm_fr_lowest_nm: true,
              cm_es_lowest_nm: true,
              cm_it_lowest_nm: true,
              cm_jp_lowest_nm: true,
              tcp_market: true,
            },
          },
          gradedPrices: {
            orderBy: [{ price: "desc" }, { label: "asc" }],
            select: {
              label: true,
              price: true,
            },
          },
          ebaySoldGradedPrices: {
            orderBy: [{ median_price: "desc" }, { label: "asc" }],
            select: {
              label: true,
              company: true,
              grade: true,
              median_price: true,
              currency: true,
            },
          },
          episode: {
            select: { id: true, name: true, code: true },
          },
        },
      }),
      db.collectionCard.findMany({
        where: {
          binder_id: binder.id,
          user_id: userId,
          ...ACTIVE_COLLECTION_CARD_FILTER,
        },
        select: {
          id: true,
          purchase_price: true,
          condition: true,
          language: true,
          notes: true,
          grading_company: true,
          grading_grade: true,
          grading_subgrades_json: true,
          tags: {
            select: {
              label: true,
            },
          },
          card: {
            select: {
              id: true,
              episode_id: true,
            },
          },
        },
      }),
    ]);

    const hasUsdEbaySoldForLinkedCards = ownedCards.some((item) => {
      if (!item.grading_company || !item.grading_grade) return false;
      const currentCard = allSetCards.find((card) => card.id === item.card.id);
      return currentCard?.ebaySoldGradedPrices.some(
        (price) => price.currency.toUpperCase() === "USD"
      ) ?? false;
    });
    const usdToEurRate = hasUsdEbaySoldForLinkedCards ? await getUsdToEurRate() : null;
    const valueOptions = { usdToEurRate };

    const ownedByCardId = new Map<
      string,
      {
        count: number;
        purchasePrice: number;
        condition: string | null;
        language: string | null;
        notes: string | null;
        tags: string[];
        gradingCompany: string | null;
        gradingGrade: string | null;
        gradingSubgrades: ReturnType<typeof parseBgsSubgrades>;
        itemIds: string[];
        currentValue: number;
        cmValue: number;
        tcpValue: number;
        costBasisValue: number;
      }
    >();

    const allSetCardById = new Map(allSetCards.map((card) => [card.id, card]));
    const costBasisByItemId = buildLinkedBinderCostBasis({
      binderType: binder.type,
      binderEpisodeId: binder.episode.id,
      binderBasePurchasePrice: binder.base_purchase_price,
      items: ownedCards.map((item) => {
        const currentCard = allSetCardById.get(item.card.id);

        return {
          itemId: item.id,
          episodeId: item.card.episode_id,
          directPurchasePrice: item.purchase_price,
          currentValue: currentCard
            ? getCollectionCardMarketValue(currentCard, {
                gradingCompany: item.grading_company,
                gradingGrade: item.grading_grade,
                usdToEurRate: valueOptions.usdToEurRate,
              })
            : null,
        };
      }),
    });

    for (const item of ownedCards) {
      const currentCard = allSetCardById.get(item.card.id);
      const itemCurrentValue =
        getCollectionCardMarketValue(currentCard, {
          gradingCompany: item.grading_company,
          gradingGrade: item.grading_grade,
          usdToEurRate: valueOptions.usdToEurRate,
        }) ?? 0;
      const itemCmValue = getCollectionCardMarketValue(currentCard) ?? 0;
      const itemTcpValue = currentCard?.prices[0]?.tcp_market ?? 0;
      const itemCostBasis = costBasisByItemId.get(item.id)?.value ?? 0;
      const existing = ownedByCardId.get(item.card.id);
      if (existing) {
        existing.count += 1;
        existing.purchasePrice += item.purchase_price ?? 0;
        existing.itemIds.push(item.id);
        existing.currentValue += itemCurrentValue;
        existing.cmValue += itemCmValue;
        existing.tcpValue += itemTcpValue;
        existing.costBasisValue += itemCostBasis;
      } else {
        ownedByCardId.set(item.card.id, {
          count: 1,
          purchasePrice: item.purchase_price ?? 0,
          condition: item.condition,
          language: item.language,
          notes: item.notes,
          tags: item.tags.map((tag) => tag.label),
          gradingCompany: item.grading_company,
          gradingGrade: item.grading_grade,
          gradingSubgrades: parseBgsSubgrades(item.grading_subgrades_json),
          itemIds: [item.id],
          currentValue: itemCurrentValue,
          cmValue: itemCmValue,
          tcpValue: itemTcpValue,
          costBasisValue: itemCostBasis,
        });
      }
    }

    const cardQuantities = new Map<string, number>();
    for (const [cardId, info] of ownedByCardId) {
      cardQuantities.set(cardId, info.count);
    }

    const historyRows =
      cardQuantities.size > 0
        ? await getCardHistoryRows([...cardQuantities.keys()], historySince)
        : [];

    const items: CollectionCardViewItem[] = allSetCards.map((card) => {
      const owned = ownedByCardId.get(card.id);
      return {
        collection_item_id: owned?.itemIds.length === 1 ? owned.itemIds[0] : null,
        collection_item_ids: owned?.itemIds ?? [],
        binder_id: owned ? binder.id : null,
        card_id: card.id,
        name: card.name,
        image_url: card.image_url,
        card_number: getDisplayCardNumber(card),
        rarity: card.rarity,
        supertype: card.supertype,
        episode_id: card.episode.id,
        episode_name: card.episode.name,
        episode_code: card.episode.code,
        cm_value: owned
          ? Number(owned.cmValue.toFixed(2))
          : getCollectionCardMarketValue(card),
        tcp_value: owned
          ? Number(owned.tcpValue.toFixed(2))
          : card.prices[0]?.tcp_market ?? null,
        current_value:
          owned
            ? Number(owned.currentValue.toFixed(2))
            : getCollectionCardMarketValue(card),
        current_value_label:
          owned
            ? getCollectionCardValueInfo(card, {
                gradingCompany: owned.gradingCompany,
                gradingGrade: owned.gradingGrade,
                usdToEurRate: valueOptions.usdToEurRate,
              }).label
            : null,
        purchase_price: owned ? Number(owned.purchasePrice.toFixed(2)) : null,
        cost_basis_value: owned ? Number(owned.costBasisValue.toFixed(2)) : null,
        cost_basis_label: owned ? "Overall Spend" : "Paid",
        cost_basis_source: owned ? "linked_binder_allocation" : "direct",
        condition: owned?.condition ?? null,
        language: owned?.language ?? null,
        notes: owned?.notes ?? null,
        tags: owned?.tags ?? [],
        grading_company: owned?.gradingCompany ?? null,
        grading_grade: owned?.gradingGrade ?? null,
        grading_subgrades: owned?.gradingSubgrades ?? null,
        owned: Boolean(owned),
        owned_count: owned?.count ?? 0,
      };
    });

    const currentValue = items.reduce((total, item) => total + (item.owned ? item.current_value ?? 0 : 0), 0);
    const investment =
      sumCollectionPurchasePrices(items.map((item) => item.purchase_price)) +
      (binder.base_purchase_price ?? 0);
    const history = buildOwnedCardValueHistory(historyRows, cardQuantities).map((point) => ({
      date: point.date,
      label: point.label,
      value: point.total_market,
    }));

    return {
      binder,
      items,
      priceSnapshots: historyRows,
      chart: history,
      metrics: {
        ...buildMetric(investment, currentValue),
        ownedCount: items.filter((item) => item.owned).length,
        totalCards: getEpisodeDisplayCardCount(binder.episode),
      },
    };
  }

  const binderCards = await getCollectionCards({ binderId, userId });
  const metricBinderCards = binderCards as CollectionCardMetricRecord[];
  const usdToEurRate = hasUsdEbaySoldGradedPrices(metricBinderCards)
    ? await getUsdToEurRate()
    : null;
  const valueOptions = { usdToEurRate };
  const items = (binderCards as CollectionCardRecord[]).map((record) =>
    buildCardViewItem(record, undefined, valueOptions)
  );
  const currentValue = sumCardCurrentValue(metricBinderCards, valueOptions);
  const investment =
    sumCollectionPurchasePrices(binderCards.map((item) => item.purchase_price)) +
    (binder.base_purchase_price ?? 0);
  const cardQuantities = buildCardQuantityMap(metricBinderCards);
  const historyRows =
    cardQuantities.size > 0
      ? await getCardHistoryRows([...cardQuantities.keys()], historySince)
      : [];

  return {
    binder,
    items,
    priceSnapshots: historyRows,
    chart: buildOwnedCardValueHistory(historyRows, cardQuantities).map((point) => ({
      date: point.date,
      label: point.label,
      value: point.total_market,
    })),
    metrics: {
      ...buildMetric(investment, currentValue),
      ownedCount: items.length,
      totalCards: null,
    },
  };
}
