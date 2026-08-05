import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { getCachedCollectionOverviewData } from "@/lib/collection-overview-cache";
import { compressedJsonResponse } from "@/lib/compressed-json-response";
import { parseVisibleGameFilter } from "@/lib/games";
import { getServerUserSettings } from "@/lib/user-settings-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const settings = await getServerUserSettings(user.id);
    const game = parseVisibleGameFilter(request.nextUrl.searchParams.get("game"), {
      onePieceEnabled: settings.onePieceLibraryEnabled,
    });
    const historyRange = request.nextUrl.searchParams.get("range") === "all" ? "all" : "year";
    const data = await getCachedCollectionOverviewData({
      userId: user.id,
      activeTab: "overview",
      game,
      deferDetailedRows: true,
      historyRange,
    });

    return compressedJsonResponse(
      request,
      { range: historyRange, points: data.overview.chart },
      {
        headers: {
          "Cache-Control": "private, max-age=300, stale-while-revalidate=86400",
        },
      }
    );
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json({ error: "Failed to load collection value history" }, { status: 500 })
    );
  }
}
