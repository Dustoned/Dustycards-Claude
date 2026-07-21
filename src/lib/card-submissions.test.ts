import { describe, expect, it } from "vitest";
import {
  cardNumberMatchesSubmittedBase,
  getCardMarketUrlGame,
  normalizeSubmissionText,
  parseCardMarketScrape,
  parseStrictCardMarketEnglishNmPrice,
  parseCardMarketVersionsScrape,
} from "@/lib/card-submissions";
import type { FirecrawlPageScrapeResult } from "@/lib/firecrawl";

function makeScrape(overrides: Partial<FirecrawlPageScrapeResult>): FirecrawlPageScrapeResult {
  return {
    title: "Umbreon ex",
    sourceUrl: "https://www.cardmarket.com/en/Pokemon/Products/Singles/Prismatic-Evolutions/Umbreon-ex",
    markdown: "",
    html: "",
    links: [],
    creditsUsed: 1,
    metadata: {},
    ...overrides,
  };
}

function makeCardMarketArticleRow(input: {
  condition: string;
  language?: string;
  price: string;
  comment?: string;
}): string {
  return [
    '<div id="articleRow-test" class="article-row">',
    '<div class="product-attributes">',
    `<a class="article-condition" data-bs-original-title="${input.condition}">${input.condition}</a>`,
    `<span aria-label="${input.language ?? "English"}"></span>`,
    "</div>",
    `<div class="product-comments">${input.comment ?? ""}</div>`,
    '<div class="mobile-offer-container"></div>',
    `<div class="price-container"><span class="color-primary fw-bold">${input.price}</span></div>`,
    "</div>",
  ].join("");
}

