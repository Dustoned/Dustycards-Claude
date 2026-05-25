import { describe, expect, it } from "vitest";
import {
  buildBuySignal,
  getBuySignalLabelForScore,
  type BuildBuySignalInput,
} from "@/lib/buy-signal";

function rawInput(overrides: Partial<BuildBuySignalInput> = {}): BuildBuySignalInput {
  return {
    price: {
      cm_en_lowest_nm: 80,
      cm_de_lowest_nm: null,
      cm_fr_lowest_nm: null,
      cm_es_lowest_nm: null,
      cm_it_lowest_nm: null,
      cm_jp_lowest_nm: null,
      tcp_market: 92,
      tcp_mid: null,
      tcp_low: null,
      cm_en_avg_7d: 86,
      cm_en_avg_30d: 100,
    },
    price_fetched_at: "2026-05-20T10:00:00.000Z",
    price_history: [
      historyPoint("2026-04-20", 100),
      historyPoint("2026-05-01", 96),
      historyPoint("2026-05-10", 90),
      historyPoint("2026-05-17", 86),
      historyPoint("2026-05-20", 80),
    ],
    now: "2026-05-24T10:00:00.000Z",
    ...overrides,
  };
}

function historyPoint(date: string, value: number) {
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
}

describe("buy signal", () => {
  it("maps score thresholds to signal labels", () => {
    expect(getBuySignalLabelForScore(0)).toBe("strong_sell");
    expect(getBuySignalLabelForScore(19)).toBe("strong_sell");
    expect(getBuySignalLabelForScore(20)).toBe("sell");
    expect(getBuySignalLabelForScore(39)).toBe("sell");
    expect(getBuySignalLabelForScore(40)).toBe("hold");
    expect(getBuySignalLabelForScore(60)).toBe("hold");
    expect(getBuySignalLabelForScore(61)).toBe("buy");
    expect(getBuySignalLabelForScore(80)).toBe("buy");
    expect(getBuySignalLabelForScore(81)).toBe("strong_buy");
  });

  it("builds a medium-confidence raw buy signal without pretending raw eBay sold exists", () => {
    const signal = buildBuySignal(rawInput());

    expect(signal.market_mode).toBe("raw");
    expect(signal.label).toBe("buy");
    expect(signal.confidence).toBe("medium");
    expect(signal.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "eBay sold", value: "Graded only" }),
      ])
    );
    expect(signal.metrics.vs_30d_avg_pct).toBeGreaterThan(10);
  });

  it("uses exact graded eBay sold samples for stronger confidence", () => {
    const signal = buildBuySignal(
      rawInput({
        price: {
          cm_en_lowest_nm: 80,
          cm_de_lowest_nm: null,
          cm_fr_lowest_nm: null,
          cm_es_lowest_nm: null,
          cm_it_lowest_nm: null,
          cm_jp_lowest_nm: null,
          tcp_market: null,
          tcp_mid: null,
          tcp_low: null,
          cm_en_avg_7d: null,
          cm_en_avg_30d: null,
        },
        collection_item: {
          purchase_price: null,
          cost_basis_value: null,
          grading_company: "PSA",
          grading_grade: "10",
        },
        graded_prices: [{ label: "PSA 10", price: 80 }],
        ebay_sold_graded_prices: [
          {
            label: "PSA 10",
            company: "PSA",
            grade: "10",
            median_price: 110,
            median_price_eur: 100,
            currency: "USD",
            sample_size: 15,
            fetched_at: "2026-05-22T10:00:00.000Z",
          },
        ],
        ebay_sold_graded_price_history: [
          {
            label: "PSA 10",
            currency: "EUR",
            latest_sample_size: 15,
            latest_fetched_at: "2026-05-22T10:00:00.000Z",
            points: [
              { date: "2026-04-20", label: "Apr 20", value: 90 },
              { date: "2026-05-10", label: "May 10", value: 95 },
              { date: "2026-05-22", label: "May 22", value: 100 },
            ],
          },
        ],
      })
    );

    expect(signal.market_mode).toBe("graded");
    expect(signal.confidence).toBe("high");
    expect(signal.metrics.ebay_sample_size).toBe(15);
    expect(signal.metrics.ebay_sold_gap_pct).toBeLessThan(0);
    expect(["buy", "strong_buy"]).toContain(signal.label);
  });

  it("leans sell for owned cards with strong profit and weakening recent action", () => {
    const signal = buildBuySignal(
      rawInput({
        price: {
          cm_en_lowest_nm: 120,
          cm_de_lowest_nm: null,
          cm_fr_lowest_nm: null,
          cm_es_lowest_nm: null,
          cm_it_lowest_nm: null,
          cm_jp_lowest_nm: null,
          tcp_market: null,
          tcp_mid: null,
          tcp_low: null,
          cm_en_avg_7d: 125,
          cm_en_avg_30d: 100,
        },
        collection_item: {
          purchase_price: 50,
          cost_basis_value: 50,
          grading_company: null,
          grading_grade: null,
        },
        price_history: [
          historyPoint("2026-04-20", 100),
          historyPoint("2026-05-01", 118),
          historyPoint("2026-05-10", 130),
          historyPoint("2026-05-17", 125),
          historyPoint("2026-05-20", 120),
        ],
      })
    );

    expect(signal.context).toBe("owned");
    expect(signal.metrics.cost_basis_pnl_pct).toBeGreaterThan(100);
    expect(["strong_sell", "sell"]).toContain(signal.label);
  });

  it("holds older scarce cards instead of selling only because profit is up", () => {
    const signal = buildBuySignal(
      rawInput({
        rarity: "Special Illustration Rare",
        episode_release_date: "2017-05-05",
        pull_rate_info: {
          rarity_name: "Special Illustration Rare",
          pull_rate_odds: "1:180",
          specific_pull_odds: "1:720",
          pull_rate_weight: 1.72,
          psa_avg_gem_pct: 0.42,
        },
        price: {
          cm_en_lowest_nm: 112,
          cm_de_lowest_nm: null,
          cm_fr_lowest_nm: null,
          cm_es_lowest_nm: null,
          cm_it_lowest_nm: null,
          cm_jp_lowest_nm: null,
          tcp_market: null,
          tcp_mid: null,
          tcp_low: null,
          cm_en_avg_7d: 116,
          cm_en_avg_30d: 100,
        },
        collection_item: {
          purchase_price: 50,
          cost_basis_value: 50,
          grading_company: null,
          grading_grade: null,
        },
        price_history: [
          historyPoint("2026-04-20", 100),
          historyPoint("2026-05-01", 110),
          historyPoint("2026-05-10", 120),
          historyPoint("2026-05-17", 116),
          historyPoint("2026-05-20", 112),
        ],
      })
    );

    expect(signal.context).toBe("owned");
    expect(signal.label).toBe("hold");
    expect(signal.metrics.long_term_score).toBeGreaterThanOrEqual(55);
    expect(signal.reasons).toContain("Long-term hold value");
  });

  it("gives older promo cards extra hold weight because they are not normal pulls", () => {
    const olderPromo = buildBuySignal(
      rawInput({
        rarity: "Promo",
        episode_name: "SM Black Star Promos",
        episode_code: "PR-SM",
        episode_release_date: "2017-02-03",
        price: {
          cm_en_lowest_nm: 118,
          cm_de_lowest_nm: null,
          cm_fr_lowest_nm: null,
          cm_es_lowest_nm: null,
          cm_it_lowest_nm: null,
          cm_jp_lowest_nm: null,
          tcp_market: null,
          tcp_mid: null,
          tcp_low: null,
          cm_en_avg_7d: 122,
          cm_en_avg_30d: 100,
        },
        collection_item: {
          purchase_price: 48,
          cost_basis_value: 48,
          grading_company: null,
          grading_grade: null,
        },
        price_history: [
          historyPoint("2026-04-20", 100),
          historyPoint("2026-05-01", 116),
          historyPoint("2026-05-10", 126),
          historyPoint("2026-05-17", 122),
          historyPoint("2026-05-20", 118),
        ],
      })
    );
    const newerPromo = buildBuySignal(
      rawInput({
        rarity: "Promo",
        episode_name: "Scarlet & Violet Promo Cards",
        episode_code: "SVP",
        episode_release_date: "2026-01-15",
      })
    );

    expect(olderPromo.metrics.promo_scarcity_score).toBeGreaterThan(
      newerPromo.metrics.promo_scarcity_score
    );
    expect(olderPromo.label).toBe("hold");
    expect(olderPromo.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Promo scarcity" }),
      ])
    );
  });

  it("does not turn an old promo into sell because of one raw active-listing outlier", () => {
    const outlierPoint = (
      date: string,
      en: number,
      fr: number,
      es: number,
      it: number,
      avg7d: number,
      avg30d: number
    ) => ({
      date,
      label: date,
      cm_market: en,
      cm_market_en: en,
      cm_market_de: null,
      cm_market_fr: fr,
      cm_market_es: es,
      cm_market_it: it,
      cm_market_jp: null,
      tcp_market: null,
      cm_avg_7d: avg7d,
      cm_avg_30d: avg30d,
    });
    const signal = buildBuySignal(
      rawInput({
        rarity: "Promo",
        episode_name: "BW Black Star Promos",
        episode_code: "PR-BLW",
        episode_release_date: "2011-03-01",
        price: {
          cm_en_lowest_nm: 600,
          cm_de_lowest_nm: null,
          cm_fr_lowest_nm: 55,
          cm_es_lowest_nm: 85,
          cm_it_lowest_nm: 199,
          cm_jp_lowest_nm: null,
          tcp_market: 291.94,
          tcp_mid: null,
          tcp_low: null,
          cm_en_avg_7d: 50.45,
          cm_en_avg_30d: 42.85,
        },
        price_history: [
          outlierPoint("2026-04-24", 1100, 55, 119.99, 199.9, 57.57, 53.82),
          outlierPoint("2026-05-05", 1100, 55, 139.95, 199, 54.56, 52.19),
          outlierPoint("2026-05-14", 600, 55, 95, 199, 50.45, 42.85),
          outlierPoint("2026-05-17", 600, 55, 85, 199, 50.45, 42.85),
        ],
      })
    );

    expect(signal.label).toBe("hold");
    expect(signal.source_label).toBe("CardMarket 30d avg");
    expect(signal.warnings).toContain("Active listing outlier");
    expect(signal.metrics.raw_active_listing_outlier).toBe(true);
    expect(signal.metrics.long_term_score).toBeGreaterThanOrEqual(90);
  });

  it("falls back to hold with low confidence when there is no usable market value", () => {
    const signal = buildBuySignal(
      rawInput({
        price: null,
        price_fetched_at: null,
        price_history: [],
      })
    );

    expect(signal.label).toBe("hold");
    expect(signal.confidence).toBe("low");
    expect(signal.warnings).toContain("No current market value");
  });
});
