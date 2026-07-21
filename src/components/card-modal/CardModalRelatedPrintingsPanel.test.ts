import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CardModalRelatedPrintingsPanel } from "@/components/card-modal/CardModalSections";
import type { ModalCardData } from "@/components/card-modal/types";

function makeCard(related = true): ModalCardData {
  return {
    id: "current-card",
    game: "pokemon",
    name: "Charizard ex",
    card_number: "125",
    price: { cm_en_lowest_nm: 4 },
    related_printings: related
      ? [
          {
            id: "reprint-card",
            name: "Charizard ex",
            card_number: "54",
            rarity: "Double Rare",
            image_url: null,
            cardmarket_url: "https://www.cardmarket.com/en/Pokemon/Products/Singles/Test",
            episode_id: "paldean-fates",
            episode_name: "Paldean Fates",
            episode_code: "PAF",
            episode_release_date: "2024-01-26",
            price: 2.5,
            match_type: "reprint",
          },
        ]
      : [],
  } as unknown as ModalCardData;
}

function makeCardWithFourPrintings(): ModalCardData {
  const card = makeCard();
  const first = card.related_printings?.[0];
  if (!first) throw new Error("Expected a related printing fixture");
  card.related_printings = Array.from({ length: 4 }, (_, index) => ({
    ...first,
    id: `reprint-card-${index + 1}`,
    episode_id: `set-${index + 1}`,
    episode_name: `Set ${index + 1}`,
  }));
  return card;
}

describe("CardModalRelatedPrintingsPanel", () => {
  it("stays absent when there is no verified reprint", () => {
    expect(
      renderToStaticMarkup(
        createElement(CardModalRelatedPrintingsPanel, { card: makeCard(false) })
      )
    ).toBe("");
  });

  it("renders a compact internal detail link and direct market option", () => {
    const markup = renderToStaticMarkup(
      createElement(CardModalRelatedPrintingsPanel, { card: makeCard() })
    );

    expect(markup).toContain("Reprints");
    expect(markup).toContain("1 verified option");
    expect(markup).toContain("Paldean Fates");
    expect(markup).toContain("€2.50");
    expect(markup).toContain("Lowest");
    expect(markup).toContain("/expansions/paldean-fates?card=reprint-card");
    expect(markup).toContain("CardMarket");
    expect(markup).toContain("eBay Deals");
    expect(markup).toContain("ebay.nl");
    expect(markup).not.toContain("Show all");
  });

  it("keeps the detail panel compact and links to the card-specific page", () => {
    const markup = renderToStaticMarkup(
      createElement(CardModalRelatedPrintingsPanel, {
        card: makeCardWithFourPrintings(),
        context: "radar",
      })
    );

    expect(markup).toContain("Show all 4 reprints");
    expect(markup).toContain("/reprints/current-card?from=radar");
    expect(markup).not.toContain("Set 4");
  });
});
