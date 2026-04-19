import { db } from "@/lib/db";
import { isHiddenExpansion } from "@/lib/episodes";
import { getPriceRefreshInfo, type PriceRefreshTier } from "@/lib/price-refresh";
import {
  categoryToSupertype,
  findTcgdexSetIdForEpisode,
  getTcgdexIllustratorLookupForCards,
  getTcgdexSupertypeLookupForSet,
  resolveTcgdexSupertype,
} from "@/lib/tcgdex";
import {
  extractGradedPrices,
  extractPrices,
  fetchAllEpisodes,
  fetchCardsForEpisode,
  fetchHistoryPricesByItemId,
  fetchSealedProductsForEpisode,
  type NormalizedSealedProduct,
} from "@/lib/tcggo";

const ACTIVE_SYNC_STALE_MS = 1000 * 60 * 60 * 2;
const STALE_SYNC_MESSAGE = "Marked stale after exceeding sync timeout";
const AUTO_PRICE_REFRESH_TYPE = "auto-prices";
const AUTO_PRICE_REFRESH_MAX_EPISODES = 6;
const AUTO_PRICE_REFRESH_MAX_CARDS = 240;
const AUTO_PRICE_REFRESH_MIN_INTERVAL_MS = 1000 * 60 * 60 * 6;
const AUTO_PRICE_BACKFILL_MAX_EPISODES = 2;
const AUTO_PRICE_BACKFILL_MAX_CARDS = 80;
const PRICE_SOURCE_UNAVAILABLE_RETRY_MS = 1000 * 60 * 60 * 24 * 7;
const HISTORY_BACKFILL_BATCH_SIZE = 12;
const DB_WRITE_BATCH_SIZE = 60;
const AUTO_NATIVE_HISTORY_CARD_BACKFILL_MAX = 0;
const AUTO_NATIVE_HISTORY_PRODUCT_BACKFILL_MAX = 0;

const CARD_FIELDS = [
  "name",
  "card_number",
  "rarity",
  "hp",
  "supertype",
  "subtypes",
  "artist",
  "image_url",
  "tcggo_url",
  "cardmarket_url",
  "tcgid",
  "cardmarket_id",
  "tcgplayer_id",
] as const;

const PRICE_FIELDS = [
  "cm_en_lowest_nm",
  "cm_de_lowest_nm",
  "cm_fr_lowest_nm",
  "cm_es_lowest_nm",
  "cm_it_lowest_nm",
  "cm_en_avg_30d",
  "cm_en_avg_7d",
  "tcp_market",
  "tcp_mid",
  "tcp_low",
] as const;

type PriceSnapshotData = ReturnType<typeof extractPrices>;

type CardWriteData = {
  name: string;
  card_number: string | null;
  rarity: string | null;
  hp: number | null;
  supertype: string | null;
  subtypes: string | null;
  artist: string | null;
  image_url: string | null;
  tcggo_url: string | null;
  cardmarket_url: string | null;
  tcgid: string | null;
  cardmarket_id: string | null;
  tcgplayer_id: string | null;
};

interface ExistingPriceRecord extends PriceSnapshotData {
  id: string;
}

interface DueCardCandidate {
  id: string;
  episodeId: string;
  rarity: string | null;
  latestFetchedAt: string;
  tier: PriceRefreshTier;
}

interface AutoEpisodePriceRefreshResult {
  episodeId: string;
  selectedCards: number;
  updatedCards: number;
  newPrices: number;
  refreshedPrices: number;
  refreshedCards: number;
}

interface MissingPriceCandidate {
  id: string;
  episodeId: string;
  hasMarketId: boolean;
  checkedAt: Date | null;
  createdAt: Date;
}

export interface EpisodeSyncResult {
  episodeId: string;
  count: number;
  newCards: number;
  updatedCards: number;
  newPrices: number;
  refreshedPrices: number;
}

export interface FullSyncResult {
  count: number;
  newEpisodes: number;
  syncedEpisodes: number;
  skippedEpisodes: number;
  newCards: number;
  updatedCards: number;
  newPrices: number;
  refreshedPrices: number;
}

export interface AutoPriceRefreshResult {
  checkedEpisodes: number;
  dueCards: number;
  missingPriceCards: number;
  selectedCards: number;
  backfillCards: number;
  nativeHistoryItems: number;
  remainingDueCards: number;
  updatedCards: number;
  newPrices: number;
  refreshedPrices: number;
  refreshedCards: number;
  skipped: boolean;
  message: string;
}

export class SyncConflictError extends Error {
  activeType: string;
  startedAt: Date;

  constructor(activeType: string, startedAt: Date) {
    super("Another sync is already running.");
    this.name = "SyncConflictError";
    this.activeType = activeType;
    this.startedAt = startedAt;
  }
}

function buildCardWriteData(
  existing: CardWriteData | undefined,
  card: CardWriteData,
  fallbackSupertype: string | null = null
): CardWriteData {
  const normalizedSupertype = categoryToSupertype(card.supertype);

  return {
    name: card.name,
    card_number: card.card_number ?? existing?.card_number ?? null,
    rarity: card.rarity ?? existing?.rarity ?? null,
    hp: card.hp ?? existing?.hp ?? null,
    supertype: normalizedSupertype ?? fallbackSupertype ?? existing?.supertype ?? null,
    subtypes: card.subtypes ?? existing?.subtypes ?? null,
    artist: card.artist ?? existing?.artist ?? null,
    image_url: card.image_url ?? existing?.image_url ?? null,
    tcggo_url: card.tcggo_url ?? existing?.tcggo_url ?? null,
    cardmarket_url: card.cardmarket_url ?? existing?.cardmarket_url ?? null,
    tcgid: card.tcgid ?? existing?.tcgid ?? null,
    cardmarket_id: card.cardmarket_id ?? existing?.cardmarket_id ?? null,
    tcgplayer_id: card.tcgplayer_id ?? existing?.tcgplayer_id ?? null,
  };
}

function hasCardChanges(existing: CardWriteData, next: CardWriteData): boolean {
  return CARD_FIELDS.some((field) => existing[field] !== next[field]);
}

async function getTcgdexSupertypeLookupForEpisode(input: {
  code?: string | null;
  name?: string | null;
  card_count?: number | null;
}): Promise<ReadonlyMap<string, string>> {
  const tcgdexSetId = await findTcgdexSetIdForEpisode({
    code: input.code,
    name: input.name,
    cardCount: input.card_count ?? null,
  });
  if (!tcgdexSetId) {
    return new Map();
  }

  return getTcgdexSupertypeLookupForSet(tcgdexSetId);
}

function hasAnyPrice(prices: PriceSnapshotData): boolean {
  return PRICE_FIELDS.some((field) => prices[field] !== null);
}

