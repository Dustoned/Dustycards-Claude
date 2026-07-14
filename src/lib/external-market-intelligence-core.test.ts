import { describe, expect, it } from "vitest";
import {
  alignConfluenceWithScenario,
  alignOpportunityScoreWithScenario,
  buildPriceScenario,
  calculateGoldMineConfluence,
  calculateOpportunityScores,
  calculateScarcityScore,
  calculateSealedPressure,
  calculateSetRarityPosition,
  classifySealedProduct,
  hasActiveReprintRisk,
  isActionablePriceScenario,
  isWatchablePriceScenario,
} from "@/lib/external-market-intelligence-core";
import type { ExternalPriceScenario } from "@/lib/external-signal-radar";

describe("external market intelligence", () => {
  it("separates packs, booster boxes and collection products", () => {
    expect(classifySealedProduct("Dragons Exalted Booster Pack")).toBe("pack");
    expect(classifySealedProduct("Dragons Exalted Booster")).toBe("pack");
    expect(classifySealedProduct("Dragons Exalted Booster (5 Cards)")).toBe("other");
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

  it("uses only sufficiently confident lifecycle evidence in sealed pressure", () => {
    const shared = {
      ageYears: 4,
      packPrice: 18,
      rawCardPrice: 50,
      trend30dPct: null,
      trend90dPct: 2,
      packProductCount: 2,
      hasReprintRisk: false,
      lifecycleOopProbability: 92,
    };
    const noLifecycle = calculateSealedPressure(shared);
    const lowConfidence = calculateSealedPressure({
      ...shared,
      lifecycleConfidence: 64,
    });
    const supportedOop = calculateSealedPressure({
      ...shared,
      lifecycleConfidence: 82,
    });

    expect(lowConfidence).toEqual(noLifecycle);
    expect(supportedOop.pressureScore).toBeGreaterThan(noLifecycle.pressureScore);
  });

  it("treats reprint and restock catalysts as risk only in the negative direction", () => {
    expect(
      hasActiveReprintRisk([
        { kind: "reprint", direction: "negative" },
      ])
    ).toBe(true);
    expect(
      hasActiveReprintRisk([
        { kind: "reprint", direction: "positive" },
      ])
    ).toBe(false);
    expect(
      hasActiveReprintRisk([
        { kind: "product", direction: "negative" },
      ])
    ).toBe(false);
  });

  it("treats hard pulls, low gem rates and thin markets as scarcer", () => {
    const scarce = calculateScarcityScore({
      ageYears: 10,
      specificPullDenominator: 1400,
      gemRatePct: 22,
      rawMarketBreadth: 1,
      verifiedActiveListings: 1,
      artistDemandScore: 82,
    });
    const common = calculateScarcityScore({
      ageYears: 1,
      specificPullDenominator: 40,
      gemRatePct: 78,
      rawMarketBreadth: 6,
      verifiedActiveListings: 50,
      artistDemandScore: 40,
    });
    expect(scarce.score).toBeGreaterThan(common.score);
    expect(scarce.label).toBe("Very scarce");
  });

  it("prefers verified complete eBay listing supply over broad source breadth", () => {
    const shared = {
      ageYears: 4,
      specificPullDenominator: 120,
      gemRatePct: 45,
      rawMarketBreadth: 6,
      artistDemandScore: 60,
    };
    const broadFallback = calculateScarcityScore(shared);
    const oneVerifiedListing = calculateScarcityScore({
      ...shared,
      verifiedActiveListings: 1,
    });

    expect(oneVerifiedListing.score).toBeGreaterThan(broadFallback.score);
  });

  it("does not call a newly released but abundant hard pull scarce", () => {
    const abundantNewChase = calculateScarcityScore({
      ageYears: 0.45,
      specificPullDenominator: 1080,
      gemRatePct: 24.6,
      rawMarketBreadth: 5,
      verifiedActiveListings: 140,
      sealedPressureScore: 34,
      artistDemandScore: 81,
      setRarityScore: 100,
    });
    const sameCardWithThinSupply = calculateScarcityScore({
      ageYears: 0.45,
      specificPullDenominator: 1080,
      gemRatePct: 24.6,
      rawMarketBreadth: 5,
      verifiedActiveListings: 3,
      sealedPressureScore: 34,
      artistDemandScore: 81,
      setRarityScore: 100,
    });

    expect(abundantNewChase.score).toBeLessThanOrEqual(35);
    expect(abundantNewChase.label).toBe("Common supply");
    expect(sameCardWithThinSupply.score).toBeGreaterThan(abundantNewChase.score + 20);
  });

  it("ranks old out-of-print NM supply above a plentiful modern chase", () => {
    const modern = calculateScarcityScore({
      ageYears: 0.45,
      specificPullDenominator: 1080,
      gemRatePct: 24.6,
      rawMarketBreadth: 5,
      verifiedActiveListings: 140,
      sealedPressureScore: 34,
      artistDemandScore: 81,
      setRarityScore: 100,
    });
    const oldNmCard = calculateScarcityScore({
      ageYears: 14.2,
      specificPullDenominator: null,
      gemRatePct: null,
      rawMarketBreadth: 4,
      verifiedActiveListings: null,
      sealedPressureScore: 69,
      artistDemandScore: 90,
      setRarityScore: 100,
    });

    expect(modern.score).toBe(29);
    expect(oldNmCard.score).toBe(79);
    expect(oldNmCard.score).toBeGreaterThan(modern.score + 35);
    expect(["Scarce", "Very scarce"]).toContain(oldNmCard.label);
  });

  it("keeps illustrator demand out of the physical scarcity score", () => {
    const shared = {
      ageYears: 2,
      specificPullDenominator: 300,
      gemRatePct: 50,
      rawMarketBreadth: 5,
      verifiedActiveListings: 20,
      sealedPressureScore: 40,
      setRarityScore: 85,
    };

    expect(calculateScarcityScore({ ...shared, artistDemandScore: 100 })).toEqual(
      calculateScarcityScore({ ...shared, artistDemandScore: 20 })
    );
  });

  it("keeps set-level gem rates out of raw scarcity", () => {
    const shared = {
      ageYears: 5,
      specificPullDenominator: 400,
      rawMarketBreadth: 4,
      verifiedActiveListings: 12,
      sealedPressureScore: 55,
      artistDemandScore: 70,
      setRarityScore: 85,
    };

    expect(calculateScarcityScore({ ...shared, gemRatePct: 5 })).toEqual(
      calculateScarcityScore({ ...shared, gemRatePct: 95 })
    );
  });

  it("does not treat language and price-feed breadth as listing inventory", () => {
    const shared = {
      ageYears: 8,
      specificPullDenominator: null,
      gemRatePct: null,
      verifiedActiveListings: null,
      sealedPressureScore: 65,
      artistDemandScore: 70,
      setRarityScore: 85,
    };

    expect(calculateScarcityScore({ ...shared, rawMarketBreadth: 1 })).toEqual(
      calculateScarcityScore({ ...shared, rawMarketBreadth: 6 })
    );
  });

  it("scales verified listing supply monotonically", () => {
    const shared = {
      ageYears: 3,
      specificPullDenominator: 500,
      gemRatePct: 30,
      rawMarketBreadth: 5,
      sealedPressureScore: 50,
      artistDemandScore: 70,
      setRarityScore: 85,
    };
    const scores = [1, 3, 10, 25, 50, 100, 200].map((verifiedActiveListings) =>
      calculateScarcityScore({ ...shared, verifiedActiveListings }).score
    );

    for (let index = 1; index < scores.length; index += 1) {
      expect(scores[index]).toBeLessThanOrEqual(scores[index - 1]);
    }
  });

  it("judges rarity relative to the other rarities in the same set", () => {
    const setRarities = [
      "Common",
      "Uncommon",
      "Rare",
      "Double Rare",
      "Illustration Rare",
      "Special Illustration Rare",
      "Hyper Rare",
    ];

    expect(calculateSetRarityPosition("Double Rare", setRarities)).toEqual({
      setRarityScore: 25,
      setRarityLabel: "Entry tier",
    });
    expect(calculateSetRarityPosition("Special Illustration Rare", setRarities)).toEqual({
      setRarityScore: 100,
      setRarityLabel: "Chase tier",
    });
  });

  it("rejects scenarios whose projected gain is too small to be useful", () => {
    expect(isActionablePriceScenario({
      marketMode: "raw",
      currentPrice: 2,
      currency: "EUR",
      confidence: "Medium",
      drivers: ["post-release stabilization"],
      points: [
        { days: 30, low: 1.76, base: 2, high: 2.28 },
        { days: 90, low: 1.69, base: 2.01, high: 2.38 },
        { days: 180, low: 1.62, base: 2.02, high: 2.49 },
      ],
    })).toBe(false);

    expect(isActionablePriceScenario({
      marketMode: "raw",
      currentPrice: 0.65,
      currency: "EUR",
      confidence: "Medium",
      drivers: [],
      points: [
        { days: 30, low: 0.62, base: 0.69, high: 0.77 },
        { days: 90, low: 0.68, base: 0.79, high: 0.91 },
        { days: 180, low: 0.8, base: 0.96, high: 1.14 },
      ],
    })).toBe(false);
  });

  it("keeps cheap cards when the forecasted move is materially large", () => {
    const scenario = {
      marketMode: "raw",
      currentPrice: 2,
      currency: "EUR",
      confidence: "Medium",
      drivers: ["launch price discovery"],
      points: [
        { days: 30, low: 1.8, base: 2.2, high: 2.7 },
        { days: 90, low: 1.7, base: 2.5, high: 3.4 },
        { days: 180, low: 1.6, base: 3, high: 4.2 },
      ],
    } satisfies ExternalPriceScenario;

    expect(isActionablePriceScenario(scenario)).toBe(true);
    expect(isWatchablePriceScenario(scenario, 70)).toBe(true);
  });

  it("can keep a strong watch candidate whose base case is flat", () => {
    const scenario = {
      marketMode: "raw" as const,
      currentPrice: 100,
      currency: "EUR" as const,
      confidence: "High" as const,
      drivers: ["structural scarcity"],
      points: [
        { days: 30, low: 92, base: 100, high: 106 },
        { days: 90, low: 88, base: 100, high: 111 },
        { days: 180, low: 84, base: 100, high: 115 },
      ],
    } satisfies ExternalPriceScenario;

    expect(isActionablePriceScenario(scenario)).toBe(false);
    expect(isWatchablePriceScenario(scenario, 85)).toBe(true);
    expect(isWatchablePriceScenario(scenario, 70)).toBe(false);
  });

  it("keeps asymmetric upside without accepting a deeply bearish base case", () => {
    const mildDownside = {
      marketMode: "raw" as const,
      currentPrice: 100,
      currency: "EUR" as const,
      confidence: "Medium" as const,
      drivers: ["market history"],
      points: [
        { days: 30, low: 88, base: 99, high: 110 },
        { days: 90, low: 82, base: 97, high: 118 },
        { days: 180, low: 75, base: 96, high: 125 },
      ],
    } satisfies ExternalPriceScenario;
    const deepDownside = {
      ...mildDownside,
      points: mildDownside.points.map((point) => ({
        ...point,
        base: point.days === 180 ? 80 : point.base,
      })),
    } satisfies ExternalPriceScenario;

    expect(isWatchablePriceScenario(mildDownside, 76)).toBe(true);
    expect(isWatchablePriceScenario(deepDownside, 90)).toBe(false);
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
    expect(scenario?.points.at(-1)?.base).toBeGreaterThan(500);
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

  it("keeps a neutral setup flat instead of manufacturing growth", () => {
    const scenario = buildPriceScenario({
      marketMode: "raw",
      currentPrice: 100,
      currency: "EUR",
      ageYears: 4,
      opportunityScore: 65,
      sealedTrendPct: null,
      rawTrend90dPct: null,
      scarcityScore: 92,
      gemRatePct: null,
      riskScore: 0,
      evidenceCount: 2,
      historyPoints: 6,
    });

    expect(scenario?.points.map((point) => point.base)).toEqual([100, 100, 100]);
  });

  it("allows negative momentum and risk to produce a declining base case", () => {
    const scenario = buildPriceScenario({
      marketMode: "graded",
      currentPrice: 100,
      currency: "EUR",
      ageYears: 5,
      opportunityScore: 78,
      sealedTrendPct: -12,
      rawTrend90dPct: -25,
      scarcityScore: 94,
      gemRatePct: 12,
      riskScore: 0.25,
      evidenceCount: 3,
      historyPoints: 12,
    });
    const bases = scenario?.points.map((point) => point.base) ?? [];

    expect(bases).toHaveLength(3);
    expect(bases[0]).toBeLessThan(100);
    expect(bases[1]).toBeLessThan(bases[0]);
    expect(bases[2]).toBeLessThan(bases[1]);
  });

  it("does not turn scarcity or a low gem-rate into automatic monthly gains", () => {
    const scores = calculateOpportunityScores({
      externalScore: 65,
      sealedPressureScore: 50,
      scarcityScore: 100,
      confluenceScore: 55,
      rawTrend90dPct: null,
      gradePremiumPct: 250,
      gemRatePct: 5,
      gradedAvailable: true,
      riskScore: 0,
      setRarityScore: 100,
    });
    const rawScenario = buildPriceScenario({
      marketMode: "raw",
      currentPrice: 100,
      currency: "EUR",
      ageYears: 8,
      opportunityScore: scores.raw,
      sealedTrendPct: null,
      rawTrend90dPct: null,
      scarcityScore: 100,
      gemRatePct: 5,
      riskScore: 0,
      evidenceCount: 3,
      historyPoints: 10,
    });
    const gradedScenario = buildPriceScenario({
      marketMode: "graded",
      currentPrice: 250,
      currency: "EUR",
      ageYears: 8,
      opportunityScore: scores.graded,
      sealedTrendPct: null,
      rawTrend90dPct: null,
      scarcityScore: 100,
      gemRatePct: 5,
      riskScore: 0,
      evidenceCount: 3,
      historyPoints: 10,
    });

    expect(scores.raw).toBeGreaterThan(65);
    expect(scores.graded).toBeGreaterThan(scores.raw);
    expect(rawScenario?.points.at(-1)?.base).toBe(100);
    expect(gradedScenario?.points.at(-1)?.base).toBe(250);
  });

  it("uses signed eBay demand as direction evidence", () => {
    const shared = {
      marketMode: "raw" as const,
      currentPrice: 100,
      currency: "EUR" as const,
      ageYears: 4,
      opportunityScore: 82,
      sealedTrendPct: null,
      rawTrend90dPct: null,
      scarcityScore: 80,
      gemRatePct: null,
      riskScore: 0,
      evidenceCount: 3,
      historyPoints: 10,
    };
    const supported = buildPriceScenario({ ...shared, ebayDemandAdjustment: 6 });
    const weakening = buildPriceScenario({ ...shared, ebayDemandAdjustment: -4 });

    expect(supported?.points.at(-1)?.base).toBeGreaterThan(100);
    expect(weakening?.points.at(-1)?.base).toBeLessThan(100);
  });

  it("keeps generated flat and mild-down scenarios watchable without keeping material declines", () => {
    const shared = {
      marketMode: "raw" as const,
      currentPrice: 100,
      currency: "EUR" as const,
      ageYears: 5,
      opportunityScore: 85,
      sealedTrendPct: null,
      scarcityScore: 90,
      gemRatePct: null,
      riskScore: 0,
      evidenceCount: 3,
      historyPoints: 12,
    };
    const flat = buildPriceScenario({ ...shared, rawTrend90dPct: null });
    const mildDown = buildPriceScenario({ ...shared, rawTrend90dPct: -5 });
    const materialDown = buildPriceScenario({ ...shared, rawTrend90dPct: -25 });

    expect(flat?.points.at(-1)?.base).toBe(100);
    expect(mildDown?.points.at(-1)?.base).toBeLessThan(100);
    expect(isWatchablePriceScenario(flat, shared.opportunityScore)).toBe(true);
    expect(isWatchablePriceScenario(mildDown, shared.opportunityScore)).toBe(true);
    expect(isWatchablePriceScenario(materialDown, shared.opportunityScore)).toBe(false);
  });

  it("does not call a bearish 180-day base case a good opportunity or gold mine", () => {
    const bearish = {
      marketMode: "raw" as const,
      currentPrice: 100,
      currency: "EUR" as const,
      confidence: "Medium" as const,
      drivers: ["market history"],
      points: [
        { days: 30 as const, low: 88, base: 98, high: 108 },
        { days: 90 as const, low: 78, base: 94, high: 112 },
        { days: 180 as const, low: 66, base: 88, high: 118 },
      ],
    } satisfies ExternalPriceScenario;
    const goldMine = calculateGoldMineConfluence({
      artistDemandScore: 95,
      collectorDemandScore: 98,
      specificPullDenominator: 1400,
      scarcityScore: 94,
      gemRatePct: 18,
      hasFreshChaseCatalyst: true,
      ageYears: 0.4,
    });

    expect(goldMine.label).toBe("Gold mine setup");
    expect(alignOpportunityScoreWithScenario(94, bearish)).toBe(59);
    expect(alignConfluenceWithScenario(goldMine, bearish)).toMatchObject({
      score: 69,
      label: "Building",
    });
  });

  it("reserves breakout and gold-mine labels for a confident actionable base case", () => {
    const smallUpside = {
      marketMode: "raw" as const,
      currentPrice: 100,
      currency: "EUR" as const,
      confidence: "High" as const,
      drivers: ["market history"],
      points: [
        { days: 30 as const, low: 94, base: 101, high: 108 },
        { days: 90 as const, low: 90, base: 103, high: 115 },
        { days: 180 as const, low: 86, base: 106, high: 124 },
      ],
    } satisfies ExternalPriceScenario;
    const actionable = {
      ...smallUpside,
      points: smallUpside.points.map((point) => ({
        ...point,
        base: point.days === 180 ? 115 : point.base,
      })),
    } satisfies ExternalPriceScenario;
    const goldMine = calculateGoldMineConfluence({
      artistDemandScore: 95,
      collectorDemandScore: 98,
      specificPullDenominator: 1400,
      scarcityScore: 94,
      gemRatePct: 18,
      hasFreshChaseCatalyst: true,
      ageYears: 0.4,
    });

    expect(alignOpportunityScoreWithScenario(94, smallUpside)).toBe(79);
    expect(alignConfluenceWithScenario(goldMine, smallUpside).label).toBe("Strong setup");
    expect(alignOpportunityScoreWithScenario(94, actionable)).toBe(94);
    expect(alignConfluenceWithScenario(goldMine, actionable).label).toBe("Gold mine setup");
    expect(alignOpportunityScoreWithScenario(94, null)).toBe(79);
    expect(alignConfluenceWithScenario(goldMine, null)).toMatchObject({
      score: 84,
      label: "Strong setup",
    });
  });

  it("does not publish a low-confidence scenario solely because its base case rises", () => {
    const scenario = {
      marketMode: "raw" as const,
      currentPrice: 100,
      currency: "EUR" as const,
      confidence: "Low" as const,
      drivers: ["market history"],
      points: [
        { days: 30, low: 96, base: 105, high: 115 },
        { days: 90, low: 98, base: 115, high: 135 },
        { days: 180, low: 100, base: 130, high: 165 },
      ],
    } satisfies ExternalPriceScenario;

    expect(isActionablePriceScenario(scenario)).toBe(true);
    expect(isWatchablePriceScenario(scenario, 90)).toBe(false);
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

  it("bounds eBay demand to a small opportunity-score modifier", () => {
    const shared = {
      externalScore: 65,
      sealedPressureScore: 60,
      scarcityScore: 60,
      confluenceScore: 60,
      rawTrend90dPct: 0,
      gradePremiumPct: null,
      gemRatePct: null,
      gradedAvailable: false,
      riskScore: 0,
    };
    const neutral = calculateOpportunityScores(shared);
    const supported = calculateOpportunityScores({ ...shared, rawEbayDemandAdjustment: 99 });
    const soft = calculateOpportunityScores({ ...shared, rawEbayDemandAdjustment: -99 });

    expect(supported.raw - neutral.raw).toBeLessThanOrEqual(6);
    expect(neutral.raw - soft.raw).toBeLessThanOrEqual(4);
  });

  it("keeps raw and graded eBay demand adjustments isolated", () => {
    const shared = {
      externalScore: 65,
      sealedPressureScore: 60,
      scarcityScore: 60,
      confluenceScore: 60,
      rawTrend90dPct: 0,
      gradePremiumPct: 100,
      gemRatePct: 30,
      gradedAvailable: true,
      riskScore: 0,
    };
    const neutral = calculateOpportunityScores(shared);
    const rawSupported = calculateOpportunityScores({
      ...shared,
      rawEbayDemandAdjustment: 6,
    });
    const gradedSoft = calculateOpportunityScores({
      ...shared,
      gradedEbayDemandAdjustment: -4,
    });

    expect(rawSupported.raw).toBeGreaterThan(neutral.raw);
    expect(rawSupported.graded).toBe(neutral.graded);
    expect(gradedSoft.raw).toBe(neutral.raw);
    expect(gradedSoft.graded).toBeLessThan(neutral.graded ?? 0);
  });
});