describe("card submission parsing", () => {
  it("normalizes text for duplicate matching", () => {
    expect(normalizeSubmissionText("Prismatic & Evolutions!!!")).toBe("prismatic and evolutions");
  });

  it("detects Pokemon and One Piece CardMarket product games", () => {
    expect(
      getCardMarketUrlGame(
        "https://www.cardmarket.com/en/Pokemon/Products/Singles/Prismatic-Evolutions/Umbreon-ex"
      )
    ).toBe("pokemon");
    expect(
      getCardMarketUrlGame(
        "https://www.cardmarket.com/en/OnePiece/Products/Singles/Romance-Dawn/MonkeyDLuffy"
      )
    ).toBe("one-piece");
  });

  it("extracts set and card metadata from a CardMarket product URL", () => {
    const parsed = parseCardMarketScrape(
      makeScrape({
        title: "Monkey.D.Luffy OP09-061",
        sourceUrl:
          "https://www.cardmarket.com/en/OnePiece/Products/Singles/Emperors-in-the-New-World/MonkeyDLuffy-OP09-061",
        markdown: "English Near Mint â‚¬12.34",
        html: '<meta property="og:image" content="https://product-images.s3.cardmarket.com/onepiece.jpg">',
      })
    );

    expect(parsed.name).toBe("Monkey.D.Luffy");
    expect(parsed.setName).toBe("Emperors in the New World");
    expect(parsed.cardNumber).toBe("OP09-061");
  });

  it("removes a plain parenthesized collector number from the product title", () => {
    const parsed = parseCardMarketScrape(
      makeScrape({
        title: "Mega Darkrai ex (116) - Pitch Black | Cardmarket",
        sourceUrl:
          "https://www.cardmarket.com/en/Pokemon/Products/Singles/Pitch-Black/Mega-Darkrai-ex-V3-PBL116",
      })
    );

    expect(parsed.name).toBe("Mega Darkrai ex");
  });

  it("matches One Piece variant suffixes by the submitted base number", () => {
    expect(cardNumberMatchesSubmittedBase("OP09-061", "OP09-061#1")).toBe(true);
    expect(cardNumberMatchesSubmittedBase("OP09-061", "OP09-061#3")).toBe(true);
    expect(cardNumberMatchesSubmittedBase("OP09-061", "OP09-062#1")).toBe(false);
  });

  it("extracts One Piece CardMarket versions and separates English from non-English", () => {
    const variants = parseCardMarketVersionsScrape(
      {
        links: [
          "https://www.cardmarket.com/en/OnePiece/Products/Singles/Adventure-on-Kamis-Island/Zeus-OP11-106",
          "https://www.cardmarket.com/en/OnePiece/Products/Singles/Egghead-Crisis-Asia-Region-Legal/Zeus-OP11-106",
          "https://www.cardmarket.com/en/OnePiece/Products/Singles/A-Fist-of-Divine-Speed/Zeus-OP11-106-V2",
          "https://www.cardmarket.com/en/OnePiece/Products/Singles/A-Fist-of-Divine-Speed-Non-English/Zeus-OP11-106-V1",
          "https://www.cardmarket.com/en/OnePiece/Products/Singles/Unnumbered-Promos-Japanese/Zeus-OP11-106-V1",
        ],
        markdown: [
          "[![Zeus (OP11-106)](https://product-images.s3.cardmarket.com/1621/OP15/880055/880055.jpg)\\\\",
          "**Adventure on Kami’s IslandOP15**](https://www.cardmarket.com/en/OnePiece/Products/Singles/Adventure-on-Kamis-Island/Zeus-OP11-106)",
          "[![Zeus (OP11-106)](https://product-images.s3.cardmarket.com/1621/EB04-JP/871503/871503.jpg)\\\\",
          "**Egghead Crisis Asia Region LegalEB04-JP**](https://www.cardmarket.com/en/OnePiece/Products/Singles/Egghead-Crisis-Asia-Region-Legal/Zeus-OP11-106)",
          "[![Zeus (OP11-106) (V.2)](https://product-images.s3.cardmarket.com/1621/OP11/827244/827244.jpg)\\\\",
          "Version **2**](https://www.cardmarket.com/en/OnePiece/Products/Singles/A-Fist-of-Divine-Speed/Zeus-OP11-106-V2)",
          "[![Zeus (OP11-106) (V.1)](https://product-images.s3.cardmarket.com/1621/OP11-JP/817480/817480.jpg)\\\\",
          "Version **1**](https://www.cardmarket.com/en/OnePiece/Products/Singles/A-Fist-of-Divine-Speed-Non-English/Zeus-OP11-106-V1)",
          "[![Zeus (OP11-106) (V.1)](https://product-images.s3.cardmarket.com/1621/UP-JP/825210/825210.jpg)\\\\",
          "Version **1**](https://www.cardmarket.com/en/OnePiece/Products/Singles/Unnumbered-Promos-Japanese/Zeus-OP11-106-V1)",
        ].join("\n"),
      },
      { game: "one-piece", name: "Zeus", cardNumber: "OP11-106" }
    );

    expect(variants).toHaveLength(5);
    expect(variants.filter((variant) => variant.languageGroup === "english")).toEqual([
      expect.objectContaining({
        name: "Zeus",
        setName: "Adventure on Kamis Island",
        cardNumber: "OP11-106",
        imageUrl: "https://product-images.s3.cardmarket.com/1621/OP15/880055/880055.jpg",
        languageGroup: "english",
        source: "versions",
      }),
      expect.objectContaining({
        setName: "A Fist of Divine Speed",
        cardNumber: "OP11-106 / V2",
        imageUrl: "https://product-images.s3.cardmarket.com/1621/OP11/827244/827244.jpg",
        languageGroup: "english",
        source: "versions",
      }),
    ]);
    expect(variants.filter((variant) => variant.languageGroup === "non_english")).toEqual([
      expect.objectContaining({
        setName: "Egghead Crisis Asia Region Legal",
        cardNumber: "OP11-106",
        imageUrl: "https://product-images.s3.cardmarket.com/1621/EB04-JP/871503/871503.jpg",
        languageGroup: "non_english",
      }),
      expect.objectContaining({
        setName: "A Fist of Divine Speed Non English",
        cardNumber: "OP11-106 / V1",
        imageUrl: "https://product-images.s3.cardmarket.com/1621/OP11-JP/817480/817480.jpg",
        languageGroup: "non_english",
      }),
      expect.objectContaining({
        setName: "Unnumbered Promos Japanese",
        cardNumber: "OP11-106 / V1",
        imageUrl: "https://product-images.s3.cardmarket.com/1621/UP-JP/825210/825210.jpg",
        languageGroup: "non_english",
      }),
    ]);
  });

  it("extracts Pokemon CardMarket versions from a versions page", () => {
    const variants = parseCardMarketVersionsScrape(
      {
        links: [
          "https://www.cardmarket.com/en/Pokemon/Products/Singles/Prismatic-Evolutions/Umbreon-ex-161-131",
          "https://www.cardmarket.com/en/Pokemon/Products/Singles/Terastal-Festival-ex-Japanese/Umbreon-ex-161-131",
        ],
        markdown: [
          "[![Umbreon ex](https://product-images.s3.cardmarket.com/51/PRE/123/123.jpg)](https://www.cardmarket.com/en/Pokemon/Products/Singles/Prismatic-Evolutions/Umbreon-ex-161-131)",
          "[![Umbreon ex](https://product-images.s3.cardmarket.com/51/SV8A-JP/456/456.jpg)](https://www.cardmarket.com/en/Pokemon/Products/Singles/Terastal-Festival-ex-Japanese/Umbreon-ex-161-131)",
        ].join("\n"),
      },
      { game: "pokemon", name: "Umbreon ex", cardNumber: "161/131" }
    );

    expect(variants).toEqual([
      expect.objectContaining({
        name: "Umbreon ex",
        setName: "Prismatic Evolutions",
        languageGroup: "english",
        source: "versions",
      }),
      expect.objectContaining({
        setName: "Terastal Festival ex Japanese",
        languageGroup: "non_english",
        source: "versions",
      }),
    ]);
  });

  it("extracts CardMarket version thumbnails from html when markdown has no images", () => {
    const variants = parseCardMarketVersionsScrape(
      {
        sourceUrl:
          "https://www.cardmarket.com/en/OnePiece/Cards/Zeus-OP11-106/Versions",
        links: [
          "https://www.cardmarket.com/en/OnePiece/Products/Singles/Adventure-on-Kamis-Island/Zeus-OP11-106",
          "https://www.cardmarket.com/en/OnePiece/Products/Singles/A-Fist-of-Divine-Speed/Zeus-OP11-106-V2",
          "https://www.cardmarket.com/en/OnePiece/Products/Singles/A-Fist-of-Divine-Speed-Non-English/Zeus-OP11-106-V1",
        ],
        markdown: [
          "[Adventure](https://www.cardmarket.com/en/OnePiece/Products/Singles/Adventure-on-Kamis-Island/Zeus-OP11-106)",
          "[Version 2](https://www.cardmarket.com/en/OnePiece/Products/Singles/A-Fist-of-Divine-Speed/Zeus-OP11-106-V2)",
          "[Japanese Version 1](https://www.cardmarket.com/en/OnePiece/Products/Singles/A-Fist-of-Divine-Speed-Non-English/Zeus-OP11-106-V1)",
        ].join("\n"),
        html: [
          '<div class="card-column"><a href="/en/OnePiece/Products/Singles/Adventure-on-Kamis-Island/Zeus-OP11-106">',
          '<img src="/img/transparent.gif" data-echo="https://product-images.s3.cardmarket.com/1621/OP15/880055/880055.jpg">',
          "</a></div>",
          '<div class="card-column"><a href="/en/OnePiece/Products/Singles/A-Fist-of-Divine-Speed/Zeus-OP11-106-V2">',
          '<img src="/img/transparent.gif" data-echo="https://product-images.s3.cardmarket.com/1621/OP11/827244/827244.jpg">',
          "</a></div>",
          '<div class="card-column"><a href="/en/OnePiece/Products/Singles/A-Fist-of-Divine-Speed-Non-English/Zeus-OP11-106-V1">',
          '<img src="/img/transparent.gif" data-echo="https://product-images.s3.cardmarket.com/1621/OP11-JP/817480/817480.jpg">',
          "</a></div>",
        ].join(""),
      },
      { game: "one-piece", name: "Zeus", cardNumber: "OP11-106" }
    );

    expect(variants).toEqual([
      expect.objectContaining({
        setName: "Adventure on Kamis Island",
        cardNumber: "OP11-106",
        imageUrl: "https://product-images.s3.cardmarket.com/1621/OP15/880055/880055.jpg",
      }),
      expect.objectContaining({
        setName: "A Fist of Divine Speed",
        cardNumber: "OP11-106 / V2",
        imageUrl: "https://product-images.s3.cardmarket.com/1621/OP11/827244/827244.jpg",
      }),
      expect.objectContaining({
        setName: "A Fist of Divine Speed Non English",
        cardNumber: "OP11-106 / V1",
        imageUrl: "https://product-images.s3.cardmarket.com/1621/OP11-JP/817480/817480.jpg",
        languageGroup: "non_english",
      }),
    ]);
  });

  it("extracts an English NM price and image from a CardMarket scrape", () => {
    const parsed = parseCardMarketScrape(
      makeScrape({
        markdown: ["# Umbreon ex", "English Near Mint €1,234.56"].join("\n"),
        html: '<meta property="og:image" content="/img/cards/umbreon.jpg">',
      })
    );

    expect(parsed.imageUrl).toBe(
      "https://www.cardmarket.com/img/cards/umbreon.jpg"
    );
    expect(parsed.language).toBe("English");
    expect(parsed.nmPriceEur).toBe(1234.56);
  });

  it("uses Japanese NM when that is the available listing language", () => {
    const parsed = parseCardMarketScrape(
      makeScrape({
        markdown: ["# Pikachu", "Japanese Near Mint 2.345,67 €"].join("\n"),
        html: '<meta property="og:image" content="https://img.example/pikachu.jpg">',
      })
    );

    expect(parsed.language).toBe("Japanese");
    expect(parsed.nmPriceEur).toBe(2345.67);
  });

  it("can extract a requested non-NM condition price", () => {
    const parsed = parseCardMarketScrape(
      makeScrape({
        markdown: ["# Monkey.D.Luffy", "English Excellent €42.50", "English Near Mint €150.00"].join("\n"),
        html: '<meta property="og:image" content="https://img.example/luffy.jpg">',
      }),
      "Excellent"
    );

    expect(parsed.condition).toBe("Excellent");
    expect(parsed.language).toBe("English");
    expect(parsed.nmPriceEur).toBe(42.5);
  });

  it("keeps condition, language, and price inside the same CardMarket offer row", () => {
    const parsed = parseCardMarketScrape(
      makeScrape({
        title: "Zeus (OP11-106) (V.1) | Cardmarket",
        sourceUrl:
          "https://www.cardmarket.com/en/OnePiece/Products/Singles/Unnumbered-Promos/Zeus-OP11-106-V1",
        markdown: [
          "English Played 90,00 EUR",
          "English Excellent 100,00 EUR",
          "English Near Mint 140,00 EUR",
          "English Near Mint PSA 10 99,00 EUR",
        ].join("\n"),
        html: [
          '<meta property="og:image" content="https://img.example/zeus.jpg">',
          makeCardMarketArticleRow({ condition: "Played", price: "90,00 EUR" }),
          makeCardMarketArticleRow({ condition: "Excellent", price: "100,00 EUR" }),
          makeCardMarketArticleRow({ condition: "Near Mint", price: "140,00 EUR" }),
          makeCardMarketArticleRow({
            condition: "Near Mint",
            price: "99,00 EUR",
            comment: "PSA 10",
          }),
        ].join(""),
      })
    );

    expect(parsed.language).toBe("English");
    expect(parsed.condition).toBe("Near Mint");
    expect(parsed.nmPriceEur).toBe(140);
  });

  it("accepts only explicit ungraded English NM offer rows for automatic chase prices", () => {
    const parsed = parseStrictCardMarketEnglishNmPrice(
      makeScrape({
        markdown: "English Near Mint 1.00 EUR",
        html: [
          makeCardMarketArticleRow({ condition: "Near Mint", price: "140,00 EUR" }),
          makeCardMarketArticleRow({ condition: "Near Mint", language: "Japanese", price: "80,00 EUR" }),
          makeCardMarketArticleRow({ condition: "Excellent", price: "90,00 EUR" }),
          makeCardMarketArticleRow({ condition: "Near Mint", price: "70,00 EUR", comment: "PSA 10" }),
        ].join(""),
      })
    );

    expect(parsed).toEqual({ priceEur: 140, offerCount: 1 });
    expect(
      parseStrictCardMarketEnglishNmPrice(
        makeScrape({ markdown: "English Near Mint 1.00 EUR", html: "" })
      )
    ).toBeNull();
  });

  it("extracts graded CardMarket prices from seller comments", () => {
    const parsed = parseCardMarketScrape(
      makeScrape({
        markdown: [
          "# Monkey.D.Luffy",
          "English Near Mint â‚¬150.00",
          "Seller comment: PSA 10",
          "â‚¬420.00",
          "Seller comment: BGS 9.5",
          "â‚¬390.00",
          "Seller comment: PSA 10",
          "â‚¬399.00",
        ].join("\n"),
        html: '<meta property="og:image" content="https://img.example/luffy.jpg">',
      })
    );

    expect(parsed.gradedPrices).toEqual([
      { label: "BGS 9.5", price: 390 },
      { label: "PSA 10", price: 399 },
    ]);
  });

  it("extracts more CardMarket graded labels and ignores raw potential text", () => {
    const parsed = parseCardMarketScrape(
      makeScrape({
        markdown: [
          "# Monkey.D.Luffy",
          "English Near Mint Ã¢â€šÂ¬150.00",
          "Seller comment: Top condition! PSA 10 potential",
          "Ã¢â€šÂ¬600.00",
          "Seller comment: AOG 9 speedversand",
          "Ã¢â€šÂ¬499.99",
          "Seller comment: AOG 9.5",
          "Ã¢â€šÂ¬550.00",
          "Seller comment: [AiGrad 10.0] Graded Card - Store image",
          "Ã¢â€šÂ¬600.00",
          "Seller comment: Grad 10 / ask to see certificate",
          "Ã¢â€šÂ¬1,300.00",
          "Seller comment: PSA 10",
          "Ã¢â€šÂ¬1,499.00",
        ].join("\n"),
        html: '<meta property="og:image" content="https://img.example/luffy.jpg">',
      })
    );

    expect(parsed.gradedPrices).toEqual([
      { label: "AIGRAD 10", price: 600 },
      { label: "AOG 9.5", price: 550 },
      { label: "AOG 9", price: 499.99 },
      { label: "GRADED 10", price: 1300 },
      { label: "PSA 10", price: 1499 },
    ]);
  });
});
