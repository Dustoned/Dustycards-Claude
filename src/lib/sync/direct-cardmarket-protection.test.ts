import { describe, expect, it } from "vitest";
import { preserveRecentDirectEnglishNmPrice } from "@/lib/sync/direct-cardmarket-protection";
import type { ExistingPriceRecord, PriceSnapshotData } from "@/lib/sync/card-helpers";

function price(cm: number): PriceSnapshotData {
  return {
    cm_en_lowest_nm: cm,
    cm_de_lowest_nm: null,
    cm_fr_lowest_nm: null,
    cm_es_lowest_nm: null,
    cm_it_lowest_nm: null,
    cm_jp_lowest_nm: null,
    cm_en_avg_30d: null,
    cm_en_avg_7d: null,
    tcp_market: null,
    tcp_mid: null,
    tcp_low: null,
  };
}

describe("direct CardMarket price protection", () => {
  it("keeps a recent direct EN/NM quote when TCGGo is behind", () => {
    const latest: ExistingPriceRecord = {
      id: "direct",
      ...price(90),
      fetched_at: new Date("2026-07-21T10:00:00Z"),
      source: "cardmarket-direct",
      source_provider: "scrapedo",
      source_url: "https://www.cardmarket.com/card",
    };
    expect(
      preserveRecentDirectEnglishNmPrice(
        latest,
        { ...price(120), tcp_market: 130 },
        new Date("2026-07-21T12:00:00Z")
      )
    ).toEqual({
      preserveExistingSnapshot: true,
      price: { ...price(90), tcp_market: 130 },
      source: "cardmarket-direct",
      sourceProvider: "scrapedo",
      sourceUrl: "https://www.cardmarket.com/card",
    });
  });

  it("returns to TCGGo after the direct protection window", () => {
    const latest: ExistingPriceRecord = {
      id: "direct",
      ...price(90),
      fetched_at: new Date("2026-07-19T10:00:00Z"),
      source: "cardmarket-direct",
      source_provider: "scrapedo",
    };
    expect(
      preserveRecentDirectEnglishNmPrice(
        latest,
        price(120),
        new Date("2026-07-21T12:00:00Z")
      )
    ).toMatchObject({
      preserveExistingSnapshot: false,
      price: { cm_en_lowest_nm: 120 },
      source: "tcggo",
    });
  });
});
