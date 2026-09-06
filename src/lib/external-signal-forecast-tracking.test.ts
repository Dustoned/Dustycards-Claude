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
    // Cohort queries (filtered on status) may run once per model version in
    // the fallback chain; the tracking query is the one without that filter.
    mocks.outcomeFindMany.mockImplementation(async (args: { where?: { status?: unknown } }) =>
      args?.where?.status
        ? []
        : [
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
          ]
    );
  });

  it("reports logged calls, active horizons and their next maturity dates", async () => {
    const summaries = await getExternalForecastSummaries(["shaymin-94"]);
    const tracking = summaries.get("shaymin-94")?.tracking;

    expect(tracking).toEqual({
      observations: 80,
      independentPredictions: 46,
      pending30d: 0,
      complete30d: 0,
      insufficient30d: 0,
      pending90d: 1,
      complete90d: 0,
      insufficient90d: 0,
      pending180d: 1,
      complete180d: 0,
      insufficient180d: 0,
      meaningfulCorrect90d: 0,
      meaningfulWrong90d: 0,
      smallMove90d: 0,
      next30dMaturesAt: null,
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

describe("forecast cohort assembly across model versions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.observationFindMany.mockResolvedValue([
      {
        card_id: "shaymin-94",
        game: "pokemon",
        model_version: "v12-hype-reset-calibrated",
        pressure_label: "Strong",
        price_band: "100-plus",
        observed_at: new Date("2026-08-04T00:00:00.000Z"),
      },
    ]);
    mocks.observationCount.mockResolvedValue(0);
    mocks.outcomeFindMany.mockImplementation(
      async (args: {
        where?: { status?: unknown; entry_observation?: { model_version?: string } };
      }) => {
        // Tracking query has no status filter; cohort queries do.
        if (!args?.where?.status) return [];
        // Only the ancestor two hops down the chain has finished outcomes.
        if (args.where.entry_observation?.model_version !== "v9-calibrated-inputs") return [];
        return Array.from({ length: 12 }, (_, index) => ({
          horizon_days: 90,
          status: "complete",
          hit_15x: index % 4 === 0,
          hit_2x: false,
          hit_3x: false,
          realized_return_pct: 10,
          direction_hit: true,
          meaningful_direction_hit: true,
          band_within: true,
          entry_observation: {
            card_id: `v9-card-${index}`,
            game: "pokemon",
            model_version: "v9-calibrated-inputs",
            pressure_label: "Strong",
            price_band: "100-plus",
            observed_at: new Date(Date.UTC(2026, 0, 1 + index)),
            entry_expected_return_pct_180: 12,
          },
        }));
      }
    );
  });

  it("borrows finished outcomes from every older version in the fallback chain", async () => {
    const summaries = await getExternalForecastSummaries(["shaymin-94"]);
    const target = summaries.get("shaymin-94")?.targets["1.5x-90d"];

    expect(target).toMatchObject({
      samples: 12,
      hits: 3,
      usingPreviousModelCohort: true,
    });
  });
});
