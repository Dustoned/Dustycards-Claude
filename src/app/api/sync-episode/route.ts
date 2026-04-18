import { NextRequest, NextResponse } from "next/server";
import { SyncConflictError, runEpisodeSync } from "@/lib/sync";

export async function POST(request: NextRequest) {
  const { episodeId } = await request.json();
  if (!episodeId) {
    return NextResponse.json({ ok: false, error: "episodeId required" }, { status: 400 });
  }

  try {
    const result = await runEpisodeSync(String(episodeId));
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof SyncConflictError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          activeType: error.activeType,
          startedAt: error.startedAt.toISOString(),
        },
        { status: 409 }
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
