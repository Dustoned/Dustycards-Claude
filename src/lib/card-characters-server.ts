import "server-only";

import { db } from "@/lib/db";
import { getDisplayCardNumber } from "@/lib/card-number-display";
import {
  cardHasCharacter,
  getCardCharacterBySlug,
  getCharacterSearchCandidates,
  type CardCharacterSearchCandidate,
  type CardCharacterMatch,
} from "@/lib/card-characters-core";
import { normalizeTradingCardGame, POKEMON_GAME } from "@/lib/games";
import { createSwrCache } from "@/lib/server-swr-cache";
import type { CardData } from "@/types/card-data";

const CHARACTER_MATCH_CACHE_FRESH_MS = 10 * 60_000;
const CHARACTER_MATCH_CACHE_STALE_MS = 60 * 60_000;
const CHARACTER_PRICE_CHUNK_SIZE = 300;

const characterCardIdsCache = createSwrCache<string[]>(
  CHARACTER_MATCH_CACHE_FRESH_MS,
  CHARACTER_MATCH_CACHE_STALE_MS,
  { maxEntries: 160 }
);

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

type CurrentCharacterPriceRow = {
  card_id: string;
  cm_fetched_at: Date | string | null;
  aux_fetched_at: Date | string | null;
  tcp_fetched_at: Date | string | null;
  cm_en_lowest_nm: number | null;
  cm_de_lowest_nm: number | null;
  cm_fr_lowest_nm: number | null;
  cm_es_lowest_nm: number | null;
  cm_it_lowest_nm: number | null;
  cm_jp_lowest_nm: number | null;
  tcp_market: number | null;
  tcp_mid: number | null;
  tcp_low: number | null;
  cm_en_avg_7d: number | null;
  cm_en_avg_30d: number | null;
};

type CurrentCharacterPrice = {
  fetchedAt: Date | string | null;
  price: NonNullable<CardData["price"]>;
};

