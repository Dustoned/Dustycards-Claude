import { describe, expect, it } from "vitest";

import {
  buildNormalizedSealedPriceFields,
  buildPreservingSealedPriceUpdate,
  getLatestValidSealedPriceAt,
  hasValidSealedCurrentPrice,
  type SealedPriceFields,
} from "@/lib/sealed-price-preservation";

const emptyPrice = (): SealedPriceFields => ({
  cm_lowest: null,
  cm_lowest_eu: null,
  cm_lowest_de: null,
  cm_lowest_fr: null,
  cm_lowest_es: null,
  cm_lowest_it: null,
  cm_avg_7d: null,
  cm_avg_30d: null,
});

describe("sealed current-price preservation", () => {
  it("does not overwrite stored values when a catalog response returns null", () => {
    expect(buildPreservingSealedPriceUpdate(emptyPrice())).toEqual({
      cm_lowest: undefined,
      cm_lowest_eu: undefined,
      cm_lowest_de: undefined,
      cm_lowest_fr: undefined,
      cm_lowest_es: undefined,
      cm_lowest_it: undefined,
      cm_avg_7d: undefined,
      cm_avg_30d: undefined,
    });
  });

  it("replaces all current variants atomically when any fresh quote exists", () => {
    expect(
      buildPreservingSealedPriceUpdate({
        ...emptyPrice(),
        cm_lowest: 100,
      })
    ).toMatchObject({
      cm_lowest: 100,
      cm_lowest_eu: null,
      cm_lowest_de: null,
      cm_lowest_fr: null,
      cm_lowest_es: null,
      cm_lowest_it: null,
    });
  });

  it("normalizes absent, zero and sentinel responses instead of storing fake prices", () => {
    expect(
      buildNormalizedSealedPriceFields({
        ...emptyPrice(),
        cm_lowest: 9001,
        cm_lowest_eu: 0,
        cm_lowest_de: 42,
      })
    ).toMatchObject({
      cm_lowest: null,
      cm_lowest_eu: null,
      cm_lowest_de: 42,
    });
  });

  it("distinguishes current market quotes from averages", () => {
    const averageOnly = { ...emptyPrice(), cm_avg_7d: 50 };
    expect(hasValidSealedCurrentPrice(averageOnly)).toBe(false);
    expect(hasValidSealedCurrentPrice({ ...emptyPrice(), cm_lowest_fr: 48 })).toBe(true);
  });

  it("reports the timestamp of the latest real quote, not the latest empty sync", () => {
    const snapshots = [
      { ...emptyPrice(), cm_lowest_eu: 90, fetched_at: "2026-07-01T12:00:00.000Z" },
      { ...emptyPrice(), cm_avg_7d: 95, fetched_at: "2026-08-10T12:00:00.000Z" },
    ];
    expect(
      getLatestValidSealedPriceAt(snapshots)
    ).toBe("2026-07-01T12:00:00.000Z");
  });
});
