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

const characterCardIdsCache = createSwrCache<string[]>(
  CHARACTER_MATCH_CACHE_FRESH_MS,
  CHARACTER_MATCH_CACHE_STALE_MS,
  { maxEntries: 160 }
);

function toIsoString(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null;
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
      prices: {
        where: {
          cm_en_lowest_nm: { gt: 0, not: 9001 },
        },
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
          tcp_mid: true,
          tcp_low: true,
          cm_en_avg_7d: true,
          cm_en_avg_30d: true,
          fetched_at: true,
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
    const price = card.prices[0] ?? null;
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
      price_fetched_at: toIsoString(price?.fetched_at),
      price: price
        ? {
            cm_en_lowest_nm: price.cm_en_lowest_nm,
            cm_de_lowest_nm: price.cm_de_lowest_nm,
            cm_fr_lowest_nm: price.cm_fr_lowest_nm,
            cm_es_lowest_nm: price.cm_es_lowest_nm,
            cm_it_lowest_nm: price.cm_it_lowest_nm,
            cm_jp_lowest_nm: price.cm_jp_lowest_nm,
            tcp_market: price.tcp_market,
            tcp_mid: price.tcp_mid,
            tcp_low: price.tcp_low,
            cm_en_avg_7d: price.cm_en_avg_7d,
            cm_en_avg_30d: price.cm_en_avg_30d,
          }
        : null,
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
