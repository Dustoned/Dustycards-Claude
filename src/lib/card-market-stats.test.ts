import { describe, expect, it } from "vitest";
import { buildCardMarketStats, getCardMarketRankingMetrics, type BuildCardMarketStatsInput } from "@/lib/card-market-stats";
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
    updatedAt: "2026-02-14T10:00:00.000Z",
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
      date: `2026-02-${String(index + 5).padStart(2, "0")}`,
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
    now: new Date("2026-02-14T12:00:00.000Z"),
    ...overrides,
  };
}

describe("buildCardMarketStats", () => {
  it.each(["stale", "capped", "invalid-date"])("keeps %s eBay samples out of market scoring", (kind) => {
    const sample = demand();
    if (kind === "stale") sample.updatedAt = "2025-12-01T00:00:00Z";
    if (kind === "capped") sample.sample.capped = true;
    if (kind === "invalid-date") sample.updatedAt = "invalid";
    const actual = buildCardMarketStats(buildInput({ demand: sample }));
    const without = buildCardMarketStats(buildInput({ demand: null }));
    expect(actual.score).toBe(without.score);
    expect(actual.confidence).toBe(without.confidence);
    expect(actual.metric_sources).toEqual(without.metric_sources);
  });

  it("does not infer a week of demand from two snapshots or capped history", () => {
    const sample = demand();
    sample.history = sample.history.slice(-2);
    const thin = buildCardMarketStats(buildInput({ demand: sample }));
    expect(thin.metric_sources.liquidity).toBe("ebay_inventory");
    expect(thin.metric_sources.demand).toBe("price_proxy");
    const cappedHistory = demand();
    cappedHistory.history[7] = { ...cappedHistory.history[7], capped: true };
    expect(buildCardMarketStats(buildInput({ demand: cappedHistory })).metric_sources.demand).toBe("price_proxy");
  });

  it("does not persist proxy bars as verified market interest", () => {
    const stats = buildCardMarketStats(buildInput({ demand: null }));
    expect(stats.metrics.liquidity).not.toBeNull();
    expect(getCardMarketRankingMetrics(stats)).toEqual({
      momentum: stats.metrics.momentum, liquidity: null, demand: null,
    });
  });

  it("keeps old price history low-confidence even after a fresh inventory update", () => {
    const sample = demand();
    sample.updatedAt = "2026-06-01T00:00:00Z";
    const stats = buildCardMarketStats(buildInput({
      demand: sample, now: new Date("2026-06-01T12:00:00Z"),
    }));
    expect(stats.confidence).toBe("low");
  });
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
    expect(stats.metric_sources).toEqual({
      liquidity: "ebay_inventory",
      demand: "ebay_lifecycle",
    });
  });

  it("penalizes erratic histories through volatility and stability", () => {
    const stable = buildCardMarketStats(buildInput());
    const volatile = buildCardMarketStats(buildInput({
      history: history(Array.from({ length: 45 }, (_, index) => index % 2 === 0 ? 20 : 42)),
    }));

    expect(volatile.volatility_percent).toBeGreaterThan(stable.volatility_percent ?? 0);
    expect(volatile.metrics.stability).toBeLessThan(stable.metrics.stability ?? 100);
  });

  it("shows neutral or bounded proxy bars without overstating sparse evidence", () => {
    const stats = buildCardMarketStats(buildInput({
      history: history([20]),
      currentLanguagePrices: { en: 20 },
      rawPrice: 20,
      demand: null,
    }));

    expect(stats.score).toBeNull();
    expect(stats.tier).toBe("BUILDING");
    expect(stats.confidence).toBe("low");
    expect(stats.metrics.liquidity).toBeGreaterThan(0);
    expect(stats.metrics.liquidity).toBeLessThan(50);
    expect(stats.metrics.demand).toBe(50);
    expect(stats.metric_sources).toEqual({
      liquidity: "market_proxy",
      demand: "neutral_prior",
    });
  });

  it("fills liquidity and demand from bounded market proxies when eBay history is absent", () => {
    const proxyHistory = history(Array.from({ length: 45 }, (_, index) => 20 * 1.01 ** index));
    proxyHistory.at(-1)!.cm_avg_7d = 34;
    proxyHistory.at(-1)!.cm_avg_30d = 29;

    const stats = buildCardMarketStats(buildInput({
      history: proxyHistory,
      demand: null,
    }));

    expect(stats.metrics.liquidity).toBeGreaterThan(40);
    expect(stats.metrics.demand).toBeGreaterThan(50);
    expect(stats.metric_sources).toEqual({
      liquidity: "market_proxy",
      demand: "price_proxy",
    });
  });

  it("prefers existing eBay sold activity over CardMarket-only proxies", () => {
    const stats = buildCardMarketStats(buildInput({
      demand: null,
      ebaySoldGradedPrices: [
        {
          label: "PSA 10",
          company: "PSA",
          grade: "10",
          median_price: 240,
          median_price_eur: 240,
          currency: "EUR",
          sample_size: 8,
        },
      ],
    }));

    expect(stats.metrics.liquidity).toBeGreaterThan(40);
    expect(stats.metrics.demand).toBeGreaterThan(40);
    expect(stats.metric_sources).toEqual({
      liquidity: "ebay_sales_proxy",
      demand: "ebay_sales_proxy",
    });
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

describe("buildCardMarketStats honesty", () => {
  it("reports the score range that the scored drivers can actually reach", () => {
    const partial = buildCardMarketStats(
      buildInput({ demand: null, ebaySoldGradedPrices: [], gradedPrices: [] })
    );
    expect(partial.score_range).toEqual({ floor: 23.5, ceiling: 76.5 });

    const complete = buildCardMarketStats(
      buildInput({ gradedPrices: [{ label: "PSA 10", price: 120 }] })
    );
    expect(complete.score_range).toEqual({ floor: 0, ceiling: 100 });
  });

  it("does not extrapolate a short history beyond the observed window", () => {
    const stats = buildCardMarketStats(
      buildInput({ history: history([10, 10.3, 10.6, 11]), demand: null })
    );
    expect(stats.metrics.momentum).toBeLessThanOrEqual(66);
  });
});
