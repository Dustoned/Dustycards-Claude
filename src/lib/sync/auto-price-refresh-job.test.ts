import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  getAutoPriceRefreshSnapshot: vi.fn(),
  getTcggoUsageSnapshot: vi.fn(),
  runAutoPriceRefresh: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    syncJob: {
      findUnique: mocks.findUnique,
      create: mocks.create,
      update: mocks.update,
    },
    syncLog: {
      findFirst: mocks.findFirst,
    },
  },
}));

vi.mock("@/lib/scraper-guard", () => ({
  areScraperRequestsDisabled: () => false,
}));

vi.mock("@/lib/sync", () => ({
  getAutoPriceRefreshSnapshot: mocks.getAutoPriceRefreshSnapshot,
  invalidateAutoPriceRefreshSnapshotCache: vi.fn(),
  runAutoPriceRefresh: mocks.runAutoPriceRefresh,
  SyncCancelledError: class SyncCancelledError extends Error {},
  SyncConflictError: class SyncConflictError extends Error {},
}));

vi.mock("@/lib/tcggo-usage", () => ({
  getTcggoUsageSnapshot: mocks.getTcggoUsageSnapshot,
}));

vi.mock("@/lib/sync/progress-details", () => ({
  createAutoPriceRefreshResultDetails: vi.fn(),
}));

import {
  getAutoPriceRefreshJobSnapshot,
  runExternalAutoPriceRefreshWorker,
  startAutoPriceRefreshJob,
} from "@/lib/sync/auto-price-refresh-job";

function makeSnapshot() {
  return {
    dueCards: 6_952,
    missingPriceCards: 0,
    submittedCardCandidates: 0,
    unavailableCooldownCards: 0,
    nextUnavailableRetryAt: null,
    nextBatchCards: 1_200,
    nextBatchEpisodes: 12,
    nextBatchEpisodeIds: [],
    nextBatchCardIds: [],
  };
}

function makeJob() {
  return {
    id: "auto-job",
    type: "auto-prices",
    status: "queued",
    details_json: null,
    started_at: new Date("2026-08-11T12:00:00.000Z"),
    finished_at: null,
    heartbeat_at: new Date("2026-08-11T12:00:00.000Z"),
    created_at: new Date("2026-08-11T12:00:00.000Z"),
    updated_at: new Date("2026-08-11T12:00:00.000Z"),
  };
}

describe("auto price refresh persisted quota gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DUSTYCARDS_EXTERNAL_PRICE_REFRESH_WORKER", "1");
    mocks.findUnique.mockResolvedValue(null);
    mocks.findFirst.mockResolvedValue(null);
    mocks.getAutoPriceRefreshSnapshot.mockResolvedValue(makeSnapshot());
    mocks.getTcggoUsageSnapshot.mockResolvedValue({
      requestsUsed: 3_000,
      requestsLimit: 3_000,
      requestsRemaining: 0,
      quotaResetsAt: new Date("2026-08-12T00:00:00.000Z"),
      observedAt: new Date("2026-08-11T12:00:00.000Z"),
      hasLiveWindow: true,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not queue the web entrypoint while the persisted window is exhausted", async () => {
    const result = await startAutoPriceRefreshJob();

    expect(result).toMatchObject({
      started: false,
      running: false,
      pendingCards: 6_952,
      status: "quota-paused",
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.runAutoPriceRefresh).not.toHaveBeenCalled();
  });

  it("does not launch the one-shot worker every minute at zero quota", async () => {
    const result = await runExternalAutoPriceRefreshWorker();

    expect(result).toEqual({
      started: false,
      running: false,
      pendingCards: 6_952,
      status: "quota-paused",
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.runAutoPriceRefresh).not.toHaveBeenCalled();
  });

  it("does not resume a queued in-process job while persisted quota is zero", async () => {
    vi.stubEnv("DUSTYCARDS_EXTERNAL_PRICE_REFRESH_WORKER", "0");
    mocks.findUnique.mockResolvedValue(makeJob());

    await getAutoPriceRefreshJobSnapshot();

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.runAutoPriceRefresh).not.toHaveBeenCalled();
  });

  it("allows the first post-reset start to discover the new live headers", async () => {
    mocks.getTcggoUsageSnapshot.mockResolvedValue({
      requestsUsed: 0,
      requestsLimit: 3_000,
      requestsRemaining: 3_000,
      quotaResetsAt: new Date("2026-08-11T00:00:00.000Z"),
      observedAt: new Date("2026-08-10T23:59:00.000Z"),
      hasLiveWindow: false,
    });
    mocks.create.mockResolvedValue(makeJob());

    const result = await startAutoPriceRefreshJob();

    expect(result).toMatchObject({ started: true, running: true, status: "queued" });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
