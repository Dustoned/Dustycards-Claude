import { describe, expect, it } from "vitest";
import {
  buildSealedSignalRadarScore,
  type SealedSignalRadarScoreInput,
} from "@/lib/sealed-signal-radar";

const ESTABLISHED_INPUT: SealedSignalRadarScoreInput = {
  currentPrice: 120,
  category: "booster_box",
  trend30dPct: 12,
  trend90dPct: 24,
  historyDays: 100,
  historySpanDays: 120,
  gapToPeakPct: -8,
  changeFromLowPct: 22,
  volatilityDaily90Pct: 2.5,
  releaseAgeDays: 820,
  staleDays: 1,
  lifecycleStatus: "supply_tightening",
  lifecycleConfidence: 82,
  lifecycleOopProbability: 68,
};

describe("buildSealedSignalRadarScore", () => {
  it("rewards confirmed history and steady supply pressure", () => {
    const result = buildSealedSignalRadarScore(ESTABLISHED_INPUT);

    expect(result.historyStatus).toBe("established");
    expect(result.confidence).toBe("High");
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.outlook).toBe("strong_up");
  });

  it("keeps thin histories visible without letting them outrank trusted evidence", () => {
    const learning = buildSealedSignalRadarScore({
      ...ESTABLISHED_INPUT,
      trend30dPct: 80,
      trend90dPct: null,
      historyDays: 4,
      historySpanDays: 5,
      lifecycleStatus: "confirmed_out_of_print",
      lifecycleConfidence: 100,
      lifecycleOopProbability: 98,
    });
    const established = buildSealedSignalRadarScore(ESTABLISHED_INPUT);

    expect(learning.historyStatus).toBe("learning");
    expect(learning.score).toBeLessThanOrEqual(58);
    expect(learning.score).toBeLessThan(established.score);
  });

  it("penalizes credible reprint evidence", () => {
    const tightening = buildSealedSignalRadarScore(ESTABLISHED_INPUT);
    const restock = buildSealedSignalRadarScore({
      ...ESTABLISHED_INPUT,
      lifecycleStatus: "reprint_restock",
    });

    expect(restock.score).toBeLessThan(tightening.score);
    expect(restock.outlook).toBe("down");
    expect(restock.riskLabel).toBe("Reprint / restock pressure");
  });

  it("marks an already vertical move as overheated", () => {
    const result = buildSealedSignalRadarScore({
      ...ESTABLISHED_INPUT,
      trend30dPct: 55,
      gapToPeakPct: -1,
    });

    expect(result.riskLabel).toBe("Recent move may be overheated");
    expect(result.score).toBeLessThan(100);
  });
});
