import { getCollectionCardMarketValue, getCollectionSealedMarketValue } from "@/lib/collection";
import { db } from "@/lib/db";
import { getUsdToEurRate } from "@/lib/exchange-rates";
import { isSpecificTradingCardGame, type TradingCardGameFilter } from "@/lib/games";

const CARD_ID_CHUNK_SIZE = 400;

export interface TradeCollectionEntry {
  key: string;
  kind: "card" | "sealed";
  cardId: string | null;
  productId: string | null;
  name: string;
  cardNumber: string | null;
  episodeName: string;
  episodeCode: string | null;
  imageUrl: string | null;
  value: number | null;
  availableCopies: number;
  gradedLabel: string | null;
}

interface LatestPriceRow {
  card_id: string;
  cm_en_lowest_nm: number | null;
  cm_de_lowest_nm: number | null;
  cm_fr_lowest_nm: number | null;
  cm_es_lowest_nm: number | null;
  cm_it_lowest_nm: number | null;
  cm_jp_lowest_nm: number | null;
}

function chunk<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function fetchLatestUsablePrices(cardIds: string[]): Promise<Map<string, LatestPriceRow>> {
  const byCardId = new Map<string, LatestPriceRow>();
  for (const ids of chunk(cardIds, CARD_ID_CHUNK_SIZE)) {
    const placeholders = ids.map(() => "?").join(", ");
    const rows = await db.$queryRawUnsafe<LatestPriceRow[]>(
      `SELECT p.card_id, p.cm_en_lowest_nm, p.cm_de_lowest_nm, p.cm_fr_lowest_nm,
              p.cm_es_lowest_nm, p.cm_it_lowest_nm, p.cm_jp_lowest_nm
         FROM "Price" p
        WHERE p.card_id IN (${placeholders})
          AND p.id = (
            SELECT p2.id FROM "Price" p2
             WHERE p2.card_id = p.card_id
               AND p2.cm_en_lowest_nm > 0 AND p2.cm_en_lowest_nm <> 9001
             ORDER BY p2.fetched_at DESC, p2.id DESC LIMIT 1
          )`,
      ...ids
    );
    for (const row of rows) byCardId.set(row.card_id, row);
  }
  return byCardId;
}

export async function getTradeCollectionEntries(
  userId: string,
  game: TradingCardGameFilter = "all"
): Promise<TradeCollectionEntry[]> {
  const [items, sealedItems] = await Promise.all([
    db.collectionCard.findMany({
      where: {
        user_id: userId,
        sold_at: null,
        OR: [{ binder_id: null }, { binder: { episode_id: null } }],
        ...(isSpecificTradingCardGame(game) ? { card: { game } } : {}),
      },
      select: {
        id: true,
        grading_company: true,
        grading_grade: true,
        card: {
          select: {
            id: true, name: true, card_number: true, image_url: true,
            episode: { select: { name: true, code: true } },
          },
        },
      },
    }),
    db.collectionSealed.findMany({
      where: {
        user_id: userId,
        ...(isSpecificTradingCardGame(game) ? { product: { game } } : {}),
      },
      select: {
        product_id: true,
        quantity: true,
        product: {
          select: {
            id: true, name: true, image_url: true, cm_lowest: true, cm_lowest_eu: true,
            cm_lowest_de: true, cm_lowest_fr: true, cm_lowest_es: true, cm_lowest_it: true,
            episode: { select: { name: true, code: true } },
          },
        },
      },
    }),
  ]);

  const cardIds = [...new Set(items.map((item) => item.card.id))];
  const gradedCardIds = [...new Set(items.filter((item) => item.grading_company && item.grading_grade).map((item) => item.card.id))];
  const priceByCardId = await fetchLatestUsablePrices(cardIds);
  const gradedPricesByCardId = new Map<string, Array<{ label: string; price: number }>>();
  const ebaySoldByCardId = new Map<string, Array<{ label: string; company: string; grade: string; median_price: number; currency: string }>>();

  for (const ids of chunk(gradedCardIds, CARD_ID_CHUNK_SIZE)) {
    const [gradedRows, ebayRows] = await Promise.all([
      db.cardGradedPrice.findMany({ where: { card_id: { in: ids } }, select: { card_id: true, label: true, price: true } }),
      db.cardEbaySoldGradedPrice.findMany({
        where: { card_id: { in: ids } },
        select: { card_id: true, label: true, company: true, grade: true, median_price: true, currency: true },
      }),
    ]);
    for (const row of gradedRows) {
      const rows = gradedPricesByCardId.get(row.card_id) ?? [];
      rows.push({ label: row.label, price: row.price });
      gradedPricesByCardId.set(row.card_id, rows);
    }
    for (const row of ebayRows) {
      const rows = ebaySoldByCardId.get(row.card_id) ?? [];
      rows.push(row);
      ebaySoldByCardId.set(row.card_id, rows);
    }
  }

  const needsUsdRate = [...ebaySoldByCardId.values()].some((rows) => rows.some((row) => row.currency.toUpperCase() === "USD"));
  const usdToEurRate = needsUsdRate ? await getUsdToEurRate().catch(() => null) : null;
  const rawByCardId = new Map<string, TradeCollectionEntry>();
  const gradedEntries: TradeCollectionEntry[] = [];

  for (const item of items) {
    const { card } = item;
    const priceRow = priceByCardId.get(card.id);
    const isGraded = Boolean(item.grading_company && item.grading_grade);
    const value = getCollectionCardMarketValue(
      {
        prices: priceRow ? [priceRow] : [],
        gradedPrices: gradedPricesByCardId.get(card.id) ?? [],
        ebaySoldGradedPrices: ebaySoldByCardId.get(card.id) ?? [],
      },
      { gradingCompany: item.grading_company, gradingGrade: item.grading_grade, usdToEurRate }
    );
    if (isGraded) {
      gradedEntries.push({
        key: `graded:${item.id}`, kind: "card", cardId: card.id, productId: null,
        name: card.name, cardNumber: card.card_number, episodeName: card.episode.name,
        episodeCode: card.episode.code, imageUrl: card.image_url, value, availableCopies: 1,
        gradedLabel: `${item.grading_company} ${item.grading_grade}`,
      });
    } else {
      const existing = rawByCardId.get(card.id);
      if (existing) existing.availableCopies += 1;
      else rawByCardId.set(card.id, {
        key: `raw:${card.id}`, kind: "card", cardId: card.id, productId: null,
        name: card.name, cardNumber: card.card_number, episodeName: card.episode.name,
        episodeCode: card.episode.code, imageUrl: card.image_url, value, availableCopies: 1,
        gradedLabel: null,
      });
    }
  }

  const sealedByProductId = new Map<string, TradeCollectionEntry>();
  for (const item of sealedItems) {
    const existing = sealedByProductId.get(item.product_id);
    if (existing) existing.availableCopies += item.quantity;
    else sealedByProductId.set(item.product_id, {
      key: `sealed:${item.product_id}`, kind: "sealed", cardId: null, productId: item.product_id,
      name: item.product.name, cardNumber: null, episodeName: item.product.episode.name,
      episodeCode: item.product.episode.code, imageUrl: item.product.image_url,
      value: getCollectionSealedMarketValue(item.product), availableCopies: item.quantity,
      gradedLabel: null,
    });
  }

  return [...rawByCardId.values(), ...gradedEntries, ...sealedByProductId.values()].sort(
    (left, right) => (right.value ?? -1) - (left.value ?? -1) || left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
  );
}
