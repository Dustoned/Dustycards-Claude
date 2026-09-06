import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  runSealedSync: vi.fn(),
  runSealedHistoryTopUpSync: vi.fn(),
  syncEpisodeSealed: vi.fn(),
  episodeFindMany: vi.fn(),
  appSettingFindUnique: vi.fn(),
  appSettingUpsert: vi.fn(),
  getTcggoUsageSnapshot: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    syncLog: {
      findFirst: mocks.findFirst,
    },
    episode: {
      findMany: mocks.episodeFindMany,
    },
    appSetting: {
      findUnique: mocks.appSettingFindUnique,
      upsert: mocks.appSettingUpsert,
    },
  },
}));

vi.mock("@/lib/sync", () => ({
  runSealedSync: mocks.runSealedSync,
  runSealedHistoryTopUpSync: mocks.runSealedHistoryTopUpSync,
  syncEpisodeSealed: mocks.syncEpisodeSealed,
}));

vi.mock("@/lib/tcggo", () => ({
  isTcggoQuotaExceededError: () => false,
}));

vi.mock("@/lib/tcggo-usage", () => ({
  getTcggoUsageSnapshot: mocks.getTcggoUsageSnapshot,
}));

import {
  AUTOMATIC_SEALED_SYNC_QUOTA_RESERVE,
  maybeStartSealedSyncJob,
  maybeSyncJustReleasedSealed,
} from "@/lib/sync/sealed-sync-job";

describe("just-released sealed check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncEpisodeSealed.mockResolvedValue(undefined);
    mocks.appSettingUpsert.mockResolvedValue({});
    mocks.appSettingFindUnique.mockResolvedValue(null);
    mocks.episodeFindMany.mockResolvedValue([
      { id: "one-piece:op17", game: "one-piece", name: "OP17", code: "OP17", release_date: "2026-09-03" },
    ]);
  });

  it("fetches sealed products for a freshly released set of any game and records the check", async () => {
    const now = new Date("2026-09-06T12:00:00.000Z");

    const result = await maybeSyncJustReleasedSealed({
      skip: false,
      requestsRemaining: AUTOMATIC_SEALED_SYNC_QUOTA_RESERVE + 10,
      now,
    });

    expect(result).toMatchObject({ checked: 1, skippedReason: null });
    expect(mocks.syncEpisodeSealed).toHaveBeenCalledWith(
      "one-piece:op17",
      expect.objectContaining({ backfillNativeHistory: false })
    );
    expect(mocks.appSettingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "sealed-release-check" },
        create: expect.objectContaining({
          value: JSON.stringify({ "one-piece:op17": now.toISOString() }),
        }),
      })
    );
  });

  it("does not spend reserved quota on release checks", async () => {
    const result = await maybeSyncJustReleasedSealed({
      skip: false,
      requestsRemaining: AUTOMATIC_SEALED_SYNC_QUOTA_RESERVE,
      now: new Date("2026-09-06T12:00:00.000Z"),
    });

    expect(result).toMatchObject({ checked: 0, skippedReason: "quota-reserve" });
    expect(mocks.syncEpisodeSealed).not.toHaveBeenCalled();
  });

  it("leaves a set alone while its last check is still fresh", async () => {
    mocks.appSettingFindUnique.mockResolvedValue({
      key: "sealed-release-check",
      value: JSON.stringify({ "one-piece:op17": "2026-09-06T09:00:00.000Z" }),
    });

    const result = await maybeSyncJustReleasedSealed({
      skip: false,
      requestsRemaining: AUTOMATIC_SEALED_SYNC_QUOTA_RESERVE + 10,
      now: new Date("2026-09-06T12:00:00.000Z"),
    });

    expect(result).toMatchObject({ checked: 0, skippedReason: null });
    expect(mocks.syncEpisodeSealed).not.toHaveBeenCalled();
  });
});

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

  it("uses the daytime reserve for current sealed work in the final window", async () => {
    const result = await maybeStartSealedSyncJob({
      skip: false,
      requestsRemaining: AUTOMATIC_SEALED_SYNC_QUOTA_RESERVE,
      allowReservedRequests: true,
      now: new Date("2026-07-29T22:30:00.000Z"),
    });

    expect(result.started).toBe(true);
    expect(mocks.runSealedSync).toHaveBeenCalledWith({
      minimumRequestsRemaining: 0,
    });
  });

  it("retries immediately when the stored quota window has rolled over", async () => {
    mocks.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ started_at: new Date("2026-07-29T00:59:00.000Z") });

    const result = await maybeStartSealedSyncJob({
      skip: false,
      requestsRemaining: AUTOMATIC_SEALED_SYNC_QUOTA_RESERVE + 1,
      hasLiveWindow: false,
      now: new Date("2026-07-29T01:00:00.000Z"),
    });

    expect(result.started).toBe(true);
    expect(mocks.runSealedSync).toHaveBeenCalledTimes(1);
  });
});
