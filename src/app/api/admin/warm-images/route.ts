import { spawn } from "node:child_process";
import { setPriority } from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
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
  episodes: WarmCardImagesResult;
  sealed: WarmCardImagesResult;
  upcoming: WarmCardImagesResult;
} | null = null;
let lastError: string | null = null;
const RESULT_PREFIX = "DUSTYCARDS_IMAGE_WARM_RESULT ";

function runImageWarmWorker(): Promise<NonNullable<typeof lastResult>> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--no-warnings", path.join(process.cwd(), "scripts", "image-cache-warmer-worker.mjs")],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      }
    );
    if (child.pid) {
      try {
        setPriority(child.pid, 10);
      } catch {
        // Priority lowering is best-effort; the worker remains process-isolated.
      }
    }

    let output = "";
    let errorOutput = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output = `${output}${chunk.toString("utf8")}`.slice(-256_000);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      errorOutput = `${errorOutput}${chunk.toString("utf8")}`.slice(-64_000);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(errorOutput.trim() || `Image warm worker exited with code ${code}`));
        return;
      }
      const resultLine = output
        .split(/\r?\n/)
        .findLast((line) => line.startsWith(RESULT_PREFIX));
      if (!resultLine) {
        reject(new Error("Image warm worker finished without a result"));
        return;
      }
      try {
        resolve(JSON.parse(resultLine.slice(RESULT_PREFIX.length)) as NonNullable<typeof lastResult>);
      } catch {
        reject(new Error("Image warm worker returned an invalid result"));
      }
    });
  });
}

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
          episodes: {
            total: lastResult.episodes.total,
            downloaded: lastResult.episodes.downloaded,
            hits: lastResult.episodes.hits,
            failed: lastResult.episodes.failed,
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

    void runImageWarmWorker()
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
