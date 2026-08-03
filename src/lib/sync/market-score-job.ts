import "server-only";

import { db } from "@/lib/db";
import { buildCardMarketStats } from "@/lib/card-market-stats";
import { buildCardPriceHistory } from "@/lib/price-history";
import { loadSafeCardMarketHistoryRows } from "@/lib/card-market-history";
import { getCurrentRawCardmarketValue } from "@/lib/market-price-sanity";
import { getEbayDemandPayload } from "@/lib/ebay-demand";
import { convertUsdToEur, getUsdToEurRate } from "@/lib/exchange-rates";

// Persists the DustyCards market score (the same buildCardMarketStats model
// the card detail page shows) onto the Card row, so search and other list
// surfaces can rank on real market interest without recomputing per request.
// Runs a small batch per scheduler tick until every priced card is fresh.
const BATCH_SIZE = 120;
const REFRESH_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

let running = false;
let lastError: string | null = null;
let lastFinishedAt: string | null = null;
let lastBatchSize = 0;

export function getMarketScoreJobSnapshot() {
  return { running, lastFinishedAt, lastError, lastBatchSize };
}

interface MarketScoreCandidateRow {
  id: string;
  game: string;
  episode_id: string;
  name: string;
  card_number: string | null;
  printed_card_number: string | null;
  cardmarket_id: string | null;
  cardmarket_url: string | null;
}

async function runMarketScoreBatch(now: Date): Promise<number> {
  const staleBefore = new Date(now.getTime() - REFRESH_INTERVAL_MS).toISOString();
  const candidates = await db.$queryRawUnsafe<MarketScoreCandidateRow[]>(
    `
    SELECT c.id, c.game, c.episode_id, c.name, c.card_number, c.printed_card_number,
           c.cardmarket_id, c.cardmarket_url
    FROM "Card" c
    WHERE EXISTS (SELECT 1 FROM "Price" p WHERE p.card_id = c.id)
      AND (c.market_score_updated_at IS NULL OR c.market_score_updated_at < ?)
    ORDER BY c.market_score_updated_at IS NOT NULL, c.market_score_updated_at ASC
    LIMIT ?
    `,
    staleBefore,
    BATCH_SIZE
  );
  if (candidates.length === 0) return 0;

  const cardIds = candidates.map((card) => card.id);
  const placeholders = cardIds.map(() => "?").join(", ");
  const [historyByCard, gradedRows, ebaySoldRows, usdToEurRate] = await Promise.all([
    loadSafeCardMarketHistoryRows(
      candidates.map((card) => ({
        id: card.id,
        game: card.game,
        episodeId: card.episode_id,
        name: card.name,
        cardNumber: card.card_number,
        printedCardNumber: card.printed_card_number,
        cardmarketId: card.cardmarket_id,
        cardmarketUrl: card.cardmarket_url,
      }))
    ),
    db.cardGradedPrice.findMany({
      where: { card_id: { in: cardIds } },
      select: { card_id: true, label: true, price: true },
    }),
    db.$queryRawUnsafe<
      Array<{
        card_id: string;
        label: string;
        company: string | null;
        grade: string | null;
        median_price: number;
        currency: string;
        sample_size: number | null;
        fetched_at: string | null;
      }>
    >(
      `
      SELECT card_id, label, company, grade, median_price, currency, sample_size, fetched_at
      FROM "CardEbaySoldGradedPrice"
      WHERE card_id IN (${placeholders})
      `,
      ...cardIds
    ),
    getUsdToEurRate().catch(() => null),
  ]);

  const gradedByCard = new Map<string, Array<{ label: string; price: number }>>();
  for (const row of gradedRows) {
    const list = gradedByCard.get(row.card_id) ?? [];
    list.push({ label: row.label, price: row.price });
    gradedByCard.set(row.card_id, list);
  }
  const ebaySoldByCard = new Map<string, typeof ebaySoldRows>();
  for (const row of ebaySoldRows) {
    const list = ebaySoldByCard.get(row.card_id) ?? [];
    list.push(row);
    ebaySoldByCard.set(row.card_id, list);
  }

  const nowIso = now.toISOString();
  for (const card of candidates) {
    const safePriceRows = historyByCard.get(card.id) ?? [];
    const latestSourceSnapshot = safePriceRows[safePriceRows.length - 1] ?? null;
    const latestEnglishNmSnapshot =
      [...safePriceRows].reverse().find((price) => getCurrentRawCardmarketValue(price) != null) ??
      null;
    const demand = await getEbayDemandPayload({ cardId: card.id, mode: "raw" }).catch(() => null);
    const stats = buildCardMarketStats({
      history: buildCardPriceHistory(safePriceRows),
      currentLanguagePrices: {
        en: latestEnglishNmSnapshot?.cm_en_lowest_nm,
        de: latestSourceSnapshot?.cm_de_lowest_nm,
        fr: latestSourceSnapshot?.cm_fr_lowest_nm,
        es: latestSourceSnapshot?.cm_es_lowest_nm,
        it: latestSourceSnapshot?.cm_it_lowest_nm,
        jp: latestSourceSnapshot?.cm_jp_lowest_nm,
      },
      rawPrice: latestEnglishNmSnapshot?.cm_en_lowest_nm,
      gradedPrices: gradedByCard.get(card.id) ?? [],
      ebaySoldGradedPrices: (ebaySoldByCard.get(card.id) ?? []).map((price) => {
        const currency = price.currency.toUpperCase();
        return {
          label: price.label,
          company: price.company,
          grade: price.grade,
          median_price: price.median_price,
          currency,
          median_price_eur:
            currency === "EUR"
              ? price.median_price
              : currency === "USD"
                ? convertUsdToEur(price.median_price, usdToEurRate)
                : null,
          sample_size: price.sample_size,
          fetched_at: price.fetched_at,
        };
      }),
      demand,
      updatedAt: latestEnglishNmSnapshot?.fetched_at ?? latestSourceSnapshot?.fetched_at ?? null,
    });

    await db.card.update({
      where: { id: card.id },
      data: {
        market_score: stats.score,
        market_score_momentum: stats.metrics.momentum,
        market_score_liquidity: stats.metrics.liquidity,
        market_score_demand: stats.metrics.demand,
        market_score_updated_at: new Date(nowIso),
      },
    });
  }

  return candidates.length;
}

export function maybeRunMarketScoreJob(now: Date = new Date()): void {
  if (running) return;
  running = true;

  void runMarketScoreBatch(now)
    .then((processed) => {
      lastBatchSize = processed;
      lastError = null;
    })
    .catch((error: unknown) => {
      lastError = error instanceof Error ? error.message : String(error);
    })
    .finally(() => {
      running = false;
      lastFinishedAt = new Date().toISOString();
    });
}
