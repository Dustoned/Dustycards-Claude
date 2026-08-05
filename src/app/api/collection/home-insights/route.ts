import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { getCachedCollectionOverviewData } from "@/lib/collection-overview-cache";
import { compressedJsonResponse } from "@/lib/compressed-json-response";
import { parseVisibleGameFilter } from "@/lib/games";
import { buildHomeOverviewInsights } from "@/lib/home-overview-insights";
import { getServerUserSettings } from "@/lib/user-settings-server";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const settings = await getServerUserSettings(user.id);
    const game = parseVisibleGameFilter(request.nextUrl.searchParams.get("game"), {
      onePieceEnabled: settings.onePieceLibraryEnabled,
    });
    const data = await getCachedCollectionOverviewData({
      userId: user.id,
      activeTab: "overview",
      game,
    });

    return compressedJsonResponse(request, buildHomeOverviewInsights(data), {
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
