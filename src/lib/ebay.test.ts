import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildEbayCardDemandSearchQuery,
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
  isConfirmedEbayGradedListing,
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
    expect(
      buildEbayCardSearchQuery({
        name: "Darkrai",
        cardNumber: "136",
        gradingCompany: "CGC",
        mode: "graded",
      })
    ).toBe("CGC Darkrai 136 Pokemon");
    expect(
      buildEbayCardSearchQuery({
        name: "Darkrai",
        cardNumber: "136",
        gradingGrade: "9.5",
        mode: "graded",
      })
    ).toBe("graded 9.5 Darkrai 136 Pokemon");
  });

  it("builds a broad exact-card demand query without expansion-only title terms", () => {
    expect(
      buildEbayCardDemandSearchQuery({
        name: "Mega Dragonite ex",
        game: "pokemon",
        cardNumber: "295/217",
      })
    ).toBe("Mega Dragonite ex 295/217 Pokemon");
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
    ).toBe("Pokemon Mega Evolution Sleeved Booster");
    expect(
      buildEbaySealedSearchQuery({
        name: "Rebel Clash Booster Box (18 Boosters)",
        episodeName: "Rebel Clash",
        episodeCode: "RCL",
      })
    ).toBe("Pokemon Rebel Clash Booster Box");
    expect(buildEbaySealedManualSearchQuery("Mega Evolution booster box")).toBe(
      "Pokemon Mega Evolution booster box"
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

  it("filters oversized, sticker, and multi-card Dragonite results", () => {
    for (const title of [
      "Jumbo Mega Dragonite ex 295/217 English Pokemon Card",
      "Mega Dragonite ex 295/217 Oversized Pokemon Card",
      "Mega Dragonite ex 295/217 Pokemon Card Sticker",
    ]) {
      expect(getEbayListingRejectionReason({ title })).toBe("accessory/pack listing");
    }
    for (const title of [
      "Mega Dragonite ex 295/217 lot Pokemon cards",
      "Mega Dragonite ex 295/217 bundle Pokemon cards",
      "Mega Dragonite ex 295/217 playset Pokemon cards",
    ]) {
      expect(getEbayListingRejectionReason({ title })).toBe("multi-card listing");
    }
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

  it("requires verified grading evidence for graded demand", () => {
    expect(isConfirmedEbayGradedListing({
      title: "Umbreon ex PSA 10 GEM MINT 161/131 Pokemon Card ENG",
    })).toBe(true);
    expect(isConfirmedEbayGradedListing({
      title: "Umbreon ex 161/131 Pokemon Card ENG",
      condition: "Graded",
    })).toBe(true);
    expect(isConfirmedEbayGradedListing({
      title: "Umbreon ex 161/131 Pokemon Card ENG",
      aspects: [{ name: "Graded", value: "Yes" }],
    })).toBe(true);
    expect(isConfirmedEbayGradedListing({
      title: "Umbreon ex 161/131 Pokemon Card ENG",
      aspects: [
        { name: "Professional Grader", value: "PSA" },
        { name: "Grade", value: "10" },
        { name: "Professional Grader", value: "Unknown company" },
        { name: "Grade", value: "Mint" },
      ],
    })).toBe(true);

    for (const rawMarker of ["ungraded", "not graded", "raw card"]) {
      expect(isConfirmedEbayGradedListing({
        title: `Umbreon ex ${rawMarker} 161/131 Pokemon Card ENG`,
        condition: "Graded",
        aspects: [{ name: "Graded", value: "Yes" }],
      })).toBe(false);
    }
    expect(isConfirmedEbayGradedListing({
      title: "Umbreon ex 161/131 Pokemon Card ENG",
      condition: "Ungraded",
      aspects: [{ name: "Graded", value: "Yes" }],
    })).toBe(false);

    expect(isConfirmedEbayGradedListing({
      title: "Umbreon ex BGS9.5 161/131 Pokemon Card ENG",
    })).toBe(true);

    for (const title of [
      "Prime Catcher ACE SPEC 157/162 Pokemon Card ENG",
      "Pikachu & Zekrom GX TAG TEAM 33/181 Pokemon Card ENG",
      "Umbreon ex PSA 161/131 Pokemon Card ENG",
      "Umbreon ex certified authenticated encased 161/131 Pokemon Card ENG",
      "Umbreon ex PSA 10 potential 161/131 Pokemon Card ENG",
      "Umbreon ex PSA 10 candidate 161/131 Pokemon Card ENG",
      "Umbreon ex PSA ready 161/131 Pokemon Card ENG",
      "Umbreon ex gradeable possible 10 161/131 Pokemon Card ENG",
      "Umbreon ex should grade PSA 10 161/131 Pokemon Card ENG",
      "Umbreon ex potential PSA 1 161/131 Pokemon Card ENG",
      "Umbreon ex PSA 7 potential 161/131 Pokemon Card ENG",
      "Umbreon ex likely BGS 8.5 161/131 Pokemon Card ENG",
      "Umbreon ex CGC 6 candidate 161/131 Pokemon Card ENG",
      "Umbreon ex SGC 5 grade-worthy 161/131 Pokemon Card ENG",
      "Umbreon ex BGS black label candidate 161/131 Pokemon Card ENG",
    ]) {
      expect(isConfirmedEbayGradedListing({ title })).toBe(false);
    }
    for (let grade = 1; grade <= 10; grade += 1) {
      expect(isConfirmedEbayGradedListing({
        title: `Umbreon ex potential PSA ${grade} 161/131 Pokemon Card ENG`,
      })).toBe(false);
      expect(isConfirmedEbayGradedListing({
        title: `Umbreon ex PSA ${grade} likely 161/131 Pokemon Card ENG`,
      })).toBe(false);
    }
  });

  it("hard-rejects explicit ungraded eBay aspects", () => {
    for (const value of [
      "No",
      "Ungraded",
      "Not Professionally Graded",
      "Not Applicable",
      "Does not apply",
    ]) {
      const input = {
        title: "Umbreon ex PSA 10 161/131 Pokemon Card ENG",
        aspects: [{ name: "Professional Grader", value }],
      };
      expect(isConfirmedEbayGradedListing(input)).toBe(false);
      expect(getEbayListingGradingReason(input)).toBeNull();
    }
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

  it("keeps strict raw demand limited to eBay-verified English Near Mint listings", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/identity/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "token", expires_in: 7200 }));
      }

      if (url.includes("/developer/analytics")) {
        return new Response(
          JSON.stringify({
            rateLimits: [{
              apiContext: "buy",
              apiName: "browse",
              resources: [{
                name: "item_summary_search",
                rates: [{ remaining: 1000, limit: 5000, timeWindow: 86400 }],
              }],
            }],
          })
        );
      }

      if (url.includes("/buy/browse/v1/item/v1%7Cstrict-nm%7C0")) {
        return new Response(
          JSON.stringify({
            conditionDescriptors: [{
              name: "Card Condition",
              values: [{ content: "Near mint or better" }],
            }],
          })
        );
      }

      if (url.includes("/buy/browse/v1/item/strict-lp")) {
        return new Response(
          JSON.stringify({
            conditionDescriptors: [{
              name: "Card Condition",
              values: [{ content: "Near mint or better" }],
            }],
          })
        );
      }

      return new Response(
        JSON.stringify({
          total: 2,
          itemSummaries: [
            {
              itemId: "v1|strict-nm|0",
              title: "Umbreon ex 161/131 Prismatic Evolutions Pokemon Card",
              itemWebUrl: "https://www.ebay.com/itm/strict-nm",
              condition: "Ungraded",
              price: { value: "500", currency: "EUR" },
              buyingOptions: ["FIXED_PRICE"],
            },
            {
              itemId: "strict-lp",
              title: "Umbreon ex 161/131 Prismatic Evolutions LP Pokemon Card",
              itemWebUrl: "https://www.ebay.com/itm/strict-lp",
              condition: "Ungraded",
              price: { value: "450", currency: "EUR" },
              buyingOptions: ["FIXED_PRICE"],
            },
          ],
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchEbayDeals({
      query: "Umbreon ex 161/131 Prismatic Evolutions Pokemon",
      reference: { label: "CardMarket raw", valueEur: 899, source: "cardmarket" },
      limit: 24,
      buyingMode: "all",
      strictEnglish: true,
      strictNearMint: true,
      excludeGraded: true,
      listingKind: "card",
      config: {
        configured: true,
        environment: "production",
        marketplaceId: "EBAY_US",
        deliveryCountry: "NL",
        categoryId: "183454",
        clientId: "client-id",
        clientSecret: "client-secret",
      },
    });

    expect(result.listings.map((listing) => listing.itemId)).toEqual(["v1|strict-nm|0"]);
    expect(result.listings[0]).toMatchObject({
      language: { code: "ENG", confidence: "explicit" },
      cardCondition: { code: "near_mint" },
      demandVerification: { english: true, nearMint: true, source: "ebay_search_filter" },
    });

    const searchCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("/buy/browse/v1/item_summary/search")
    );
    expect(searchCall).toBeTruthy();
    const searchUrl = new URL(String(searchCall?.[0]));
    expect(searchUrl.searchParams.get("filter")).toContain("conditionIds:{4000}");
    expect(searchUrl.searchParams.get("aspect_filter")).toContain("Language:{English}");
    expect(searchUrl.searchParams.get("aspect_filter")).toContain("Card Condition:{Near Mint or Better}");
  });

  it("accepts Near Mint verified through a localized Card Condition aspect", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/identity/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "token", expires_in: 7200 }));
      }

      if (url.includes("/developer/analytics")) {
        return new Response(JSON.stringify({
          rateLimits: [{
            apiContext: "buy",
            apiName: "browse",
            resources: [{
              name: "item_summary_search",
              rates: [{ remaining: 1000, limit: 5000, timeWindow: 86400 }],
            }],
          }],
        }));
      }

      if (url.includes("/buy/browse/v1/item/aspect-nm")) {
        return new Response(JSON.stringify({
          localizedAspects: [
            { name: "Language", value: "English" },
            { name: "Card Condition", value: "Near Mint or Better" },
          ],
        }));
      }

      return new Response(JSON.stringify({
        total: 1,
        itemSummaries: [{
          itemId: "aspect-nm",
          title: "Mega Dragonite ex 295/217 Pokemon Card",
          itemWebUrl: "https://www.ebay.nl/itm/aspect-nm",
          condition: "Ungraded",
          price: { value: "220", currency: "EUR" },
          buyingOptions: ["FIXED_PRICE"],
        }],
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchEbayDeals({
      query: "Mega Dragonite ex 295/217 Pokemon aspect fallback",
      reference: { label: "CardMarket raw", valueEur: 250, source: "cardmarket" },
      strictEnglish: true,
      strictNearMint: true,
      excludeGraded: true,
      listingKind: "card",
      config: {
        configured: true,
        environment: "production",
        marketplaceId: "EBAY_NL",
        deliveryCountry: null,
        categoryId: "183454",
        clientId: "client-id",
        clientSecret: "client-secret",
      },
    });

    expect(result.listings).toHaveLength(1);
    expect(result.listings[0]).toMatchObject({
      itemId: "aspect-nm",
      language: { code: "ENG", confidence: "explicit" },
      cardCondition: { code: "near_mint" },
      demandVerification: { english: true, nearMint: true, source: "ebay_item" },
    });
  });

  it("uses fixed-price and official English-graded filters for graded demand", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/identity/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "token", expires_in: 7200 }));
      }
      if (url.includes("/developer/analytics")) {
        return new Response(JSON.stringify({
          rateLimits: [{
            apiContext: "buy",
            apiName: "browse",
            resources: [{
              name: "item_summary_search",
              rates: [{ remaining: 1000, limit: 5000, timeWindow: 86400 }],
            }],
          }],
        }));
      }

      return new Response(JSON.stringify({
        total: 3,
        itemSummaries: [
          {
            itemId: "confirmed-by-filter",
            title: "Umbreon ex 161/131 Prismatic Evolutions Pokemon Card",
            itemWebUrl: "https://www.ebay.com/itm/confirmed-by-filter",
            condition: "Used",
            price: { value: "900", currency: "EUR" },
            buyingOptions: ["FIXED_PRICE", "BEST_OFFER"],
          },
          {
            itemId: "conflicting-raw-title",
            title: "Umbreon ex 161/131 raw card Pokemon",
            itemWebUrl: "https://www.ebay.com/itm/conflicting-raw-title",
            condition: "Used",
            price: { value: "500", currency: "EUR" },
            buyingOptions: ["FIXED_PRICE"],
          },
          {
            itemId: "mixed-auction",
            title: "Umbreon ex PSA 10 161/131 Pokemon Card ENG",
            itemWebUrl: "https://www.ebay.com/itm/mixed-auction",
            condition: "Graded",
            price: { value: "800", currency: "EUR" },
            buyingOptions: ["FIXED_PRICE", "AUCTION"],
          },
        ],
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchEbayDeals({
      query: "Umbreon ex 161/131 Prismatic Evolutions Pokemon",
      reference: { label: "All graded listings", valueEur: null, source: "none" },
      buyingMode: "fixed",
      strictEnglish: true,
      requireGraded: true,
      listingKind: "graded",
      config: {
        configured: true,
        environment: "production",
        marketplaceId: "EBAY_US",
        deliveryCountry: "NL",
        categoryId: "183454",
        clientId: "client-id",
        clientSecret: "client-secret",
      },
    });

    expect(result.listings.map((listing) => listing.itemId)).toEqual(["confirmed-by-filter"]);
    expect(result.listings[0]).toMatchObject({
      isConfirmedGradedListing: true,
      language: { code: "ENG", confidence: "explicit" },
    });
    expect(fetchMock.mock.calls.some(([input]) =>
      String(input).includes("/buy/browse/v1/item/confirmed-by-filter")
    )).toBe(false);

    const searchCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("/buy/browse/v1/item_summary/search")
    );
    expect(searchCall).toBeTruthy();
    const searchUrl = new URL(String(searchCall?.[0]));
    expect(searchUrl.searchParams.get("filter")).toContain("buyingOptions:{FIXED_PRICE}");
    expect(searchUrl.searchParams.get("aspect_filter")).toContain("Language:{English}");
    expect(searchUrl.searchParams.get("aspect_filter")).toContain("Graded:{Yes}");
  });

  it("paginates the complete strict NM-English inventory when eBay exposes it", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/identity/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "token", expires_in: 7200 }));
      }
      if (url.includes("/developer/analytics")) {
        return new Response(JSON.stringify({
          rateLimits: [{
            apiContext: "buy",
            apiName: "browse",
            resources: [{
              name: "item_summary_search",
              rates: [{ remaining: 5000, limit: 5000, timeWindow: 86400 }],
            }],
          }],
        }));
      }
      const parsed = new URL(url);
      const offset = Number(parsed.searchParams.get("offset") ?? 0);
      const count = Math.min(200, 250 - offset);
      return new Response(JSON.stringify({
        total: 250,
        itemSummaries: Array.from({ length: count }, (_, index) => ({
          itemId: `complete-${offset + index}`,
          title: `Shining Kabutops 108/105 Neo Destiny Pokemon Card ${offset + index}`,
          itemWebUrl: `https://www.ebay.com/itm/complete-${offset + index}`,
          condition: "Ungraded",
          price: { value: "400", currency: "EUR" },
          buyingOptions: ["FIXED_PRICE"],
        })),
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchEbayDeals({
      query: "Shining Kabutops 108/105 Neo Destiny Pokemon complete inventory",
      reference: { label: "CardMarket raw", valueEur: 440, source: "cardmarket" },
      buyingMode: "all",
      strictEnglish: true,
      strictNearMint: true,
      excludeGraded: true,
      listingKind: "card",
      config: {
        configured: true,
        environment: "production",
        marketplaceId: "EBAY_US",
        deliveryCountry: "NL",
        categoryId: "183454",
        clientId: "client-id",
        clientSecret: "client-secret",
      },
    });

    expect(result.listings).toHaveLength(250);
    expect(result.scan).toMatchObject({ fetchedCount: 250, availableTotal: 250, capped: false });
    expect(fetchMock.mock.calls.filter(([request]) =>
      String(request).includes("/item_summary/search")
    )).toHaveLength(2);
    expect(fetchMock.mock.calls.some(([request]) =>
      String(request).includes("/buy/browse/v1/item/")
    )).toBe(false);
  });

  it("marks the official 10,000-result window as capped when eBay reports more", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/identity/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "token", expires_in: 7200 }));
      }
      if (url.includes("/developer/analytics")) {
        return new Response(JSON.stringify({
          rateLimits: [{
            apiContext: "buy",
            apiName: "browse",
            resources: [{
              name: "item_summary_search",
              rates: [{ remaining: 5000, limit: 5000, timeWindow: 86400 }],
            }],
          }],
        }));
      }
      const parsed = new URL(url);
      const offset = Number(parsed.searchParams.get("offset") ?? 0);
      return new Response(JSON.stringify({
        total: 10_050,
        itemSummaries: Array.from({ length: 200 }, (_, index) => ({
          itemId: `capped-${offset + index}`,
          title: `Pikachu 58/102 Base Set Pokemon Card ${offset + index}`,
          itemWebUrl: `https://www.ebay.com/itm/capped-${offset + index}`,
          condition: "Ungraded",
          price: { value: "50", currency: "EUR" },
          buyingOptions: ["FIXED_PRICE"],
        })),
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchEbayDeals({
      query: "Pikachu 58/102 Base Set Pokemon full official window",
      reference: { label: "CardMarket raw", valueEur: 50, source: "cardmarket" },
      buyingMode: "all",
      strictEnglish: true,
      strictNearMint: true,
      excludeGraded: true,
      listingKind: "card",
      config: {
        configured: true,
        environment: "production",
        marketplaceId: "EBAY_US",
        deliveryCountry: "US",
        categoryId: "183454",
        clientId: "client-id",
        clientSecret: "client-secret",
      },
    });

    expect(result.listings).toHaveLength(10_000);
    expect(result.scan).toMatchObject({
      fetchedCount: 10_000,
      availableTotal: 10_050,
      capped: true,
    });
    expect(fetchMock.mock.calls.filter(([request]) =>
      String(request).includes("/item_summary/search")
    )).toHaveLength(50);
  }, 15_000);

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
