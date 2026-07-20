import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  findRun: vi.fn(),
  findObservation: vi.fn(),
  countObservations: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    externalSignalRun: { findFirst: dbMocks.findRun },
    externalSignalObservation: {
      findUnique: dbMocks.findObservation,
      count: dbMocks.countObservations,
    },
  },
}));

import { getExternalSignalRadarDetailContext } from "@/lib/external-signal-persisted";

describe("getExternalSignalRadarDetailContext", () => {
  beforeEach(() => {
    dbMocks.findRun.mockReset();
    dbMocks.findObservation.mockReset();
    dbMocks.countObservations.mockReset();
  });

  it("returns an honest current fallback before the first successful run", async () => {
    dbMocks.findRun.mockResolvedValue(null);
    const now = new Date("2026-07-20T12:34:56.000Z");

    await expect(
      getExternalSignalRadarDetailContext("card-1", "pokemon", now)
    ).resolves.toEqual({ generatedAt: now.toISOString(), rank: null, runId: null });
    expect(dbMocks.findObservation).not.toHaveBeenCalled();
  });

  it("returns snapshot time without materialising the cohort for an unranked card", async () => {
    dbMocks.findRun.mockResolvedValue({
      id: "run-1",
      generated_at: new Date("2026-07-20T10:00:00.000Z"),
      created_at: new Date("2026-07-20T09:59:00.000Z"),
    });
    dbMocks.findObservation.mockResolvedValue(null);

    await expect(
      getExternalSignalRadarDetailContext("structural-card", "pokemon")
    ).resolves.toEqual({
      generatedAt: "2026-07-20T10:00:00.000Z",
      rank: null,
      runId: "run-1",
    });
    expect(dbMocks.countObservations).not.toHaveBeenCalled();
  });

  it("calculates the stable persisted rank with indexed scalar comparisons", async () => {
    dbMocks.findRun.mockResolvedValue({
      id: "run-2",
      generated_at: null,
      created_at: new Date("2026-07-20T11:00:00.000Z"),
    });
    dbMocks.findObservation.mockResolvedValue({
      external_score: 82,
      archetype_count: 4,
    });
    dbMocks.countObservations.mockResolvedValue(6);

    await expect(
      getExternalSignalRadarDetailContext("card-7", "one-piece")
    ).resolves.toEqual({
      generatedAt: "2026-07-20T11:00:00.000Z",
      rank: 7,
      runId: "run-2",
    });
    expect(dbMocks.countObservations).toHaveBeenCalledWith({
      where: expect.objectContaining({ run_id: "run-2", game: "one-piece" }),
    });
  });
});
