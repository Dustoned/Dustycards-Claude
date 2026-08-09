import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { ACTIVE_COLLECTION_CARD_FILTER } from "@/lib/collection-data";
import { getCachedCollectionOverviewData } from "@/lib/collection-overview-cache";
import { compressedJsonResponse } from "@/lib/compressed-json-response";
import { db } from "@/lib/db";
import {
  isSpecificTradingCardGame,
  ONE_PIECE_GAME,
  parseVisibleGameFilter,
  POKEMON_GAME,
  type TradingCardGame,
  type TradingCardGameFilter,
} from "@/lib/games";
import {
  buildHomeOverviewInsights,
  buildForSalePreview,
  type HomeCardListPreview,
} from "@/lib/home-overview-insights";
import {
  readMoversSnapshot,
  SHARED_MOVERS_SNAPSHOT_USER_ID,
} from "@/lib/movers-snapshot-store";
import { getUpcomingSealedReleases } from "@/lib/sealed-movers";
import { readSignalRadarSnapshot } from "@/lib/signal-radar-snapshot-store";
import type { PriceSource } from "@/lib/user-settings";
import { getServerUserSettings } from "@/lib/user-settings-server";

function validPrice(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 && value !== 9001
    ? value
    : null;
}

async function getHomeWantsPreview(
  userId: string,
  game: TradingCardGameFilter,
  source: PriceSource
): Promise<HomeCardListPreview> {
  const where = {
    user_id: userId,
    dismissed_at: null,
    card: {
      ...(isSpecificTradingCardGame(game) ? { game } : {}),
      collectionItems: {
        none: { user_id: userId, ...ACTIVE_COLLECTION_CARD_FILTER },
      },
    },
  } as const;
  const [total, rows] = await Promise.all([
    db.collectionWant.count({ where }),
    db.collectionWant.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: 24,
      select: {
        card: {
          select: {
            id: true,
            name: true,
            image_url: true,
            card_number: true,
            printed_card_number: true,
            episode: { select: { name: true, code: true } },
            prices: {
              orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
              take: 1,
              select: { cm_en_lowest_nm: true, tcp_market: true },
            },
          },
        },
      },
    }),
  ]);

  return {
    total,
    totalValue: null,
    items: rows.map(({ card }) => {
      const latest = card.prices[0];
      const isTcgPlayer = source === "tcp";
      return {
        cardId: card.id,
        name: card.name,
        cardNumber: card.printed_card_number ?? card.card_number,
        episodeName: card.episode.name,
        episodeCode: card.episode.code,
        imageUrl: card.image_url,
        price: validPrice(isTcgPlayer ? latest?.tcp_market : latest?.cm_en_lowest_nm),
        currency: isTcgPlayer ? "USD" as const : "EUR" as const,
      };
    }),
  };
}

async function getHomeUpcoming(game: TradingCardGameFilter) {
  const games: TradingCardGame[] = isSpecificTradingCardGame(game)
    ? [game]
    : [POKEMON_GAME, ONE_PIECE_GAME];
  const releases = (await Promise.all(games.map(getUpcomingSealedReleases))).flat();
  return releases
    .filter((release) => release.daysSinceRelease == null)
    .sort((left, right) => left.releaseDate.localeCompare(right.releaseDate))
    .slice(0, 24);
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const settings = await getServerUserSettings(user.id);
    const game = parseVisibleGameFilter(request.nextUrl.searchParams.get("game"), {
      onePieceEnabled: settings.onePieceLibraryEnabled,
    });
    const [data, sellingData, moversSnapshot, radarSnapshot, wants, upcoming] = await Promise.all([
      getCachedCollectionOverviewData({
        userId: user.id,
        activeTab: "overview",
        game,
      }),
      getCachedCollectionOverviewData({
        userId: user.id,
        activeTab: "selling",
        game,
      }),
      readMoversSnapshot({
        userId: SHARED_MOVERS_SNAPSHOT_USER_ID,
        game,
        source: settings.primaryPriceSource,
        scope: "all",
        itemScope: "all",
      }),
      readSignalRadarSnapshot(game),
      getHomeWantsPreview(user.id, game, settings.primaryPriceSource).catch(() => ({
        total: 0,
        totalValue: null,
        items: [],
      })),
      getHomeUpcoming(game).catch(() => []),
    ]);

    return compressedJsonResponse(request, buildHomeOverviewInsights(data, {
      movers: moversSnapshot?.data.movers ?? [],
      radarSignals: radarSnapshot?.data.signals ?? [],
      wants,
      forSale: buildForSalePreview(sellingData),
      upcoming,
    }), {
      headers: {
        "Cache-Control": "private, max-age=300, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json({ error: "Failed to load collection insights" }, { status: 500 })
    );
  }
}
