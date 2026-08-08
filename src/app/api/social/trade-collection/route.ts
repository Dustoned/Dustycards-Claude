import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCollectionCardMarketValue } from "@/lib/collection";
import { getUsdToEurRate } from "@/lib/exchange-rates";
import { GAME_SEARCH_PARAM, parseVisibleGameFilter, isSpecificTradingCardGame } from "@/lib/games";
import { getServerUserSettings } from "@/lib/user-settings-server";

export const dynamic = "force-dynamic";

// SQLite bounds the number of bound parameters per query; a whole collection
// spans thousands of card ids, so every per-card lookup runs in chunks.
const CARD_ID_CHUNK_SIZE = 400;

export interface TradeCollectionEntry {
  key: string;
  cardId: string;
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
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchLatestUsablePrices(cardIds: string[]): Promise<Map<string, LatestPriceRow>> {
  const priceByCardId = new Map<string, LatestPriceRow>();
  for (const ids of chunk(cardIds, CARD_ID_CHUNK_SIZE)) {
    const placeholders = ids.map(() => "?").join(", ");
    const rows = await db.$queryRawUnsafe<LatestPriceRow[]>(
      `
      SELECT p.card_id, p.cm_en_lowest_nm, p.cm_de_lowest_nm, p.cm_fr_lowest_nm,
             p.cm_es_lowest_nm, p.cm_it_lowest_nm, p.cm_jp_lowest_nm
      FROM "Price" p
      WHERE p.card_id IN (${placeholders})
        AND p.id = (
          SELECT p2.id
          FROM "Price" p2
          WHERE p2.card_id = p.card_id
            AND p2.cm_en_lowest_nm > 0
            AND p2.cm_en_lowest_nm <> 9001
          ORDER BY p2.fetched_at DESC, p2.id DESC
          LIMIT 1
        )
      `,
      ...ids
    );
    for (const row of rows) priceByCardId.set(row.card_id, row);
  }
  return priceByCardId;
}

// The manual compare picker's "From collection" source: every unsold owned
// card, with raw copies grouped per card and each graded slab as its own
// selectable entry carrying its graded market value.
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const settings = await getServerUserSettings(user.id);
    const game = parseVisibleGameFilter(req.nextUrl.searchParams.get(GAME_SEARCH_PARAM), {
      onePieceEnabled: settings.onePieceLibraryEnabled,
    });

    const items = await db.collectionCard.findMany({
      where: {
        user_id: user.id,
        sold_at: null,
        ...(isSpecificTradingCardGame(game) ? { card: { game } } : {}),
      },
      select: {
        id: true,
        grading_company: true,
        grading_grade: true,
        card: {
          select: {
            id: true,
            name: true,
            card_number: true,
            image_url: true,
            episode: { select: { name: true, code: true } },
          },
        },
      },
    });

    const cardIds = [...new Set(items.map((item) => item.card.id))];
    const gradedCardIds = [
      ...new Set(
        items
          .filter((item) => item.grading_company && item.grading_grade)
          .map((item) => item.card.id)
      ),
    ];

    const priceByCardId = await fetchLatestUsablePrices(cardIds);
    const gradedPricesByCardId = new Map<string, Array<{ label: string; price: number }>>();
    const ebaySoldByCardId = new Map<
      string,
      Array<{ label: string; company: string; grade: string; median_price: number; currency: string }>
    >();
    for (const ids of chunk(gradedCardIds, CARD_ID_CHUNK_SIZE)) {
      const [gradedRows, ebayRows] = await Promise.all([
        db.cardGradedPrice.findMany({
          where: { card_id: { in: ids } },
          select: { card_id: true, label: true, price: true },
        }),
        db.cardEbaySoldGradedPrice.findMany({
          where: { card_id: { in: ids } },
          select: {
            card_id: true,
            label: true,
            company: true,
            grade: true,
            median_price: true,
            currency: true,
          },
        }),
      ]);
      for (const row of gradedRows) {
        const list = gradedPricesByCardId.get(row.card_id) ?? [];
        list.push({ label: row.label, price: row.price });
        gradedPricesByCardId.set(row.card_id, list);
      }
      for (const row of ebayRows) {
        const list = ebaySoldByCardId.get(row.card_id) ?? [];
        list.push({
          label: row.label,
          company: row.company,
          grade: row.grade,
          median_price: row.median_price,
          currency: row.currency,
        });
        ebaySoldByCardId.set(row.card_id, list);
      }
    }

    const needsUsdRate = [...ebaySoldByCardId.values()].some((rows) =>
      rows.some((price) => price.currency.toUpperCase() === "USD")
    );
    const usdToEurRate = needsUsdRate ? await getUsdToEurRate().catch(() => null) : null;

    const rawByCardId = new Map<string, TradeCollectionEntry>();
    const gradedEntries: TradeCollectionEntry[] = [];

    for (const item of items) {
      const card = item.card;
      const priceRow = priceByCardId.get(card.id);
      const isGraded = Boolean(item.grading_company && item.grading_grade);
      const value = getCollectionCardMarketValue(
        {
          prices: priceRow ? [priceRow] : [],
          gradedPrices: gradedPricesByCardId.get(card.id) ?? [],
          ebaySoldGradedPrices: ebaySoldByCardId.get(card.id) ?? [],
        },
        {
          gradingCompany: item.grading_company,
          gradingGrade: item.grading_grade,
          usdToEurRate,
        }
      );

      if (isGraded) {
        gradedEntries.push({
          key: `graded:${item.id}`,
          cardId: card.id,
          name: card.name,
          cardNumber: card.card_number,
          episodeName: card.episode.name,
          episodeCode: card.episode.code,
          imageUrl: card.image_url,
          value,
          availableCopies: 1,
          gradedLabel: `${item.grading_company} ${item.grading_grade}`,
        });
        continue;
      }

      const existing = rawByCardId.get(card.id);
      if (existing) {
        existing.availableCopies += 1;
        continue;
      }
      rawByCardId.set(card.id, {
        key: `raw:${card.id}`,
        cardId: card.id,
        name: card.name,
        cardNumber: card.card_number,
        episodeName: card.episode.name,
        episodeCode: card.episode.code,
        imageUrl: card.image_url,
        value,
        availableCopies: 1,
        gradedLabel: null,
      });
    }

    const entries = [...rawByCardId.values(), ...gradedEntries].sort(
      (left, right) =>
        (right.value ?? -1) - (left.value ?? -1) ||
        left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
    );

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("[trade-collection]", error);
    return (
      authErrorResponse(error) ??
      NextResponse.json({ error: "Could not load your collection for trading" }, { status: 500 })
    );
  }
}
