import "server-only";

import { loadLatestSafeEnglishNmPrices } from "@/lib/card-market-history";
import { db } from "@/lib/db";
import {
  applyPostLaunchSetBreadth,
  calculatePostLaunchRerating,
  isPostLaunchReratingRarity,
  type PostLaunchReratingEntry,
  type PostLaunchReratingMetrics,
} from "@/lib/post-launch-rerating";
import { createSwrCache } from "@/lib/server-swr-cache";

const DAY_MS = 86_400_000;
const HISTORY_DAYS = 1_100;
const SQLITE_SAFE_CHUNK_SIZE = 400;
const cache = createSwrCache<Map<string, PostLaunchReratingMetrics>>(
  30 * 60_000,
  6 * 60 * 60_000
);

interface LaunchHistoryRow {
  card_id: string;
  fetched_at: Date | string;
  cm_en_lowest_nm: number | null;
}

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function loadPostLaunchUniverse(
  now: Date
): Promise<Map<string, PostLaunchReratingMetrics>> {
  const cutoff = new Date(now.getTime() - HISTORY_DAYS * DAY_MS);
  const cards = (
    await db.card.findMany({
      where: {
        game: "pokemon",
        rarity: { not: null },
        episode: {
          release_date: {
            gte: isoDay(cutoff),
            lte: isoDay(now),
          },
        },
      },
      select: {
        id: true,
        game: true,
        episode_id: true,
        name: true,
        card_number: true,
        printed_card_number: true,
        rarity: true,
        cardmarket_id: true,
        cardmarket_url: true,
        episode: {
          select: {
            name: true,
            code: true,
            release_date: true,
          },
        },
      },
    })
  ).filter((card) =>
    isPostLaunchReratingRarity({
      game: card.game,
      rarity: card.rarity,
      episodeName: card.episode.name,
      episodeCode: card.episode.code,
    })
  );
  if (cards.length === 0) return new Map();

  const historyByCard = new Map<string, LaunchHistoryRow[]>();
  const cardIds = cards.map((card) => card.id);
  for (let index = 0; index < cardIds.length; index += SQLITE_SAFE_CHUNK_SIZE) {
    const chunk = cardIds.slice(index, index + SQLITE_SAFE_CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = await db.$queryRawUnsafe<LaunchHistoryRow[]>(
      `
        SELECT p.card_id, p.fetched_at, p.cm_en_lowest_nm
        FROM "Price" p
        INNER JOIN "Card" c ON c.id = p.card_id
        INNER JOIN "Episode" e ON e.id = c.episode_id
        WHERE p.card_id IN (${placeholders})
          AND p.cm_en_lowest_nm > 0
          AND p.cm_en_lowest_nm <> 9001
          AND DATE(p.fetched_at) >= DATE(e.release_date)
          AND DATE(p.fetched_at) <= DATE(e.release_date, '+35 days')
        ORDER BY p.card_id ASC, p.fetched_at ASC, p.id ASC
      `,
      ...chunk
    );
    for (const row of rows) {
      const history = historyByCard.get(row.card_id) ?? [];
      history.push(row);
      historyByCard.set(row.card_id, history);
    }
  }

  const latestPrices = await loadLatestSafeEnglishNmPrices(
    cards.map((card) => ({
      id: card.id,
      game: card.game,
      episodeId: card.episode_id,
      name: card.name,
      cardNumber: card.card_number,
      printedCardNumber: card.printed_card_number,
      cardmarketId: card.cardmarket_id,
      cardmarketUrl: card.cardmarket_url,
    }))
  );
  const entries: PostLaunchReratingEntry[] = [];
  for (const card of cards) {
    const latest = latestPrices.get(card.id);
    const metrics = calculatePostLaunchRerating({
      game: card.game,
      rarity: card.rarity,
      episodeName: card.episode.name,
      episodeCode: card.episode.code,
      releaseDate: card.episode.release_date,
      currentPrice: latest?.value ?? null,
      history: (historyByCard.get(card.id) ?? []).map((row) => ({
        observedAt: row.fetched_at,
        value: row.cm_en_lowest_nm,
      })),
      now,
    });
    if (metrics) {
      entries.push({
        cardId: card.id,
        episodeId: card.episode_id,
        metrics,
      });
    }
  }
  return applyPostLaunchSetBreadth(entries);
}

export async function loadPostLaunchReratingMetrics(
  cardIds: readonly string[],
  now = new Date()
): Promise<Map<string, PostLaunchReratingMetrics>> {
  if (cardIds.length === 0) return new Map();
  const universe = await cache.get(`post-launch-v1:${isoDay(now)}`, () =>
    loadPostLaunchUniverse(now)
  );
  const requested = new Set(cardIds);
  return new Map([...universe].filter(([cardId]) => requested.has(cardId)));
}
