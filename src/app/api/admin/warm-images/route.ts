import { NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { warmAllImages } from "@/lib/sync/image-warmer";
import type { WarmCardImagesResult } from "@/lib/image-cache-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// One warm pass at a time; the state lives in module scope like the other
// background jobs. Warming is idempotent (cached images are instant HITs),
// so a lost state after a restart is harmless.
let running = false;
let startedAt: string | null = null;
let lastFinishedAt: string | null = null;
let lastResult: {
  cards: WarmCardImagesResult;
  sealed: WarmCardImagesResult;
  upcoming: WarmCardImagesResult;
} | null = null;
let lastError: string | null = null;

function snapshot() {
  return {
    ok: true,
    running,
    startedAt,
    lastFinishedAt,
    lastError,
    lastResult: lastResult
      ? {
          cards: {
            total: lastResult.cards.total,
            downloaded: lastResult.cards.downloaded,
            hits: lastResult.cards.hits,
            failed: lastResult.cards.failed,
          },
          sealed: {
            total: lastResult.sealed.total,
            downloaded: lastResult.sealed.downloaded,
            hits: lastResult.sealed.hits,
            failed: lastResult.sealed.failed,
          },
          upcoming: {
            total: lastResult.upcoming.total,
            downloaded: lastResult.upcoming.downloaded,
            hits: lastResult.upcoming.hits,
            failed: lastResult.upcoming.failed,
          },
        }
      : null,
  };
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(snapshot());
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json({ ok: false, error: "Failed to load warm status" }, { status: 500 })
    );
  }
}

export async function POST() {
  try {
    await requireAdmin();

    if (running) {
      return NextResponse.json({ ...snapshot(), started: false });
    }

    running = true;
    startedAt = new Date().toISOString();
    lastError = null;

    void warmAllImages()
      .then((result) => {
        lastResult = result;
      })
      .catch((error: unknown) => {
        lastError = error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        running = false;
        lastFinishedAt = new Date().toISOString();
      });

    return NextResponse.json({ ...snapshot(), started: true });
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json({ ok: false, error: "Failed to start image warm" }, { status: 500 })
    );
  }
}