function hasAnySealedPrice(
  price: Pick<
    NormalizedSealedProduct["price"],
    | "cm_lowest"
    | "cm_lowest_eu"
    | "cm_lowest_de"
    | "cm_lowest_fr"
    | "cm_lowest_es"
    | "cm_lowest_it"
    | "cm_avg_7d"
    | "cm_avg_30d"
  >
): boolean {
  return (
    price.cm_lowest != null ||
    price.cm_lowest_eu != null ||
    price.cm_lowest_de != null ||
    price.cm_lowest_fr != null ||
    price.cm_lowest_es != null ||
    price.cm_lowest_it != null ||
    price.cm_avg_7d != null ||
    price.cm_avg_30d != null
  );
}

function pricesMatch(existing: ExistingPriceRecord, next: PriceSnapshotData): boolean {
  return PRICE_FIELDS.every((field) => existing[field] === next[field]);
}

async function acquireSyncLog(type: string, message: string) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - ACTIVE_SYNC_STALE_MS);

  return db.$transaction(async (tx) => {
    await tx.syncLog.updateMany({
      where: {
        status: "running",
        started_at: {
          lt: staleBefore,
        },
      },
      data: {
        status: "failed",
        message: STALE_SYNC_MESSAGE,
        finished_at: now,
      },
    });

    const activeSync = await tx.syncLog.findFirst({
      where: { status: "running" },
      orderBy: { started_at: "desc" },
    });

    if (activeSync) {
      throw new SyncConflictError(activeSync.type, activeSync.started_at);
    }

    return tx.syncLog.create({
      data: {
        type,
        status: "running",
        message,
      },
    });
  });
}

async function finalizeSyncLog(id: string, status: "success" | "failed", message: string) {
  await db.syncLog.update({
    where: { id },
    data: {
      status,
      message,
      finished_at: new Date(),
    },
  });
}

async function runLoggedSync<T>(
  type: string,
  startMessage: string,
  successMessage: (result: T) => string,
  work: () => Promise<T>
): Promise<T> {
  const log = await acquireSyncLog(type, startMessage);

  try {
    const result = await work();
    await finalizeSyncLog(log.id, "success", successMessage(result));
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeSyncLog(log.id, "failed", message);
    throw error;
  }
}

function summarizeEpisodeSync(result: EpisodeSyncResult): string {
  return [
    `Synced ${result.count} cards`,
    `${result.newCards} new cards`,
    `${result.updatedCards} updated cards`,
    `${result.newPrices} new price snapshots`,
    `${result.refreshedPrices} refreshed prices`,
  ].join(" | ");
}

function summarizeFullSync(result: FullSyncResult): string {
  return [
    `Checked ${result.count} sets`,
    `${result.syncedEpisodes} synced`,
    `${result.skippedEpisodes} skipped`,
    `${result.newEpisodes} new sets`,
    `${result.newCards} new cards`,
    `${result.updatedCards} updated cards`,
    `${result.newPrices} new price snapshots`,
    `${result.refreshedPrices} refreshed prices`,
  ].join(" | ");
}

function summarizeAutoPriceRefresh(result: AutoPriceRefreshResult): string {
  return [
    `Checked ${result.selectedCards} cards`,
    `${result.checkedEpisodes} sets`,
    `${result.backfillCards} first-price checks`,
    `${result.nativeHistoryItems} history backfills`,
    `${result.newPrices} new price snapshots`,
    `${result.refreshedPrices} refreshed prices`,
    `${result.remainingDueCards} still due`,
  ].join(" | ");
}

async function pruneAutoPriceRefreshLogs(keepId: string) {
  await db.syncLog.deleteMany({
    where: {
      type: AUTO_PRICE_REFRESH_TYPE,
      status: "success",
      id: { not: keepId },
    },
  });
}

async function runAutoLoggedSync<T>(
  startMessage: string,
  successMessage: (result: T) => string,
  work: () => Promise<T>
): Promise<T> {
  const log = await acquireSyncLog(AUTO_PRICE_REFRESH_TYPE, startMessage);

  try {
    const result = await work();
    await finalizeSyncLog(log.id, "success", successMessage(result));
    await pruneAutoPriceRefreshLogs(log.id);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeSyncLog(log.id, "failed", message);
    throw error;
  }
}
function normalizeTimestamp(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function getTierWeight(tier: PriceRefreshTier): number {
  switch (tier) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
    default:
      return 1;
  }
}

function queuePriceSnapshotWrite(
  latestPrice: ExistingPriceRecord | null,
  nextPrice: PriceSnapshotData,
  cardId: string,
  fetchedAt: Date,
  options: { refreshAllPrices: boolean },
  priceCreates: Array<{ card_id: string; fetched_at: Date } & PriceSnapshotData>,
  priceRefreshes: Array<{ id: string; fetched_at: Date }>
): "new" | "refreshed" | "none" {
  if (!hasAnyPrice(nextPrice)) {
    return "none";
  }

  if (!options.refreshAllPrices) {
    if (!latestPrice) {
      priceCreates.push({
        card_id: cardId,
        fetched_at: fetchedAt,
        ...nextPrice,
      });
      return "new";
    }

    return "none";
  }

  if (latestPrice && pricesMatch(latestPrice, nextPrice)) {
    priceRefreshes.push({ id: latestPrice.id, fetched_at: fetchedAt });
    return "refreshed";
  }

  priceCreates.push({
    card_id: cardId,
    fetched_at: fetchedAt,
    ...nextPrice,
  });
  return "new";
}

function toHistorySnapshotDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

async function mapInBatches<T>(
  items: T[],
  batchSize: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  for (let index = 0; index < items.length; index += batchSize) {
    await Promise.all(items.slice(index, index + batchSize).map((item) => worker(item)));
  }
}

async function writeInChunks<T>(
  items: T[],
  chunkSize: number,
  writer: (chunk: T[]) => Promise<void>
): Promise<void> {
  for (let index = 0; index < items.length; index += chunkSize) {
    await writer(items.slice(index, index + chunkSize));
  }
}

