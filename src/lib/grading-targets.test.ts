import { describe, expect, it } from "vitest";
import {
  buildGradingTargetAssessment,
  parseGradingTargetLabel,
} from "@/lib/grading-targets";

describe("grading target equivalence", () => {
  it("treats BGS 9.5 as PSA 10 equivalent and BGS 10 as pristine", () => {
    expect(parseGradingTargetLabel("BGS 9.5")).toMatchObject({
      tier: "gem",
      isGradeTenEquivalent: true,
    });
    expect(parseGradingTargetLabel("PSA 10")).toMatchObject({
      tier: "gem",
      isGradeTenEquivalent: true,
    });
    expect(parseGradingTargetLabel("BGS 10")).toMatchObject({
      tier: "pristine",
      isGradeTenEquivalent: true,
    });
  });

  it("uses every company in the same numeric grade tier", () => {
    const assessment = buildGradingTargetAssessment({
      label: "PSA 10",
      marketPrice: 600,
      rawPrice: 100,
      ageYears: 5,
      peerPrices: [
        { label: "BGS 9.5", price: 550 },
        { label: "CGC 10", price: 420 },
        { label: "PSA 9", price: 180 },
        { label: "BGS 9", price: 170 },
      ],
    });

    expect(assessment.equivalentLabel).toBe("CGC 10");
    expect(assessment.fallbackLabel).toBe("BGS 9");
    expect(assessment.gradeStepMultiplier).toBeGreaterThan(3);
  });

  it("caps an unsupported gem ask against an equivalent-company price", () => {
    const assessment = buildGradingTargetAssessment({
      label: "PSA 10",
      marketPrice: 5_000,
      rawPrice: 120,
      ageYears: 6,
      peerPrices: [
        { label: "BGS 9.5", price: 700 },
        { label: "PSA 9", price: 200 },
      ],
    });

    expect(assessment.targetPrice).toBe(2_100);
    expect(assessment.priceAdjusted).toBe(true);
    expect(assessment.priceStatus).toBe("thin_history");
  });

  it("penalizes a huge 10-to-9 spread through the estimated hit rate", () => {
    const balanced = buildGradingTargetAssessment({
      label: "PSA 10",
      marketPrice: 600,
      rawPrice: 100,
      ageYears: 8,
      peerPrices: [{ label: "PSA 9", price: 250 }],
    });
    const extreme = buildGradingTargetAssessment({
      label: "PSA 10",
      marketPrice: 2_000,
      rawPrice: 100,
      ageYears: 8,
      peerPrices: [{ label: "PSA 9", price: 50 }],
    });

    expect(balanced.spreadRisk).toBe("normal");
    expect(extreme.spreadRisk).toBe("extreme");
    expect(extreme.targetPrice).toBe(1_250);
    expect(extreme.priceStatus).toBe("thin_history");
    expect(extreme.estimatedHitRatePct).toBeLessThan(balanced.estimatedHitRatePct);
  });

  it("does not let an inverted lower-grade ask inflate expected value", () => {
    const assessment = buildGradingTargetAssessment({
      label: "PSA 10",
      marketPrice: 1_000,
      rawPrice: 100,
      ageYears: 8,
      peerPrices: [{ label: "PSA 9", price: 2_000 }],
    });

    expect(assessment.fallbackPrice).toBeNull();
    expect(assessment.expectedValue).toBeLessThan(1_000);
    expect(assessment.priceStatus).toBe("thin_history");
  });

  it("keeps the BGS 10 premium separate but assigns a much lower hit rate", () => {
    const bgs95 = buildGradingTargetAssessment({
      label: "BGS 9.5",
      marketPrice: 700,
      rawPrice: 100,
      ageYears: 5,
      peerPrices: [
        { label: "PSA 10", price: 650 },
        { label: "BGS 9", price: 220 },
      ],
    });
    const bgs10 = buildGradingTargetAssessment({
      label: "BGS 10",
      marketPrice: 4_000,
      rawPrice: 100,
      ageYears: 5,
      peerPrices: [
        { label: "PSA 10", price: 650 },
        { label: "BGS 9.5", price: 700 },
      ],
    });

    expect(bgs10.targetPrice).toBe(4_000);
    expect(bgs10.fallbackLabel).toBe("PSA 10");
    expect(bgs10.estimatedHitRatePct).toBeLessThan(bgs95.estimatedHitRatePct);
  });

  it("rejects penny-raw and unsupported extreme grade premiums", () => {
    const pennyRaw = buildGradingTargetAssessment({
      label: "PSA 10",
      marketPrice: 400,
      rawPrice: 0.05,
      ageYears: 4,
      peerPrices: [],
    });
    const unsupported = buildGradingTargetAssessment({
      label: "PSA 10",
      marketPrice: 40_000,
      rawPrice: 100,
      ageYears: 12,
      peerPrices: [],
    });

    expect(pennyRaw.priceStatus).toBe("suspicious");
    expect(unsupported.priceStatus).toBe("suspicious");
  });
});
