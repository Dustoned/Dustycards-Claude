import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CardListTile,
  CardListTileBody,
  CardListTileFooter,
  CardListTileGrid,
  CardListTileInsight,
  CardListTileLink,
  CardListTileMedia,
  CardListTileMetrics,
  CardListTilePrice,
} from "@/components/CardListTile";

describe("CardListTile", () => {
  it("renders one shared responsive tile contract", () => {
    const markup = renderToStaticMarkup(
      createElement(
        CardListTile,
        { interactive: true, accent: "radar", state: "highlighted" },
        createElement(CardListTileMedia, {
          imageUrl: "https://example.com/card.png",
        }),
        createElement(
          CardListTileBody,
          null,
          createElement("strong", null, "Test card"),
          createElement(CardListTilePrice, {
            label: "Current",
            value: "€12.00",
          }),
          createElement(
            CardListTileMetrics,
            null,
            createElement("span", null, "€12.00")
          ),
          createElement(
            CardListTileFooter,
            null,
            createElement("button", { type: "button" }, "Add")
          )
        )
      )
    );

    expect(markup).toContain('data-card-list-tile="true"');
    expect(markup).toContain('data-card-list-accent="radar"');
    expect(markup).toContain('data-card-list-state="highlighted"');
    expect(markup).toContain('data-card-list-media="true"');
    expect(markup).toContain('data-card-list-body="true"');
    expect(markup).toContain('data-card-list-metrics="true"');
    expect(markup).toContain('data-card-list-price="true"');
    expect(markup).toContain('data-card-list-footer="true"');
    expect(markup).toContain("aspect-[63/88]");
    expect(markup).toContain(
      "grid-cols-[clamp(5.75rem,26vw,6.5rem)_minmax(0,1fr)]"
    );
    expect(markup).toContain(
      "max-[359px]:grid-cols-[5.5rem_minmax(0,1fr)]"
    );
    expect(markup).toContain("whitespace-nowrap");
    expect(markup).toContain("min-h-11");
  });

  it("keeps a readable fixed-aspect empty media state", () => {
    const markup = renderToStaticMarkup(
      createElement(CardListTileMedia, {
        imageUrl: null,
        emptyLabel: "Missing artwork",
      })
    );

    expect(markup).toContain('data-card-list-media-state="empty"');
    expect(markup).toContain("Missing artwork");
    expect(markup).toContain("repeating-linear-gradient");
  });

  it("offers one shared showcase layout for Radar, chases, and movers", () => {
    const tileMarkup = renderToStaticMarkup(
      createElement(CardListTile, { layout: "showcase" })
    );

    expect(tileMarkup).toContain('data-card-list-layout="showcase"');
    expect(tileMarkup).toContain(
      "grid-cols-[clamp(6.75rem,30vw,7.25rem)_minmax(0,1fr)]"
    );
    expect(tileMarkup).toContain("sm:grid-cols-[7.5rem_minmax(0,1fr)]");

    const gridMarkup = renderToStaticMarkup(
      createElement(CardListTileGrid, null, createElement(CardListTile))
    );
    expect(gridMarkup).toContain('data-card-list-grid="true"');
    expect(gridMarkup).toContain(
      "grid-template-columns:repeat(auto-fit, minmax(min(100%, 25rem), 1fr))"
    );
  });

  it("keeps the shared price clearly above body-copy size", () => {
    const markup = renderToStaticMarkup(
      createElement(CardListTilePrice, { label: "Raw", value: "€549" })
    );

    expect(markup).toContain("text-[19px]");
    expect(markup).toContain("sm:text-xl");
  });

  it("reserves one shared insight baseline across market cards", () => {
    const markup = renderToStaticMarkup(
      createElement(CardListTileInsight, null, "One concise reason")
    );

    expect(markup).toContain("min-h-[2.1rem]");
    expect(markup).toContain("sm:min-h-[25px]");
  });

  it("provides a full-tile navigation layer with an accessible label", () => {
    const markup = renderToStaticMarkup(
      createElement(CardListTileLink, {
        href: "/cards/123",
        label: "Open Test card",
      })
    );

    expect(markup).toContain('data-card-list-link="true"');
    expect(markup).toContain('href="/cards/123"');
    expect(markup).toContain('aria-label="Open Test card"');
  });
});
