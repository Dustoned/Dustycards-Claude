import { describe, expect, it } from "vitest";
import { assessSetLifecycle } from "@/lib/set-lifecycle-core";

const AS_OF = "2026-07-14T00:00:00.000Z";

function matureSet(overrides: Parameters<typeof assessSetLifecycle>[0] = {}) {
  return assessSetLifecycle({
    asOf: AS_OF,
    releaseDate: "2018-08-01T00:00:00.000Z",
    latestProductReleaseDate: "2019-02-01T00:00:00.000Z",
    supplyDataAsOf: "2026-07-01T00:00:00.000Z",
    observationCount: 6,
    totalProductCount: 12,
    pricedProductCount: 10,
    activeProductCount: 1,
    supplyChange90dPct: -45,
    consecutiveSupplyContractionObservations: 3,
    ...overrides,
  });
}

describe("assessSetLifecycle", () => {
  it("marks a future set as upcoming and caps OOP probability at zero", () => {
    const result = assessSetLifecycle({
      asOf: AS_OF,
      releaseDate: "2026-09-01T00:00:00.000Z",
      supplyDataAsOf: "2026-07-12T00:00:00.000Z",
      observationCount: 4,
      supplyChange90dPct: -80,
      consecutiveSupplyContractionObservations: 4,
      explicitOopEvidence: true,
    });

    expect(result.status).toBe("upcoming");
    expect(result.oopProbability).toBe(0);
    expect(result.label).toBe("Upcoming");
  });

  it("keeps launch-year volatility out of OOP classifications", () => {
    const result = assessSetLifecycle({
      asOf: AS_OF,
      releaseDate: "2026-03-27T00:00:00.000Z",
      supplyDataAsOf: "2026-07-10T00:00:00.000Z",
      observationCount: 8,
      totalProductCount: 20,
      activeProductCount: 1,
      supplyChange90dPct: -75,
      consecutiveSupplyContractionObservations: 5,
      explicitOopEvidence: true,
      priceTrend90dPct: 120,
    });

    expect(result.status).toBe("launch_window");
    expect(result.oopProbability).toBeLessThanOrEqual(8);
    expect(result.summary).toContain("premature");
  });

  it("allows only official explicit evidence to confirm OOP", () => {
    const unofficial = matureSet({ explicitOopEvidence: true });
    const official = matureSet({ officialExplicitOop: true });

    expect(unofficial.status).toBe("likely_out_of_print");
    expect(official.status).toBe("confirmed_out_of_print");
    expect(official.oopProbability).toBe(100);
    expect(official.confidence).toBe(100);
  });

  it("lets a recent reprint override an older official OOP signal", () => {
    const result = matureSet({
      officialExplicitOop: true,
      recentReprintOrRestock: true,
    });

    expect(result.status).toBe("reprint_restock");
    expect(result.oopProbability).toBeLessThan(10);
  });

  it("recognizes a dated reprint observation only inside the recent window", () => {
    const recent = matureSet({
      reprintOrRestockObservedAt: "2026-05-10T00:00:00.000Z",
    });
    const old = matureSet({
      reprintOrRestockObservedAt: "2025-01-01T00:00:00.000Z",
    });

    expect(recent.status).toBe("reprint_restock");
    expect(old.status).toBe("likely_out_of_print");
  });

  it("requires at least three observations for likely OOP", () => {
    const result = matureSet({
      observationCount: 2,
      explicitOopEvidence: true,
    });

    expect(result.status).toBe("unknown_historical");
    expect(result.confidenceLabel).toBe("low");
    expect(result.reasons.join(" ")).toContain("Only 2");
  });

  it("requires fresh supply data for likely OOP", () => {
    const result = matureSet({
      supplyDataAsOf: "2025-12-01T00:00:00.000Z",
      explicitOopEvidence: true,
    });

    expect(result.status).toBe("unknown_historical");
    expect(result.supplyDataFresh).toBe(false);
    expect(result.oopProbability).toBeLessThanOrEqual(54);
  });

  it("never treats a price spike by itself as OOP evidence", () => {
    const result = matureSet({
      activeProductCount: 8,
      supplyChange90dPct: 0,
      consecutiveSupplyContractionObservations: 0,
      explicitOopEvidence: false,
      priceTrend30dPct: 250,
      priceTrend90dPct: 500,
    });

    expect(result.status).toBe("actively_supplied");
    expect(result.oopProbability).toBeLessThan(45);
    expect(result.reasons).not.toContain(
      "Sealed prices rose alongside the supply contraction"
    );
  });

  it("requires repeated contraction, not one noisy availability drop", () => {
    const oneDrop = matureSet({
      supplyChange90dPct: -70,
      consecutiveSupplyContractionObservations: 1,
      explicitOopEvidence: false,
    });
    const repeated = matureSet({
      supplyChange90dPct: -70,
      consecutiveSupplyContractionObservations: 3,
      explicitOopEvidence: false,
    });

    expect(oneDrop.status).toBe("actively_supplied");
    expect(repeated.status).toBe("likely_out_of_print");
  });

  it("uses a recent linked product to prevent a false OOP classification", () => {
    const result = matureSet({
      latestProductReleaseDate: "2026-02-01T00:00:00.000Z",
      explicitOopEvidence: true,
    });

    expect(result.status).not.toBe("likely_out_of_print");
    expect(result.status).toBe("supply_tightening");
    expect(result.reasons.join(" ")).toContain("recent set-linked product");
  });

  it("classifies mature repeated supply contraction as likely OOP", () => {
    const result = matureSet();

    expect(result.status).toBe("likely_out_of_print");
    expect(result.oopProbability).toBeGreaterThanOrEqual(65);
    expect(result.confidence).toBeGreaterThanOrEqual(75);
    expect(result.reasons.length).toBeGreaterThan(1);
  });

  it("uses supply tightening below the likely-OOP threshold", () => {
    const result = assessSetLifecycle({
      asOf: AS_OF,
      releaseDate: "2024-06-01T00:00:00.000Z",
      supplyDataAsOf: "2026-07-01T00:00:00.000Z",
      observationCount: 5,
      totalProductCount: 20,
      pricedProductCount: 18,
      activeProductCount: 8,
      supplyChange90dPct: -20,
      consecutiveSupplyContractionObservations: 2,
    });

    expect(result.status).toBe("supply_tightening");
    expect(result.oopProbability).toBeLessThan(65);
  });

  it("accepts explicit contraction only when the caller supplies real evidence", () => {
    const noEvidence = matureSet({
      activeProductCount: null,
      supplyChange90dPct: null,
      consecutiveSupplyContractionObservations: 0,
      explicitSupplyContraction: false,
    });
    const verifiedEvidence = matureSet({
      activeProductCount: null,
      supplyChange90dPct: null,
      consecutiveSupplyContractionObservations: 0,
      explicitSupplyContraction: true,
    });

    expect(noEvidence.status).toBe("unknown_historical");
    expect(verifiedEvidence.status).toBe("likely_out_of_print");
    expect(verifiedEvidence.reasons.join(" ")).toContain("verified supply source");
  });

  it("does not mistake price coverage for current product availability", () => {
    const result = matureSet({
      activeProductCount: null,
      supplyChange90dPct: null,
      explicitSupplyContraction: false,
      pricedProductCount: 12,
      totalProductCount: 12,
      priceTrend90dPct: 80,
    });

    expect(result.status).toBe("unknown_historical");
    expect(result.supplyDataFresh).toBe(false);
    expect(result.reasons.join(" ")).toContain("No measured product-availability");
  });

  it("returns unknown historical for missing release and supply evidence", () => {
    const result = assessSetLifecycle({ asOf: AS_OF, priceTrend90dPct: 80 });

    expect(result.status).toBe("unknown_historical");
    expect(result.ageDays).toBeNull();
    expect(result.confidence).toBeLessThan(40);
  });

  it("sanitizes invalid dates and impossible numeric inputs", () => {
    const result = assessSetLifecycle({
      asOf: AS_OF,
      releaseDate: "not-a-date",
      supplyDataAsOf: "also-not-a-date",
      observationCount: -10,
      totalProductCount: Number.NaN,
      activeProductCount: Number.POSITIVE_INFINITY,
      supplyChange90dPct: Number.NaN,
    });

    expect(result.status).toBe("unknown_historical");
    expect(result.oopProbability).toBeGreaterThanOrEqual(0);
    expect(result.oopProbability).toBeLessThanOrEqual(100);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });

  it("keeps output reasons concise and duplicate-free", () => {
    const result = matureSet({ explicitOopEvidence: true });

    expect(result.reasons.length).toBeLessThanOrEqual(5);
    expect(new Set(result.reasons).size).toBe(result.reasons.length);
    expect(result.modelVersion).toBe(1);
  });
});
