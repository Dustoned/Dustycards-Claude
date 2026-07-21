import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { compressedJsonResponse } from "@/lib/compressed-json-response";
import { getExpansionChaseRadarData } from "@/lib/expansion-chase-radar";
import { parseVisibleGameFilter } from "@/lib/games";
import { getServerUserSettings } from "@/lib/user-settings-server";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const settings = await getServerUserSettings(user.id);
    const game = parseVisibleGameFilter(request.nextUrl.searchParams.get("game"), {
      onePieceEnabled: settings.onePieceLibraryEnabled,
    });
    const newReleaseChases = await getExpansionChaseRadarData({
      gameFilter: game,
      episodeId: request.nextUrl.searchParams.get("set")?.trim() || null,
    });

    return compressedJsonResponse(
      request,
      { newReleaseChases },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json({ error: "Failed to refresh Chase Watch" }, { status: 500 })
    );
  }
}
