import { db } from "@/lib/db";
import { areScraperRequestsDisabled } from "@/lib/scraper-guard";
import {
  countSealedHistoryTopUpCandidates,
  runSealedHistoryTopUpSync,
} from "@/lib/sync";
import {
  getTcggoUsageSnapshot,
  type TcggoUsageSnapshot,
} from "@/lib/tcggo-usage";
import { startCardHistorySyncJob } from "@/lib/sync/card-history-job";

const AUTO_CARD_HISTORY_QUOTA_DRAIN_WINDOW_MS = 1000 * 60 * 60 * 2;
const AUTO_CARD_HISTORY_QUOTA_DRAIN_MIN_REMAINING_REQUESTS = 1;
const AUTO_SEALED_HISTORY_DRAIN_MAX_PRODUCTS = 400;
const SEALED_HISTORY_TOPUP_SYNC_TYPE = "sealed-history-topup";

export function isCardHistoryQuotaDrainWindow(
  usage: Pick<
    TcggoUsageSnapshot,
    "hasLiveWindow" | "quotaResetsAt" | "requestsRemaining"
  >,
  now = new Date()
): boolean {
  if (!usage.hasLiveWindow || !usage.quotaResetsAt) {
    return false;
  }

  if (
    usage.requestsRemaining != null &&
    usage.requestsRemaining < AUTO_CARD_HISTORY_QUOTA_DRAIN_MIN_REMAINING_REQUESTS
  ) {
    return false;
  }

  // Only the 2-hour wind-down before the daily reset. The old "ample quota"
  // shortcut made the drain fire right after the morning reset and empty the
  // whole day's budget before anything else could use it. The wind-down alone
  // still spends the full leftover (the rate limit allows 300 requests/min),
  // so nothing of the subscription is wasted.
  const msUntilReset = usage.quotaResetsAt.getTime() - now.getTime();
  return msUntilReset > 0 && msUntilReset <= AUTO_CARD_HISTORY_QUOTA_DRAIN_WINDOW_MS;
}

export async function maybeStartCardHistoryQuotaDrainJob(options?: {
  skip?: boolean;
}): Promise<{
  started: boolean;
  running: boolean;
  pendingCards: number;
  startedAt: string | null;
}> {
  if (options?.skip || areScraperRequestsDisabled()) {
    return {
      started: false,
      running: false,
      pendingCards: 0,
      startedAt: null,
    };
  }

  const usage = await getTcggoUsageSnapshot();
  if (!isCardHistoryQuotaDrainWindow(usage)) {
    return {
      started: false,
      running: false,
      pendingCards: 0,
      startedAt: null,
    };
  }

  // Card history drains first. If there are no card candidates, the same
  // end-of-window lane uses the leftover quota for sealed history instead.
  const cardHistory = await startCardHistorySyncJob({
    stopAtQuotaReset: usage.quotaResetsAt,
  });
  if (cardHistory.pendingCards > 0 || cardHistory.running || cardHistory.started) {
    return cardHistory;
  }

  const [pendingSealedProducts, activeSealedHistory] = await Promise.all([
    countSealedHistoryTopUpCandidates(),
    db.syncLog.findFirst({
      where: { type: SEALED_HISTORY_TOPUP_SYNC_TYPE, status: "running" },
      orderBy: { started_at: "desc" },
      select: { started_at: true },
    }),
  ]);

  if (activeSealedHistory) {
    return {
      started: false,
      running: true,
      pendingCards: 0,
      startedAt: activeSealedHistory.started_at.toISOString(),
    };
  }

  if (pendingSealedProducts === 0) {
    return cardHistory;
  }

  const maxProducts = Math.min(
    AUTO_SEALED_HISTORY_DRAIN_MAX_PRODUCTS,
    pendingSealedProducts,
    usage.requestsRemaining ?? AUTO_SEALED_HISTORY_DRAIN_MAX_PRODUCTS
  );
  if (maxProducts <= 0) {
    return cardHistory;
  }

  const startedAt = new Date();
  void runSealedHistoryTopUpSync({
    maxProducts,
    stopAtQuotaReset: usage.quotaResetsAt,
  }).catch((error: unknown) => {
    console.error(
      "[history-auto-drain] scheduled sealed history sync failed:",
      error instanceof Error ? error.message : String(error)
    );
  });

  return {
    started: true,
    running: true,
    pendingCards: 0,
    startedAt: startedAt.toISOString(),
  };
}
