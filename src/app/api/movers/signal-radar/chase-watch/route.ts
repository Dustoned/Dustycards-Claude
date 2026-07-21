import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAdmin, requireUser } from "@/lib/auth";
import { compressedJsonResponse } from "@/lib/compressed-json-response";
import { getExpansionChaseRadarData } from "@/lib/expansion-chase-radar";
import { parseVisibleGameFilter } from "@/lib/games";
import { getServerUserSettings } from "@/lib/user-settings-server";
import { refreshNewReleaseChasePriceNow } from "@/lib/sync/new-release-chase-price-job";

async function loadChaseRadar(request: NextRequest, userId: string) {
  const settings = await getServerUserSettings(userId);
  const game = parseVisibleGameFilter(request.nextUrl.searchParams.get("game"), {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
  return getExpansionChaseRadarData({
    gameFilter: game,
    episodeId: request.nextUrl.searchParams.get("set")?.trim() || null,
  });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const newReleaseChases = await loadChaseRadar(request, user.id);

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

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin();
    const body = (await request.json().catch(() => null)) as { cardId?: unknown } | null;
    const cardId = typeof body?.cardId === "string" ? body.cardId.trim() : "";
    if (!cardId) {
      return NextResponse.json({ ok: false, error: "A card id is required." }, { status: 400 });
    }

    const result = await refreshNewReleaseChasePriceNow(cardId);
    const newReleaseChases = await loadChaseRadar(request, user.id);
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