async function backfillCardNativeHistory(cardIds: string[], syncedAt: Date): Promise<number> {
  if (cardIds.length === 0) return 0;

  const existingSnapshots = await db.price.findMany({
    where: { card_id: { in: cardIds } },
    select: {
      card_id: true,
      fetched_at: true,
    },
  });

  const existingByCard = new Map<string, Set<string>>();

  for (const snapshot of existingSnapshots) {
    const existing = existingByCard.get(snapshot.card_id) ?? new Set<string>();
    existing.add(snapshot.fetched_at.toISOString());
    existingByCard.set(snapshot.card_id, existing);
  }

  const historyCreates: Array<{
    card_id: string;
    fetched_at: Date;
  } & PriceSnapshotData> = [];
  const syncedCardIds: string[] = [];

  await mapInBatches(cardIds, HISTORY_BACKFILL_BATCH_SIZE, async (cardId) => {
    try {
      const history = await fetchHistoryPricesByItemId(cardId);
      const existing = existingByCard.get(cardId) ?? new Set<string>();

      for (const point of history) {
        const fetchedAt = toHistorySnapshotDate(point.date);
        const iso = fetchedAt.toISOString();
        if (existing.has(iso)) {
          continue;
        }

        historyCreates.push({
          card_id: cardId,
          fetched_at: fetchedAt,
          cm_en_lowest_nm: point.cm_market,
          cm_de_lowest_nm: point.cm_market_de,
          cm_fr_lowest_nm: point.cm_market_fr,
          cm_es_lowest_nm: point.cm_market_es,
          cm_it_lowest_nm: point.cm_market_it,
          cm_en_avg_30d: null,
          cm_en_avg_7d: null,
          tcp_market: point.tcp_market,
          tcp_mid: null,
          tcp_low: null,
        });
        existing.add(iso);
      }

      syncedCardIds.push(cardId);
    } catch {
      // Leave this card eligible for a later history backfill retry.
    }
  });

  await db.$transaction(async (tx) => {
    if (historyCreates.length > 0) {
      await writeInChunks(historyCreates, DB_WRITE_BATCH_SIZE, async (chunk) => {
        await tx.price.createMany({
          data: chunk,
        });
      });
    }

    if (syncedCardIds.length > 0) {
      await tx.card.updateMany({
        where: { id: { in: syncedCardIds } },
        data: { native_history_synced_at: syncedAt },
      });
    }
  });

  return syncedCardIds.length;
}

async function backfillSealedNativeHistory(
  products: Array<{ id: string; episodeId: string }>,
  syncedAt: Date
): Promise<number> {
  if (products.length === 0) return 0;

  const existingSnapshots = await db.sealedPriceSnapshot.findMany({
    where: { product_id: { in: products.map((product) => product.id) } },
    select: {
      product_id: true,
      fetched_at: true,
    },
  });

  const existingByProduct = new Map<string, Set<string>>();

  for (const snapshot of existingSnapshots) {
    const existing = existingByProduct.get(snapshot.product_id) ?? new Set<string>();
    existing.add(snapshot.fetched_at.toISOString());
    existingByProduct.set(snapshot.product_id, existing);
  }

  const historyCreates: Array<{
    product_id: string;
    episode_id: string;
    fetched_at: Date;
    cm_lowest: number | null;
    cm_lowest_eu: number | null;
    cm_lowest_de: number | null;
    cm_lowest_fr: number | null;
    cm_lowest_es: number | null;
    cm_lowest_it: number | null;
    cm_avg_7d: number | null;
    cm_avg_30d: number | null;
  }> = [];
  const syncedProductIds: string[] = [];

  await mapInBatches(products, HISTORY_BACKFILL_BATCH_SIZE, async (product) => {
    try {
      const history = await fetchHistoryPricesByItemId(product.id);
      const existing = existingByProduct.get(product.id) ?? new Set<string>();

      for (const point of history) {
        const fetchedAt = toHistorySnapshotDate(point.date);
        const iso = fetchedAt.toISOString();
        if (existing.has(iso)) {
          continue;
        }

        historyCreates.push({
          product_id: product.id,
          episode_id: product.episodeId,
          fetched_at: fetchedAt,
          cm_lowest: point.cm_market,
          cm_lowest_eu: null,
          cm_lowest_de: point.cm_market_de,
          cm_lowest_fr: point.cm_market_fr,
          cm_lowest_es: point.cm_market_es,
          cm_lowest_it: point.cm_market_it,
          cm_avg_7d: null,
          cm_avg_30d: null,
        });
        existing.add(iso);
      }

      syncedProductIds.push(product.id);
    } catch {
      // Leave this product eligible for a later history backfill retry.
    }
  });

  await db.$transaction(async (tx) => {
    if (historyCreates.length > 0) {
      await writeInChunks(historyCreates, DB_WRITE_BATCH_SIZE, async (chunk) => {
        await tx.sealedPriceSnapshot.createMany({
          data: chunk,
        });
      });
    }

    if (syncedProductIds.length > 0) {
      await tx.sealedProduct.updateMany({
        where: { id: { in: syncedProductIds } },
        data: { native_history_synced_at: syncedAt },
      });
    }
  });

  return syncedProductIds.length;
}

async function selectNativeHistoryBackfillBatch(): Promise<{
  cardIds: string[];
  products: Array<{ id: string; episodeId: string }>;
}> {
  if (
    AUTO_NATIVE_HISTORY_CARD_BACKFILL_MAX <= 0 &&
    AUTO_NATIVE_HISTORY_PRODUCT_BACKFILL_MAX <= 0
  ) {
    return { cardIds: [], products: [] };
  }

  const [cards, products] = await Promise.all([
    db.card.findMany({
      where: {
        native_history_synced_at: null,
        OR: [
          { prices: { some: {} } },
          { cardmarket_id: { not: null } },
          { tcgplayer_id: { not: null } },
        ],
      },
      orderBy: [{ updated_at: "desc" }],
      select: { id: true },
      take: AUTO_NATIVE_HISTORY_CARD_BACKFILL_MAX,
    }),
    db.sealedProduct.findMany({
      where: {
        native_history_synced_at: null,
        OR: [
          { cm_lowest: { not: null } },
          { cm_lowest_eu: { not: null } },
          { cm_lowest_de: { not: null } },
          { cm_lowest_fr: { not: null } },
          { cm_lowest_es: { not: null } },
          { cm_lowest_it: { not: null } },
          { cm_avg_7d: { not: null } },
          { cm_avg_30d: { not: null } },
          { cardmarket_id: { not: null } },
          { tcgplayer_id: { not: null } },
        ],
      },
      orderBy: [{ synced_at: "desc" }],
      select: {
        id: true,
        episode_id: true,
      },
      take: AUTO_NATIVE_HISTORY_PRODUCT_BACKFILL_MAX,
    }),
  ]);

  return {
    cardIds: cards.map((card) => card.id),
    products: products.map((product) => ({
      id: product.id,
      episodeId: product.episode_id,
    })),
  };
}

function hasAnyMarketplaceId(card: Pick<CardWriteData, "cardmarket_id" | "tcgplayer_id">): boolean {
  return Boolean(card.cardmarket_id || card.tcgplayer_id);
}

function countSelectedCards(selectedByEpisode: Map<string, string[]>): number {
  let total = 0;
  for (const cardIds of selectedByEpisode.values()) {
    total += cardIds.length;
  }
  return total;
}

