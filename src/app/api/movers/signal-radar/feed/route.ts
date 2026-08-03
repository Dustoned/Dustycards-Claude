import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { getCardQuickActionMap } from "@/lib/card-quick-actions-server";
import { compressedJsonResponse } from "@/lib/compressed-json-response";
import { parseVisibleGameFilter } from "@/lib/games";
import { getSharedSignalRadarSignals } from "@/lib/signal-radar-feed-server";
import { getServerUserSettings } from "@/lib/user-settings-server";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const settings = await getServerUserSettings(user.id);
    const game = parseVisibleGameFilter(request.nextUrl.searchParams.get("game"), {
      onePieceEnabled: settings.onePieceLibraryEnabled,
    });
    const signals = await getSharedSignalRadarSignals(game);
    const cardQuickActions = await getCardQuickActionMap(
      user.id,
      signals.map((signal) => signal.cardId)
    );

    return compressedJsonResponse(
      request,
      {
        signals,
        cardQuickActions,
        newReleaseChases: null,
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
