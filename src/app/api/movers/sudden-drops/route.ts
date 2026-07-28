import { NextRequest, NextResponse } from "next/server";
import { normalizeMoversPriceSource } from "@/app/movers/routing";
import { authErrorResponse, requireUser } from "@/lib/auth";
import {
  GAME_SEARCH_PARAM,
  parseVisibleGameFilter,
} from "@/lib/games";
import {
  getFastSealedSuddenDropsData,
  getFastSuddenDropsData,
} from "@/lib/home-sudden-drops-server";
import { getServerUserSettings } from "@/lib/user-settings-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const settings = await getServerUserSettings(user.id);
    const searchParams = request.nextUrl.searchParams;
    const activeGame = parseVisibleGameFilter(searchParams.get(GAME_SEARCH_PARAM), {
      onePieceEnabled: settings.onePieceLibraryEnabled,
    });
    const activePriceSource = normalizeMoversPriceSource(
      searchParams.get("source"),
      settings.primaryPriceSource
    );
    const [data, sealed] = await Promise.all([
      getFastSuddenDropsData(activePriceSource, activeGame),
      getFastSealedSuddenDropsData(activeGame, 12),
    ]);

    return NextResponse.json({
      ...data.preview,
      sealedItems: sealed.items.slice(0, 4).map((item) => ({
        productId: item.productId,
        name: item.name,
        episodeId: item.episodeId,
        episodeName: item.episodeName,
        episodeCode: item.episodeCode,
        currentPrice: item.currentPrice,
        currency: item.currency,
        dropAmount: item.dropAmount,
        dropPercent: item.dropPercent,
      })),
      sealedTotal: sealed.total,
    }, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json({ error: "Could not load sudden drops" }, { status: 500 })
    );
  }
}
