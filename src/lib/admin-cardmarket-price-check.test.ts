import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AdminCardMarketPriceCheckError,
  createAdminCardMarketPriceCheckToken,
  loadAdminCardMarketEnglishNmPrice,
  parseAdminCardMarketPriceCheckToken,
} from "./admin-cardmarket-price-check";
import type { ProviderPageScrapeResult } from "./scrape-provider";

function makeScrape(html: string, provider: "firecrawl" | "scrapedo"): ProviderPageScrapeResult {
  return {
    title: "Blissey (HS 106)",
    sourceUrl:
      "https://www.cardmarket.com/en/Pokemon/Products/Singles/HeartGold-SoulSilver/Blissey-HS106?language=1&minCondition=2",
    markdown: "",
    html,
    links: [],
    creditsUsed: 1,
    metadata: {},
    provider,
  };
}

function makeOfferRow(input: { language?: string; condition?: string; price: string }): string {
  return [
    '<div id="articleRow-blissey" class="article-row">',
    '<div class="product-attributes col">',
    `<a class="article-condition" data-bs-original-title="${input.condition ?? "Near Mint"}"><span>NM</span></a>`,
    `<span class="icon" aria-label="${input.language ?? "English"}" data-bs-original-title="${input.language ?? "English"}"></span>`,
    "</div>",
    '<div class="product-comments"></div>',
    '<div class="mobile-offer-container"></div>',
    `<span class="color-primary fw-bold">${input.price}</span>`,
    "</div>",
  ].join("");
}

describe("admin CardMarket price check tokens", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps the scraped quote bound to one card for ten minutes", () => {
    vi.stubEnv("DUSTYCARDS_SYNC_SCHEDULER_SECRET", "price-check-secret");
    const now = new Date("2026-08-05T12:00:00.000Z");
    const token = createAdminCardMarketPriceCheckToken({
      v: 1,
      cardId: "card-1",
      priceEur: 99.99,
      offerCount: 4,
      sourceUrl: "https://www.cardmarket.com/en/Pokemon/Products/Singles/Test/Test",
      provider: "firecrawl",
      observedAt: now.toISOString(),
    });

    expect(parseAdminCardMarketPriceCheckToken(token, "card-1", now)).toMatchObject({
      cardId: "card-1",
      priceEur: 99.99,
      offerCount: 4,
    });
    expect(() => parseAdminCardMarketPriceCheckToken(token, "card-2", now)).toThrow(
      AdminCardMarketPriceCheckError
    );
  });

  it("rejects expired or modified live quotes", () => {
    vi.stubEnv("DUSTYCARDS_SYNC_SCHEDULER_SECRET", "price-check-secret");
    const observedAt = new Date("2026-08-05T12:00:00.000Z");
    const token = createAdminCardMarketPriceCheckToken({
      v: 1,
      cardId: "card-1",
      priceEur: 44,
      offerCount: 1,
      sourceUrl: "https://www.cardmarket.com/en/Pokemon/Products/Singles/Test/Test",
      provider: "scrapedo",
      observedAt: observedAt.toISOString(),
    });

    expect(() =>
      parseAdminCardMarketPriceCheckToken(
        token,
        "card-1",
        new Date(observedAt.getTime() + 11 * 60_000)
      )
    ).toThrow(/expired/i);
    expect(() =>
      parseAdminCardMarketPriceCheckToken(`${token.slice(0, -1)}x`, "card-1", observedAt)
    ).toThrow(/invalid/i);
  });
});

describe("admin CardMarket live offer loading", () => {
  it("accepts the current Cardmarket NM badge and English tooltip markup", async () => {
    const scraper = vi.fn().mockResolvedValue(
      makeScrape(
        [
          makeOfferRow({ price: "120,00 €" }),
          makeOfferRow({ price: "150,00 €" }),
        ].join(""),
        "firecrawl",
      ),
    );

    await expect(
      loadAdminCardMarketEnglishNmPrice("https://example.com/blissey", scraper),
    ).resolves.toMatchObject({
      strictPrice: { priceEur: 120, offerCount: 2 },
    });
    expect(scraper).toHaveBeenCalledTimes(1);
  });

  it("retries an unreadable primary render instead of claiming there are no listings", async () => {
    const scraper = vi
      .fn()
      .mockResolvedValueOnce(makeScrape("<main>Cardmarket product shell</main>", "firecrawl"))
      .mockResolvedValueOnce(makeScrape(makeOfferRow({ price: "120,00 €" }), "scrapedo"));

    await expect(
      loadAdminCardMarketEnglishNmPrice("https://example.com/blissey", scraper),
    ).resolves.toMatchObject({
      scrape: { provider: "scrapedo" },
      strictPrice: { priceEur: 120, offerCount: 1 },
    });
    expect(scraper).toHaveBeenNthCalledWith(2, "https://example.com/blissey", {
      skipFirecrawl: true,
    });
  });

  it("reports an unreadable table separately from a conclusive no-listing result", async () => {
    const scraper = vi
      .fn()
      .mockResolvedValueOnce(makeScrape("<main>partial</main>", "firecrawl"))
      .mockResolvedValueOnce(makeScrape("<main>still partial</main>", "scrapedo"));

    await expect(
      loadAdminCardMarketEnglishNmPrice("https://example.com/blissey", scraper),
    ).rejects.toMatchObject({ status: 502 });

    const noEnglishScraper = vi.fn().mockResolvedValue(
      makeScrape(makeOfferRow({ language: "Japanese", price: "80,00 €" }), "firecrawl"),
    );
    await expect(
      loadAdminCardMarketEnglishNmPrice("https://example.com/blissey", noEnglishScraper),
    ).rejects.toMatchObject({ status: 422 });
  });
});
