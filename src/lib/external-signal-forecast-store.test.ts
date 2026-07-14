import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import {
  EXTERNAL_FORECAST_TARGETS,
  dedupeCohortRowsByHorizon,
  getSameSourceCardmarketValue,
  selectForecastCohort,
  type ForecastCohortOutcomeSample,
  type ForecastSignalContext,
} from "@/lib/external-signal-forecast-store";

const DAY_MS = 24 * 60 * 60_000;

function sample(input: {
  index: number;
  cardId?: string;
  game?: string;
  modelVersion?: string;
  signalTier?: string;
  priceBand?: string | null;
  hit?: boolean;
  horizonDays?: number;
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
      target: EXTERNAL_FORECAST_TARGETS[0],
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
      target: EXTERNAL_FORECAST_TARGETS[0],
    });

    expect(summary.status).toBe("learning");
    expect(summary.samples).toBe(0);
    expect(summary.hits).toBe(0);
    expect(summary.cohortScope).toBe("game");
  });
});
