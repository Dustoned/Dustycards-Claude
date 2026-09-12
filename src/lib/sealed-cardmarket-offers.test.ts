import { describe, expect, it } from "vitest";
import { parseSealedMarketOffers } from "./sealed-cardmarket-offers";
function row(id: string, country: string | null, price: string, language = "English", seller = "Seller") {
  return `<div id="articleRow${id}" class="article-row"><span class="seller-info">${country ? `<span aria-label="Item location: ${country}"></span>` : ""}<a href="/en/Pokemon/Users/${seller}">${seller}</a></span><div class="product-attributes"><span aria-label="${language}"></span></div><div class="col-offer"><span class="color-primary fw-bold">${price} €</span><span class="color-primary fw-bold">${price} €</span></div></div>`;
}
describe("sealed seller market comparison", () => {
  it("separates a cheaper UK seller from the cheapest EU seller regardless of language flags", () => {
    const offers = parseSealedMarketOffers(row("1", "Germany", "90,00", "German") + row("2", "United Kingdom", "100,00") + row("3", "Netherlands", "120,00") + row("4", "Belgium", "110,00"));
    expect(offers.map(o => o.priceEur)).toEqual([100, 110, 120]);
    expect(offers[0]).toMatchObject({ country: "United Kingdom", isEu: false });
    expect(offers.find(o => o.isEu)).toMatchObject({ country: "Belgium", priceEur: 110 });
  });
  it("does not classify an unknown location or non-EU European country as EU", () => {
    for (const country of [null, "Norway", "Switzerland", "United Kingdom"]) {
      expect(parseSealedMarketOffers(row("1", country, "99,00"))[0].isEu).toBe(false);
    }
  });
  it("requires explicit English language and a safe seller profile", () => {
    expect(parseSealedMarketOffers(row("1", "Germany", "10,00", ""))).toEqual([]);
    expect(parseSealedMarketOffers(row("1", "Germany", "10,00").replace('/en/Pokemon/Users/Seller', 'https://evil.example/en/Pokemon/Users/Seller'))).toEqual([]);
  });
  it("keeps seller, location and price together with one price per article", () => {
    expect(parseSealedMarketOffers(row("1", "France", "1.025,00", "English", "FrenchShop"))).toEqual([expect.objectContaining({ seller: "FrenchShop", sellerUrl: "https://www.cardmarket.com/en/Pokemon/Users/FrenchShop", country: "France", priceEur: 1025, isEu: true })]);
  });
});