function mergeSelectedByEpisode(...maps: Array<Map<string, string[]>>): Map<string, string[]> {
  const merged = new Map<string, string[]>();

  for (const current of maps) {
    for (const [episodeId, cardIds] of current) {
      const existing = merged.get(episodeId) ?? [];
      const next = new Set([...existing, ...cardIds]);
      merged.set(episodeId, [...next]);
    }
  }

  return merged;
}

async function syncEpisodeCards(
  episodeId: string,
  options: { refreshAllPrices: boolean; backfillNativeHistory: boolean }
): Promise<EpisodeSyncResult> {
  const [cards, episode] = await Promise.all([
    fetchCardsForEpisode(episodeId),
    db.episode.findUnique({
      where: { id: episodeId },
      select: { code: true, name: true, card_count: true },
    }),
  ]);
  const [tcgdexSupertypeLookup, tcgdexIllustratorLookup] = await Promise.all([
    episode ? getTcgdexSupertypeLookupForEpisode(episode) : Promise.resolve(new Map()),
    episode
      ? getTcgdexIllustratorLookupForCards(
          {
            code: episode.code,
            name: episode.name,
            cardCount: episode.card_count,
          },
          cards
        )
      : Promise.resolve(new Map()),
  ]);
  const fetchedAt = new Date();
  const nativeHistoryCandidateCardIds = cards
    .filter(
      (card) => hasAnyPrice(extractPrices(card.prices)) || hasAnyMarketplaceId(card)
    )
    .map((card) => card.id);

  const result = await db.$transaction(async (tx) => {
    const existingCards = await tx.card.findMany({
      where: { episode_id: episodeId },
      select: {
        id: true,
        name: true,
        card_number: true,
        rarity: true,
        hp: true,
        supertype: true,
        subtypes: true,
        artist: true,
        image_url: true,
        tcggo_url: true,
        cardmarket_url: true,
        tcgid: true,
        cardmarket_id: true,
        tcgplayer_id: true,
        price_source_status: true,
        price_source_checked_at: true,
        native_history_synced_at: true,
        prices: {
          orderBy: { fetched_at: "desc" },
          take: 1,
          select: {
            id: true,
            cm_en_lowest_nm: true,
            cm_de_lowest_nm: true,
            cm_fr_lowest_nm: true,
            cm_es_lowest_nm: true,
            cm_it_lowest_nm: true,
            cm_en_avg_30d: true,
            cm_en_avg_7d: true,
            tcp_market: true,
            tcp_mid: true,
            tcp_low: true,
          },
        },
      },
    });

    const existingCardMap = new Map(existingCards.map((card) => [card.id, card]));
    const priceCreates: Array<{ card_id: string; fetched_at: Date } & PriceSnapshotData> = [];
    const priceRefreshes: Array<{ id: string; fetched_at: Date }> = [];
    const gradedCardIds = cards.map((card) => card.id);
    const gradedCreates: Array<{
      card_id: string;
      label: string;
      price: number;
      fetched_at: Date;
    }> = [];

    let newCards = 0;
    let updatedCards = 0;
    let newPrices = 0;
    let refreshedPrices = 0;

    for (const card of cards) {
      const existingCard = existingCardMap.get(card.id);
      const fallbackSupertype = resolveTcgdexSupertype(card.tcgid, tcgdexSupertypeLookup);
      const fallbackArtist = tcgdexIllustratorLookup.get(card.id) ?? null;
      const nextCardData = buildCardWriteData(
        existingCard,
        {
          ...card,
          artist: card.artist ?? fallbackArtist,
        },
        fallbackSupertype
      );

      if (!existingCard) {
        await tx.card.create({
          data: {
            id: card.id,
            episode_id: episodeId,
            ...nextCardData,
          },
        });
        existingCardMap.set(card.id, {
          id: card.id,
          ...nextCardData,
          price_source_status: null,
          price_source_checked_at: null,
          native_history_synced_at: null,
          prices: [],
        });
        newCards += 1;
      } else if (hasCardChanges(existingCard, nextCardData)) {
        await tx.card.update({
          where: { id: card.id },
          data: nextCardData,
        });
        existingCardMap.set(card.id, {
          ...existingCard,
          ...nextCardData,
        });
        updatedCards += 1;
      }

      for (const gradedPrice of extractGradedPrices(card.prices)) {
        gradedCreates.push({
          card_id: card.id,
          label: gradedPrice.label,
          price: gradedPrice.price,
          fetched_at: fetchedAt,
        });
      }

      const latestPrice = existingCard?.prices[0] ?? null;
      const nextPrice = extractPrices(card.prices);
      const writeMode = queuePriceSnapshotWrite(
        latestPrice,
        nextPrice,
        card.id,
        fetchedAt,
        options,
        priceCreates,
        priceRefreshes
      );

      if (writeMode === "new") {
        if (existingCard?.price_source_status || existingCard?.price_source_checked_at) {
          await tx.card.update({
            where: { id: card.id },
            data: {
              price_source_status: null,
              price_source_checked_at: null,
            },
          });
        }
        newPrices += 1;
      } else if (writeMode === "refreshed") {
        if (existingCard?.price_source_status || existingCard?.price_source_checked_at) {
          await tx.card.update({
            where: { id: card.id },
            data: {
              price_source_status: null,
              price_source_checked_at: null,
            },
          });
        }
        refreshedPrices += 1;
      } else if (!latestPrice) {
        await tx.card.update({
          where: { id: card.id },
          data: {
            price_source_status: "unavailable",
            price_source_checked_at: fetchedAt,
          },
        });
      }
    }

    await tx.cardGradedPrice.deleteMany({
      where: { card_id: { in: gradedCardIds } },
    });

    if (gradedCreates.length > 0) {
      await tx.cardGradedPrice.createMany({
        data: gradedCreates,
      });
    }

    for (const refresh of priceRefreshes) {
      await tx.price.update({
        where: { id: refresh.id },
        data: { fetched_at: refresh.fetched_at },
      });
    }

    if (priceCreates.length > 0) {
      await tx.price.createMany({
        data: priceCreates,
      });
    }

    await tx.episode.update({
      where: { id: episodeId },
      data: {
        synced_at: fetchedAt,
      },
    });

    return {
      episodeId,
      count: cards.length,
      newCards,
      updatedCards,
      newPrices,
      refreshedPrices,
    };
  });

  if (options.backfillNativeHistory) {
    const cardIdsNeedingHistory = (
      await db.card.findMany({
        where: {
          episode_id: episodeId,
          id: { in: nativeHistoryCandidateCardIds },
          native_history_synced_at: null,
        },
        select: { id: true },
      })
    ).map((card) => card.id);

    await backfillCardNativeHistory(cardIdsNeedingHistory, fetchedAt);
  }

  return result;
}

