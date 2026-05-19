import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import type { CollectionCardViewItem, CollectionSealedViewItem } from "@/types/collection-view";
import {
  buildOwnedCardValueHistory,
  buildOwnedSealedValueHistory,
  buildLinkedBinderCostBasis,
  combineValueHistories,
  type CollectionCostBasis,
  type CollectionCardValueLike,
  type CollectionSealedValueLike,
  getCollectionCardMarketValue,
  getCollectionCardValueInfo,
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
import { WANT_SOURCE_BINDER_MISSING, syncMissingBinderWantsForUser } from "@/lib/wantlist-planner";

export interface CollectionSummaryMetric {
  investment: number;
  currentValue: number;
  pnl: number;
}

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
}

export type CollectionValueDriversScope = "collection" | "all";

export interface CollectionValueDriversData {
  latestDate: string | null;
  latestLabel: string | null;
  previousDate: string | null;
  previousLabel: string | null;
  totalChange: number | null;
  gainsTotal: number;
  dropsTotal: number;
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
  sealed: CollectionSealedViewItem[];
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

export type CollectionPageTab =
  | "overview"
  | "complete"
  | "singles"
  | "cards"
  | "binders"
  | "sealed"
  | "graded";

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
      rarity: true,
      supertype: true,
      episode_id: true,
      prices: {
        orderBy: { fetched_at: "desc" },
        take: 1,
        select: {
          cm_en_lowest_nm: true,
          cm_de_lowest_nm: true,
          cm_fr_lowest_nm: true,
          cm_es_lowest_nm: true,
          cm_it_lowest_nm: true,
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
  purchase_price: true,
  grading_company: true,
  grading_grade: true,
  grading_subgrades_json: true,
  card: {
    select: {
      id: true,
      episode_id: true,
      prices: {
        orderBy: { fetched_at: "desc" },
        take: 1,
        select: {
          cm_en_lowest_nm: true,
          cm_de_lowest_nm: true,
          cm_fr_lowest_nm: true,
          cm_es_lowest_nm: true,
          cm_it_lowest_nm: true,
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
      rarity: true,
      supertype: true,
      prices: {
        orderBy: { fetched_at: "desc" },
        take: 1,
        select: {
          cm_en_lowest_nm: true,
          cm_de_lowest_nm: true,
          cm_fr_lowest_nm: true,
          cm_es_lowest_nm: true,
          cm_it_lowest_nm: true,
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
const COLLECTION_VALUE_DRIVER_LIMIT = 24;
const EMPTY_COLLECTION_VALUE_DRIVERS: CollectionValueDriversData = {
  latestDate: null,
  latestLabel: null,
  previousDate: null,
  previousLabel: null,
  totalChange: null,
  gainsTotal: 0,
  dropsTotal: 0,
  gains: [],
  drops: [],
};

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

function toHistoryDateKey(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function toHistoryMillis(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
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
    skip?: number;
    take?: number;
    detail?: boolean;
  }
) {
  return db.collectionCard.findMany({
    where: {
      user_id: options.userId,
      ...(isSpecificTradingCardGame(options.game) ? { card: { game: options.game } } : {}),
      ...(options.binderId ? { binder_id: options.binderId } : {}),
    },
    orderBy: { added_at: "desc" },
    skip: options.skip,
    take: options.take,
    select: options.detail ? collectionCardSelect : collectionCardMetricSelect,
  });
}

async function fetchCollectionCards(options: {
  userId: string;
  game?: TradingCardGameFilter;
  binderId?: string;
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
    rarity: string | null;
    supertype: string | null;
    prices: Array<{
      cm_en_lowest_nm: number | null;
      cm_de_lowest_nm: number | null;
      cm_fr_lowest_nm: number | null;
      cm_es_lowest_nm: number | null;
      cm_it_lowest_nm: number | null;
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

async function getCollectionWants(userId: string, game: TradingCardGameFilter = POKEMON_GAME) {
  return db.collectionWant.findMany({
    where: {
      user_id: userId,
      dismissed_at: null,
      card: {
        ...(isSpecificTradingCardGame(game) ? { game } : {}),
        collectionItems: {
          none: { user_id: userId },
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
    { cards: { some: { card: { game } } } },
  ];

  if (game === POKEMON_GAME) {
    gameConditions.push({ episode_id: null, cards: { none: {} } });
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

async function getCardHistoryRows(cardIds: string[], since?: string) {
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
          cm_it_lowest_nm
        FROM (
          SELECT
            p.card_id,
            p.fetched_at,
            p.cm_en_lowest_nm,
            p.cm_de_lowest_nm,
            p.cm_fr_lowest_nm,
            p.cm_es_lowest_nm,
            p.cm_it_lowest_nm,
            ROW_NUMBER() OVER (
              PARTITION BY p.card_id, DATE(p.fetched_at)
              ORDER BY p.fetched_at DESC, p.id DESC
            ) AS row_num
          FROM "Price" p
          WHERE p.card_id IN (${placeholdersFor(chunk)})
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
    card_id: record.card.id,
    name: record.card.name,
    image_url: record.card.image_url,
    card_number: getDisplayCardNumber(record.card),
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
    card_id: record.card.id,
    name: record.card.name,
    image_url: record.card.image_url,
    card_number: getDisplayCardNumber(record.card),
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

function buildCardBaselineValueMap(
  rows: EpisodePriceHistorySnapshot[],
  baselineDate: string
): Map<string, number> {
  const values = new Map<string, number>();
  const sorted = [...rows].sort((a, b) => toHistoryMillis(a.fetched_at) - toHistoryMillis(b.fetched_at));

  for (const row of sorted) {
    if (toHistoryDateKey(row.fetched_at) > baselineDate) {
      continue;
    }

    const value = getCardMarketValue(row);
    if (value == null) {
      values.delete(row.card_id);
    } else {
      values.set(row.card_id, value);
    }
  }

  return values;
}

function buildSealedBaselineValueMap(
  rows: EpisodeSealedPriceHistorySnapshot[],
  baselineDate: string
): Map<string, number> {
  const values = new Map<string, number>();
  const sorted = [...rows].sort((a, b) => toHistoryMillis(a.fetched_at) - toHistoryMillis(b.fetched_at));

  for (const row of sorted) {
    if (toHistoryDateKey(row.fetched_at) > baselineDate) {
      continue;
    }

    const value = getSealedCardMarketValue(row);
    if (value == null) {
      values.delete(row.product_id);
    } else {
      values.set(row.product_id, value);
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

  return number ?? "";
}

function buildSealedValueDriverDetail(item: CollectionSealedViewItem): string {
  const episode = item.episode_code
    ? `${item.episode_name} (${item.episode_code})`
    : item.episode_name;

  return [`x${item.quantity}`, episode].filter(Boolean).join(" / ");
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
  chart,
  currentValue,
  limit = COLLECTION_VALUE_DRIVER_LIMIT,
}: {
  cards: CollectionCardViewItem[];
  sealed: CollectionSealedViewItem[];
  cardHistory: EpisodePriceHistorySnapshot[];
  sealedHistory: EpisodeSealedPriceHistorySnapshot[];
  chart: Array<{ date: string; label: string; value: number | null }>;
  currentValue: number;
  limit?: number | null;
}): CollectionValueDriversData {
  const valuedPoints = chart.filter(
    (point): point is { date: string; label: string; value: number } => point.value != null
  );
  const latestPoint = valuedPoints[valuedPoints.length - 1] ?? null;
  const previousPoint = valuedPoints[valuedPoints.length - 2] ?? null;

  if (!latestPoint || !previousPoint) {
    return {
      ...EMPTY_COLLECTION_VALUE_DRIVERS,
      latestDate: latestPoint?.date ?? null,
      latestLabel: latestPoint?.label ?? null,
    };
  }

  const cardBaselineValues = buildCardBaselineValueMap(cardHistory, previousPoint.date);
  const sealedBaselineValues = buildSealedBaselineValueMap(sealedHistory, previousPoint.date);
  const drafts = new Map<string, CollectionValueDriverDraft>();

  for (const item of cards) {
    const currentItemValue = item.current_value ?? 0;
    const previousItemValue = cardBaselineValues.get(item.card_id) ?? 0;
    const currentSource = getCollectionValueDriverCardSource(item);
    const previousSource = item.current_value_label ? "Raw" : "Raw";
    const key = `card:${item.card_id}:${currentSource}`;

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
      currentSource,
      previousSource,
    });
  }

  for (const item of sealed) {
    const currentItemValue = (item.current_value_per_item ?? 0) * item.quantity;
    const previousItemValue = (sealedBaselineValues.get(item.product_id) ?? 0) * item.quantity;

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
      previousValue: currentItemValue === 0 && previousItemValue === 0 ? 0 : previousItemValue,
      currentValue: currentItemValue,
      currentSource: "Sealed",
      previousSource: "Sealed",
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

  return {
    latestDate: latestPoint.date,
    latestLabel: latestPoint.label,
    previousDate: previousPoint.date,
    previousLabel: previousPoint.label,
    totalChange: roundCurrency(currentValue - previousPoint.value),
    gainsTotal: roundCurrency(
      drivers.reduce((total, item) => total + (item.change > 0 ? item.change : 0), 0)
    ),
    dropsTotal: roundCurrency(
      drivers.reduce((total, item) => total + (item.change < 0 ? item.change : 0), 0)
    ),
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
    activeTab === "graded"
  );
}

function shouldLoadDetailedSealed(activeTab: CollectionPageTab): boolean {
  return activeTab === "overview" || activeTab === "complete" || activeTab === "cards" || activeTab === "sealed";
}

function shouldLoadDetailedBinders(activeTab: CollectionPageTab): boolean {
  return activeTab === "overview" || activeTab === "complete" || activeTab === "cards" || activeTab === "binders";
}

export async function getCollectionOverviewData(
  options: { userId: string; activeTab?: CollectionPageTab; game?: TradingCardGameFilter }
): Promise<CollectionOverviewData> {
  const activeTab = options?.activeTab ?? "overview";
  const game = options.game ?? POKEMON_GAME;
  const loadDetailedCards = shouldLoadDetailedCards(activeTab);
  const loadDetailedSealed = shouldLoadDetailedSealed(activeTab);
  const loadDetailedBinders = shouldLoadDetailedBinders(activeTab);
  const loadCollectionHistory = true;
  const timer = startPerformanceTimer("collection.overview", {
    activeTab,
    game,
    detailedCards: loadDetailedCards,
    detailedSealed: loadDetailedSealed,
    detailedBinders: loadDetailedBinders,
    history: loadCollectionHistory,
  });

  const [collectionCards, collectionSealed, binders] = await Promise.all([
    loadDetailedCards
      ? getCollectionCards({ userId: options.userId, game })
      : getCollectionCardMetrics(options.userId, game),
    loadDetailedSealed
      ? getCollectionSealedItems(options.userId, true, game)
      : getCollectionSealedMetrics(options.userId, game),
    getCollectionBinders(options.userId, loadDetailedBinders, game),
  ]);

  const metricCards = collectionCards as CollectionCardMetricRecord[];
  const metricSealed = collectionSealed as CollectionSealedMetricRecord[];
  const usdToEurRate = hasUsdEbaySoldGradedPrices(metricCards)
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
  const historyCutoff = loadCollectionHistory ? getHistoryCutoffDate() : null;
  const [cardHistory, sealedHistory] = loadCollectionHistory
    ? await Promise.all([
        getCardHistoryRows([...cardQuantities.keys()], historyCutoff ?? undefined),
        getSealedHistoryRows([...sealedQuantities.keys()], historyCutoff ?? undefined),
      ])
    : [[], []];

  const combinedHistory = combineValueHistories(
    buildOwnedCardValueHistory(cardHistory, cardQuantities),
    buildOwnedSealedValueHistory(sealedHistory, sealedQuantities)
  ).map((point) => ({
    date: point.date,
    label: point.label,
    value: point.total_market,
  }));
  const binderCardIds = loadDetailedBinders
    ? [...new Set(metricCards.filter((record) => record.binder_id).map((record) => record.card.id))]
    : [];
  const binderHistoryRows = loadDetailedBinders
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
    sealed: sealedViewItems,
    binders: binderSummaries,
  };

  timer.finish({
    cards: metricCards.length,
    sealedItems: metricSealed.length,
    binders: binders.length,
    historyLoaded: loadCollectionHistory,
    historyPoints: combinedHistory.length,
  });

  return result;
}

interface AllCardValueDriverRow {
  cardId: string;
  name: string;
  imageUrl: string | null;
  cardNumber: string | null;
  episodeId: string;
  episodeName: string;
  episodeCode: string | null;
  currentCmEnLowestNm: number | null;
  currentCmDeLowestNm: number | null;
  currentCmFrLowestNm: number | null;
  currentCmEsLowestNm: number | null;
  currentCmItLowestNm: number | null;
  previousCmEnLowestNm: number | null;
  previousCmDeLowestNm: number | null;
  previousCmFrLowestNm: number | null;
  previousCmEsLowestNm: number | null;
  previousCmItLowestNm: number | null;
  currentFallbackValue: number | null;
  previousFallbackValue: number | null;
  valueHistoryPoints: number;
}

function getSaneAllCardRawValue(
  value: number | null,
  fallbackValue: number | null
): number | null {
  if (value == null) return null;

  if (
    fallbackValue != null &&
    fallbackValue >= 10 &&
    value < 1 &&
    value < fallbackValue * 0.15
  ) {
    return fallbackValue;
  }

  return value;
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
      AND (
        p.cm_en_lowest_nm IS NOT NULL
        OR p.cm_de_lowest_nm IS NOT NULL
        OR p.cm_fr_lowest_nm IS NOT NULL
        OR p.cm_es_lowest_nm IS NOT NULL
        OR p.cm_it_lowest_nm IS NOT NULL
      )
    GROUP BY DATE(p.fetched_at)
    ORDER BY date DESC
    LIMIT 2
  `;
  const latestDate = dates[0]?.date ?? null;
  const previousDate = dates[1]?.date ?? null;

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
          p.cm_en_lowest_nm,
          p.cm_de_lowest_nm,
          p.cm_fr_lowest_nm,
          p.cm_es_lowest_nm,
          p.cm_it_lowest_nm,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS row_num
        FROM "Price" p
        WHERE DATE(p.fetched_at) <= ${latestDate}
          AND (
            p.cm_en_lowest_nm IS NOT NULL
            OR p.cm_de_lowest_nm IS NOT NULL
            OR p.cm_fr_lowest_nm IS NOT NULL
            OR p.cm_es_lowest_nm IS NOT NULL
            OR p.cm_it_lowest_nm IS NOT NULL
          )
      )
      WHERE row_num = 1
    ),
    previous_prices AS (
      SELECT *
      FROM (
        SELECT
          p.card_id,
          p.cm_en_lowest_nm,
          p.cm_de_lowest_nm,
          p.cm_fr_lowest_nm,
          p.cm_es_lowest_nm,
          p.cm_it_lowest_nm,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS row_num
        FROM "Price" p
        WHERE DATE(p.fetched_at) <= ${previousDate}
          AND (
            p.cm_en_lowest_nm IS NOT NULL
            OR p.cm_de_lowest_nm IS NOT NULL
            OR p.cm_fr_lowest_nm IS NOT NULL
            OR p.cm_es_lowest_nm IS NOT NULL
            OR p.cm_it_lowest_nm IS NOT NULL
          )
      )
      WHERE row_num = 1
    ),
    current_fallback_prices AS (
      SELECT card_id, value
      FROM (
        SELECT
          p.card_id,
          COALESCE(
            p.cm_en_lowest_nm,
            p.cm_de_lowest_nm,
            p.cm_fr_lowest_nm,
            p.cm_es_lowest_nm,
            p.cm_it_lowest_nm
          ) AS value,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS row_num
        FROM "Price" p
        WHERE DATE(p.fetched_at) <= ${latestDate}
          AND COALESCE(
            p.cm_en_lowest_nm,
            p.cm_de_lowest_nm,
            p.cm_fr_lowest_nm,
            p.cm_es_lowest_nm,
            p.cm_it_lowest_nm
          ) >= 1
      )
      WHERE row_num = 1
    ),
    previous_fallback_prices AS (
      SELECT card_id, value
      FROM (
        SELECT
          p.card_id,
          COALESCE(
            p.cm_en_lowest_nm,
            p.cm_de_lowest_nm,
            p.cm_fr_lowest_nm,
            p.cm_es_lowest_nm,
            p.cm_it_lowest_nm
          ) AS value,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS row_num
        FROM "Price" p
        WHERE DATE(p.fetched_at) <= ${previousDate}
          AND COALESCE(
            p.cm_en_lowest_nm,
            p.cm_de_lowest_nm,
            p.cm_fr_lowest_nm,
            p.cm_es_lowest_nm,
            p.cm_it_lowest_nm
          ) >= 1
      )
      WHERE row_num = 1
    ),
    history_counts AS (
      SELECT
        card_id,
        COUNT(*) AS value_history_points
      FROM "Price"
      WHERE cm_en_lowest_nm IS NOT NULL
         OR cm_de_lowest_nm IS NOT NULL
         OR cm_fr_lowest_nm IS NOT NULL
         OR cm_es_lowest_nm IS NOT NULL
         OR cm_it_lowest_nm IS NOT NULL
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
      cp.cm_en_lowest_nm AS "currentCmEnLowestNm",
      cp.cm_de_lowest_nm AS "currentCmDeLowestNm",
      cp.cm_fr_lowest_nm AS "currentCmFrLowestNm",
      cp.cm_es_lowest_nm AS "currentCmEsLowestNm",
      cp.cm_it_lowest_nm AS "currentCmItLowestNm",
      pp.cm_en_lowest_nm AS "previousCmEnLowestNm",
      pp.cm_de_lowest_nm AS "previousCmDeLowestNm",
      pp.cm_fr_lowest_nm AS "previousCmFrLowestNm",
      pp.cm_es_lowest_nm AS "previousCmEsLowestNm",
      pp.cm_it_lowest_nm AS "previousCmItLowestNm",
      cfp.value AS "currentFallbackValue",
      pfp.value AS "previousFallbackValue",
      COALESCE(hc.value_history_points, 0) AS "valueHistoryPoints"
    FROM current_prices cp
    INNER JOIN previous_prices pp ON pp.card_id = cp.card_id
    INNER JOIN "Card" c ON c.id = cp.card_id
    INNER JOIN "Episode" e ON e.id = c.episode_id
    LEFT JOIN current_fallback_prices cfp ON cfp.card_id = c.id
    LEFT JOIN previous_fallback_prices pfp ON pfp.card_id = c.id
    LEFT JOIN history_counts hc ON hc.card_id = c.id
    WHERE c.game = ${game}
  `;

  const drafts = new Map<string, CollectionValueDriverDraft>();

  for (const row of rows) {
    const currentValue = getSaneAllCardRawValue(
      getCardMarketValue({
        cm_en_lowest_nm: row.currentCmEnLowestNm,
        cm_de_lowest_nm: row.currentCmDeLowestNm,
        cm_fr_lowest_nm: row.currentCmFrLowestNm,
        cm_es_lowest_nm: row.currentCmEsLowestNm,
        cm_it_lowest_nm: row.currentCmItLowestNm,
      }),
      row.currentFallbackValue
    );
    const previousValue = getSaneAllCardRawValue(
      getCardMarketValue({
        cm_en_lowest_nm: row.previousCmEnLowestNm,
        cm_de_lowest_nm: row.previousCmDeLowestNm,
        cm_fr_lowest_nm: row.previousCmFrLowestNm,
        cm_es_lowest_nm: row.previousCmEsLowestNm,
        cm_it_lowest_nm: row.previousCmItLowestNm,
      }),
      row.previousFallbackValue
    );

    if (currentValue == null || previousValue == null || currentValue <= 0 || previousValue <= 0) {
      continue;
    }

    const change = roundCurrency(currentValue - previousValue);
    const changePct = calculateChangePct(change, previousValue);
    const coveredDays = Math.max(
      1,
      Math.round(
        (new Date(`${latestDate}T00:00:00.000Z`).getTime() -
          new Date(`${previousDate}T00:00:00.000Z`).getTime()) /
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
  const [cardHistory, sealedHistory] = await Promise.all([
    getCardHistoryRows([...cardQuantities.keys()], getHistoryCutoffDate()),
    getSealedHistoryRows([...sealedQuantities.keys()], getHistoryCutoffDate()),
  ]);
  const usdToEurRate = hasUsdEbaySoldGradedPrices(metricCards)
    ? await getUsdToEurRate()
    : null;
  const valueOptions = { usdToEurRate };
  const combinedHistory = combineValueHistories(
    buildOwnedCardValueHistory(cardHistory, cardQuantities),
    buildOwnedSealedValueHistory(sealedHistory, sealedQuantities)
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

export async function getWantsPageData(
  userId: string,
  game: TradingCardGameFilter = POKEMON_GAME
): Promise<WantsPageData> {
  const timer = startPerformanceTimer("collection.wants", { game });
  const wants = (await getCollectionWants(userId, game)) as CollectionWantRecord[];
  const items = wants.map(buildWantViewItem);
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
          collectionItems: { none: { user_id: userId } },
        },
      },
      orderBy: { created_at: "desc" },
      select: collectionWantSelect,
    }),
    db.collectionCard.findMany({
      where: {
        user_id: userId,
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
          collectionItems: { none: { user_id: userId } },
        },
      },
    }),
  ]);

  const items = sortWantPlannerItems(
    (wants as CollectionWantRecord[]).map(buildWantViewItem)
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
  };
}

export async function getBinderPageData(
  binderId: string,
  userId: string
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
          rarity: true,
          supertype: true,
          episode_id: true,
          prices: {
            orderBy: { fetched_at: "desc" },
            take: 1,
            select: {
              cm_en_lowest_nm: true,
              cm_de_lowest_nm: true,
              cm_fr_lowest_nm: true,
              cm_es_lowest_nm: true,
              cm_it_lowest_nm: true,
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
        where: { binder_id: binder.id, user_id: userId },
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
        ? await getCardHistoryRows([...cardQuantities.keys()])
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
      ? await getCardHistoryRows([...cardQuantities.keys()])
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
