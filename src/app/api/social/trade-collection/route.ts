import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCollectionCardMarketValue } from "@/lib/collection";
import { getUsdToEurRate } from "@/lib/exchange-rates";
import { GAME_SEARCH_PARAM, parseVisibleGameFilter, isSpecificTradingCardGame } from "@/lib/games";
import { getServerUserSettings } from "@/lib/user-settings-server";

export const dynamic = "force-dynamic";

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
            prices: {
              where: { cm_en_lowest_nm: { gt: 0, not: 9001 } },
              orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
              take: 1,
              select: {
                cm_en_lowest_nm: true,
                cm_de_lowest_nm: true,
                cm_fr_lowest_nm: true,
                cm_es_lowest_nm: true,
                cm_it_lowest_nm: true,
                cm_jp_lowest_nm: true,
              },
            },
            gradedPrices: { select: { label: true, price: true } },
            ebaySoldGradedPrices: {
              select: {
                label: true,
                company: true,
                grade: true,
                median_price: true,
                currency: true,
              },
            },
          },
        },
      },
    });

    const needsUsdRate = items.some((item) =>
      item.card.ebaySoldGradedPrices.some((price) => price.currency.toUpperCase() === "USD")
    );
    const usdToEurRate = needsUsdRate ? await getUsdToEurRate().catch(() => null) : null;

    const rawByCardId = new Map<string, TradeCollectionEntry>();
    const gradedEntries: TradeCollectionEntry[] = [];

    for (const item of items) {
      const card = item.card;
      const isGraded = Boolean(item.grading_company && item.grading_grade);
      const value = getCollectionCardMarketValue(card, {
        gradingCompany: item.grading_company,
        gradingGrade: item.grading_grade,
        usdToEurRate,
      });

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
    return (
      authErrorResponse(error) ??
      NextResponse.json({ error: "Could not load your collection for trading" }, { status: 500 })
    );
  }
}