async function selectAutoRefreshBatch(now: Date): Promise<{
  dueCards: number;
  selectedCards: number;
  selectedByEpisode: Map<string, string[]>;
}> {
  const potentialCutoff = new Date(now.getTime() - AUTO_PRICE_REFRESH_MIN_INTERVAL_MS);
  const candidates = await db.$queryRaw<
    Array<{
      id: string;
      episode_id: string;
      rarity: string | null;
      latest_fetched_at: Date | string;
    }>
  >`
    WITH latest_prices AS (
      SELECT card_id, MAX(fetched_at) AS latest_fetched_at
      FROM "Price"
      GROUP BY card_id
    )
    SELECT
      c.id,
      c.episode_id,
      c.rarity,
      latest_prices.latest_fetched_at
    FROM "Card" c
    INNER JOIN latest_prices ON latest_prices.card_id = c.id
    WHERE c.tcggo_url IS NOT NULL
      AND latest_prices.latest_fetched_at <= ${potentialCutoff}
  `;

  const dueCandidates: DueCardCandidate[] = [];

  for (const candidate of candidates) {
    const latestFetchedAt = normalizeTimestamp(candidate.latest_fetched_at);
    if (!latestFetchedAt) continue;

    const refreshInfo = getPriceRefreshInfo(candidate.rarity, latestFetchedAt, now.getTime());
    if (!refreshInfo.due) continue;

    dueCandidates.push({
      id: candidate.id,
      episodeId: candidate.episode_id,
      rarity: candidate.rarity,
      latestFetchedAt,
      tier: refreshInfo.tier,
    });
  }

  if (dueCandidates.length === 0) {
    return {
      dueCards: 0,
      selectedCards: 0,
      selectedByEpisode: new Map(),
    };
  }

  const byEpisode = new Map<string, DueCardCandidate[]>();
  for (const candidate of dueCandidates) {
    const existing = byEpisode.get(candidate.episodeId);
    if (existing) {
      existing.push(candidate);
    } else {
      byEpisode.set(candidate.episodeId, [candidate]);
    }
  }

  const rankedEpisodes = [...byEpisode.entries()]
    .map(([episodeId, cards]) => {
      const rankedCards = [...cards].sort((a, b) => {
        const tierDiff = getTierWeight(b.tier) - getTierWeight(a.tier);
        if (tierDiff !== 0) return tierDiff;
        return a.latestFetchedAt.localeCompare(b.latestFetchedAt);
      });

      return {
        episodeId,
        cards: rankedCards,
        highestTierWeight: Math.max(...rankedCards.map((card) => getTierWeight(card.tier))),
        score: rankedCards.reduce((total, card) => total + getTierWeight(card.tier), 0),
        oldestFetchedAt: rankedCards[0]?.latestFetchedAt ?? "",
      };
    })
    .sort((a, b) => {
      const highestTierDiff = b.highestTierWeight - a.highestTierWeight;
      if (highestTierDiff !== 0) return highestTierDiff;

      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;

      const oldestDiff = a.oldestFetchedAt.localeCompare(b.oldestFetchedAt);
      if (oldestDiff !== 0) return oldestDiff;

      return b.cards.length - a.cards.length;
    });

  const selectedByEpisode = new Map<string, string[]>();
  let selectedCards = 0;

  for (const episode of rankedEpisodes) {
    if (
      selectedByEpisode.size >= AUTO_PRICE_REFRESH_MAX_EPISODES ||
      selectedCards >= AUTO_PRICE_REFRESH_MAX_CARDS
    ) {
      break;
    }

    const remainingSlots = AUTO_PRICE_REFRESH_MAX_CARDS - selectedCards;
    const pickedCards = episode.cards.slice(0, remainingSlots).map((card) => card.id);
    if (pickedCards.length === 0) continue;

    selectedByEpisode.set(episode.episodeId, pickedCards);
    selectedCards += pickedCards.length;
  }

  return {
    dueCards: dueCandidates.length,
    selectedCards,
    selectedByEpisode,
  };
}

async function selectMissingPriceBackfillBatch(options?: {
  maxEpisodes?: number;
  maxCards?: number;
}): Promise<{
  missingPriceCards: number;
  selectedCards: number;
  selectedByEpisode: Map<string, string[]>;
}> {
  const maxEpisodes = options?.maxEpisodes ?? AUTO_PRICE_BACKFILL_MAX_EPISODES;
  const maxCards = options?.maxCards ?? AUTO_PRICE_BACKFILL_MAX_CARDS;

  if (maxEpisodes <= 0 || maxCards <= 0) {
    return {
      missingPriceCards: 0,
      selectedCards: 0,
      selectedByEpisode: new Map(),
    };
  }

  const retryBefore = new Date(Date.now() - PRICE_SOURCE_UNAVAILABLE_RETRY_MS);

  const [missingPriceCards, cards] = await Promise.all([
    db.card.count({
      where: {
        tcggo_url: { not: null },
        prices: {
          none: {},
        },
      },
    }),
    db.card.findMany({
      where: {
        tcggo_url: { not: null },
        prices: {
          none: {},
        },
        OR: [
          { price_source_status: null },
          { price_source_checked_at: null },
          { price_source_checked_at: { lt: retryBefore } },
        ],
      },
      select: {
        id: true,
        episode_id: true,
        cardmarket_id: true,
        tcgplayer_id: true,
        price_source_status: true,
        price_source_checked_at: true,
        created_at: true,
      },
      take: Math.max(maxCards * 6, maxCards),
    }),
  ]);

  if (missingPriceCards === 0) {
    return {
      missingPriceCards: 0,
      selectedCards: 0,
      selectedByEpisode: new Map(),
    };
  }

  const candidates: MissingPriceCandidate[] = cards
    .map((card) => ({
      id: card.id,
      episodeId: card.episode_id,
      hasMarketId: hasAnyMarketplaceId(card),
      checkedAt: card.price_source_checked_at,
      createdAt: card.created_at,
    }))
    .sort((a, b) => {
      if (a.hasMarketId !== b.hasMarketId) return a.hasMarketId ? -1 : 1;

      const aNeverChecked = !a.checkedAt;
      const bNeverChecked = !b.checkedAt;
      if (aNeverChecked !== bNeverChecked) return aNeverChecked ? -1 : 1;

      if (a.checkedAt && b.checkedAt) {
        const checkedDiff = a.checkedAt.getTime() - b.checkedAt.getTime();
        if (checkedDiff !== 0) return checkedDiff;
      }

      return b.createdAt.getTime() - a.createdAt.getTime();
    });

  const selectedByEpisode = new Map<string, string[]>();
  let selectedCards = 0;

  for (const candidate of candidates) {
    if (selectedByEpisode.size >= maxEpisodes || selectedCards >= maxCards) {
      break;
    }

    const existing = selectedByEpisode.get(candidate.episodeId);
    if (existing) {
      existing.push(candidate.id);
      selectedCards += 1;
      continue;
    }

    selectedByEpisode.set(candidate.episodeId, [candidate.id]);
    selectedCards += 1;
  }

  return {
    missingPriceCards,
    selectedCards,
    selectedByEpisode,
  };
}