async function getCurrentCharacterPrices(
  cardIds: string[]
): Promise<Map<string, CurrentCharacterPrice>> {
  const pricesByCardId = new Map<string, CurrentCharacterPrice>();

  for (let index = 0; index < cardIds.length; index += CHARACTER_PRICE_CHUNK_SIZE) {
    const chunk = cardIds.slice(index, index + CHARACTER_PRICE_CHUNK_SIZE);
    const placeholders = chunk.map(() => "(?)").join(", ");
    const rows = await db.$queryRawUnsafe<CurrentCharacterPriceRow[]>(
      `
      WITH requested(id) AS (VALUES ${placeholders}),
      latest_cm AS (
        SELECT
          p.*,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS row_num
        FROM "Price" p
        JOIN requested r ON r.id = p.card_id
        WHERE p.cm_en_lowest_nm > 0
          AND p.cm_en_lowest_nm <> 9001
      ),
      latest_aux AS (
        SELECT
          p.*,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS row_num
        FROM "Price" p
        JOIN requested r ON r.id = p.card_id
        WHERE (p.cm_de_lowest_nm > 0 AND p.cm_de_lowest_nm <> 9001)
           OR (p.cm_fr_lowest_nm > 0 AND p.cm_fr_lowest_nm <> 9001)
           OR (p.cm_es_lowest_nm > 0 AND p.cm_es_lowest_nm <> 9001)
           OR (p.cm_it_lowest_nm > 0 AND p.cm_it_lowest_nm <> 9001)
           OR (p.cm_jp_lowest_nm > 0 AND p.cm_jp_lowest_nm <> 9001)
           OR (p.cm_en_avg_7d > 0 AND p.cm_en_avg_7d <> 9001)
           OR (p.cm_en_avg_30d > 0 AND p.cm_en_avg_30d <> 9001)
      ),
      latest_tcp AS (
        SELECT
          p.*,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS row_num
        FROM "Price" p
        JOIN requested r ON r.id = p.card_id
        WHERE p.tcp_market > 0
          AND p.tcp_market <> 9001
      )
      SELECT
        r.id AS card_id,
        cm.fetched_at AS cm_fetched_at,
        aux.fetched_at AS aux_fetched_at,
        tcp.fetched_at AS tcp_fetched_at,
        cm.cm_en_lowest_nm,
        CASE WHEN aux.cm_de_lowest_nm > 0 AND aux.cm_de_lowest_nm <> 9001
          THEN aux.cm_de_lowest_nm ELSE NULL END AS cm_de_lowest_nm,
        CASE WHEN aux.cm_fr_lowest_nm > 0 AND aux.cm_fr_lowest_nm <> 9001
          THEN aux.cm_fr_lowest_nm ELSE NULL END AS cm_fr_lowest_nm,
        CASE WHEN aux.cm_es_lowest_nm > 0 AND aux.cm_es_lowest_nm <> 9001
          THEN aux.cm_es_lowest_nm ELSE NULL END AS cm_es_lowest_nm,
        CASE WHEN aux.cm_it_lowest_nm > 0 AND aux.cm_it_lowest_nm <> 9001
          THEN aux.cm_it_lowest_nm ELSE NULL END AS cm_it_lowest_nm,
        CASE WHEN aux.cm_jp_lowest_nm > 0 AND aux.cm_jp_lowest_nm <> 9001
          THEN aux.cm_jp_lowest_nm ELSE NULL END AS cm_jp_lowest_nm,
        tcp.tcp_market,
        CASE WHEN tcp.tcp_mid > 0 AND tcp.tcp_mid <> 9001
          THEN tcp.tcp_mid ELSE NULL END AS tcp_mid,
        CASE WHEN tcp.tcp_low > 0 AND tcp.tcp_low <> 9001
          THEN tcp.tcp_low ELSE NULL END AS tcp_low,
        CASE WHEN aux.cm_en_avg_7d > 0 AND aux.cm_en_avg_7d <> 9001
          THEN aux.cm_en_avg_7d ELSE NULL END AS cm_en_avg_7d,
        CASE WHEN aux.cm_en_avg_30d > 0 AND aux.cm_en_avg_30d <> 9001
          THEN aux.cm_en_avg_30d ELSE NULL END AS cm_en_avg_30d
      FROM requested r
      LEFT JOIN latest_cm cm ON cm.card_id = r.id AND cm.row_num = 1
      LEFT JOIN latest_aux aux ON aux.card_id = r.id AND aux.row_num = 1
      LEFT JOIN latest_tcp tcp ON tcp.card_id = r.id AND tcp.row_num = 1
      WHERE cm.card_id IS NOT NULL OR aux.card_id IS NOT NULL OR tcp.card_id IS NOT NULL
      `,
      ...chunk
    );

    for (const row of rows) {
      pricesByCardId.set(row.card_id, {
        // CardData has one refresh timestamp and defaults to CardMarket. Keep
        // that timestamp tied to a real CM observation; TCP is only the
        // fallback when no CardMarket observation exists for this card.
        fetchedAt: row.cm_fetched_at ?? row.aux_fetched_at ?? row.tcp_fetched_at,
        price: {
          cm_en_lowest_nm: row.cm_en_lowest_nm,
          cm_de_lowest_nm: row.cm_de_lowest_nm,
          cm_fr_lowest_nm: row.cm_fr_lowest_nm,
          cm_es_lowest_nm: row.cm_es_lowest_nm,
          cm_it_lowest_nm: row.cm_it_lowest_nm,
          cm_jp_lowest_nm: row.cm_jp_lowest_nm,
          tcp_market: row.tcp_market,
          tcp_mid: row.tcp_mid,
          tcp_low: row.tcp_low,
          cm_en_avg_7d: row.cm_en_avg_7d,
          cm_en_avg_30d: row.cm_en_avg_30d,
        },
      });
    }
  }

  return pricesByCardId;
}

