import { NextRequest, NextResponse } from "next/server";
import { ALL_GAMES } from "@/lib/games";
import { isAuthorizedSchedulerRequest } from "@/lib/scheduler-secret";
import {
  refreshSharedSignalRadarChases,
  refreshSharedSignalRadarSignals,
} from "@/lib/signal-radar-feed-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAuthorizedSchedulerRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  try {
    const [signals, newReleaseChases] = await Promise.all([
      refreshSharedSignalRadarSignals(ALL_GAMES),
      refreshSharedSignalRadarChases({
        gameFilter: ALL_GAMES,
        episodeId: null,
      }),
    ]);

    return NextResponse.json({
      ok: true,
      signals: signals.length,
      chaseCards: newReleaseChases?.cards.length ?? 0,
      generatedAt: newReleaseChases?.generatedAt ?? null,
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
