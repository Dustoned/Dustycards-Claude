import { areScraperRequestsDisabled } from "@/lib/scraper-guard";
import {
  getTcggoUsageSnapshot,
  type TcggoUsageSnapshot,
} from "@/lib/tcggo-usage";
import { startCardHistorySyncJob } from "@/lib/sync/card-history-job";

const AUTO_CARD_HISTORY_QUOTA_DRAIN_WINDOW_MS = 1000 * 60 * 60 * 2;
const AUTO_CARD_HISTORY_QUOTA_DRAIN_MIN_REMAINING_REQUESTS = 1;
// When the daily quota is mostly untouched, card history can drain during the
// day too (price refresh is cheap — a full catalog pass is ~300 of 3000/day),
// instead of only in the 2h wind-down before the reset. This keeps card history
// from lagging behind when new cards/sets appear.
const AUTO_CARD_HISTORY_AMPLE_QUOTA_REQUESTS = 800;
// Outside the wind-down window the drain keeps this many requests untouched,
// so manual syncs (eBay graded prices, card refreshes, sealed passes) always
// have room. In the final stretch before the daily reset the leftover quota
// is use-it-or-lose-it and may still drain to zero as before.
export const CARD_HISTORY_DRAIN_QUOTA_RESERVE = 500;

export function isCardHistoryQuotaWindDownWindow(
  usage: Pick<TcggoUsageSnapshot, "hasLiveWindow" | "quotaResetsAt">,
  now = new Date()
): boolean {
  if (!usage.hasLiveWindow || !usage.quotaResetsAt) {
    return false;
  }

  const msUntilReset = usage.quotaResetsAt.getTime() - now.getTime();
  return msUntilReset > 0 && msUntilReset <= AUTO_CARD_HISTORY_QUOTA_DRAIN_WINDOW_MS;
}

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

  // Plenty of quota to spare: drain now rather than waiting for the reset window.
  if (
    usage.requestsRemaining != null &&
    usage.requestsRemaining >= AUTO_CARD_HISTORY_AMPLE_QUOTA_REQUESTS
  ) {
    return true;
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

  const windDown = isCardHistoryQuotaWindDownWindow(usage);
  return startCardHistorySyncJob({
    stopAtRequestsRemaining: windDown ? null : CARD_HISTORY_DRAIN_QUOTA_RESERVE,
  });
}