export async function getAutoPriceRefreshSnapshot(): Promise<{
  dueCards: number;
  missingPriceCards: number;
  nextBatchCards: number;
  nextBatchEpisodes: number;
}> {
  const dueBatch = await selectAutoRefreshBatch(new Date());
  const backfillBatch = await selectMissingPriceBackfillBatch({
    maxCards: Math.min(
      AUTO_PRICE_BACKFILL_MAX_CARDS,
      Math.max(AUTO_PRICE_REFRESH_MAX_CARDS - dueBatch.selectedCards, 0)
    ),
  });
  const combinedBatch = mergeSelectedByEpisode(dueBatch.selectedByEpisode, backfillBatch.selectedByEpisode);

  return {
    dueCards: dueBatch.dueCards,
    missingPriceCards: backfillBatch.missingPriceCards,
    nextBatchCards: countSelectedCards(combinedBatch),
    nextBatchEpisodes: combinedBatch.size,
  };
}

async function refreshEpisodeDueCards(
  episodeId: string,
  cardIds: string[],
  fetchedAt: Date
): Promise<AutoEpisodePriceRefreshResult> {
  const [remoteCards, episode] = await Promise.all([
    fetchCardsForEpisode(episodeId),
    db.episode.findUnique({
      where: { id: episodeId },
      select: { code: true, name: true, card_count: true },
    }),
  ]);
  const [tcgdexSupertypeLookup, tcgdexIllustratorLookup] = await Promise.all([
    episode ? getTcgdexSupertypeLookupForEpisode(episode) : Promise.resolve(new Map()),
    episode
      ? getTcgdexIllustratorLookupForCards(
          {
            code: episode.code,
            name: episode.name,
            cardCount: episode.card_count,
          },
          remoteCards
        )
      : Promise.resolve(new Map()),
  ]);
  const remoteCardMap = new Map(remoteCards.map((card) => [card.id, card]));

  return db.$transaction(async (tx) => {
    const existingCards = await tx.card.findMany({
      where: { id: { in: cardIds } },
      select: {
        id: true,
        name: true,
        card_number: true,
        rarity: true,
        hp: true,
        supertype: true,
        subtypes: true,
        artist: true,
        image_url: true,
        tcggo_url: true,
        cardmarket_url: true,
        tcgid: true,
        cardmarket_id: true,
        tcgplayer_id: true,
        price_source_status: true,
        price_source_checked_at: true,
        prices: {
          orderBy: { fetched_at: "desc" },
          take: 1,
          select: {
            id: true,
            cm_en_lowest_nm: true,
            cm_de_lowest_nm: true,
            cm_fr_lowest_nm: true,
            cm_es_lowest_nm: true,
            cm_it_lowest_nm: true,
            cm_en_avg_30d: true,
            cm_en_avg_7d: true,
            tcp_market: true,
            tcp_mid: true,
            tcp_low: true,
          },
        },
      },
    });

    const existingCardMap = new Map(existingCards.map((card) => [card.id, card]));
    const priceCreates: Array<{ card_id: string; fetched_at: Date } & PriceSnapshotData> = [];
    const priceRefreshes: Array<{ id: string; fetched_at: Date }> = [];
    const gradedCreates: Array<{
      card_id: string;
      label: string;
      price: number;
      fetched_at: Date;
    }> = [];

    let updatedCards = 0;
    let newPrices = 0;
    let refreshedPrices = 0;
    let refreshedCards = 0;

    for (const cardId of cardIds) {
      const existingCard = existingCardMap.get(cardId);
      const remoteCard = remoteCardMap.get(cardId);

      if (!existingCard || !remoteCard) {
        continue;
      }

      const fallbackSupertype = resolveTcgdexSupertype(remoteCard.tcgid, tcgdexSupertypeLookup);
      const fallbackArtist = tcgdexIllustratorLookup.get(cardId) ?? null;
      const nextCardData = buildCardWriteData(
        existingCard,
        {
          ...remoteCard,
          artist: remoteCard.artist ?? fallbackArtist,
        },
        fallbackSupertype
      );
      if (hasCardChanges(existingCard, nextCardData)) {
        await tx.card.update({
          where: { id: cardId },
          data: nextCardData,
        });
        updatedCards += 1;
      }

      for (const gradedPrice of extractGradedPrices(remoteCard.prices)) {
        gradedCreates.push({
          card_id: cardId,
          label: gradedPrice.label,
          price: gradedPrice.price,
          fetched_at: fetchedAt,
        });
      }

      const latestPrice = existingCard.prices[0] ?? null;
      const nextPrice = extractPrices(remoteCard.prices);
      const writeMode = queuePriceSnapshotWrite(
        latestPrice,
        nextPrice,
        cardId,
        fetchedAt,
        { refreshAllPrices: true },
        priceCreates,
        priceRefreshes
      );

      if (writeMode === "new") {
        if (existingCard.price_source_status || existingCard.price_source_checked_at) {
          await tx.card.update({
            where: { id: cardId },
            data: {
              price_source_status: null,
              price_source_checked_at: null,
            },
          });
        }
        newPrices += 1;
        refreshedCards += 1;
      } else if (writeMode === "refreshed") {
        if (existingCard.price_source_status || existingCard.price_source_checked_at) {
          await tx.card.update({
            where: { id: cardId },
            data: {
              price_source_status: null,
              price_source_checked_at: null,
            },
          });
        }
        refreshedPrices += 1;
        refreshedCards += 1;
      } else {
        await tx.card.update({
          where: { id: cardId },
          data: {
            price_source_status: "unavailable",
            price_source_checked_at: fetchedAt,
          },
        });
      }
    }

    await tx.cardGradedPrice.deleteMany({
      where: { card_id: { in: cardIds } },
    });

    if (gradedCreates.length > 0) {
      await tx.cardGradedPrice.createMany({
        data: gradedCreates,
      });
    }

    for (const refresh of priceRefreshes) {
      await tx.price.update({
        where: { id: refresh.id },
        data: { fetched_at: refresh.fetched_at },
      });
    }

    if (priceCreates.length > 0) {
      await tx.price.createMany({
        data: priceCreates,
      });
    }

    return {
      episodeId,
      selectedCards: cardIds.length,
      updatedCards,
      newPrices,
      refreshedPrices,
      refreshedCards,
    };
  });
}

