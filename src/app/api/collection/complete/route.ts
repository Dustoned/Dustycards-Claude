import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { buildCompleteCollectionPayload } from "@/lib/complete-collection-payload";
import { compressedJsonResponse } from "@/lib/compressed-json-response";
import { getCollectionOverviewData } from "@/lib/collection-data";
import { parseVisibleGameFilter } from "@/lib/games";
import { getServerUserSettings } from "@/lib/user-settings-server";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const settings = await getServerUserSettings(user.id);
    const game = parseVisibleGameFilter(request.nextUrl.searchParams.get("game"), {
      onePieceEnabled: settings.onePieceLibraryEnabled,
    });
    const data = await getCollectionOverviewData({
      userId: user.id,
      activeTab: "complete",
      game,
    });

    return compressedJsonResponse(request, buildCompleteCollectionPayload(data), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json({ error: "Failed to load complete collection" }, { status: 500 })
    );
  }
}
