import { describe, expect, it } from "vitest";
import { buildCardMarketStats, type BuildCardMarketStatsInput } from "@/lib/card-market-stats";
import type { EbayDemandPayload } from "@/lib/ebay-demand";
import type { CardPriceHistoryPoint } from "@/lib/price-history";

function history(values: number[]): CardPriceHistoryPoint[] {
  return values.map((value, index) => {
    const date = new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10);
    return {
      date,
      label: date,
      cm_market: value,
      cm_market_en: value,
      cm_market_de: null,
      cm_market_fr: null,
      cm_market_es: null,
      cm_market_it: null,
      cm_market_jp: null,
      tcp_market: null,
      cm_avg_7d: null,
      cm_avg_30d: null,
    };
  });
}

function demand(overrides: Partial<EbayDemandPayload["summary"]> = {}): EbayDemandPayload {
  return {
    updatedAt: "2026-01-30T12:00:00.000Z",
    marketplaceId: "EBAY_NL",
    mode: "raw",
    sample: { observed: 24, clean: 18, capped: false },
    summary: {
      activeCount: 18,
      new7d: 3,
      removed7d: 8,
      removalPressure7d: 34,
      baseline30d: 25,
      pressureChangePercent: 36,
      medianAskEur: 52,
      lowestAskEur: 45,
      auctionCount: 0,
      fixedCount: 18,
      ...overrides,
    },
    history: Array.from({ length: 10 }, (_, index) => ({
      date: `2026-01-${String(index + 21).padStart(2, "0")}`,
      activeCount: 18,
      newCount: index % 3 === 0 ? 1 : 0,
      removedCount: index % 2,
      medianAskEur: 52,
    })),
  };
}

function buildInput(overrides: Partial<BuildCardMarketStatsInput> = {}): BuildCardMarketStatsInput {
  return {
    history: history(Array.from({ length: 45 }, (_, index) => 20 * 1.01 ** index)),
    currentLanguagePrices: {
      en: 31,
      de: 29,
      fr: 33,
      es: null,
      it: null,
      jp: null,
    },
    rawPrice: 31,
    gradedPrices: [],
    ebaySoldGradedPrices: [],
    demand: demand(),
    updatedAt: "2026-02-14T10:00:00.000Z",
    ...overrides,
  };
}

describe("buildCardMarketStats", () => {
  it("scores sustained price direction and calculates RSI, ATH and ATL", () => {
    const stats = buildCardMarketStats(buildInput());

    expect(stats.score).not.toBeNull();
    expect(stats.metrics.momentum).toBeGreaterThan(50);
    expect(stats.metrics.stability).toBeGreaterThan(90);
    expect(stats.rsi).toBe(100);
    expect(stats.rsi_label).toBe("Overbought");
    expect(stats.ath).toBeGreaterThan(stats.atl ?? 0);
    expect(stats.language_spread).toBe(4);
    expect(stats.data_points).toBe(45);
  });

  it("penalizes erratic histories through volatility and stability", () => {
    const stable = buildCardMarketStats(buildInput());
    const volatile = buildCardMarketStats(buildInput({
      history: history(Array.from({ length: 45 }, (_, index) => index % 2 === 0 ? 20 : 42)),
    }));

    expect(volatile.volatility_percent).toBeGreaterThan(stable.volatility_percent ?? 0);
    expect(volatile.metrics.stability).toBeLessThan(stable.metrics.stability ?? 100);
  });

  it("keeps missing market inputs neutral and reports low confidence", () => {
    const stats = buildCardMarketStats(buildInput({
      history: history([20]),
      currentLanguagePrices: { en: 20 },
      rawPrice: 20,
      demand: null,
    }));

    expect(stats.score).toBeNull();
    expect(stats.tier).toBe("BUILDING");
    expect(stats.confidence).toBe("low");
    expect(stats.metrics.liquidity).toBeNull();
    expect(stats.metrics.demand).toBeNull();
  });

  it("prefers eBay sold evidence and treats BGS 9.5 as a gem-mint peer", () => {
    const stats = buildCardMarketStats(buildInput({
      rawPrice: 50,
      gradedPrices: [
        { label: "PSA 10", price: 300 },
        { label: "BGS 9.5", price: 225 },
      ],
      ebaySoldGradedPrices: [
        {
          label: "PSA 10",
          company: "PSA",
          grade: "10",
          median_price: 240,
          median_price_eur: 240,
          currency: "EUR",
          sample_size: 6,
        },
      ],
    }));

    expect(stats.graded_comparisons[0]).toEqual(expect.objectContaining({
      label: "PSA 10",
      price_eur: 240,
      raw_multiple: 4.8,
      source: "ebay_sold",
      reliability: "high",
    }));
    expect(stats.graded_comparisons.map((comparison) => comparison.label)).toContain("BGS 9.5");
    expect(stats.metrics.grade_premium).toBeGreaterThan(50);
  });

  it("passes through TCGGO fields only as an optional comparison", () => {
    const stats = buildCardMarketStats(buildInput({
      tcggo: {
        score: 57,
        tier: "neutral",
        momentum: 71,
        gradePremium: 26,
        updatedAt: "2026-02-14T08:00:00.000Z",
      },
    }));

    expect(stats.tcggo).toEqual(expect.objectContaining({
      score: 57,
      tier: "NEUTRAL",
      momentum: 71,
      grade_premium: 26,
      updated_at: "2026-02-14T08:00:00.000Z",
    }));
  });
});