export async function runAutoPriceRefresh(): Promise<AutoPriceRefreshResult> {
  const previewDueBatch = await selectAutoRefreshBatch(new Date());
  const previewBackfillBatch = await selectMissingPriceBackfillBatch({
    maxCards: Math.min(
      AUTO_PRICE_BACKFILL_MAX_CARDS,
      Math.max(AUTO_PRICE_REFRESH_MAX_CARDS - previewDueBatch.selectedCards, 0)
    ),
  });
  const previewNativeHistoryBatch = await selectNativeHistoryBackfillBatch();

  if (
    previewDueBatch.dueCards === 0 &&
    previewBackfillBatch.missingPriceCards === 0 &&
    previewNativeHistoryBatch.cardIds.length === 0 &&
    previewNativeHistoryBatch.products.length === 0
  ) {
    return {
      checkedEpisodes: 0,
      dueCards: 0,
      missingPriceCards: 0,
      selectedCards: 0,
      backfillCards: 0,
      nativeHistoryItems: 0,
      remainingDueCards: 0,
      updatedCards: 0,
      newPrices: 0,
      refreshedPrices: 0,
      refreshedCards: 0,
      skipped: true,
      message: "No cards are due or waiting for a first price sync.",
    };
  }

  return runAutoLoggedSync(
    "Refreshing due cards and backfilling missing first prices in the background",
    summarizeAutoPriceRefresh,
    async () => {
      const dueBatch = await selectAutoRefreshBatch(new Date());
      const backfillBatch = await selectMissingPriceBackfillBatch({
        maxCards: Math.min(
          AUTO_PRICE_BACKFILL_MAX_CARDS,
          Math.max(AUTO_PRICE_REFRESH_MAX_CARDS - dueBatch.selectedCards, 0)
        ),
      });
      const nativeHistoryBatch = await selectNativeHistoryBackfillBatch();
      const combinedBatch = mergeSelectedByEpisode(
        dueBatch.selectedByEpisode,
        backfillBatch.selectedByEpisode
      );

      if (
        combinedBatch.size === 0 &&
        nativeHistoryBatch.cardIds.length === 0 &&
        nativeHistoryBatch.products.length === 0
      ) {
        return {
          checkedEpisodes: 0,
          dueCards: dueBatch.dueCards,
          missingPriceCards: backfillBatch.missingPriceCards,
          selectedCards: 0,
          backfillCards: 0,
          nativeHistoryItems: 0,
          remainingDueCards: 0,
          updatedCards: 0,
          newPrices: 0,
          refreshedPrices: 0,
          refreshedCards: 0,
          skipped: true,
          message: "No cards are due or waiting for a first price sync.",
        };
      }

      const fetchedAt = new Date();
      let updatedCards = 0;
      let newPrices = 0;
      let refreshedPrices = 0;
      let refreshedCards = 0;

      for (const [episodeId, cardIds] of combinedBatch) {
        const result = await refreshEpisodeDueCards(episodeId, cardIds, fetchedAt);
        updatedCards += result.updatedCards;
        newPrices += result.newPrices;
        refreshedPrices += result.refreshedPrices;
        refreshedCards += result.refreshedCards;
      }

      const [syncedCardHistoryItems, syncedSealedHistoryItems] = await Promise.all([
        backfillCardNativeHistory(nativeHistoryBatch.cardIds, fetchedAt),
        backfillSealedNativeHistory(nativeHistoryBatch.products, fetchedAt),
      ]);

      const remainingDueCards = Math.max(dueBatch.dueCards - dueBatch.selectedCards, 0);
      const selectedCards = countSelectedCards(combinedBatch);
      const nativeHistoryCount = syncedCardHistoryItems + syncedSealedHistoryItems;

      return {
        checkedEpisodes: combinedBatch.size,
        dueCards: dueBatch.dueCards,
        missingPriceCards: backfillBatch.missingPriceCards,
        selectedCards,
        backfillCards: backfillBatch.selectedCards,
        nativeHistoryItems: nativeHistoryCount,
        remainingDueCards,
        updatedCards,
        newPrices,
        refreshedPrices,
        refreshedCards,
        skipped: false,
        message:
          nativeHistoryCount > 0
            ? `Checked ${selectedCards} cards across ${combinedBatch.size} sets and backfilled history for ${nativeHistoryCount} items.`
            : `Checked ${selectedCards} cards across ${combinedBatch.size} sets.`,
      };
    }
  );
}

async function persistEpisodeSealedProducts(
  episodeId: string,
  products: NormalizedSealedProduct[],
  syncedAt: Date
): Promise<void> {
  const fetchedIds = products.map((product) => product.id);

  await db.$transaction(async (tx) => {
    for (const product of products) {
      await tx.sealedProduct.upsert({
        where: { id: product.id },
        create: {
          id: product.id,
          episode_id: episodeId,
          name: product.name,
          image_url: product.image_url,
          tcggo_url: product.tcggo_url,
          cardmarket_url: product.cardmarket_url,
          cardmarket_id: product.cardmarket_id,
          tcgplayer_id: product.tcgplayer_id,
          cm_lowest: product.price.cm_lowest,
          cm_lowest_eu: product.price.cm_lowest_eu,
          cm_lowest_de: product.price.cm_lowest_de,
          cm_lowest_fr: product.price.cm_lowest_fr,
          cm_lowest_es: product.price.cm_lowest_es,
          cm_lowest_it: product.price.cm_lowest_it,
          cm_avg_7d: product.price.cm_avg_7d,
          cm_avg_30d: product.price.cm_avg_30d,
          synced_at: syncedAt,
        },
        update: {
          episode_id: episodeId,
          name: product.name,
          image_url: product.image_url,
          tcggo_url: product.tcggo_url,
          cardmarket_url: product.cardmarket_url,
          cardmarket_id: product.cardmarket_id,
          tcgplayer_id: product.tcgplayer_id,
          cm_lowest: product.price.cm_lowest,
          cm_lowest_eu: product.price.cm_lowest_eu,
          cm_lowest_de: product.price.cm_lowest_de,
          cm_lowest_fr: product.price.cm_lowest_fr,
          cm_lowest_es: product.price.cm_lowest_es,
          cm_lowest_it: product.price.cm_lowest_it,
          cm_avg_7d: product.price.cm_avg_7d,
          cm_avg_30d: product.price.cm_avg_30d,
          synced_at: syncedAt,
        },
      });
    }

    await tx.sealedPriceSnapshot.createMany({
      data: products.map((product) => ({
        product_id: product.id,
        episode_id: episodeId,
        fetched_at: syncedAt,
        cm_lowest: product.price.cm_lowest,
        cm_lowest_eu: product.price.cm_lowest_eu,
        cm_lowest_de: product.price.cm_lowest_de,
        cm_lowest_fr: product.price.cm_lowest_fr,
        cm_lowest_es: product.price.cm_lowest_es,
        cm_lowest_it: product.price.cm_lowest_it,
        cm_avg_7d: product.price.cm_avg_7d,
        cm_avg_30d: product.price.cm_avg_30d,
      })),
    });

    await tx.sealedProduct.deleteMany({
      where: {
        episode_id: episodeId,
        id: { notIn: fetchedIds },
      },
    });
  });
}

