import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { getCardQuickActionMap } from "@/lib/card-quick-actions-server";
import { compressedJsonResponse } from "@/lib/compressed-json-response";
import { parseVisibleGameFilter } from "@/lib/games";
import { getSharedSignalRadarFeedData } from "@/lib/signal-radar-feed-server";
import { getServerUserSettings } from "@/lib/user-settings-server";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const settings = await getServerUserSettings(user.id);
    const game = parseVisibleGameFilter(request.nextUrl.searchParams.get("game"), {
      onePieceEnabled: settings.onePieceLibraryEnabled,
    });
    const data = await getSharedSignalRadarFeedData({
      gameFilter: game,
      episodeId: request.nextUrl.searchParams.get("set")?.trim() || null,
    });
    const cardQuickActions = await getCardQuickActionMap(
      user.id,
      [
        ...data.signals.map((signal) => signal.cardId),
        ...(data.newReleaseChases?.cards.map((card) => card.cardId) ?? []),
      ]
    );

    return compressedJsonResponse(
      request,
      {
        signals: data.signals,
        cardQuickActions,
        newReleaseChases: data.newReleaseChases,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
          Vary: "Cookie",
        },
      }
    );
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json({ error: "Failed to load Signal Radar feed" }, { status: 500 })
    );
  }
}
