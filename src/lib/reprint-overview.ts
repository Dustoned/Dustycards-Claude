import { db } from "@/lib/db";
import {
  loadRelatedCardPrintings,
  type RelatedCardPrinting,
} from "@/lib/card-printings";
import { getCurrentRawCardmarketValue } from "@/lib/market-price-sanity";
import { createSwrCache } from "@/lib/server-swr-cache";

const CANDIDATE_GROUP_LIMIT = 48;
const REPRINT_GROUP_LIMIT = 18;
const LOOKUP_CONCURRENCY = 6;

type CandidateGroupRow = {
  name: string;
  hp: number | null;
  supertype: string | null;
  artist: string;
};

type OverviewLookupCard = {
  id: string;
  game: string;
  name: string;
  card_number: string | null;
  rarity: string | null;
  hp: number | null;
  image_url: string | null;
  tcgid: string | null;
  supertype: string | null;
  artist: string | null;
  cardmarket_url: string | null;
  episode: {
    id: string;
    name: string;
    code: string | null;
    release_date: string | null;
  };
  prices: Array<{ cm_en_lowest_nm: number | null }>;
};

export type ReprintOverviewCard = RelatedCardPrinting & {
  is_original: boolean;
};

export type ReprintOverviewGroup = {
  key: string;
  name: string;
  illustrator: string | null;
  cards: ReprintOverviewCard[];
  lowest_price: number | null;
};

const overviewCache = createSwrCache<ReprintOverviewGroup[]>(
  30 * 60_000,
  6 * 60 * 60_000,
  { maxEntries: 1 }
);

function candidateKey(card: {
  name: string;
  hp: number | null;
  supertype: string | null;
  artist: string | null;
}): string {
  return [card.name, card.hp ?? "", card.supertype ?? "", card.artist ?? ""]
    .join("\u0000")
    .toLowerCase();
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;

  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker())
  );
  return results;
}

function toOverviewCard(card: OverviewLookupCard): ReprintOverviewCard {
  const latestPrice = card.prices[0] ?? null;
  return {
    id: card.id,
    name: card.name,
    card_number: card.card_number,
    rarity: card.rarity,
    image_url: card.image_url,
    cardmarket_url: card.cardmarket_url,
    episode_id: card.episode.id,
    episode_name: card.episode.name,
    episode_code: card.episode.code,
    episode_release_date: card.episode.release_date,
    price: latestPrice ? getCurrentRawCardmarketValue(latestPrice) : null,
    match_type: "reprint",
    is_original: true,
  };
}

async function loadReprintOverviewUncached(): Promise<ReprintOverviewGroup[]> {
  const candidateGroups = await db.$queryRawUnsafe<CandidateGroupRow[]>(`
    SELECT
      c.name,
      c.hp,
      c.supertype,
      c.artist
    FROM "Card" c
    INNER JOIN "Episode" e ON e.id = c.episode_id
    WHERE c.game = 'pokemon'
      AND c.image_url IS NOT NULL
      AND TRIM(c.image_url) <> ''
      AND c.artist IS NOT NULL
      AND TRIM(c.artist) <> ''
    GROUP BY c.name, c.hp, c.supertype, c.artist
    HAVING COUNT(*) > 1
    ORDER BY MAX(COALESCE(e.release_date, '')) DESC, c.name ASC
    LIMIT ${CANDIDATE_GROUP_LIMIT}
  `);
  if (candidateGroups.length === 0) return [];

  const candidates = await db.card.findMany({
    where: {
      game: "pokemon",
      image_url: { not: null },
      OR: candidateGroups.map((group) => ({
        name: group.name,
        hp: group.hp,
        supertype: group.supertype,
        artist: group.artist,
      })),
    },
    orderBy: [{ episode: { release_date: "desc" } }, { card_number: "asc" }],
    select: {
      id: true,
      game: true,
      name: true,
      card_number: true,
      rarity: true,
      hp: true,
      image_url: true,
      tcgid: true,
      supertype: true,
      artist: true,
      cardmarket_url: true,
      episode: {
        select: { id: true, name: true, code: true, release_date: true },
      },
      prices: {
        where: { cm_en_lowest_nm: { gt: 0, not: 9001 } },
        orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
        take: 1,
        select: { cm_en_lowest_nm: true },
      },
    },
  });

  const newestCardByGroup = new Map<string, OverviewLookupCard>();
  for (const card of candidates) {
    const key = candidateKey(card);
    if (!newestCardByGroup.has(key)) newestCardByGroup.set(key, card);
  }

  const leaders = candidateGroups
    .map((group) => newestCardByGroup.get(candidateKey(group)))
    .filter((card): card is OverviewLookupCard => Boolean(card));
  const resolved = await mapWithConcurrency(leaders, LOOKUP_CONCURRENCY, async (leader) => ({
    leader,
    related: await loadRelatedCardPrintings(leader),
  }));

  return resolved
    .filter(({ related }) => related.length > 0)
    .map(({ leader, related }) => {
      const cards: ReprintOverviewCard[] = [
        toOverviewCard(leader),
        ...related.map((card) => ({ ...card, is_original: false })),
      ].sort((left, right) =>
        (left.episode_release_date ?? "").localeCompare(right.episode_release_date ?? "")
      );
      if (cards[0]) cards[0].is_original = true;
      for (const card of cards.slice(1)) card.is_original = false;
      const prices = cards
        .map((card) => card.price)
        .filter((price): price is number => price != null);

      return {
        key: candidateKey(leader),
        name: leader.name,
        illustrator: leader.artist,
        cards,
        lowest_price: prices.length > 0 ? Math.min(...prices) : null,
      };
    })
    .slice(0, REPRINT_GROUP_LIMIT);
}

export function loadReprintOverview(): Promise<ReprintOverviewGroup[]> {
  return overviewCache.get("pokemon", loadReprintOverviewUncached);
}
