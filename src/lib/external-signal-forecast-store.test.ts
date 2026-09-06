import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { FORECAST_TARGET_DISPLAY } from "@/lib/external-signal-forecast";
import {
  EXTERNAL_FORECAST_TARGETS,
  FORECAST_MODEL_VERSION_FALLBACKS,
  dedupeCohortRowsByHorizon,
  getForecastModelVersionChain,
  getSameSourceCardmarketValue,
  selectForecastCohort,
  type ForecastCohortOutcomeSample,
  type ForecastSignalContext,
} from "@/lib/external-signal-forecast-store";

const DAY_MS = 24 * 60 * 60_000;
const target15x30 = EXTERNAL_FORECAST_TARGETS.find((target) => target.key === "1.5x-30d")!;
const target15x90 = EXTERNAL_FORECAST_TARGETS.find((target) => target.key === "1.5x-90d")!;
const target3x180 = EXTERNAL_FORECAST_TARGETS.find((target) => target.key === "3x-180d")!;

function sample(input: {
  index: number;
  cardId?: string;
  game?: string;
  modelVersion?: string;
  signalTier?: string;
  priceBand?: string | null;
  hit?: boolean;
  horizonDays?: number;
  status?: "complete" | "insufficient";
  directionHit?: boolean | null;
  bandWithin?: boolean | null;
  realizedReturnPct?: number | null;
  entryExpectedReturnPct180?: number | null;
}): ForecastCohortOutcomeSample {
  return {
    horizonDays: input.horizonDays ?? 90,
    hit15x: input.hit ?? false,
    hit2x: input.hit ?? false,
    hit3x: input.hit ?? false,
    cardId: input.cardId ?? `card-${input.index}`,
    game: input.game ?? "pokemon",
    modelVersion: input.modelVersion ?? "v1",
    signalTier: input.signalTier ?? "Breakout",
    priceBand: input.priceBand ?? "5-25",
    observedAt: new Date(Date.UTC(2025, 0, 1) + input.index * DAY_MS),
    status: input.status,
    directionHit: input.directionHit,
    bandWithin: input.bandWithin,
    realizedReturnPct: input.realizedReturnPct,
    entryExpectedReturnPct180: input.entryExpectedReturnPct180,
  };
}

const current: ForecastSignalContext = {
  cardId: "current-card",
  game: "pokemon",
  modelVersion: "v1",
  signalTier: "Breakout",
  priceBand: "5-25",
  observedAt: new Date("2026-07-12T00:00:00.000Z"),
};

