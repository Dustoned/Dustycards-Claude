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
  getCollectionMatchedGradedPrice,
  getCollectionCardMarketValue,
  getCollectionSealedMarketValue,
  sumCollectionPurchasePrices,
} from "@/lib/collection";
import { getEpisodeDisplayCardCount } from "@/lib/episodes";
import { startPerformanceTimer } from "@/lib/performance-timing";
import type { EpisodePriceHistorySnapshot } from "@/lib/price-history";

export interface CollectionSummaryMetric {
  investment: number;
  currentValue: number;
  pnl: number;
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
    currentValue: number;
    investment: number;
    pnl: number;
    subtitle: string;
  }>;
}

export type CollectionPageTab = "overview" | "cards" | "binders" | "sealed" | "graded";

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

const collectionCardSelect = {
  id: true,
  binder_id: true,
  purchase_price: true,
  condition: true,
  language: true,
  notes: true,
  grading_company: true,
  grading_grade: true,
  tags: {
    select: {
      label: true,
    },
  },
  card: {
    select: {
      id: true,
      name: true,
      image_url: true,
      card_number: true,
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
      episode: {
        select: {
          id: true,
          name: true,
          code: true,
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
    },
  },
} satisfies Prisma.CollectionCardSelect;

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

async function fetchCollectionCardsPage(
  options?: {
    binderId?: string;
    skip?: number;
    take?: number;
    detail?: boolean;
  }
) {
  return db.collectionCard.findMany({
    where: options?.binderId ? { binder_id: options.binderId } : undefined,
    orderBy: { added_at: "desc" },
    skip: options?.skip,
    take: options?.take,
    select: options?.detail ? collectionCardSelect : collectionCardMetricSelect,
  });
}

async function fetchCollectionCards(options?: {
  binderId?: string;
  detail?: boolean;
}) {
  const pageSize = 200;
  const records: Awaited<ReturnType<typeof fetchCollectionCardsPage>> = [];
  let skip = 0;

  while (true) {
    const page = await fetchCollectionCardsPage({
      binderId: options?.binderId,
      skip,
      take: pageSize,
      detail: options?.detail,
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
  };
};

type CollectionCardRecord = CollectionCardMetricRecord & {
  condition: string | null;
  language: string | null;
  notes: string | null;
  tags: Array<{ label: string }>;
  card: CollectionCardMetricRecord["card"] & {
    name: string;
    image_url: string | null;
    card_number: string | null;
    rarity: string | null;
    supertype: string | null;
    episode: {
      id: string;
      name: string;
      code: string | null;
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

async function getCollectionCards(options?: { binderId?: string }) {
  return fetchCollectionCards({ ...options, detail: true });
}

async function getCollectionCardMetrics() {
  const records = await fetchCollectionCards({ detail: false });
  return records as CollectionCardMetricRecord[];
}

async function getCollectionSealedItems(detail = true) {
  return db.collectionSealed.findMany({
    orderBy: { added_at: "desc" },
    select: detail ? collectionSealedSelect : collectionSealedMetricSelect,
  });
}

async function getCollectionSealedMetrics() {
  const records = await getCollectionSealedItems(false);
  return records as CollectionSealedMetricRecord[];
}

async function getCollectionBinders(detail = true) {
  return db.collectionBinder.findMany({
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

async function getCardHistoryRows(cardIds: string[]) {
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
        )
        WHERE row_num = 1
        ORDER BY fetched_at ASC, card_id ASC`,
        ...chunk
      )
    )
  );

  return rows.flat();
}

async function getSealedHistoryRows(productIds: string[]) {
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
        )
        WHERE row_num = 1
        ORDER BY fetched_at ASC, product_id ASC`,
        ...chunk
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
  binders: CollectionBinderCostBasisRecord[]
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
        currentValue: getCollectionCardCurrentValue(record),
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
  costBasis?: CollectionCostBasis | null
): CollectionCardViewItem {
  const cmValue = getCollectionCardMarketValue(record.card);
  const tcpValue = record.card.prices[0]?.tcp_market ?? null;
  const currentValue = getCollectionCardCurrentValue(record);
  const matchedGradedPrice = getCollectionMatchedGradedPrice(record.card, {
    gradingCompany: record.grading_company,
    gradingGrade: record.grading_grade,
  });

  return {
    collection_item_id: record.id,
    collection_item_ids: [record.id],
    binder_id: record.binder_id,
    card_id: record.card.id,
    name: record.card.name,
    image_url: record.card.image_url,
    card_number: record.card.card_number,
    rarity: record.card.rarity,
    supertype: record.card.supertype,
    episode_id: record.card.episode.id,
    episode_name: record.card.episode.name,
    episode_code: record.card.episode.code,
    cm_value: cmValue,
    tcp_value: tcpValue,
    current_value: currentValue,
    current_value_label: matchedGradedPrice?.label ?? null,
    purchase_price: record.purchase_price,
    ...buildCostBasisFields(costBasis ?? buildDirectCostBasis(record.purchase_price)),
    condition: record.condition,
    language: record.language,
    notes: record.notes,
    tags: record.tags.map((tag) => tag.label),
    grading_company: record.grading_company,
    grading_grade: record.grading_grade,
    owned: true,
    owned_count: 1,
  };
}

function getCollectionCardCurrentValue(record: CollectionCardMetricRecord): number | null {
  return getCollectionCardMarketValue(record.card, {
    gradingCompany: record.grading_company,
    gradingGrade: record.grading_grade,
  });
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

function sumCardCurrentValue(records: CollectionCardMetricRecord[]): number {
  return Number(
    records
      .reduce((total, record) => total + (getCollectionCardCurrentValue(record) ?? 0), 0)
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

function buildBinderCardStats(records: CollectionCardMetricRecord[]) {
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
      existing.currentValue += getCollectionCardCurrentValue(record) ?? 0;
      existing.investment += record.purchase_price ?? 0;
      existing.uniqueOwnedCardIds.add(record.card.id);
    } else {
      stats.set(record.binder_id, {
        count: 1,
        currentValue: getCollectionCardCurrentValue(record) ?? 0,
        investment: record.purchase_price ?? 0,
        uniqueOwnedCardIds: new Set([record.card.id]),
      });
    }
  }

  return stats;
}

function buildMetric(investment: number, currentValue: number): CollectionSummaryMetric {
  return {
    investment: Number(investment.toFixed(2)),
    currentValue: Number(currentValue.toFixed(2)),
    pnl: Number((currentValue - investment).toFixed(2)),
  };
}

function shouldLoadDetailedCards(activeTab: CollectionPageTab): boolean {
  return activeTab === "overview" || activeTab === "cards" || activeTab === "graded";
}

function shouldLoadDetailedSealed(activeTab: CollectionPageTab): boolean {
  return activeTab === "overview" || activeTab === "sealed";
}

function shouldLoadDetailedBinders(activeTab: CollectionPageTab): boolean {
  return activeTab === "overview" || activeTab === "binders";
}

export async function getCollectionOverviewData(
  options?: { activeTab?: CollectionPageTab }
): Promise<CollectionOverviewData> {
  const activeTab = options?.activeTab ?? "overview";
  const loadDetailedCards = shouldLoadDetailedCards(activeTab);
  const loadDetailedSealed = shouldLoadDetailedSealed(activeTab);
  const loadDetailedBinders = shouldLoadDetailedBinders(activeTab);
  const timer = startPerformanceTimer("collection.overview", {
    activeTab,
    detailedCards: loadDetailedCards,
    detailedSealed: loadDetailedSealed,
    detailedBinders: loadDetailedBinders,
  });

  const [collectionCards, collectionSealed, binders] = await Promise.all([
    loadDetailedCards ? getCollectionCards() : getCollectionCardMetrics(),
    loadDetailedSealed ? getCollectionSealedItems(true) : getCollectionSealedMetrics(),
    getCollectionBinders(loadDetailedBinders),
  ]);

  const metricCards = collectionCards as CollectionCardMetricRecord[];
  const metricSealed = collectionSealed as CollectionSealedMetricRecord[];
  const cardCurrentValue = sumCardCurrentValue(metricCards);
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
  const [cardHistory, sealedHistory] = await Promise.all([
    getCardHistoryRows([...cardQuantities.keys()]),
    getSealedHistoryRows([...sealedQuantities.keys()]),
  ]);

  const combinedHistory = combineValueHistories(
    buildOwnedCardValueHistory(cardHistory, cardQuantities),
    buildOwnedSealedValueHistory(sealedHistory, sealedQuantities)
  ).map((point) => ({
    date: point.date,
    label: point.label,
    value: point.total_market,
  }));
  const costBasisByItemId = buildCollectionCostBasisMap(
    metricCards,
    binders as CollectionBinderCostBasisRecord[]
  );

  const collectionCardViewItems = loadDetailedCards
    ? (collectionCards as CollectionCardRecord[]).map((record) =>
        buildCardViewItem(record, costBasisByItemId.get(record.id))
      )
    : [];
  const looseSingleViewItems: CollectionCardViewItem[] = [];
  const binderCardViewItems: CollectionCardViewItem[] = [];

  if (activeTab === "overview") {
    for (const item of collectionCardViewItems) {
      if (item.binder_id) {
        binderCardViewItems.push(item);
      } else {
        looseSingleViewItems.push(item);
      }
    }
  }

  const binderCardStats = loadDetailedBinders
    ? buildBinderCardStats(metricCards)
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

            return {
              id: binder.id,
              name: binder.name,
              type: binder.type,
              accent_color: binder.accent_color,
              icon_name: binder.icon_name,
              episode: binder.episode,
              progressLabel: `${uniqueOwned}/${totalCards}`,
              subtitle: `${binder.episode.series ?? "Set"} / ${binder.episode.name}`,
              ...buildMetric(investment, currentValue),
            };
          }

          const investment = baseInvestment + (binder.base_purchase_price ?? 0);

          return {
            id: binder.id,
            name: binder.name,
            type: binder.type,
            accent_color: binder.accent_color,
            icon_name: binder.icon_name,
            episode: null,
            progressLabel: `${binderStats?.count ?? 0} cards`,
            subtitle: "Custom binder",
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
    sealed: loadDetailedSealed ? (collectionSealed as CollectionSealedRecord[]).map(buildSealedViewItem) : [],
    binders: binderSummaries,
  };

  timer.finish({
    cards: metricCards.length,
    sealedItems: metricSealed.length,
    binders: binders.length,
    historyPoints: combinedHistory.length,
  });

  return result;
}

export async function getBinderPageData(binderId: string): Promise<BinderPageData | null> {
  const binder = await db.collectionBinder.findUnique({
    where: { id: binderId },
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
          episode: {
            select: { id: true, name: true, code: true },
          },
        },
      }),
      db.collectionCard.findMany({
        where: { binder_id: binder.id },
        select: {
          id: true,
          purchase_price: true,
          condition: true,
          language: true,
          notes: true,
          grading_company: true,
          grading_grade: true,
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
        card_number: card.card_number,
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
            ? getCollectionMatchedGradedPrice(card, {
                gradingCompany: owned.gradingCompany,
                gradingGrade: owned.gradingGrade,
              })?.label ?? null
            : null,
        purchase_price: owned ? Number(owned.purchasePrice.toFixed(2)) : null,
        cost_basis_value: owned ? Number(owned.costBasisValue.toFixed(2)) : null,
        cost_basis_label: owned ? "Set Spend" : "Paid",
        cost_basis_source: owned ? "linked_binder_allocation" : "direct",
        condition: owned?.condition ?? null,
        language: owned?.language ?? null,
        notes: owned?.notes ?? null,
        tags: owned?.tags ?? [],
        grading_company: owned?.gradingCompany ?? null,
        grading_grade: owned?.gradingGrade ?? null,
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

  const binderCards = await getCollectionCards({ binderId });
  const metricBinderCards = binderCards as CollectionCardMetricRecord[];
  const items = (binderCards as CollectionCardRecord[]).map((record) => buildCardViewItem(record));
  const currentValue = sumCardCurrentValue(metricBinderCards);
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
