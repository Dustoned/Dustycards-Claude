import { NextRequest, NextResponse } from "next/server";
import { loadMoversPageData } from "@/app/movers/page-data";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { getCardQuickActionMap } from "@/lib/card-quick-actions-server";
import { compressedJsonResponse } from "@/lib/compressed-json-response";
import {
  GAME_SEARCH_PARAM,
  parseVisibleGameFilter,
} from "@/lib/games";
import {
  toCollectionMoverBrowserItem,
  type CollectionMoversData,
} from "@/lib/movers";
import { getServerUserSettings } from "@/lib/user-settings-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const settings = await getServerUserSettings(user.id);
    const params = request.nextUrl.searchParams;
    const game = parseVisibleGameFilter(params.get(GAME_SEARCH_PARAM), {
      onePieceEnabled: settings.onePieceLibraryEnabled,
    });
    const scope = params.get("scope");
    if (scope === "sealed" || scope === "value") {
      return NextResponse.json({ error: "Unsupported mover list" }, { status: 400 });
    }

    const result = await loadMoversPageData(
      params.get("source"),
      scope,
      params.get("view"),
      user.id,
      game
    );
    const data = result.data as CollectionMoversData;
    const movers = data.movers.map(toCollectionMoverBrowserItem);
    const cardQuickActions = await getCardQuickActionMap(
      user.id,
      Array.from(new Set(movers.map((item) => item.cardId)))
    );

    return compressedJsonResponse(request, { movers, cardQuickActions }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json({ error: "Could not load market list" }, { status: 500 })
    );
  }
}
