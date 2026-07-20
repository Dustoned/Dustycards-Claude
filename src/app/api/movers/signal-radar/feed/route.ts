import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { getCardQuickActionMap } from "@/lib/card-quick-actions-server";
import { compressedJsonResponse } from "@/lib/compressed-json-response";
import { enrichExternalSignalRadarData } from "@/lib/external-signal-intelligence";
import { getExternalSignalRadarPageData } from "@/lib/external-signal-persisted";
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
    // Request rendering and this progressive endpoint both use persisted data;
    // external websites remain exclusively owned by the background scheduler.
    const [persisted, newReleaseChases] = await Promise.all([
      getExternalSignalRadarPageData(game),
      getExpansionChaseRadarData({
        gameFilter: game,
        episodeId: request.nextUrl.searchParams.get("set")?.trim() || null,
      }),
    ]);
    const data = await enrichExternalSignalRadarData(persisted);
    const cardQuickActions = await getCardQuickActionMap(
      user.id,
      [
        ...data.signals.map((signal) => signal.cardId),
        ...(newReleaseChases?.cards.map((card) => card.cardId) ?? []),
      ]
    );

    return compressedJsonResponse(
      request,
      { signals: data.signals, cardQuickActions, newReleaseChases },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json({ error: "Failed to load Signal Radar feed" }, { status: 500 })
    );
  }
}
