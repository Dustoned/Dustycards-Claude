import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomeItemDetailProvider from "@/components/HomeItemDetailProvider";
import {
  HomeMarketMoversWidget,
  HomeUpcomingSinglesWidget,
  HomeUpcomingWidget,
} from "@/components/HomePreviewWidgets";

describe("Home widget item click contract", () => {
  it("renders Market Mover items as detail buttons while the header remains the overview link", () => {
    const markup = renderToStaticMarkup(createElement(
      HomeItemDetailProvider,
      null,
      createElement(HomeMarketMoversWidget, {
        viewAllHref: "/movers?scope=all",
        viewMode: "grid",
        items: [{
          cardId: "card-1",
          name: "Mover card",
          imageUrl: null,
          cardNumber: "1",
          episodeName: "Test Set",
          episodeCode: "TST",
          currentPrice: 25,
          currency: "EUR",
          change: 5,
          changePct: 25,
          windowDays: 7,
        }],
      })
    ));

    expect(markup).toContain('href="/movers?scope=all"');
    expect(markup).toContain('<button type="button"');
    expect(markup).not.toContain("highlight=");
  });

  it("renders linked Upcoming Sealed products as detail buttons", () => {
    const markup = renderToStaticMarkup(createElement(
      HomeItemDetailProvider,
      null,
      createElement(HomeUpcomingWidget, {
        viewAllHref: "/upcoming",
        viewMode: "list",
        items: [{
          id: "release-1",
          productId: "product-1",
          name: "Upcoming box",
          imageUrl: null,
          releaseDate: "2026-12-01T00:00:00.000Z",
          daysUntil: 100,
          episodeId: "episode-1",
          episodeName: "Future Set",
          episodeCode: "FUT",
          sourceName: "Official",
          sourceUrl: "https://example.com/release",
        }],
      })
    ));

    expect(markup.match(/href="\/upcoming"/g)).toHaveLength(1);
    expect(markup).toContain('<button type="button"');
    expect(markup).not.toContain('href="https://example.com/release"');
  });

  it("does not turn an unlinked source-less Upcoming item into a second overview link", () => {
    const markup = renderToStaticMarkup(createElement(
      HomeItemDetailProvider,
      null,
      createElement(HomeUpcomingWidget, {
        viewAllHref: "/upcoming",
        viewMode: "grid",
        items: [{
          id: "release-2", productId: null, name: "Unmatched box", imageUrl: null,
          releaseDate: "2026-12-01T00:00:00.000Z", daysUntil: 100,
          episodeId: null, episodeName: null, episodeCode: null,
          sourceName: "Unknown", sourceUrl: null,
        }],
      })
    ));

    expect(markup.match(/href="\/upcoming"/g)).toHaveLength(1);
    expect(markup).not.toContain('href="#"');
    expect(markup).toContain("Unmatched box");
  });

  it.each(["grid", "list"] as const)("keeps a source-less Upcoming Single static in %s view", (viewMode) => {
    const markup = renderToStaticMarkup(createElement(
      HomeItemDetailProvider,
      null,
      createElement(HomeUpcomingSinglesWidget, {
        viewAllHref: "/upcoming",
        viewMode,
        total: 1,
        groups: [{
          key: "future-set", name: "Future Set", releaseDate: null, total: 1,
          numberedCount: 1, nearComplete: false, sources: [],
          statuses: { confirmed: 0, reveal: 0, leak: 1, upcoming: 0 },
          items: [{
            id: "source-1", cardId: null, name: "Mystery card", imageUrl: null,
            cardNumber: "1", episodeName: "Future Set", episodeCode: "FUT",
            releaseDate: null, rarity: null, status: "leak", episodeId: null,
          }],
        }],
      })
    ));

    expect(markup.match(/href="\/upcoming"/g)).toHaveLength(1);
    expect(markup).toContain("Mystery card");
    expect(markup).not.toContain('href="#"');
  });
});
