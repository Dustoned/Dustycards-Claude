import { db } from "@/lib/db";
import type { CollectionCardViewItem } from "@/components/CollectionCardsView";
import type { CollectionSealedViewItem } from "@/components/CollectionSealedView";
import {
  buildOwnedCardValueHistory,
  buildOwnedSealedValueHistory,
  combineValueHistories,
  getCollectionCardMarketValue,
  getCollectionSealedMarketValue,
  sumCollectionPurchasePrices,
} from "@/lib/collection";
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
  episodes: Array<{
    id: string;
    name: string;
    code: string | null;
  }>;
}

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
} as const;

const SQLITE_SAFE_CHUNK_SIZE = 250;

async function fetchCollectionCardBatch(options?: {
  binderId?: string;
  skip?: number;
  take?: number;
}) {
  return db.collectionCard.findMany({
    where: options?.binderId ? { binder_id: options.binderId } : undefined,
    orderBy: { added_at: "desc" },
    skip: options?.skip ?? 0,
    take: options?.take ?? SQLITE_SAFE_CHUNK_SIZE,
    select: collectionCardSelect,
  });
}

type CollectionCardRecord = Awaited<ReturnType<typeof fetchCollectionCardBatch>>[number];
type CollectionSealedRecord = Awaited<ReturnType<typeof getCollectionSealedItems>>[number];

async function getCollectionCards(options?: { binderId?: string }) {
  const records: CollectionCardRecord[] = [];
  let skip = 0;

  while (true) {
    const batch = await fetchCollectionCardBatch({
      binderId: options?.binderId,
      skip,
      take: SQLITE_SAFE_CHUNK_SIZE,
    });

    records.push(...batch);

    if (batch.length < SQLITE_SAFE_CHUNK_SIZE) {
      break;
    }

    skip += batch.length;
  }

  return records;
}

async function getCollectionSealedItems() {
  return db.collectionSealed.findMany({
    orderBy: { added_at: "desc" },
    select: {
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
    },
  });
}

