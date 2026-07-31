import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAdmin, requireUser } from "@/lib/auth";
import { getCardQuickActionMap } from "@/lib/card-quick-actions-server";
import { compressedJsonResponse } from "@/lib/compressed-json-response";
import { parseVisibleGameFilter } from "@/lib/games";
import {
  getSharedSignalRadarChases,
  refreshSharedSignalRadarChases,
} from "@/lib/signal-radar-feed-server";
import { getServerUserSettings } from "@/lib/user-settings-server";
import { refreshNewReleaseChasePriceNow } from "@/lib/sync/new-release-chase-price-job";

async function loadChaseRadar(request: NextRequest, userId: string) {
  const settings = await getServerUserSettings(userId);
  const game = parseVisibleGameFilter(request.nextUrl.searchParams.get("game"), {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
  return getSharedSignalRadarChases({
    gameFilter: game,
    episodeId: request.nextUrl.searchParams.get("set")?.trim() || null,
  });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const newReleaseChases = await loadChaseRadar(request, user.id);
    const cardQuickActions = await getCardQuickActionMap(
      user.id,
      newReleaseChases?.cards.map((card) => card.cardId) ?? []
    );

    return compressedJsonResponse(
      request,
      { newReleaseChases, cardQuickActions },
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
      NextResponse.json({ error: "Failed to refresh Chase Watch" }, { status: 500 })
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin();
    const body = (await request.json().catch(() => null)) as { cardId?: unknown } | null;
    const cardId = typeof body?.cardId === "string" ? body.cardId.trim() : "";
    if (!cardId) {
      return NextResponse.json({ ok: false, error: "A card id is required." }, { status: 400 });
    }

    const result = await refreshNewReleaseChasePriceNow(cardId);
    const settings = await getServerUserSettings(user.id);
    const game = parseVisibleGameFilter(request.nextUrl.searchParams.get("game"), {
      onePieceEnabled: settings.onePieceLibraryEnabled,
    });
    const newReleaseChases = await refreshSharedSignalRadarChases({
      gameFilter: game,
      episodeId: request.nextUrl.searchParams.get("set")?.trim() || null,
    });
    const ok = result.status === "updated" || result.status === "confirming";
    return NextResponse.json(
      { ok, result, newReleaseChases },
      {
        status: ok ? 200 : 422,
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Manual price refresh failed" },
        { status: 500 }
      )
    );
  }
}
