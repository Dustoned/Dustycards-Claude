import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  runSealedSync: vi.fn(),
  runSealedHistoryTopUpSync: vi.fn(),
  getTcggoUsageSnapshot: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    syncLog: {
      findFirst: mocks.findFirst,
    },
  },
}));

vi.mock("@/lib/sync", () => ({
  runSealedSync: mocks.runSealedSync,
  runSealedHistoryTopUpSync: mocks.runSealedHistoryTopUpSync,
}));

vi.mock("@/lib/tcggo-usage", () => ({
  getTcggoUsageSnapshot: mocks.getTcggoUsageSnapshot,
}));

import {
  AUTOMATIC_SEALED_SYNC_QUOTA_RESERVE,
  maybeStartSealedSyncJob,
} from "@/lib/sync/sealed-sync-job";

describe("automatic sealed sync quota policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue(null);
    mocks.runSealedSync.mockResolvedValue({
      synced: 0,
      products: 0,
      quotaExceeded: false,
    });
    mocks.getTcggoUsageSnapshot.mockResolvedValue({
      requestsRemaining: AUTOMATIC_SEALED_SYNC_QUOTA_RESERVE,
    });
  });

  it("keeps the reserved requests available for card prices and manual refreshes", async () => {
    const result = await maybeStartSealedSyncJob({
      skip: false,
      requestsRemaining: AUTOMATIC_SEALED_SYNC_QUOTA_RESERVE,
      now: new Date("2026-07-29T01:00:00.000Z"),
    });

    expect(result).toMatchObject({
      started: false,
      due: true,
      skippedReason: "quota-reserve",
    });
    expect(mocks.runSealedSync).not.toHaveBeenCalled();
  });

  it("passes the same hard reserve into a scheduled sealed run", async () => {
    const result = await maybeStartSealedSyncJob({
      skip: false,
      requestsRemaining: AUTOMATIC_SEALED_SYNC_QUOTA_RESERVE + 1,
      now: new Date("2026-07-29T01:00:00.000Z"),
    });

    expect(result.started).toBe(true);
    expect(mocks.runSealedSync).toHaveBeenCalledWith({
      minimumRequestsRemaining: AUTOMATIC_SEALED_SYNC_QUOTA_RESERVE,
    });
  });
});
