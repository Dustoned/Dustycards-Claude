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
  type ExtendedPriceHistoryFeatures,
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

  it("raises sealed pressure when the raw chase value is dense relative to pack price", () => {
    const denseChase = calculateSealedPressure({
      ageYears: 4,
      packPrice: 15,
      rawCardPrice: 120,
      trend30dPct: 2,
      trend90dPct: 6,
      packProductCount: 2,
      hasReprintRisk: false,
    });
    const shallowChase = calculateSealedPressure({
      ageYears: 4,
      packPrice: 15,
      rawCardPrice: 24,
      trend30dPct: 2,
      trend90dPct: 6,
      packProductCount: 2,
      hasReprintRisk: false,
    });

    expect(denseChase.pressureScore).toBeGreaterThan(shallowChase.pressureScore);
    expect(denseChase.pressureLabel).not.toBe("Low");
  });

  it("does not let a trophy-card price overpower a healthy chase ratio", () => {
    const healthyChase = calculateSealedPressure({
      ageYears: 7,
      packPrice: 20,
      rawCardPrice: 160,
      trend30dPct: 2,
      trend90dPct: 6,
      packProductCount: 2,
      hasReprintRisk: false,
    });
    const trophyCard = calculateSealedPressure({
      ageYears: 7,
      packPrice: 20,
      rawCardPrice: 5_000,
      trend30dPct: 2,
      trend90dPct: 6,
      packProductCount: 2,
      hasReprintRisk: false,
    });

    expect(trophyCard).toEqual(healthyChase);
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

    expect(modern.score).toBe(25);
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

  it("produces distinct bearish, flat, modest, and strong 180-day regimes", () => {
    const shared = {
      marketMode: "raw" as const,
      currentPrice: 100,
      currency: "EUR" as const,
      ageYears: 4,
      opportunityScore: 95,
      scarcityScore: 95,
      gemRatePct: 12,
      evidenceCount: 4,
      historyPoints: 20,
    };
    const scenarios = {
      bearish: buildPriceScenario({
        ...shared,
        sealedTrendPct: -8,
        rawTrend90dPct: -18,
        ebayDemandAdjustment: -3,
        riskScore: 0.08,
      }),
      flat: buildPriceScenario({
        ...shared,
        sealedTrendPct: null,
        rawTrend90dPct: null,
        ebayDemandAdjustment: 0,
        riskScore: 0,
      }),
      modest: buildPriceScenario({
        ...shared,
        sealedTrendPct: 3,
        rawTrend90dPct: 5,
        ebayDemandAdjustment: 2,
        riskScore: 0,
      }),
      strong: buildPriceScenario({
        ...shared,
        sealedTrendPct: 30,
        rawTrend90dPct: 30,
        ebayDemandAdjustment: 6,
        riskScore: 0,
      }),
    };
    const horizon = (key: keyof typeof scenarios) =>
      scenarios[key]?.points.find((point) => point.days === 180)?.base ?? NaN;

    expect(horizon("bearish")).toBeLessThan(95);
    expect(horizon("flat")).toBe(100);
    expect(horizon("modest")).toBeGreaterThan(100);
    expect(horizon("modest")).toBeLessThanOrEqual(108);
    expect(horizon("strong")).toBeGreaterThanOrEqual(115);
    expect([
      horizon("bearish"),
      horizon("flat"),
      horizon("modest"),
      horizon("strong"),
    ]).toEqual([...[
      horizon("bearish"),
      horizon("flat"),
      horizon("modest"),
      horizon("strong"),
    ]].sort((left, right) => left - right));

    expect(isActionablePriceScenario(scenarios.modest)).toBe(false);
    expect(isActionablePriceScenario(scenarios.strong)).toBe(true);
    expect(scenarios.bearish?.points.map((point) => point.base)).toEqual(
      [...(scenarios.bearish?.points.map((point) => point.base) ?? [])].sort(
        (left, right) => right - left
      )
    );
    expect(scenarios.flat?.points.map((point) => point.base)).toEqual([100, 100, 100]);
    expect(scenarios.strong?.points.map((point) => point.base)).toEqual(
      [...(scenarios.strong?.points.map((point) => point.base) ?? [])].sort(
        (left, right) => left - right
      )
    );
  });

  it("does not use static ranking strength as automatic price direction", () => {
    const buildNeutral = (input: {
      opportunityScore: number;
      scarcityScore: number;
      gemRatePct: number | null;
    }) =>
      buildPriceScenario({
        marketMode: "graded",
        currentPrice: 100,
        currency: "EUR",
        ageYears: 7,
        sealedTrendPct: null,
        rawTrend90dPct: null,
        ebayDemandAdjustment: 0,
        riskScore: 0,
        evidenceCount: 4,
        historyPoints: 20,
        ...input,
      });

    const ordinary = buildNeutral({
      opportunityScore: 35,
      scarcityScore: 20,
      gemRatePct: 80,
    });
    const structurallyExceptional = buildNeutral({
      opportunityScore: 100,
      scarcityScore: 100,
      gemRatePct: 2,
    });

    expect(ordinary?.points.map((point) => point.base)).toEqual([100, 100, 100]);
    expect(structurallyExceptional?.points.map((point) => point.base)).toEqual([
      100,
      100,
      100,
    ]);
  });

  it("keeps an overextended newly released low rarity card out of a bullish forecast", () => {
    const scenario = buildPriceScenario({
      marketMode: "raw",
      currentPrice: 2,
      currency: "EUR",
      ageYears: 0.2,
      opportunityScore: 92,
      sealedTrendPct: null,
      rawTrend30dPct: 25,
      rawTrend90dPct: null,
      rawTrend180dPct: null,
      scarcityScore: 40,
      setRarityScore: 25,
      artistDemandScore: 92,
      collectorDemandScore: 100,
      catalystScore: 0.4,
      ebayDemandAdjustment: -4,
      currentVsEnglishNmAverage30dPct: 50,
      gemRatePct: null,
      riskScore: 0,
      evidenceCount: 4,
      historyPoints: 12,
    });

    expect(["flat", "down"]).toContain(scenario?.outlook);
    expect(scenario?.points.at(-1)?.base).toBeLessThanOrEqual(2);
  });

  it("allows a top-rarity launch chase with independent demand signals to be strong upside", () => {
    const scenario = buildPriceScenario({
      marketMode: "raw",
      currentPrice: 100,
      currency: "EUR",
      ageYears: 0.08,
      opportunityScore: 95,
      sealedTrendPct: 12,
      rawTrend30dPct: 22,
      rawTrend90dPct: null,
      rawTrend180dPct: null,
      scarcityScore: 86,
      setRarityScore: 100,
      confluenceScore: 94,
      artistDemandScore: 92,
      collectorDemandScore: 100,
      catalystScore: 0.8,
      ebayDemandAdjustment: 4,
      gemRatePct: 18,
      riskScore: 0,
      evidenceCount: 5,
      historyPoints: 12,
    });

    expect(scenario?.outlook).toBe("strong_up");
    expect(scenario?.expectedReturnPct180).toBeGreaterThanOrEqual(20);
  });

  it("lets a trusted reprint and weakening demand override positive old momentum", () => {
    const scenario = buildPriceScenario({
      marketMode: "raw",
      currentPrice: 100,
      currency: "EUR",
      ageYears: 4,
      opportunityScore: 88,
      sealedTrendPct: 10,
      rawTrend90dPct: 8,
      scarcityScore: 90,
      setRarityScore: 95,
      ebayDemandAdjustment: -2,
      lifecycleStatus: "reprint_restock",
      lifecycleConfidence: 90,
      lifecycleOopProbability: 15,
      gemRatePct: null,
      riskScore: 0.1,
      evidenceCount: 4,
      historyPoints: 20,
    });

    expect(scenario?.outlook).toBe("down");
    expect(scenario?.points.at(-1)?.base).toBeLessThan(100);
  });

  it("rounds a tiny low-price drift back to a genuinely flat base line", () => {
    const scenario = buildPriceScenario({
      marketMode: "raw",
      currentPrice: 2,
      currency: "EUR",
      ageYears: 3,
      opportunityScore: 75,
      sealedTrendPct: null,
      rawTrend90dPct: 1,
      scarcityScore: 70,
      gemRatePct: null,
      riskScore: 0,
      evidenceCount: 3,
      historyPoints: 15,
    });

    expect(scenario?.outlook).toBe("flat");
    expect(scenario?.points.map((point) => point.base)).toEqual([2, 2, 2]);
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

  const extendedFeatures = (
    overrides: Partial<ExtendedPriceHistoryFeatures>
  ): ExtendedPriceHistoryFeatures => ({
    volatilityDaily90Pct: null,
    athDistancePct: null,
    momentum365Pct: null,
    jpLeadLagPct: null,
    setRelativeStrength90Pct: null,
    avg30AnchorGapPct: null,
    ...overrides,
  });

  it("treats missing extended history exactly like an all-null feature set", () => {
    const shared = {
      marketMode: "raw" as const,
      currentPrice: 100,
      currency: "EUR" as const,
      ageYears: 4,
      opportunityScore: 82,
      sealedTrendPct: 6,
      rawTrend90dPct: 15,
      scarcityScore: 80,
      gemRatePct: null,
      ebayDemandAdjustment: 2,
      riskScore: 0,
      evidenceCount: 3,
      historyPoints: 10,
    };
    const absent = buildPriceScenario(shared);
    const explicitNull = buildPriceScenario({ ...shared, extendedHistory: null });
    const allNullFeatures = buildPriceScenario({
      ...shared,
      extendedHistory: extendedFeatures({}),
    });

    expect(explicitNull).toEqual(absent);
    expect(allNullFeatures).toEqual(absent);
  });

  it("counts the same momentum for more on a stable card than a volatile one", () => {
    const shared = {
      marketMode: "raw" as const,
      currentPrice: 100,
      currency: "EUR" as const,
      ageYears: 4,
      opportunityScore: 82,
      sealedTrendPct: null,
      rawTrend90dPct: 15,
      scarcityScore: 80,
      gemRatePct: null,
      riskScore: 0,
      evidenceCount: 3,
      historyPoints: 10,
    };
    const stable = buildPriceScenario({
      ...shared,
      extendedHistory: extendedFeatures({ volatilityDaily90Pct: 1 }),
    });
    const choppy = buildPriceScenario({
      ...shared,
      extendedHistory: extendedFeatures({ volatilityDaily90Pct: 4 }),
    });
    const span = (scenario: ReturnType<typeof buildPriceScenario>) => {
      const horizon = scenario?.points.at(-1);
      return horizon == null ? NaN : horizon.high - horizon.low;
    };

    expect(stable?.points.at(-1)?.base).toBeGreaterThan(choppy?.points.at(-1)?.base ?? NaN);
    expect(span(choppy)).toBeGreaterThan(span(stable));
  });

  it("requires calm dispersion for High confidence and demotes extremes to Low", () => {
    const shared = {
      marketMode: "raw" as const,
      currentPrice: 100,
      currency: "EUR" as const,
      ageYears: 4,
      opportunityScore: 82,
      sealedTrendPct: null,
      rawTrend90dPct: 8,
      scarcityScore: 80,
      gemRatePct: null,
      riskScore: 0,
      evidenceCount: 4,
      historyPoints: 20,
    };

    expect(buildPriceScenario(shared)?.confidence).toBe("High");
    expect(
      buildPriceScenario({
        ...shared,
        extendedHistory: extendedFeatures({ volatilityDaily90Pct: 6 }),
      })?.confidence
    ).toBe("Medium");
    expect(
      buildPriceScenario({
        ...shared,
        extendedHistory: extendedFeatures({ volatilityDaily90Pct: 9 }),
      })?.confidence
    ).toBe("Low");
  });

  it("penalizes hot trends near the all-time high and rewards recovering deep discounts", () => {
    const hotShared = {
      marketMode: "raw" as const,
      currentPrice: 100,
      currency: "EUR" as const,
      ageYears: 4,
      opportunityScore: 82,
      sealedTrendPct: null,
      rawTrend90dPct: 30,
      scarcityScore: 80,
      gemRatePct: null,
      riskScore: 0,
      evidenceCount: 3,
      historyPoints: 10,
    };
    const unanchored = buildPriceScenario(hotShared);
    const nearAth = buildPriceScenario({
      ...hotShared,
      extendedHistory: extendedFeatures({ athDistancePct: -2 }),
    });
    const recoveryShared = { ...hotShared, rawTrend90dPct: 5 };
    const noRecoveryContext = buildPriceScenario(recoveryShared);
    const deepRecovery = buildPriceScenario({
      ...recoveryShared,
      extendedHistory: extendedFeatures({ athDistancePct: -60 }),
    });

    expect(nearAth?.points.at(-1)?.base).toBeLessThan(unanchored?.points.at(-1)?.base ?? NaN);
    expect(deepRecovery?.points.at(-1)?.base).toBeGreaterThan(
      noRecoveryContext?.points.at(-1)?.base ?? NaN
    );
  });

  it("uses the avg30 anchor gap as the valuation signal when extended history is loaded", () => {
    const shared = {
      marketMode: "raw" as const,
      currentPrice: 100,
      currency: "EUR" as const,
      ageYears: 4,
      opportunityScore: 82,
      sealedTrendPct: null,
      rawTrend90dPct: 10,
      scarcityScore: 80,
      gemRatePct: null,
      riskScore: 0,
      evidenceCount: 3,
      historyPoints: 10,
      currentVsEnglishNmAverage30dPct: 50,
    };
    const legacyAnchor = buildPriceScenario(shared);
    const thinFloor = buildPriceScenario({
      ...shared,
      extendedHistory: extendedFeatures({ avg30AnchorGapPct: -40 }),
    });
    const stretchedFloor = buildPriceScenario({
      ...shared,
      extendedHistory: extendedFeatures({ avg30AnchorGapPct: 40 }),
    });

    expect(thinFloor?.points.at(-1)?.base).toBeGreaterThan(
      stretchedFloor?.points.at(-1)?.base ?? NaN
    );
    expect(thinFloor?.points.at(-1)?.base).toBeGreaterThan(
      legacyAnchor?.points.at(-1)?.base ?? NaN
    );
  });

  it("adds clamped long-horizon, JP lead-lag and set-relative contributions", () => {
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
    const neutral = buildPriceScenario(shared);
    const supportive = buildPriceScenario({
      ...shared,
      extendedHistory: extendedFeatures({
        momentum365Pct: 500,
        jpLeadLagPct: 500,
        setRelativeStrength90Pct: 500,
      }),
    });
    const weakening = buildPriceScenario({
      ...shared,
      extendedHistory: extendedFeatures({
        momentum365Pct: -500,
        jpLeadLagPct: -500,
        setRelativeStrength90Pct: -500,
      }),
    });

    expect(neutral?.points.at(-1)?.base).toBe(100);
    expect(supportive?.points.at(-1)?.base).toBeGreaterThan(100);
    expect(supportive?.expectedReturnPct180 ?? 0).toBeLessThanOrEqual(17);
    expect(weakening?.points.at(-1)?.base).toBeLessThan(100);
    expect(weakening?.expectedReturnPct180 ?? 0).toBeGreaterThanOrEqual(-12);
  });

  it("mirrors the quality bonus as a penalty for weak quality on strong negative evidence", () => {
    const shared = {
      marketMode: "raw" as const,
      currentPrice: 100,
      currency: "EUR" as const,
      ageYears: 5,
      opportunityScore: 60,
      sealedTrendPct: null,
      rawTrend90dPct: -20,
      gemRatePct: null,
      riskScore: 0,
      evidenceCount: 3,
      historyPoints: 12,
    };
    const weakQuality = buildPriceScenario({
      ...shared,
      scarcityScore: 20,
      setRarityScore: 10,
      artistDemandScore: 20,
      collectorDemandScore: 25,
    });
    const middlingQuality = buildPriceScenario({
      ...shared,
      scarcityScore: 55,
      setRarityScore: 55,
      artistDemandScore: 55,
      collectorDemandScore: 55,
    });

    expect(weakQuality?.points.at(-1)?.base).toBeLessThan(
      middlingQuality?.points.at(-1)?.base ?? NaN
    );
  });

  it("widens the low band with the same factor as the high band when the outlook is down", () => {
    const scenario = buildPriceScenario({
      marketMode: "raw",
      currentPrice: 100,
      currency: "EUR",
      ageYears: 5,
      opportunityScore: 70,
      sealedTrendPct: null,
      rawTrend90dPct: -20,
      scarcityScore: 60,
      gemRatePct: null,
      riskScore: 0,
      evidenceCount: 3,
      historyPoints: 12,
    });
    const horizon = scenario?.points.at(-1);

    expect(scenario?.outlook).toBe("down");
    // The 0.35x-current low-band floor can lift the low point a few cents, so
    // symmetry is asserted to the nearest 0.5 rather than 0.05.
    expect((horizon?.base ?? 0) - (horizon?.low ?? 0)).toBeCloseTo(
      (horizon?.high ?? 0) - (horizon?.base ?? 0),
      0
    );
  });
});
