import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildEbayCardSearchQuery,
  buildEbayManualSearchQuery,
  buildEbayMarketplaceSearchUrl,
  buildEbaySealedManualSearchQuery,
  buildEbaySealedSearchQuery,
  compareListingToReference,
  detectEbayListingCardCondition,
  detectEbayListingLanguage,
  getEbayListingGradingReason,
  getEbayListingRejectionReason,
  searchEbayDeals,
  __resetEbayTokenCacheForTests,
} from "@/lib/ebay";

describe("ebay deal helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetEbayTokenCacheForTests();
  });

  it("builds a card search query with set and grading context", () => {
    expect(
      buildEbayCardSearchQuery({
        name: "Latias ex",
        episodeName: "Surging Sparks",
        episodeCode: "SV08",
        cardNumber: "239",
        gradingCompany: "PSA",
        gradingGrade: "10",
        mode: "graded",
      })
    ).toBe("PSA 10 Latias ex 239 Surging Sparks SV08 Pokemon");
    expect(
      buildEbayCardSearchQuery({
        name: "Darkrai",
        cardNumber: "136",
        mode: "graded",
      })
    ).toBe("graded Darkrai 136 Pokemon");
  });

  it("adds Pokemon context to manual searches", () => {
    expect(buildEbayManualSearchQuery("Latias ex")).toBe("Latias ex Pokemon");
    expect(buildEbayManualSearchQuery("Pokemon Latias ex")).toBe("Pokemon Latias ex");
  });

  it("keeps sealed queries broad enough for eBay product titles", () => {
    expect(
      buildEbaySealedSearchQuery({
        name: "Mega Evolution Sleeved Booster",
        episodeName: "Mega Evolution",
        episodeCode: "MEG",
      })
    ).toBe("Mega Evolution Sleeved Booster");
    expect(buildEbaySealedManualSearchQuery("Mega Evolution booster box")).toBe(
      "Mega Evolution booster box"
    );
  });

  it("compares listing totals against the DustyCards reference price", () => {
    expect(
      compareListingToReference({
        totalPriceEur: 75,
        referencePriceEur: 100,
      })
    ).toMatchObject({
      differenceEur: 25,
      discountPercent: 25,
      dealTone: "great",
    });
  });

  it("creates a marketplace search URL for the configured eBay site", () => {
    expect(buildEbayMarketplaceSearchUrl("Latias ex", "EBAY_NL")).toBe(
      "https://www.ebay.nl/sch/i.html?_nkw=Latias+ex&_sacat=183454"
    );
  });

  it("keeps normal English card listings", () => {
    expect(
      getEbayListingRejectionReason({
        title: "Umbreon ex 161/131 Prismatic Evolutions Pokemon Card",
        condition: "Ungraded",
      })
    ).toBeNull();
  });

  it("labels explicit English and leaves unknown language unconfirmed", () => {
    expect(
      detectEbayListingLanguage({
        title: "Umbreon ex 161/131 ENG Pokemon Card",
      })
    ).toMatchObject({
      code: "ENG",
      label: "ENG",
      confidence: "explicit",
    });
    expect(
      detectEbayListingLanguage({
        title: "Umbreon ex 161/131 Prismatic Evolutions Pokemon Card",
      })
    ).toMatchObject({
      code: "UNKNOWN",
      label: "Check ENG",
      confidence: "unconfirmed",
    });
    expect(
      detectEbayListingLanguage({
        title: "Umbreon ex 161/131 English, not Japanese",
      })
    ).toMatchObject({
      code: "ENG",
      label: "ENG",
      confidence: "explicit",
    });
  });

  it("filters non-English eBay card listings", () => {
    expect(
      detectEbayListingLanguage({
        title: "Umbreon ex 161/131 Japanese Pokemon Card",
      })
    ).toMatchObject({
      code: "JPN",
      label: "JPN",
    });
    expect(
      getEbayListingRejectionReason({
        title: "Umbreon ex 161/131 Japanese Pokemon Card",
      })
    ).toBe("non-English card language");
    expect(
      getEbayListingRejectionReason({
        title: "포켓몬 Umbreon ex 161/131 Korean Pokemon Card",
      })
    ).toBe("non-English card language");
    expect(
      getEbayListingRejectionReason({
        title: "Umbreon ex 161/131 Chinese Pokemon Card",
      })
    ).toBe("non-English card language");
    expect(
      getEbayListingRejectionReason({
        title: "Carte Pokémon Darkrai 136/197 Holo",
      })
    ).toBe("non-English card language");
    expect(
      getEbayListingRejectionReason({
        title: "Darkrai ex Pokemon Japan Start Deck 100 Battle Collection",
      })
    ).toBe("non-English card language");
    expect(
      getEbayListingRejectionReason({
        title: "Pokemon Darkrai 046/DP-P 10th Movie PROMO Holo PSA 9 MINT",
      })
    ).toBe("non-English card language");
    expect(
      detectEbayListingLanguage({
        title: "Umbreon ex 161/131 FR Pokemon Card",
      })
    ).toMatchObject({
      code: "OTHER",
      label: "FR",
    });
    expect(
      getEbayListingRejectionReason({
        title: "Umbreon ex 161/131 FR Pokemon Card",
      })
    ).toBe("non-English card language");
    expect(
      detectEbayListingLanguage({
        title: "Umbreon ex 161/131 ES Pokemon Card",
      })
    ).toMatchObject({
      code: "OTHER",
      label: "ES",
    });
    expect(
      getEbayListingRejectionReason({
        title: "Umbreon ex 161/131 ES Pokemon Card",
      })
    ).toBe("non-English card language");
    expect(
      getEbayListingRejectionReason({
        title: "Umbreon ex 161/131 DE ITA Pokemon Card",
      })
    ).toBe("non-English card language");
    expect(
      detectEbayListingLanguage({
        title: "Pokemon mega charizard x ex",
        condition: "Non gradada",
      })
    ).toMatchObject({
      code: "OTHER",
      label: "IT",
    });
    expect(
      getEbayListingRejectionReason({
        title: "Pokemon mega charizard x ex",
        condition: "Non gradada",
      })
    ).toBe("non-English card language");
    expect(
      getEbayListingRejectionReason({
        title: "Umbreon ex 161/131 ENG not FR Pokemon Card",
      })
    ).toBeNull();
  });

  it("filters digital, Pocket, mystery, and custom listings", () => {
    expect(
      getEbayListingRejectionReason({
        title: "Pokemon TCG Pocket Umbreon ex digital card",
      })
    ).toBe("Pokemon TCG Pocket listing");
    expect(
      getEbayListingRejectionReason({
        title: "Umbreon ex Pokemon TCG Live code card",
      })
    ).toBe("digital/code listing");
    expect(
      getEbayListingRejectionReason({
        title: "Pokemon Mystery Box Umbreon Chase Card",
      })
    ).toBe("mystery/custom listing");
    expect(
      getEbayListingRejectionReason({
        title: "PSA 10 Umbreon ex fan made custom card",
        listingKind: "graded",
      })
    ).toBe("mystery/custom listing");
    expect(
      getEbayListingRejectionReason({
        title: "DIY Karten Charizard ex proxy fanmade Pokemon card",
        listingKind: "graded",
      })
    ).toBe("mystery/custom listing");
    expect(
      getEbayListingRejectionReason({
        title: "Umbreon ex 161/131 unofficial art card reproduction",
      })
    ).toBe("mystery/custom listing");
    expect(
      getEbayListingRejectionReason({
        title: "Mega Charizard X EX SIR 125/094 SIR 130/094 Gold - PFL Chase Pack! Read Please!",
      })
    ).toBe("mystery/custom listing");
    expect(
      getEbayListingRejectionReason({
        title: "Team Rocket's Mewtwo ex Extended Art Insert for PSA / Graded Guard (No Card)",
      })
    ).toBe("no-card listing");
    expect(
      getEbayListingRejectionReason({
        title: "Pokemon CGC Graded Cards Slab Choose Your Card Multiple Available PSA",
      })
    ).toBe("choice listing");
    expect(
      getEbayListingRejectionReason({
        title: "Umbreon EX 161/131 Prismatic Evolutions Pokemon Card TCG Novelty Keychain",
      })
    ).toBe("accessory/pack listing");
    expect(
      getEbayListingRejectionReason({
        title: "POKEMON TCG EXTENDED ART ACRYLIC CASE CARD UMBREON EX 161 PRE ANIME FRAME",
      })
    ).toBe("accessory/pack listing");
    expect(
      getEbayListingRejectionReason({
        title: "1-150 chance to get Umbreon ex 161 of 131 Prismatic Evolutions Pack",
      })
    ).toBe("accessory/pack listing");
    expect(
      getEbayListingRejectionReason({
        title: "Pokemon - Darkrai Pokeball With TCG Display Stand PSA ACE BECKETT",
      })
    ).toBe("accessory/pack listing");
    expect(
      getEbayListingRejectionReason({
        title: "POKEMON MINI SLAB KEYCHAINS PSA 10",
      })
    ).toBe("accessory/pack listing");
  });

  it("allows non-English markers for graded but filters sealed language mismatches", () => {
    expect(
      getEbayListingRejectionReason({
        title: "PSA 10 Umbreon ex SAR 217/187 Japanese Pokemon Card",
      })
    ).toBe("non-English card language");
    expect(
      getEbayListingRejectionReason({
        title: "PSA 10 Umbreon ex SAR 217/187 Japanese Pokemon Card",
        listingKind: "graded",
      })
    ).toBeNull();
    expect(
      getEbayListingRejectionReason({
        title: "Pokemon TCG Booster Box Phantasmal Flames French",
        listingKind: "sealed",
      })
    ).toBe("non-English sealed language");
    expect(
      getEbayListingRejectionReason({
        title: "Pokemon TCG Booster Box Phantasmal Flames English",
        listingKind: "sealed",
      })
    ).toBeNull();
  });

  it("does not reject official sealed product wording as accessory noise", () => {
    expect(
      getEbayListingRejectionReason({
        title: "Pokemon Mega Evolution Sleeved Booster Pack Sealed",
        listingKind: "sealed",
      })
    ).toBeNull();
    expect(
      getEbayListingRejectionReason({
        title: "Pokemon Mega Evolution Booster Bundle Display Sealed",
        listingKind: "sealed",
      })
    ).toBeNull();
    expect(
      getEbayListingRejectionReason({
        title: "Pokemon Mega Evolution Booster Box Empty Box Only",
        listingKind: "sealed",
      })
    ).toBe("no-card listing");
    expect(
      getEbayListingRejectionReason({
        title: "Pokemon Mega Evolution Elite Trainer Box Empty ETB No Packs",
        listingKind: "sealed",
      })
    ).toBe("no-card listing");
    expect(
      getEbayListingRejectionReason({
        title: "EMPTY Pokemon Phantasmal Flames Elite Trainer Box & Dividers Mega Charizard X",
        listingKind: "sealed",
      })
    ).toBe("no-card listing");
    expect(
      getEbayListingRejectionReason({
        title: "Pokémon TCG: Phantasmal Flames Elite Trainer Box Card Sleeves (65-Pack)",
        listingKind: "sealed",
      })
    ).toBe("accessory/pack listing");
    expect(
      getEbayListingRejectionReason({
        title: "Pokemon Phantasmal Flames Lot , Pulls From Booster Box's And And Elite Trainer",
        listingKind: "sealed",
      })
    ).toBe("multi-card listing");
  });

  it("detects graded listings that should stay out of raw mode", () => {
    expect(
      getEbayListingGradingReason({
        title: "Umbreon ex PSA 10 GEM MINT 161/131 Pokemon Card ENG",
      })
    ).toBeTruthy();
    expect(
      getEbayListingGradingReason({
        title: "Umbreon ex PSA10 GEM MINT 161/131 Pokemon Card ENG",
      })
    ).toBe("Title mentions a grading company and grade");
    expect(
      getEbayListingGradingReason({
        title: "Umbreon ex CGC10 Pristine 161/131 Pokemon Card ENG",
      })
    ).toBe("Title mentions a grading company and grade");
    expect(
      getEbayListingGradingReason({
        title: "Umbreon ex BGS9.5 161/131 Pokemon Card ENG",
      })
    ).toBe("Title mentions a grading company and grade");
    expect(
      getEbayListingGradingReason({
        title: "Umbreon ex GEM 💎 MINT 161/131 Pokemon Card ENG",
      })
    ).toBe("Title mentions GEM MINT");
    expect(
      getEbayListingGradingReason({
        title: "Umbreon ex 161/131 Pokemon Card ENG",
        aspects: [{ name: "Graded", value: "Yes" }],
      })
    ).toBe("eBay aspect says graded");
    expect(
      getEbayListingGradingReason({
        title: "Umbreon ex 161/131 Near Mint Pokemon Card ENG",
      })
    ).toBeNull();
    expect(
      getEbayListingGradingReason({
        title: "Charizard 10/102 Base Set Pokemon Card ENG",
      })
    ).toBeNull();
  });

  it("detects raw card condition markers from eBay titles", () => {
    expect(
      detectEbayListingCardCondition({
        title: "Darkrai EX 107/108 Dark Explorers Full Art Pokemon NM",
        condition: "Ungraded",
      })
    ).toMatchObject({
      code: "near_mint",
      label: "NM",
      confidence: "explicit",
    });
    expect(
      detectEbayListingCardCondition({
        title: "Darkrai 4/106 Holo Great Encounters VLP/NM",
      })
    ).toMatchObject({
      code: "light_play",
      label: "LP",
    });
    expect(
      detectEbayListingCardCondition({
        title: "Umbreon ex 161/131 damaged Pokemon Card",
      })
    ).toMatchObject({
      code: "damaged",
      label: "DMG",
    });
    expect(
      detectEbayListingCardCondition({
        title: "Umbreon ex 161/131 Pokemon Card",
        condition: "Ungraded",
      })
    ).toMatchObject({
      code: "unknown",
      label: "Cond. unknown",
    });
  });

  it("continues fetching eBay pages until enough listings survive local filters", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/identity/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({
            access_token: "token",
            expires_in: 7200,
          })
        );
      }

      if (url.includes("/developer/analytics")) {
        return new Response(
          JSON.stringify({
            rateLimits: [
              {
                apiContext: "buy",
                apiName: "browse",
                resources: [
                  {
                    name: "item_summary_search",
                    rates: [{ remaining: 1000, limit: 5000, timeWindow: 86400 }],
                  },
                ],
              },
            ],
          })
        );
      }

      if (url.includes("offset=0")) {
        return new Response(
          JSON.stringify({
            total: 150,
            itemSummaries: Array.from({ length: 100 }, (_, index) => ({
              itemId: `bad-${index}`,
              title: `Pokemon TCG Pocket Digital Card ${index}`,
              itemWebUrl: `https://www.ebay.nl/itm/bad-${index}`,
              price: { value: "1", currency: "EUR" },
              buyingOptions: ["FIXED_PRICE"],
            })),
          })
        );
      }

      return new Response(
        JSON.stringify({
          total: 150,
          itemSummaries: [
            {
              itemId: "good-1",
              title: "Umbreon ex 161/131 Prismatic Evolutions Pokemon Card ENG",
              itemWebUrl: "https://www.ebay.nl/itm/good-1",
              price: { value: "500", currency: "EUR" },
              buyingOptions: ["FIXED_PRICE"],
            },
          ],
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchEbayDeals({
      query: "Umbreon ex 161 Pokemon",
      reference: { label: "CardMarket raw", valueEur: 899, source: "cardmarket" },
      limit: 1,
      config: {
        configured: true,
        environment: "production",
        marketplaceId: "EBAY_NL",
        deliveryCountry: null,
        categoryId: null,
        clientId: "client-id",
        clientSecret: "client-secret",
      },
    });

    expect(result.listings.map((listing) => listing.itemId)).toEqual(["good-1"]);
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes("offset=100"))
    ).toBe(true);
  });

  it("uses eBay language aspects to filter non-English sealed listings", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/identity/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({
            access_token: "token",
            expires_in: 7200,
          })
        );
      }

      if (url.includes("/developer/analytics")) {
        return new Response(
          JSON.stringify({
            rateLimits: [
              {
                apiContext: "buy",
                apiName: "browse",
                resources: [
                  {
                    name: "item_summary_search",
                    rates: [{ remaining: 1000, limit: 5000, timeWindow: 86400 }],
                  },
                ],
              },
            ],
          })
        );
      }

      if (url.includes("/buy/browse/v1/item/sealed-de")) {
        return new Response(
          JSON.stringify({
            localizedAspects: [{ name: "Language", value: "German" }],
          })
        );
      }

      return new Response(
        JSON.stringify({
          total: 1,
          itemSummaries: [
            {
              itemId: "sealed-de",
              title: "Pokemon Phantasmal Flames Booster Box Sealed",
              itemWebUrl: "https://www.ebay.nl/itm/sealed-de",
              price: { value: "95", currency: "EUR" },
              buyingOptions: ["FIXED_PRICE"],
            },
          ],
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchEbayDeals({
      query: "Phantasmal Flames Booster Box",
      reference: { label: "CardMarket sealed", valueEur: 120, source: "sealed" },
      limit: 1,
      listingKind: "sealed",
      config: {
        configured: true,
        environment: "production",
        marketplaceId: "EBAY_NL",
        deliveryCountry: null,
        categoryId: null,
        clientId: "client-id",
        clientSecret: "client-secret",
      },
    });

    expect(result.listings).toEqual([]);
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes("/buy/browse/v1/item/sealed-de"))
    ).toBe(true);
  });
});
