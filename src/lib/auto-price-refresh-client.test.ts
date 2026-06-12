import { describe, expect, it } from "vitest";
import {
  AUTO_PRICE_REFRESH_MAX_CHAINED_FOLLOW_UPS,
  AUTO_PRICE_REFRESH_TAB_LOCK_KEY,
  releaseAutoPriceRefreshTabLock,
  hasQueuedFollowUp,
  hasRefreshProgress,
  hasVisibleRefreshChanges,
  shouldQueueAutoPriceRefreshFollowUp,
  tryAcquireAutoPriceRefreshTabLock,
} from "@/lib/auto-price-refresh-client";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("auto price refresh client follow-up guards", () => {
  it("does not chain quota pauses, skipped runs, or no-progress unavailable batches", () => {
    expect(hasQueuedFollowUp({ quotaExceeded: true, remainingDueCards: 100 })).toBe(false);
    expect(hasQueuedFollowUp({ skipped: true, remainingDueCards: 100 })).toBe(false);
    expect(
      hasQueuedFollowUp({
        selectedCards: 50,
        dueCards: 100,
        remainingDueCards: 50,
        newPrices: 0,
        refreshedPrices: 0,
        updatedCards: 0,
      })
    ).toBe(false);
  });

  it("chains only when a batch made real progress and backlog remains", () => {
    const response = {
      dueCards: 100,
      selectedCards: 50,
      remainingDueCards: 50,
      refreshedPrices: 50,
    };

    expect(hasRefreshProgress(response)).toBe(true);
    expect(hasQueuedFollowUp(response)).toBe(true);
  });

  it("refreshes the UI when the quota-drain history job starts server-side", () => {
    expect(hasVisibleRefreshChanges({ cardHistoryJobStarted: true })).toBe(true);
    expect(hasVisibleRefreshChanges({ cardHistoryJobRunning: true })).toBe(true);
  });

  it("refreshes the UI when the auto price job starts server-side", () => {
    expect(hasVisibleRefreshChanges({ autoJobStarted: true })).toBe(true);
    expect(hasVisibleRefreshChanges({ autoJobRunning: true })).toBe(true);
  });

  it("refreshes the UI when submitted cards get CardMarket snapshots", () => {
    expect(hasVisibleRefreshChanges({ submittedCardsRefreshed: 1 })).toBe(true);
  });

  it("caps forced follow-up chains per browser session", () => {
    expect(
      shouldQueueAutoPriceRefreshFollowUp(
        { dueCards: 100, selectedCards: 50, remainingDueCards: 50, refreshedPrices: 50 },
        AUTO_PRICE_REFRESH_MAX_CHAINED_FOLLOW_UPS
      )
    ).toBe(false);
  });

  it("allows only one browser tab to own the auto-refresh lock until it expires", () => {
    const storage = new MemoryStorage();

    expect(tryAcquireAutoPriceRefreshTabLock(storage, "tab-a", 1_000, 10_000)).toBe(true);
    expect(tryAcquireAutoPriceRefreshTabLock(storage, "tab-b", 2_000, 10_000)).toBe(false);
    expect(tryAcquireAutoPriceRefreshTabLock(storage, "tab-b", 12_000, 10_000)).toBe(true);
  });

  it("does not let a different tab release the active lock", () => {
    const storage = new MemoryStorage();

    expect(tryAcquireAutoPriceRefreshTabLock(storage, "tab-a", 1_000, 10_000)).toBe(true);
    releaseAutoPriceRefreshTabLock(storage, "tab-b");
    expect(storage.getItem(AUTO_PRICE_REFRESH_TAB_LOCK_KEY)).not.toBeNull();
    releaseAutoPriceRefreshTabLock(storage, "tab-a");
    expect(storage.getItem(AUTO_PRICE_REFRESH_TAB_LOCK_KEY)).toBeNull();
  });
});
