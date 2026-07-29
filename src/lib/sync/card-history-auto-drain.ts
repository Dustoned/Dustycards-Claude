import { areScraperRequestsDisabled } from "@/lib/scraper-guard";
import {
  getTcggoUsageSnapshot,
  type TcggoUsageSnapshot,
} from "@/lib/tcggo-usage";
import { startCardHistorySyncJob } from "@/lib/sync/card-history-job";

const AUTO_CARD_HISTORY_QUOTA_DRAIN_WINDOW_MS = 1000 * 60 * 60 * 2;
const AUTO_CARD_HISTORY_QUOTA_DRAIN_MIN_REMAINING_REQUESTS = 1;

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

  // The drain exists precisely to spend the full daily budget on history:
  // no reserve here. The Settings "History import" panel shows what it is
  // backfilling, so the usage is visible instead of mysterious. The job stops
  // at the reset moment so it never rolls into the fresh budget.
  return startCardHistorySyncJob({ stopAtQuotaReset: usage.quotaResetsAt });
}
