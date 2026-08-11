import { describe, expect, it } from "vitest";
import {
  hasPriceSourceProvenanceChanged,
  preserveRecentDirectEnglishNmPrice,
} from "@/lib/sync/direct-cardmarket-protection";
import type { ExistingPriceRecord, PriceSnapshotData } from "@/lib/sync/card-helpers";

function price(cm: number | null): PriceSnapshotData {
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
  it("treats identical values from a different provider as a new observation", () => {
    const latest: ExistingPriceRecord = {
      id: "base",
      ...price(37),
      fetched_at: new Date("2026-08-11T10:00:00Z"),
      source: "cardmarket_base_backfill",
      source_provider: "firecrawl",
    };
    expect(hasPriceSourceProvenanceChanged(latest, "tcggo", "tcggo")).toBe(true);
    expect(
      hasPriceSourceProvenanceChanged(latest, "cardmarket_base_backfill", "firecrawl")
    ).toBe(false);
  });

  it("keeps direct EN/NM untouched while retaining an independent TCP observation", () => {
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
      preserveExistingSnapshot: false,
      price: { ...price(null), tcp_market: 130 },
      source: "tcggo",
      sourceProvider: "tcggo",
      sourceUrl: null,
    });
  });

  it("does not create an empty TCGGo row when only protected EN/NM was returned", () => {
    const latest: ExistingPriceRecord = {
      id: "direct",
      ...price(90),
      fetched_at: new Date("2026-07-21T10:00:00Z"),
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
      preserveExistingSnapshot: true,
      price: price(null),
      source: "tcggo",
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

  it("keeps base CM observations separate from later TCP-only snapshots", () => {
    const latest: ExistingPriceRecord = {
      id: "base-backfill",
      ...price(37),
      tcp_market: 40,
      fetched_at: new Date("2026-07-01T10:00:00Z"),
      source: "cardmarket_base_backfill",
      source_provider: "firecrawl",
      source_url: "https://www.cardmarket.com/card",
    };

    expect(
      preserveRecentDirectEnglishNmPrice(
        latest,
        { ...price(null), tcp_market: 45 },
        new Date("2026-08-11T12:00:00Z")
      )
    ).toMatchObject({
      preserveExistingSnapshot: false,
      price: { cm_en_lowest_nm: null, tcp_market: 45 },
      source: "tcggo",
    });

    expect(
      preserveRecentDirectEnglishNmPrice(
        latest,
        { ...price(39), tcp_market: 45 },
        new Date("2026-08-11T12:00:00Z")
      )
    ).toMatchObject({
      preserveExistingSnapshot: false,
      price: { cm_en_lowest_nm: 39, tcp_market: 45 },
      source: "tcggo",
    });
  });

  it("protects a recent base backfill across consecutive TCGGo refreshes", () => {
    const authoritativeBase: ExistingPriceRecord = {
      id: "base-backfill",
      ...price(37),
      fetched_at: new Date("2026-08-11T10:00:00Z"),
      source: "cardmarket_base_backfill",
      source_provider: "firecrawl",
    };

    for (const checkedAt of ["2026-08-11T12:00:00Z", "2026-08-11T14:00:00Z"]) {
      expect(
        preserveRecentDirectEnglishNmPrice(
          authoritativeBase,
          { ...price(39), tcp_market: 45 },
          new Date(checkedAt)
        )
      ).toMatchObject({
        preserveExistingSnapshot: false,
        price: { cm_en_lowest_nm: null, tcp_market: 45 },
        source: "tcggo",
      });
    }
  });
});
