import { describe, expect, it } from "vitest";
import {
  buildPriceScenario,
  calculateGoldMineConfluence,
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
      confluenceScore: 76,
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
      ageYears: 8,
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

  it("keeps optimistic scenarios for new releases close to flat during stabilization", () => {
    const shared = {
      marketMode: "raw" as const,
      currentPrice: 100,
      currency: "EUR" as const,
      opportunityScore: 88,
      sealedTrendPct: 15,
      rawTrend90dPct: 18,
      scarcityScore: 76,
      gemRatePct: null,
      riskScore: 0,
      evidenceCount: 4,
      historyPoints: 12,
    };
    const newRelease = buildPriceScenario({ ...shared, ageYears: 0.45 });
    const matureSet = buildPriceScenario({ ...shared, ageYears: 4 });

    expect(newRelease?.confidence).toBe("Medium");
    expect(newRelease?.points[1].base).toBeLessThanOrEqual(103);
    expect(matureSet?.points[1].base).toBeGreaterThan(newRelease?.points[1].base ?? 0);
    expect(newRelease?.drivers).toContain("post-release stabilization");
  });

  it("keeps the launch window opportunistic but visibly uncertain", () => {
    const shared = {
      marketMode: "raw" as const,
      currentPrice: 100,
      currency: "EUR" as const,
      opportunityScore: 88,
      sealedTrendPct: 15,
      rawTrend90dPct: 18,
      scarcityScore: 76,
      gemRatePct: null,
      riskScore: 0,
      evidenceCount: 4,
      historyPoints: 12,
    };
    const launch = buildPriceScenario({ ...shared, ageYears: 0.08 });
    const stabilized = buildPriceScenario({ ...shared, ageYears: 0.45 });

    expect(launch?.points[1].base).toBeGreaterThan(stabilized?.points[1].base ?? 0);
    expect(launch?.points[1].high).toBeGreaterThan(stabilized?.points[1].high ?? 0);
    expect(launch?.drivers).toContain("launch price discovery");
  });

  it("only calls a multi-factor chase a gold mine setup", () => {
    const combined = calculateGoldMineConfluence({
      artistDemandScore: 91,
      collectorDemandScore: 96,
      specificPullDenominator: 1200,
      scarcityScore: 91,
      gemRatePct: 22,
      hasFreshChaseCatalyst: true,
      ageYears: 0.2,
    });
    const illustratorOnly = calculateGoldMineConfluence({
      artistDemandScore: 96,
      collectorDemandScore: 45,
      specificPullDenominator: 45,
      scarcityScore: 42,
      gemRatePct: 70,
      hasFreshChaseCatalyst: false,
      ageYears: 0.2,
    });
    expect(combined.label).toBe("Gold mine setup");
    expect(combined.score).toBeGreaterThanOrEqual(85);
    expect(illustratorOnly.score).toBeLessThan(50);
  });

  it("keeps risk capable of overruling a strong confluence", () => {
    const safe = calculateOpportunityScores({
      externalScore: 68,
      sealedPressureScore: 70,
      scarcityScore: 78,
      confluenceScore: 90,
      rawTrend90dPct: 8,
      gradePremiumPct: null,
      gemRatePct: null,
      gradedAvailable: false,
      riskScore: 0,
    });
    const risky = calculateOpportunityScores({
      externalScore: 68,
      sealedPressureScore: 70,
      scarcityScore: 78,
      confluenceScore: 90,
      rawTrend90dPct: 8,
      gradePremiumPct: null,
      gemRatePct: null,
      gradedAvailable: false,
      riskScore: 1,
    });
    expect(risky.raw).toBeLessThan(safe.raw);
  });
});