export async function runSealedSync(): Promise<{ synced: number; products: number }> {
  const episodes = (
    await db.episode.findMany({ select: { id: true, name: true, code: true } })
  ).filter((episode) => !isHiddenExpansion(episode));
  let synced = 0;
  let products = 0;

  // Process in batches of 5 to avoid overwhelming the API
  const BATCH = 5;
  for (let i = 0; i < episodes.length; i += BATCH) {
    const batch = episodes.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (ep) => {
        try {
          const fetched = await fetchSealedProductsForEpisode(ep.id);
          if (fetched.length === 0) return;
          const syncedAt = new Date();
          await persistEpisodeSealedProducts(ep.id, fetched, syncedAt);
          synced += 1;
          products += fetched.length;
        } catch {
          // skip failed episodes silently
        }
      })
    );
  }

  return { synced, products };
}

async function syncEpisodeSealed(
  episodeId: string,
  options: { backfillNativeHistory: boolean }
): Promise<void> {
  const products = await fetchSealedProductsForEpisode(episodeId);
  if (products.length === 0) return;

  const syncedAt = new Date();
  const nativeHistoryCandidateProductIds = products
    .filter(
      (product) =>
        hasAnySealedPrice(product.price) ||
        Boolean(product.cardmarket_id || product.tcgplayer_id)
    )
    .map((product) => product.id);
  await persistEpisodeSealedProducts(episodeId, products, syncedAt);

  if (options.backfillNativeHistory) {
    const productsNeedingHistory = await db.sealedProduct.findMany({
      where: {
        episode_id: episodeId,
        id: { in: nativeHistoryCandidateProductIds },
        native_history_synced_at: null,
      },
      select: {
        id: true,
        episode_id: true,
      },
    });

    await backfillSealedNativeHistory(
      productsNeedingHistory.map((product) => ({
        id: product.id,
        episodeId: product.episode_id,
      })),
      syncedAt
    );
  }
}

export async function runEpisodeSync(episodeId: string): Promise<EpisodeSyncResult> {
  return runLoggedSync(
    `episode:${episodeId}`,
    `Syncing cards and all prices for episode ${episodeId}`,
    summarizeEpisodeSync,
    async () => {
      const [cardResult] = await Promise.all([
        syncEpisodeCards(episodeId, {
          refreshAllPrices: true,
          backfillNativeHistory: true,
        }),
        syncEpisodeSealed(episodeId, { backfillNativeHistory: true }).catch(() => undefined),
      ]);
      return cardResult;
    }
  );
}

export async function runFullSync(): Promise<FullSyncResult> {
  return runLoggedSync(
    "full",
    "Checking new sets, cards, and missing prices",
    summarizeFullSync,
    async () => {
      const [remoteEpisodes, localEpisodes, cardsMissingPrices, cardsMissingMetadata] =
        await Promise.all([
          fetchAllEpisodes(),
          db.episode.findMany({
            select: {
              id: true,
              card_count: true,
              synced_at: true,
              _count: {
                select: { cards: true },
              },
            },
          }),
          db.card.findMany({
            where: {
              prices: {
                none: {},
              },
            },
            select: { episode_id: true },
            distinct: ["episode_id"],
          }),
          db.card.findMany({
            where: {
              OR: [
                { image_url: null },
                { tcgid: null },
                { cardmarket_id: null },
                { cardmarket_url: null },
                { tcgplayer_id: null },
              ],
            },
            select: { episode_id: true },
            distinct: ["episode_id"],
          }),
        ]);

      const localEpisodeMap = new Map(localEpisodes.map((episode) => [episode.id, episode]));
      const missingPriceEpisodeIds = new Set(cardsMissingPrices.map((card) => card.episode_id));
      const metadataBackfillEpisodeIds = new Set(
        cardsMissingMetadata.map((card) => card.episode_id)
      );

      let newEpisodes = 0;
      const episodesToSync: string[] = [];

      for (const episode of remoteEpisodes) {
        if (isHiddenExpansion(episode)) {
          continue;
        }

        const existingEpisode = localEpisodeMap.get(episode.id);
        const isNewEpisode = !existingEpisode;
        const localCardCount = existingEpisode?._count.cards ?? 0;
        const mayHaveRemoteCards = episode.card_count == null || episode.card_count > 0;
        const remoteCardCountChanged =
          episode.card_count != null ? localCardCount !== episode.card_count : localCardCount === 0;
        const needsBackfill =
          missingPriceEpisodeIds.has(episode.id) || metadataBackfillEpisodeIds.has(episode.id);

        if (isNewEpisode) {
          newEpisodes += 1;
        }

        await db.episode.upsert({
          where: { id: episode.id },
          create: episode,
          update: {
            name: episode.name,
            code: episode.code,
            release_date: episode.release_date,
            card_count: episode.card_count,
            logo_url: episode.logo_url,
            symbol_url: episode.symbol_url,
            series: episode.series,
          },
        });

        if (
          mayHaveRemoteCards &&
          (isNewEpisode || localCardCount === 0 || remoteCardCountChanged || needsBackfill)
        ) {
          episodesToSync.push(episode.id);
        }
      }

      let newCards = 0;
      let updatedCards = 0;
      let newPrices = 0;
      let refreshedPrices = 0;

      for (const episodeId of episodesToSync) {
        const [episodeResult] = await Promise.all([
          syncEpisodeCards(episodeId, {
            refreshAllPrices: false,
            backfillNativeHistory: false,
          }),
          syncEpisodeSealed(episodeId, { backfillNativeHistory: false }).catch(() => undefined),
        ]);

        newCards += episodeResult.newCards;
        updatedCards += episodeResult.updatedCards;
        newPrices += episodeResult.newPrices;
        refreshedPrices += episodeResult.refreshedPrices;
      }

      return {
        count: remoteEpisodes.length,
        newEpisodes,
        syncedEpisodes: episodesToSync.length,
        skippedEpisodes: Math.max(remoteEpisodes.length - episodesToSync.length, 0),
        newCards,
        updatedCards,
        newPrices,
        refreshedPrices,
      };
    }
  );
}
