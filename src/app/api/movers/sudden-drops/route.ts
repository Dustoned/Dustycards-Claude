import { NextRequest, NextResponse } from "next/server";
import { normalizeMoversPriceSource } from "@/app/movers/routing";
import { authErrorResponse, requireUser } from "@/lib/auth";
import {
  GAME_SEARCH_PARAM,
  parseVisibleGameFilter,
} from "@/lib/games";
import {
  getCachedHomeSuddenDropsData,
} from "@/lib/home-sudden-drops-cache";
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
    const data = await getCachedHomeSuddenDropsData(activePriceSource, activeGame);

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "private, max-age=300, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json({ error: "Could not load sudden drops" }, { status: 500 })
    );
  }
}
