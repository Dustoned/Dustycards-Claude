import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CardModalHistorySection } from "@/components/card-modal/CardModalSections";
import type { ModalCardData } from "@/components/card-modal/types";

const card = {
  id: "status-card",
  game: "pokemon",
  name: "Status Card",
  rarity: "Rare",
  tcggo_url: "https://example.test/status-card",
  price_source_status: null,
  price_source_checked_at: null,
  price_fetched_at: null,
  price: {
    cm_en_lowest_nm: 25,
    cm_de_lowest_nm: null,
    cm_fr_lowest_nm: null,
    cm_es_lowest_nm: null,
    cm_it_lowest_nm: null,
    cm_jp_lowest_nm: null,
    tcp_market: 27,
    tcp_mid: null,
    tcp_low: null,
    cm_en_avg_7d: null,
    cm_en_avg_30d: null,
  },
  graded_prices: [{ label: "PSA 10", price: 125 }],
  graded_price_history: [
    {
      label: "PSA 10",
      points: [{ date: "2026-07-18", label: "Jul 18", value: 125 }],
    },
  ],
  ebay_sold_graded_prices: [],
  ebay_sold_graded_price_history: [],
  price_history: [
    {
      date: "2026-07-18",
      label: "Jul 18",
      cm_market: 25,
      cm_market_en: 25,
      cm_market_de: null,
      cm_market_fr: null,
      cm_market_es: null,
      cm_market_it: null,
      cm_avg_7d: null,
      cm_avg_30d: null,
      tcp_market: 27,
    },
  ],
} as unknown as ModalCardData;

function renderHistory(mode: "market" | "graded") {
  return renderToStaticMarkup(
    createElement(CardModalHistorySection, {
      historyChartMode: mode,
      activeMarketSource: "cardmarket",
      cardMarketHistory: [{ date: "2026-07-18", label: "Jul 18", value: 25 }],
      activeCardMarketCurrentValue: 25,
      showTcgPlayerSource: true,
      card,
      collectionItem: null,
      availableCardMarketHistorySeries: [{ key: "cm_market_en", label: "EN" }],
      activeCardMarketHistorySeries: "cm_market_en",
      activeCardMarketSeriesLabel: "EN",
      onSelectMarketSource: vi.fn(),
      onSelectCardMarketHistorySeries: vi.fn(),
      onSelectHistoryChartMode: vi.fn(),
      tcgPlayerHistory: [{ date: "2026-07-18", label: "Jul 18", value: 27 }],
      tcgPlayerCurrentValue: 27,
      gradedPriceHistory: card.graded_price_history ?? [],
      ebaySoldGradedPriceHistory: card.ebay_sold_graded_price_history ?? [],
      showCurrentValue: false,
      showModeControl: false,
      showGradedSelectionControl: false,
    })
  );
}

function expectPriceStatus(markup: string) {
  expect(markup.match(/data-card-detail-price-status(?!-)/g)).toHaveLength(1);
  for (const key of ["source", "updated", "next", "coverage", "history"]) {
    expect(markup).toContain(`data-card-detail-price-status-item="${key}"`);
  }
  expect(markup.match(/title="Source:/g)).toHaveLength(1);
  expect(markup.match(/title="Latest price:/g)).toHaveLength(1);
  expect(markup.match(/title="Refresh:/g)).toHaveLength(1);
  expect(markup.match(/title="Data:/g)).toHaveLength(1);
  expect(markup.match(/title="History:/g)).toHaveLength(1);
}

describe("CardModalHistorySection price status", () => {
  it("renders all five status chips for Raw history", () => {
    expectPriceStatus(renderHistory("market"));
  });

  it("renders the same five status chips for Graded history", () => {
    expectPriceStatus(renderHistory("graded"));
  });
});
