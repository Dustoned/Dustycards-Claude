import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTcggoUsageSnapshot: vi.fn(),
  startCardHistorySyncJob: vi.fn(),
  countSealedHistoryTopUpCandidates: vi.fn(),
  runSealedHistoryTopUpSync: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { syncLog: { findFirst: mocks.findFirst } },
}));

vi.mock("@/lib/scraper-guard", () => ({
  areScraperRequestsDisabled: vi.fn(() => false),
}));

vi.mock("@/lib/tcggo-usage", () => ({
  getTcggoUsageSnapshot: mocks.getTcggoUsageSnapshot,
}));

vi.mock("@/lib/sync/card-history-job", () => ({
  startCardHistorySyncJob: mocks.startCardHistorySyncJob,
}));

vi.mock("@/lib/sync", () => ({
  countSealedHistoryTopUpCandidates: mocks.countSealedHistoryTopUpCandidates,
  runSealedHistoryTopUpSync: mocks.runSealedHistoryTopUpSync,
}));

import {
  isCardHistoryQuotaDrainWindow,
  maybeStartCardHistoryQuotaDrainJob,
} from "@/lib/sync/card-history-auto-drain";

describe("card history quota drain window", () => {
  const now = new Date("2026-05-09T20:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.clearAllMocks();
    mocks.getTcggoUsageSnapshot.mockResolvedValue({
      hasLiveWindow: true,
      quotaResetsAt: new Date("2026-05-09T21:30:00.000Z"),
      requestsRemaining: 250,
    });
    mocks.startCardHistorySyncJob.mockResolvedValue({
      started: false,
      running: false,
      pendingCards: 0,
      startedAt: null,
    });
    mocks.countSealedHistoryTopUpCandidates.mockResolvedValue(0);
    mocks.findFirst.mockResolvedValue(null);
    mocks.runSealedHistoryTopUpSync.mockResolvedValue({ candidates: 0, synced: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens in the final two hours of a live quota window", () => {
    expect(
      isCardHistoryQuotaDrainWindow(
        {
          hasLiveWindow: true,
          quotaResetsAt: new Date("2026-05-09T21:30:00.000Z"),
          requestsRemaining: 250,
        },
        now
      )
    ).toBe(true);
  });

  it("stays closed without live quota data, after reset, or with no requests left", () => {
    expect(
      isCardHistoryQuotaDrainWindow(
        { hasLiveWindow: false, quotaResetsAt: null, requestsRemaining: 250 },
        now
      )
    ).toBe(false);
    expect(
      isCardHistoryQuotaDrainWindow(
        {
          hasLiveWindow: true,
          quotaResetsAt: new Date("2026-05-09T19:59:00.000Z"),
          requestsRemaining: 250,
        },
        now
      )
    ).toBe(false);
    expect(
      isCardHistoryQuotaDrainWindow(
        {
          hasLiveWindow: true,
          quotaResetsAt: new Date("2026-05-09T21:30:00.000Z"),
          requestsRemaining: 0,
        },
        now
      )
    ).toBe(false);
  });

  it("drains card history before sealed history", async () => {
    mocks.startCardHistorySyncJob.mockResolvedValue({
      started: true,
      running: true,
      pendingCards: 12,
      startedAt: now.toISOString(),
    });

    const result = await maybeStartCardHistoryQuotaDrainJob();

    expect(result.pendingCards).toBe(12);
    expect(mocks.countSealedHistoryTopUpCandidates).not.toHaveBeenCalled();
    expect(mocks.runSealedHistoryTopUpSync).not.toHaveBeenCalled();
  });

  it("uses the same final-window lane for sealed history after cards are complete", async () => {
    mocks.countSealedHistoryTopUpCandidates.mockResolvedValue(2200);

    const result = await maybeStartCardHistoryQuotaDrainJob();

    expect(result).toMatchObject({ started: true, running: true, pendingCards: 0 });
    expect(mocks.runSealedHistoryTopUpSync).toHaveBeenCalledWith({
      maxProducts: 250,
      stopAtQuotaReset: new Date("2026-05-09T21:30:00.000Z"),
    });
  });
});