describe("external signal forecast store helpers", () => {
  it("keeps each episode on its fixed CardMarket reference family", () => {
    const row = {
      cm_en_avg_7d: 12,
      cm_en_lowest_nm: 2,
      cm_de_lowest_nm: 4,
      cm_fr_lowest_nm: 6,
      cm_es_lowest_nm: null,
      cm_it_lowest_nm: null,
    };

    expect(getSameSourceCardmarketValue("cardmarket:avg7d", row)).toBe(12);
    expect(getSameSourceCardmarketValue("cardmarket:median-low", row)).toBe(4);
    expect(getSameSourceCardmarketValue("cardmarket:en-nm", row)).toBe(2);
    expect(getSameSourceCardmarketValue("tcgplayer", row)).toBeNull();
    expect(getSameSourceCardmarketValue(null, row)).toBeNull();
  });

  it("does not count overlapping episodes from the same card as independent", () => {
    const rows = [
      sample({ index: 0, cardId: "same" }),
      sample({ index: 30, cardId: "same" }),
      sample({ index: 91, cardId: "same" }),
      sample({ index: 31, cardId: "other" }),
    ];

    expect(dedupeCohortRowsByHorizon(rows, 90).map((row) => row.cardId)).toEqual([
      "same",
      "other",
      "same",
    ]);
  });

  it("falls back from a small price-band cohort to a calibrated tier cohort", () => {
    const rows = Array.from({ length: 200 }, (_, index) =>
      sample({
        index,
        hit: index % 5 === 0,
        priceBand: index < 20 ? "5-25" : "25-100",
      })
    );
    const summary = selectForecastCohort({
      current,
      rows,
      target: target15x90,
    });

    expect(summary.status).toBe("calibrated");
    expect(summary.cohortScope).toBe("game-tier");
    expect(summary.samples).toBe(200);
    expect(summary.hits).toBe(40);
    expect(summary.holdoutSamples).toBe(40);
    expect(summary.holdoutCalibrationError).toBe(0);
  });

  it("never borrows outcomes from a different game or model version", () => {
    const unrelatedRows = Array.from({ length: 250 }, (_, index) =>
      sample({
        index,
        game: "one-piece",
        modelVersion: "v2",
        hit: true,
      })
    );
    const summary = selectForecastCohort({
      current,
      rows: unrelatedRows,
      target: target15x90,
    });

    expect(summary.status).toBe("learning");
    expect(summary.samples).toBe(0);
    expect(summary.hits).toBe(0);
    expect(summary.cohortScope).toBe("game");
  });

  it("reports direction accuracy, band coverage and the survivorship share", () => {
    const rows = [
      ...Array.from({ length: 200 }, (_, index) =>
        sample({
          index,
          hit: index % 5 === 0,
          directionHit: index % 2 === 0,
          bandWithin: index % 4 !== 0,
        })
      ),
      ...Array.from({ length: 50 }, (_, index) =>
        sample({ index: 300 + index, status: "insufficient" })
      ),
    ];
    const summary = selectForecastCohort({
      current,
      rows,
      target: target15x90,
    });

    // The insufficient rows never enter the hit counts.
    expect(summary.samples).toBe(200);
    expect(summary.hits).toBe(40);
    expect(summary.directionAccuracy).toBe(0.5);
    expect(summary.bandCoverage).toBe(0.75);
    expect(summary.insufficientShare).toBe(0.2);
  });

  it("computes the mean absolute forecast error for 180d outcomes", () => {
    const rows = Array.from({ length: 40 }, (_, index) =>
      sample({
        index: index * 2,
        horizonDays: 180,
        hit: index % 8 === 0,
        realizedReturnPct: index % 2 === 0 ? 20 : 40,
        entryExpectedReturnPct180: 30,
      })
    );
    const summary = selectForecastCohort({
      current,
      rows,
      target: target3x180,
    });

    expect(summary.meanAbsoluteErrorPct180).toBe(10);
    expect(summary.directionAccuracy).toBeNull();
    expect(summary.bandCoverage).toBeNull();
  });

  it("falls back to the previous model version when the new cohort is too small", () => {
    expect(FORECAST_MODEL_VERSION_FALLBACKS["v9-calibrated-inputs"]).toBe(
      "v8-expanded-coverage"
    );

    const v9Current: ForecastSignalContext = {
      ...current,
      modelVersion: "v9-calibrated-inputs",
    };
    const rows = [
      ...Array.from({ length: 5 }, (_, index) =>
        sample({
          index,
          cardId: `v9-card-${index}`,
          modelVersion: "v9-calibrated-inputs",
        })
      ),
      ...Array.from({ length: 200 }, (_, index) =>
        sample({
          index,
          modelVersion: "v8-expanded-coverage",
          hit: index % 5 === 0,
        })
      ),
    ];
    const summary = selectForecastCohort({
      current: v9Current,
      rows,
      target: target15x90,
    });

    expect(summary.usingPreviousModelCohort).toBe(true);
    expect(summary.status).toBe("calibrated");
    expect(summary.samples).toBe(200);
  });

  it("walks the whole model fallback chain from v12 down to v8", () => {
    expect(getForecastModelVersionChain("v13-evidence-quality")[0]).toBe("v12-hype-reset-calibrated");
    expect(getForecastModelVersionChain("v12-hype-reset-calibrated")).toEqual([
      "v11-hype-reset-support",
      "v10-consistent-live-prices",
      "v9-calibrated-inputs",
      "v8-expanded-coverage",
    ]);
    expect(getForecastModelVersionChain("unknown-version")).toEqual([]);
  });

  it("borrows a calibrated ancestor cohort across multiple version bumps", () => {
    const rows = Array.from({ length: 200 }, (_, index) =>
      sample({
        index,
        modelVersion: "v9-calibrated-inputs",
        hit: index % 5 === 0,
      })
    );

    // v12 has zero samples of its own; the chain reaches v9 two hops away.
    const summary = selectForecastCohort({
      current: { ...current, modelVersion: "v12-hype-reset-calibrated" },
      rows,
      target: target15x90,
    });

    expect(summary.status).toBe("calibrated");
    expect(summary.samples).toBe(200);
    expect(summary.usingPreviousModelCohort).toBe(true);
  });

  it("gates the 30-day early target looser than the 90-day target", () => {
    const rows = Array.from({ length: 45 }, (_, index) =>
      sample({
        index: index * 31,
        cardId: `early-${index}`,
        horizonDays: 30,
        hit: index % 5 === 0,
      })
    );

    const summary = selectForecastCohort({
      current,
      rows,
      target: target15x30,
    });

    expect(summary.horizonDays).toBe(30);
    // 45 samples clear the 40-sample gate; the same count would still be
    // "learning" for the 90-day target that needs 50.
    expect(summary.samples).toBe(45);
    expect(summary.reason).not.toContain("more completed comparable signals");
  });

  it("keeps the current cohort once it clears the minimum sample gate", () => {
    const rows = [
      ...Array.from({ length: 60 }, (_, index) =>
        sample({
          index,
          cardId: `v9-card-${index}`,
          modelVersion: "v9-calibrated-inputs",
        })
      ),
      ...Array.from({ length: 200 }, (_, index) =>
        sample({
          index,
          modelVersion: "v8-expanded-coverage",
          hit: index % 5 === 0,
        })
      ),
    ];
    const summary = selectForecastCohort({
      current: { ...current, modelVersion: "v9-calibrated-inputs" },
      rows,
      target: target15x90,
    });

    expect(summary.usingPreviousModelCohort).toBeUndefined();
    expect(summary.samples).toBe(60);
  });
});

describe("forecast target keys", () => {
  it("keeps the persisted target keys aligned with the shared display list", () => {
    expect(EXTERNAL_FORECAST_TARGETS.map((target) => target.key)).toEqual(
      FORECAST_TARGET_DISPLAY.map((target) => target.key)
    );
  });
});
