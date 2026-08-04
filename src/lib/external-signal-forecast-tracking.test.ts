import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  observationFindMany: vi.fn(),
  observationCount: vi.fn(),
  outcomeFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    externalSignalObservation: {
      findMany: mocks.observationFindMany,
      count: mocks.observationCount,
    },
    externalSignalOutcome: {
      findMany: mocks.outcomeFindMany,
    },
  },
}));

import { getExternalForecastSummaries } from "@/lib/external-signal-forecast-store";

describe("live forecast tracking status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.observationFindMany.mockResolvedValue([
      {
        card_id: "shaymin-94",
        game: "pokemon",
        model_version: "v10-consistent-live-prices",
        pressure_label: "Strong",
        price_band: "100-plus",
        observed_at: new Date("2026-08-04T00:00:00.000Z"),
      },
    ]);
    mocks.observationCount
      .mockResolvedValueOnce(80)
      .mockResolvedValueOnce(46);
    mocks.outcomeFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          horizon_days: 90,
          status: "pending",
          entry_observation: { observed_at: new Date("2026-08-04T00:00:00.000Z") },
        },
        {
          horizon_days: 180,
          status: "pending",
          entry_observation: { observed_at: new Date("2026-08-04T00:00:00.000Z") },
        },
      ]);
  });

  it("reports logged calls, active horizons and their next maturity dates", async () => {
    const summaries = await getExternalForecastSummaries(["shaymin-94"]);
    const tracking = summaries.get("shaymin-94")?.tracking;

    expect(tracking).toEqual({
      observations: 80,
      independentPredictions: 46,
      pending90d: 1,
      complete90d: 0,
      insufficient90d: 0,
      pending180d: 1,
      complete180d: 0,
      insufficient180d: 0,
      next90dMaturesAt: "2026-11-02T00:00:00.000Z",
      next180dMaturesAt: "2027-01-31T00:00:00.000Z",
    });
    expect(summaries.get("shaymin-94")?.targets["1.5x-90d"]).toMatchObject({
      samples: 0,
      hits: 0,
      status: "learning",
    });
  });
});
