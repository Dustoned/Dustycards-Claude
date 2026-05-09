import { NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { runAutoPriceRefresh, type AutoPriceRefreshResult } from "@/lib/sync";
import { maybeStartCardHistoryQuotaDrainJob } from "@/lib/sync/card-history-auto-drain";
import { getScraperDisabledResponse } from "@/app/api/scraper-disabled-response";
import { getSyncErrorResponse } from "@/app/api/sync-error-response";

function shouldSkipCardHistoryQuotaDrain(result: AutoPriceRefreshResult): boolean {
  const remainingMissingPriceCards = Math.max(
    result.missingPriceCards - result.backfillCards,
    0
  );
  const pausedAfterManualStop =
    result.skipped && result.message.toLowerCase().includes("paused");

  return (
    result.quotaExceeded ||
    pausedAfterManualStop ||
    result.remainingDueCards > 0 ||
    remainingMissingPriceCards > 0
  );
}

export async function POST() {
  const scraperDisabled = getScraperDisabledResponse();
  if (scraperDisabled) return scraperDisabled;

  try {
    await requireAdmin();
    const result = await runAutoPriceRefresh();
    const historyDrain = await maybeStartCardHistoryQuotaDrainJob({
      skip: shouldSkipCardHistoryQuotaDrain(result),
    });

    return NextResponse.json({
      ok: true,
      ...result,
      cardHistoryJobStarted: historyDrain.started,
      cardHistoryJobRunning: historyDrain.running,
      cardHistoryPendingCards: historyDrain.pendingCards,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return getSyncErrorResponse(error);
  }
}
