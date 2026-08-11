import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PriceRefreshCountdown from "@/components/PriceRefreshCountdown";
import { CardPriceStatusLine } from "@/components/card-modal/CardModalSections";
import type { ModalCardData } from "@/components/card-modal/types";
import { CARDMARKET_NO_EN_NM_PRICE_STATUS } from "@/lib/price-source-status";

const cardWithoutEnglishNmListings = {
  id: "no-cardmarket-en-nm",
  game: "pokemon",
  name: "No English NM card",
  rarity: "Rare",
  tcggo_url: null,
  price_source_status: CARDMARKET_NO_EN_NM_PRICE_STATUS,
  price_source_checked_at: "2026-08-11T00:00:00.000Z",
  price_fetched_at: null,
  price: {
    cm_en_lowest_nm: null,
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
  price_history: [],
} as unknown as ModalCardData;

describe("CardMarket no English Near Mint status UI", () => {
  it("takes precedence over a missing TCGGO link in the detail status line", () => {
    const markup = renderToStaticMarkup(
      createElement(CardPriceStatusLine, { card: cardWithoutEnglishNmListings })
    );

    expect(markup).toContain("No EN/NM listings");
    expect(markup).not.toContain("Missing TCGGO source link");
  });

  it("uses the independent TCP observation when TCGPlayer is selected", () => {
    const card = {
      ...cardWithoutEnglishNmListings,
      tcggo_url: "https://www.tcggo.com/example",
      tcp_price_fetched_at: "2026-08-11T01:00:00.000Z",
      price: {
        ...cardWithoutEnglishNmListings.price,
        tcp_market: 12.5,
      },
    } as ModalCardData;
    const markup = renderToStaticMarkup(
      createElement(CardPriceStatusLine, {
        card,
        activeMarketSource: "tcgplayer",
      })
    );

    expect(markup).toContain("Live");
    expect(markup).not.toContain("No EN/NM listings");
  });

  it.each([
    { compact: false, variant: "panel" as const, priceFetchedAt: null },
    { compact: true, variant: "panel" as const, priceFetchedAt: null },
    { compact: true, variant: "micro" as const, priceFetchedAt: null },
    {
      compact: true,
      variant: "micro" as const,
      priceFetchedAt: "2026-08-11T00:00:00.000Z",
    },
  ])(
    "shows the explicit status in the $variant refresh view",
    ({ compact, variant, priceFetchedAt }) => {
    const markup = renderToStaticMarkup(
      createElement(PriceRefreshCountdown, {
        rarity: "Rare",
        priceFetchedAt,
        priceSourceStatus: CARDMARKET_NO_EN_NM_PRICE_STATUS,
        priceSourceCheckedAt: "2026-08-11T00:00:00.000Z",
        compact,
        variant,
      })
    );

    expect(markup).toContain("No EN/NM listings");
    }
  );
});
