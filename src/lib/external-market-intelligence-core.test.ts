import { describe, expect, it } from "vitest";
import {
  buildPriceScenario,
  calculateOpportunityScores,
  calculateScarcityScore,
  calculateSealedPressure,
  classifySealedProduct,
} from "@/lib/external-market-intelligence-core";

describe("external market intelligence", () => {
  it("separates packs, booster boxes and collection products", () => {
    expect(classifySealedProduct("Dragons Exalted Booster Pack")).toBe("pack");
    expect(classifySealedProduct("Dragons Exalted Booster Box")).toBe("box");
    expect(classifySealedProduct("Premium Figure Collection")).toBe("other");
  });

  it("raises sealed pressure for old, expensive and rising packs", () => {
    const old = calculateSealedPressure({
      ageYears: 12,
      packPrice: 170,
      rawCardPrice: 40,
      trend30dPct: 18,
      trend90dPct: 35,
      packProductCount: 1,
      hasReprintRisk: false,
    });
    const newSet = calculateSealedPressure({
      ageYears: 0.5,
      packPrice: 6,
      rawCardPrice: 40,
      trend30dPct: -4,
      trend90dPct: null,
      packProductCount: 8,
      hasReprintRisk: false,
    });
    expect(old.pressureScore).toBeGreaterThan(newSet.pressureScore);
    expect(["High", "Extreme"]).toContain(old.pressureLabel);
  });

  it("treats hard pulls, low gem rates and thin markets as scarcer", () => {
    const scarce = calculateScarcityScore({
      ageYears: 10,
      specificPullDenominator: 1400,
      gemRatePct: 22,
      rawMarketBreadth: 1,
      artistDemandScore: 82,
    });
    const common = calculateScarcityScore({
      ageYears: 1,
      specificPullDenominator: 40,
      gemRatePct: 78,
      rawMarketBreadth: 6,
      artistDemandScore: 40,
    });
    expect(scarce.score).toBeGreaterThan(common.score);
    expect(scarce.label).toBe("Very scarce");
  });

  it("keeps graded scoring separate and creates bounded price scenarios", () => {
    const scores = calculateOpportunityScores({
      externalScore: 68,
      sealedPressureScore: 82,
      scarcityScore: 78,
      rawTrend90dPct: 12,
      gradePremiumPct: 450,
      gemRatePct: 25,
      gradedAvailable: true,
      riskScore: 0,
    });
    expect(scores.graded).toBeGreaterThan(scores.raw);
    const scenario = buildPriceScenario({
      marketMode: "graded",
      currentPrice: 500,
      currency: "USD",
      opportunityScore: scores.graded,
      sealedTrendPct: 12,
      rawTrend90dPct: 8,
      scarcityScore: 78,
      gemRatePct: 25,
      riskScore: 0,
      evidenceCount: 3,
      historyPoints: 12,
    });
    expect(scenario?.points).toHaveLength(3);
    expect(scenario?.points.every((point) => point.low <= point.base && point.base <= point.high)).toBe(true);
    expect(scenario?.confidence).toBe("High");
  });
});
