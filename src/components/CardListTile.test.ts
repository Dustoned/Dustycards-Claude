import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CardListTile,
  CardListTileBody,
  CardListTileFooter,
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
