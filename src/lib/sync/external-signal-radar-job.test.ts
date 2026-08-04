import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimed: false,
  updateMany: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    syncJob: {
      updateMany: mocks.updateMany,
      findUnique: mocks.findUnique,
    },
  },
}));

vi.mock("@/lib/external-radar-catalyst-discovery", () => ({
  runExternalCatalystDiscovery: vi.fn(),
}));
vi.mock("@/lib/external-signal-radar", () => ({
  refreshExternalSignalRadarData: vi.fn(),
}));
vi.mock("@/lib/external-signal-intelligence", () => ({
  enrichExternalSignalRadarData: vi.fn(),
}));
vi.mock("@/lib/sync/signal-radar-ebay-demand", () => ({
  refreshSignalRadarEbayDemand: vi.fn(),
}));
vi.mock("@/lib/sync/external-signal-persistence", () => ({
  EXTERNAL_CATALYST_REFRESH_INTERVAL_MS: 72 * 60 * 60_000,
  EXTERNAL_COMPETITIVE_REFRESH_INTERVAL_MS: 6 * 60 * 60_000,
  EXTERNAL_SIGNAL_MODEL_VERSION: "v10-consistent-live-prices",
  getCompleteExternalSignalGames: vi.fn(),
  isExternalRefreshDue: vi.fn(),
  persistExternalCompetitiveScan: vi.fn(),
}));

import {
  claimExternalSignalJob,
  isCurrentExternalSignalModel,
} from "@/lib/sync/external-signal-radar-job";

describe("external signal scheduler lease", () => {
  beforeEach(() => {
    mocks.claimed = false;
    mocks.updateMany.mockReset().mockImplementation(async () => {
      if (mocks.claimed) return { count: 0 };
      mocks.claimed = true;
      return { count: 1 };
    });
    mocks.findUnique.mockReset().mockResolvedValue({
      id: "radar-job",
      type: "external-signal-radar",
      status: "queued",
      details_json: null,
      started_at: new Date("2026-07-12T12:00:00Z"),
      finished_at: null,
      heartbeat_at: new Date("2026-07-12T12:00:00Z"),
      created_at: new Date("2026-07-12T00:00:00Z"),
      updated_at: new Date("2026-07-12T12:00:00Z"),
    });
  });

  it("allows only one process to claim the same existing singleton job", async () => {
    const state = {
      job: {
        id: "radar-job",
        type: "external-signal-radar",
        status: "success",
        details_json: null,
        started_at: null,
        finished_at: new Date("2026-07-12T00:00:00Z"),
        heartbeat_at: new Date("2026-07-12T00:00:00Z"),
        created_at: new Date("2026-07-12T00:00:00Z"),
        updated_at: new Date("2026-07-12T00:00:00Z"),
      },
      lastCompetitiveAt: null,
      lastCatalystAt: null,
      competitiveDue: true,
      catalystDue: true,
    };
    const now = new Date("2026-07-12T12:00:00Z");

    const claims = await Promise.all([
      claimExternalSignalJob(state, now),
      claimExternalSignalJob(state, now),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
  });

  it("forces a refresh after the signal pricing model changes", () => {
    expect(isCurrentExternalSignalModel("v6-price-sanity")).toBe(false);
    expect(isCurrentExternalSignalModel("v8-expanded-coverage")).toBe(false);
    expect(isCurrentExternalSignalModel("v10-consistent-live-prices")).toBe(true);
    expect(isCurrentExternalSignalModel(null)).toBe(false);
  });
});
