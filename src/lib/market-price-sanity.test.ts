import { describe, expect, it } from "vitest";
import {
  getCurrentRawCardmarketValue,
  getSaneCardmarketAverage7d,
} from "@/lib/market-price-sanity";

describe("CardMarket raw price sanity", () => {
  it("rejects a corrupted 7-day average against several language anchors", () => {
    const price = {
      cm_en_avg_7d: 4507.66,
      cm_en_lowest_nm: 604.15,
      cm_de_lowest_nm: 395,
      cm_fr_lowest_nm: 449.99,
      cm_es_lowest_nm: 879.95,
      cm_it_lowest_nm: 1500,
    };

    expect(getSaneCardmarketAverage7d(price)).toBeNull();
    expect(getCurrentRawCardmarketValue(price)).toBe(604.15);
  });

  it("keeps a plausible average available as a fallback", () => {
    const price = {
      cm_en_avg_7d: 49.49,
      cm_en_lowest_nm: null,
      cm_de_lowest_nm: null,
      cm_fr_lowest_nm: null,
      cm_es_lowest_nm: null,
      cm_it_lowest_nm: null,
    };

    expect(getSaneCardmarketAverage7d(price)).toBe(49.49);
    expect(getCurrentRawCardmarketValue(price)).toBe(49.49);
  });
});