function toNameSearchFilter(candidate: CardCharacterSearchCandidate) {
  switch (candidate.match) {
    case "equals":
      return { name: candidate.value };
    case "startsWith":
      return { name: { startsWith: candidate.value } };
    case "contains":
      return { name: { contains: candidate.value } };
  }
}

async function loadCharacterCardIds(character: CardCharacterMatch): Promise<string[]> {
  const searchCandidates = getCharacterSearchCandidates(character);
  const candidates = await db.card.findMany({
    where: {
      game: POKEMON_GAME,
      OR: searchCandidates.map(toNameSearchFilter),
    },
    select: {
      id: true,
      game: true,
      name: true,
      supertype: true,
    },
  });

  return candidates
    .filter((card) => cardHasCharacter(card, character))
    .map((card) => card.id);
}

async function getCharacterCardIds(character: CardCharacterMatch): Promise<string[]> {
  return characterCardIdsCache.get(
    `${character.kind}:${character.slug}`,
    () => loadCharacterCardIds(character)
  );
}

function compareCardNumbers(left: string | null, right: string | null): number {
  return (left ?? "").localeCompare(right ?? "", "en", {
    numeric: true,
    sensitivity: "base",
  });
}

export async function getCharacterPageData(
  kind: string,
  slug: string,
  userId: string
): Promise<{ entity: CardCharacterMatch; cards: CardData[] } | null> {
  const entity = getCardCharacterBySlug(kind, slug);
  if (!entity) return null;

  const cardIds = await getCharacterCardIds(entity);
  if (cardIds.length === 0) {
    return { entity, cards: [] };
  }

  const rows = await db.card.findMany({
    where: { id: { in: cardIds } },
    select: {
      id: true,
      game: true,
      name: true,
      card_number: true,
      printed_card_number: true,
      rarity: true,
      hp: true,
      image_url: true,
      supertype: true,
      subtypes: true,
      artist: true,
      cardmarket_id: true,
      cardmarket_url: true,
      tcggo_url: true,
      price_source_status: true,
      price_source_checked_at: true,
      episode: {
        select: {
          id: true,
          name: true,
          code: true,
          release_date: true,
        },
      },
      wants: {
        where: { user_id: userId },
        take: 1,
        select: {
          id: true,
          created_at: true,
        },
      },
    },
  });

  const pricesByCardId = await getCurrentCharacterPrices(rows.map((card) => card.id));

  rows.sort((left, right) => {
    const releaseDifference =
      (right.episode.release_date ? Date.parse(right.episode.release_date) : 0) -
      (left.episode.release_date ? Date.parse(left.episode.release_date) : 0);
    if (releaseDifference !== 0) return releaseDifference;
    const numberDifference = compareCardNumbers(
      getDisplayCardNumber(left),
      getDisplayCardNumber(right)
    );
    if (numberDifference !== 0) return numberDifference;
    return left.name.localeCompare(right.name, "en", { sensitivity: "base" });
  });

  const cards: CardData[] = rows.map((card) => {
    const currentPrice = pricesByCardId.get(card.id) ?? null;
    const want = card.wants[0] ?? null;
    return {
      id: card.id,
      game: normalizeTradingCardGame(card.game),
      name: card.name,
      card_number: getDisplayCardNumber(card),
      rarity: card.rarity,
      hp: card.hp,
      image_url: card.image_url,
      supertype: card.supertype,
      subtypes: card.subtypes,
      artist: card.artist,
      cardmarket_id: card.cardmarket_id,
      cardmarket_url: card.cardmarket_url,
      tcggo_url: card.tcggo_url,
      episode_id: card.episode.id,
      episode_name: card.episode.name,
      episode_code: card.episode.code,
      episode_release_date: card.episode.release_date,
      price_source_status: card.price_source_status,
      price_source_checked_at: toIsoString(card.price_source_checked_at),
      price_fetched_at: toIsoString(currentPrice?.fetchedAt),
      price: currentPrice?.price ?? null,
      want_item: want
        ? {
            id: want.id,
            created_at: want.created_at.toISOString(),
          }
        : null,
    };
  });

  return { entity, cards };
}
