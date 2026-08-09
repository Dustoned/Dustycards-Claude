import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { GAME_SEARCH_PARAM, parseVisibleGameFilter } from "@/lib/games";
import { getTradeCollectionEntries } from "@/lib/trade-collection";
import { getServerUserSettings } from "@/lib/user-settings-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const settings = await getServerUserSettings(user.id);
    const game = parseVisibleGameFilter(req.nextUrl.searchParams.get(GAME_SEARCH_PARAM), {
      onePieceEnabled: settings.onePieceLibraryEnabled,
    });
    return NextResponse.json({ entries: await getTradeCollectionEntries(user.id, game) });
  } catch (error) {
    console.error("[trade-collection]", error);
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "Could not load your collection for trading" },
      { status: 500 }
    );
  }
}
