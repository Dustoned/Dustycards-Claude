import { NextResponse } from "next/server";
import { isScraperRequestsDisabledError } from "@/lib/scraper-guard";
import { SyncCancelledError, SyncConflictError } from "@/lib/sync";
import { getTcggoRequestRuntimeSnapshot, isTcggoQuotaExceededError } from "@/lib/tcggo";

export function getSyncErrorResponse(error: unknown) {
  if (error instanceof SyncCancelledError) {
    return NextResponse.json(
      {
        ok: false,
        cancelled: true,
        error: error.message,
      },
      { status: 409 }
    );
  }

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

  if (isTcggoQuotaExceededError(error)) {
    const quota = getTcggoRequestRuntimeSnapshot();
    return NextResponse.json(
      {
        ok: false,
        quotaExceeded: true,
        error: error.message,
        requestsRemaining: quota.requestsRemaining,
        requestConcurrency: quota.requestConcurrency,
      },
      { status: 429 }
    );
  }

  if (isScraperRequestsDisabledError(error)) {
    return NextResponse.json(
      {
        ok: false,
        skipped: true,
        scraperDisabled: true,
        error: error.message,
      },
      { status: 503 }
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}
