import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import HomeItemDetailProvider from "@/components/HomeItemDetailProvider";
import HomeSuddenDropsPanel from "@/components/HomeSuddenDropsPanel";

vi.mock("@/lib/home-client-cache", () => ({
  readHomeClientCache: () => ({
    items: [{
      cardId: "card-1",
      name: "Falling card",
      imageUrl: null,
      cardNumber: "1",
      episodeName: "Test Set",
      episodeCode: "TST",
      source: "cm",
      sourceLabel: "CardMarket",
      currentPrice: 20,
      currency: "EUR",
      dropAmount: 10,
      dropPercent: 33,
      coveredDays: 1,
    }],
    sealedItems: [{
      productId: "product-1",
      name: "Falling box",
      imageUrl: null,
      episodeId: "episode-1",
      episodeName: "Test Set",
      episodeCode: "TST",
      currentPrice: 80,
      currency: "EUR",
      dropAmount: 20,
      dropPercent: 20,
    }],
    sealedTotal: 1,
    total: 1,
    threshold: 5,
    windowDays: 1,
    limit: 50,
    refreshStartedAt: null,
    refreshFinishedAt: null,
    refreshStatus: "success",
  }),
  writeHomeClientCache: vi.fn(),
}));

describe("Home sudden-drop item click contract", () => {
  it.each(["grid", "list"] as const)("keeps only Open movers as a route link in %s view", (viewMode) => {
    const markup = renderToStaticMarkup(createElement(
      HomeItemDetailProvider,
      null,
      createElement(HomeSuddenDropsPanel, {
        apiHref: "/api/home-drops",
        cacheScope: "user-1",
        viewAllHref: "/movers/sudden-drops?scope=all",
        viewMode,
      })
    ));

    expect(markup.match(/href="\/movers\/sudden-drops\?scope=all"/g)).toHaveLength(1);
    expect(markup.match(/<button type="button"/g)).toHaveLength(2);
    expect(markup).not.toContain("highlight=");
    expect(markup).not.toContain("#sealed");
  });
});
