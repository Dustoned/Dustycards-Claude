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
  it("stays absent when there is no related printing", () => {
    expect(
      renderToStaticMarkup(
        createElement(CardModalRelatedPrintingsPanel, { card: makeCard(false) })
      )
    ).toBe("");
  });

  it("renders a compact pre-matched printing link", () => {
    const markup = renderToStaticMarkup(
      createElement(CardModalRelatedPrintingsPanel, { card: makeCard() })
    );

    expect(markup).toContain("Related printings");
    expect(markup).toContain("2 editions");
    expect(markup).toContain("Paldean Fates");
    expect(markup).toContain("€2.50");
    expect(markup).toContain("Lowest");
    expect(markup).toContain("/expansions/paldean-fates?card=reprint-card");
    expect(markup).not.toContain("CardMarket");
    expect(markup).not.toContain("eBay Deals");
    expect(markup).not.toContain("Compare all");
  });

  it("keeps the detail panel compact and opens the full comparison in a dialog", () => {
    const markup = renderToStaticMarkup(
      createElement(CardModalRelatedPrintingsPanel, {
        card: makeCardWithFourPrintings(),
        context: "radar",
      })
    );

    expect(markup).toContain("Compare all 5 editions");
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).not.toContain("/reprints/current-card");
    expect(markup).not.toContain("Set 4");
  });
});
