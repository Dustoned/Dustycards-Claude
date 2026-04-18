import { db } from "@/lib/db";
import { getPriceRefreshInfo, type PriceRefreshTier } from "@/lib/price-refresh";
import {
  extractPrices,
  fetchAllEpisodes,
  fetchCardsForEpisode,
  type NormalizedCard,
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

interface ExistingCardRecord extends CardWriteData {
  id: string;
  price_source_status: string | null;
  price_source_checked_at: Date | null;
  prices: ExistingPriceRecord[];
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
  existing: ExistingCardRecord | undefined,
  card: NormalizedCard
): CardWriteData {
  return {
    name: card.name,
    card_number: card.card_number ?? existing?.card_number ?? null,
    rarity: card.rarity ?? existing?.rarity ?? null,
    hp: card.hp ?? existing?.hp ?? null,
    supertype: card.supertype ?? existing?.supertype ?? null,
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

function hasCardChanges(existing: ExistingCardRecord, next: CardWriteData): boolean {
  return CARD_FIELDS.some((field) => existing[field] !== next[field]);
}

function hasAnyPrice(prices: PriceSnapshotData): boolean {
  return PRICE_FIELDS.some((field) => prices[field] !== null);
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
  options: { refreshAllPrices: boolean }
): Promise<EpisodeSyncResult> {
  const cards = await fetchCardsForEpisode(episodeId);

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
    const fetchedAt = new Date();
    const priceCreates: Array<{ card_id: string; fetched_at: Date } & PriceSnapshotData> = [];
    const priceRefreshes: Array<{ id: string; fetched_at: Date }> = [];

    let newCards = 0;
    let updatedCards = 0;
    let newPrices = 0;
    let refreshedPrices = 0;

    for (const card of cards) {
      const existingCard = existingCardMap.get(card.id);
      const nextCardData = buildCardWriteData(existingCard, card);

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
  const remoteCards = await fetchCardsForEpisode(episodeId);
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

      const nextCardData = buildCardWriteData(existingCard, remoteCard);
      if (hasCardChanges(existingCard, nextCardData)) {
        await tx.card.update({
          where: { id: cardId },
          data: nextCardData,
        });
        updatedCards += 1;
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

  if (previewDueBatch.dueCards === 0 && previewBackfillBatch.missingPriceCards === 0) {
    return {
      checkedEpisodes: 0,
      dueCards: 0,
      missingPriceCards: 0,
      selectedCards: 0,
      backfillCards: 0,
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
      const combinedBatch = mergeSelectedByEpisode(
        dueBatch.selectedByEpisode,
        backfillBatch.selectedByEpisode
      );

      if (combinedBatch.size === 0) {
        return {
          checkedEpisodes: 0,
          dueCards: dueBatch.dueCards,
          missingPriceCards: backfillBatch.missingPriceCards,
          selectedCards: 0,
          backfillCards: 0,
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

      const remainingDueCards = Math.max(dueBatch.dueCards - dueBatch.selectedCards, 0);
      const selectedCards = countSelectedCards(combinedBatch);

      return {
        checkedEpisodes: combinedBatch.size,
        dueCards: dueBatch.dueCards,
        missingPriceCards: backfillBatch.missingPriceCards,
        selectedCards,
        backfillCards: backfillBatch.selectedCards,
        remainingDueCards,
        updatedCards,
        newPrices,
        refreshedPrices,
        refreshedCards,
        skipped: false,
        message: `Checked ${selectedCards} cards across ${combinedBatch.size} sets.`,
      };
    }
  );
}

export async function runEpisodeSync(episodeId: string): Promise<EpisodeSyncResult> {
  return runLoggedSync(
    `episode:${episodeId}`,
    `Syncing cards and all prices for episode ${episodeId}`,
    summarizeEpisodeSync,
    () => syncEpisodeCards(episodeId, { refreshAllPrices: true })
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
        const episodeResult = await syncEpisodeCards(episodeId, {
          refreshAllPrices: false,
        });

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
