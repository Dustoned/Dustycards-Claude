import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomeFeaturedSealedPanel from "@/components/HomeFeaturedSealedPanel";
import HomeItemDetailProvider from "@/components/HomeItemDetailProvider";

describe("Home Featured Sealed", () => {
  it("shows ownership, market, cost and P&L context instead of price alone", () => {
    const markup = renderToStaticMarkup(createElement(
      HomeItemDetailProvider,
      null,
      createElement(HomeFeaturedSealedPanel, {
        items: [{
          id: "copy-1",
          product_id: "product-1",
          name: "Collector Box",
          image_url: null,
          episode_id: "set-1",
          episode_name: "Test Set",
          episode_code: "TST",
          cardmarket_url: null,
          quantity: 2,
          purchase_price_per_item: 100,
          current_value_per_item: 140,
        }],
        viewAllHref: "/collection?tab=sealed",
        viewMode: "grid",
      })
    ));

    expect(markup).toContain("1 products");
    expect(markup).toContain("2 units");
    expect(markup).toContain("Market total");
    expect(markup).toContain("Paid");
    expect(markup).toContain("P&amp;L");
    expect(markup).toContain("+€80.00");
    expect(markup).toContain("+40%");
  });
});
