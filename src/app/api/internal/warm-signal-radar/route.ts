import { NextRequest, NextResponse } from "next/server";
import { ALL_GAMES, ONE_PIECE_GAME, POKEMON_GAME } from "@/lib/games";
import { isAuthorizedSchedulerRequest } from "@/lib/scheduler-secret";
import {
  getSharedSignalRadarFeedData,
} from "@/lib/signal-radar-feed-server";
import { refreshSharedSealedSignalRadarData } from "@/lib/sealed-signal-radar-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAuthorizedSchedulerRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  try {
    // Hydrate the new process from durable snapshots. A deploy must never
    // force the expensive Radar model to recompute while collectors are
    // trying to open the freshly restarted app.
    const { signals, newReleaseChases } = await getSharedSignalRadarFeedData(
      {
        gameFilter: ALL_GAMES,
        episodeId: null,
      },
      { refreshStaleChases: false }
    );
    const sealedItems: Record<string, number> = {};
    for (const gameFilter of [ALL_GAMES, POKEMON_GAME, ONE_PIECE_GAME] as const) {
      const sealedRadar = await refreshSharedSealedSignalRadarData(gameFilter);
      sealedItems[gameFilter] = sealedRadar.items.length;
    }

    return NextResponse.json({
      ok: true,
      signals: signals.length,
      chaseCards: newReleaseChases?.cards.length ?? 0,
      generatedAt: newReleaseChases?.generatedAt ?? null,
      sealedItems,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Signal Radar warm-up failed",
      },
      { status: 500 }
    );
  }
}
