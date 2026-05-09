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

  return startCardHistorySyncJob();
}