async function getCollectionBinders() {
  return db.collectionBinder.findMany({
    orderBy: { updated_at: "desc" },
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
}

function chunkValues<T>(values: T[], size = SQLITE_SAFE_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

async function getCardHistoryRows(cardIds: string[]) {
  if (cardIds.length === 0) return [];

  const rows = await Promise.all(
    chunkValues(cardIds).map((chunk) =>
      db.price.findMany({
        where: { card_id: { in: chunk } },
        orderBy: [{ fetched_at: "asc" }, { card_id: "asc" }],
        select: {
          card_id: true,
          fetched_at: true,
          cm_en_lowest_nm: true,
          cm_de_lowest_nm: true,
          cm_fr_lowest_nm: true,
          cm_es_lowest_nm: true,
          cm_it_lowest_nm: true,
        },
      })
    )
  );

  return rows.flat();
}

async function getSealedHistoryRows(productIds: string[]) {
  if (productIds.length === 0) return [];

  const rows = await Promise.all(
    chunkValues(productIds).map((chunk) =>
      db.sealedPriceSnapshot.findMany({
        where: { product_id: { in: chunk } },
        orderBy: [{ fetched_at: "asc" }, { product_id: "asc" }],
        select: {
          product_id: true,
          fetched_at: true,
          cm_lowest: true,
          cm_lowest_eu: true,
          cm_lowest_de: true,
          cm_lowest_fr: true,
          cm_lowest_es: true,
          cm_lowest_it: true,
          cm_avg_7d: true,
          cm_avg_30d: true,
        },
      })
    )
  );

  return rows.flat();
}

function buildCardViewItem(record: CollectionCardRecord): CollectionCardViewItem {
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
    current_value: getCollectionCardMarketValue(record.card),
    purchase_price: record.purchase_price,
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

function sumCardCurrentValue(records: CollectionCardRecord[]): number {
  return Number(
    records.reduce((total, record) => total + (getCollectionCardMarketValue(record.card) ?? 0), 0).toFixed(2)
  );
}

function sumSealedCurrentValue(records: CollectionSealedRecord[]): number {
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

function buildMetric(investment: number, currentValue: number): CollectionSummaryMetric {
  return {
    investment: Number(investment.toFixed(2)),
    currentValue: Number(currentValue.toFixed(2)),
    pnl: Number((currentValue - investment).toFixed(2)),
  };
}

export async function getCollectionOverviewData(): Promise<CollectionOverviewData> {
  const [collectionCards, collectionSealed, binders, episodes] = await Promise.all([
    getCollectionCards(),
    getCollectionSealedItems(),
    getCollectionBinders(),
    db.episode.findMany({
      orderBy: [{ release_date: "desc" }, { name: "asc" }],
      select: { id: true, name: true, code: true },
      take: 600,
    }),
  ]);

  const cardCurrentValue = sumCardCurrentValue(collectionCards);
  const sealedCurrentValue = sumSealedCurrentValue(collectionSealed);
  const cardInvestment = sumCollectionPurchasePrices(collectionCards.map((item) => item.purchase_price));
  const sealedInvestment = sumCollectionPurchasePrices(
    collectionSealed.map((item) => (item.purchase_price_per_item ?? 0) * item.quantity)
  );
  const binderBaseInvestment = sumCollectionPurchasePrices(
    binders.map((binder) => binder.base_purchase_price)
  );
  const overviewMetric = buildMetric(
    cardInvestment + sealedInvestment + binderBaseInvestment,
    cardCurrentValue + sealedCurrentValue
  );

  const cardQuantities = buildCardQuantityMap(collectionCards);
  const sealedQuantities = buildProductQuantityMap(collectionSealed);
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

  const binderSummaries = binders.map((binder) => {
    if (binder.type === "linked_set" && binder.episode) {
      const linkedCards = collectionCards.filter((item) => item.binder_id === binder.id);
      const uniqueOwned = new Set(linkedCards.map((item) => item.card.id)).size;
      const currentValue = sumCardCurrentValue(linkedCards);
      const investment =
        sumCollectionPurchasePrices(linkedCards.map((item) => item.purchase_price)) +
        (binder.base_purchase_price ?? 0);
      const totalCards = binder.episode.card_count ?? binder.episode._count.cards;

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

    const binderCards = collectionCards.filter((item) => item.binder_id === binder.id);
    const currentValue = sumCardCurrentValue(binderCards);
    const investment =
      sumCollectionPurchasePrices(binderCards.map((item) => item.purchase_price)) +
      (binder.base_purchase_price ?? 0);

    return {
      id: binder.id,
      name: binder.name,
      type: binder.type,
      accent_color: binder.accent_color,
      icon_name: binder.icon_name,
      episode: null,
      progressLabel: `${binderCards.length} cards`,
      subtitle: "Custom binder",
      ...buildMetric(investment, currentValue),
    };
  });

  return {
    overview: {
      ...overviewMetric,
      totalCards: collectionCards.length,
      totalSealedUnits: collectionSealed.reduce((total, item) => total + item.quantity, 0),
      totalBinders: binders.length,
      chart: combinedHistory,
    },
    cards: collectionCards.map(buildCardViewItem),
    looseSingles: collectionCards.filter((item) => !item.binder_id).map(buildCardViewItem),
    binderCards: collectionCards.filter((item) => item.binder_id).map(buildCardViewItem),
    sealed: collectionSealed.map(buildSealedViewItem),
    binders: binderSummaries,
    episodes,
  };
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
      }
    >();

    for (const item of ownedCards) {
      const existing = ownedByCardId.get(item.card.id);
      if (existing) {
        existing.count += 1;
        existing.purchasePrice += item.purchase_price ?? 0;
        existing.itemIds.push(item.id);
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
        current_value:
          owned && getCollectionCardMarketValue(card) != null
            ? Number((getCollectionCardMarketValue(card)! * owned.count).toFixed(2))
            : getCollectionCardMarketValue(card),
        purchase_price: owned ? Number(owned.purchasePrice.toFixed(2)) : null,
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
        totalCards: binder.episode.card_count ?? binder.episode._count.cards,
      },
    };
  }

  const binderCards = await getCollectionCards({ binderId });
  const items = binderCards.map(buildCardViewItem);
  const currentValue = sumCardCurrentValue(binderCards);
  const investment =
    sumCollectionPurchasePrices(binderCards.map((item) => item.purchase_price)) +
    (binder.base_purchase_price ?? 0);
  const cardQuantities = buildCardQuantityMap(binderCards);
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
