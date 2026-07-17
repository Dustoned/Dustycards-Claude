import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { collectionMock, dbMock, demandMock, ebayMock, exchangeMock, priceHistoryMock } =
  vi.hoisted(() => ({
    collectionMock: {
      getCollectionMatchedGradedPrice: vi.fn(),
    },
    dbMock: {
      card: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      ebayListingCardOverride: {
        findMany: vi.fn(),
      },
      sealedProduct: {
        findUnique: vi.fn(),
      },
    },
    demandMock: {
      recordEbayDemandScan: vi.fn(),
    },
    ebayMock: {
      buildEbayCardDemandSearchQuery: vi.fn(),
      buildEbayCardSearchQuery: vi.fn(),
      buildEbayManualSearchQuery: vi.fn(),
      buildEbayMarketplaceSearchUrl: vi.fn(),
      buildEbaySealedManualSearchQuery: vi.fn(),
      buildEbaySealedSearchQuery: vi.fn(),
      compareListingToReference: vi.fn(),
      getEbayDemandRuntimeConfig: vi.fn(),
      getEbayRuntimeConfig: vi.fn(),
      searchEbayDeals: vi.fn(),
    },
    exchangeMock: {
      convertUsdToEur: vi.fn(),
      getUsdToEurRate: vi.fn(),
    },
    priceHistoryMock: {
      getCardMarketValue: vi.fn(),
    },
  }));

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({
    id: "user-1",
    email: "user@example.com",
    role: "user",
    disabled: false,
  }),
  authErrorResponse: vi.fn(() => null),
}));

vi.mock("@/lib/collection", () => ({
  COLLECTION_GRADING_COMPANIES: ["PSA", "BGS", "CGC", "SGC", "ACE", "TAG"],
  getCollectionMatchedGradedPrice:
    collectionMock.getCollectionMatchedGradedPrice,
}));

vi.mock("@/lib/db", () => ({
  db: dbMock,
}));

vi.mock("@/lib/ebay", () => ({
  buildEbayCardDemandSearchQuery: ebayMock.buildEbayCardDemandSearchQuery,
  buildEbayCardSearchQuery: ebayMock.buildEbayCardSearchQuery,
  buildEbayManualSearchQuery: ebayMock.buildEbayManualSearchQuery,
  buildEbayMarketplaceSearchUrl: ebayMock.buildEbayMarketplaceSearchUrl,
  buildEbaySealedManualSearchQuery: ebayMock.buildEbaySealedManualSearchQuery,
  buildEbaySealedSearchQuery: ebayMock.buildEbaySealedSearchQuery,
  compareListingToReference: ebayMock.compareListingToReference,
  getEbayDemandRuntimeConfig: ebayMock.getEbayDemandRuntimeConfig,
  getEbayRuntimeConfig: ebayMock.getEbayRuntimeConfig,
  searchEbayDeals: ebayMock.searchEbayDeals,
}));

vi.mock("@/lib/ebay-demand", () => ({
  recordEbayDemandScan: demandMock.recordEbayDemandScan,
}));

vi.mock("@/lib/exchange-rates", () => ({
  convertUsdToEur: exchangeMock.convertUsdToEur,
  getUsdToEurRate: exchangeMock.getUsdToEurRate,
}));

vi.mock("@/lib/price-history", () => ({
  getCardMarketValue: priceHistoryMock.getCardMarketValue,
}));

import { GET } from "@/app/api/ebay/deals/route";

type TestCard = ReturnType<typeof makeUmbreonCard>;
type TestListing = ReturnType<typeof makeListing>;

function makeUmbreonCard() {
  return {
    id: "21554",
    name: "Umbreon ex",
    card_number: "161/131",
    printed_card_number: "161/131",
    rarity: "Special Illustration Rare",
    image_url: null,
    episode: {
      id: "pre",
      name: "Prismatic Evolutions",
      code: "PRE",
    },
    prices: [
      {
        cm_en_lowest_nm: 899,
        cm_de_lowest_nm: null,
        cm_fr_lowest_nm: null,
        cm_es_lowest_nm: null,
        cm_it_lowest_nm: null,
        tcp_market: null,
      },
    ],
    gradedPrices: [],
    ebaySoldGradedPrices: [],
    collectionItems: [],
  };
}

function makeSealedProduct() {
  return {
    id: "sealed-1",
    name: "Mega Evolution Sleeved Booster",
    image_url: null,
    cm_lowest: 8,
    cm_lowest_eu: null,
    cm_lowest_de: null,
    cm_lowest_fr: null,
    cm_lowest_es: null,
    cm_lowest_it: null,
    episode: {
      id: "meg",
      name: "Mega Evolution",
      code: "MEG",
    },
  };
}

function toOverrideCard(card: TestCard) {
  return {
    id: card.id,
    name: card.name,
    card_number: card.card_number,
    rarity: card.rarity,
    image_url: card.image_url,
    episode: card.episode,
  };
}

function makeListing(input: {
  itemId: string;
  title: string;
  totalEur: number;
  condition?: string | null;
}): {
  itemId: string;
  title: string;
  imageUrl: string | null;
  itemWebUrl: string;
  condition: string | null;
  language: {
    code: "ENG";
    label: "ENG";
    confidence: "explicit";
    reason: "Title mentions EN, ENG, or English";
  };
  isGradedListing: false;
  gradingReason: null;
  buyingOptions: string[];
  price: { value: number; currency: string; valueEur: number };
  shipping: { value: null; currency: null; valueEur: null };
  total: { value: number; currency: string; valueEur: number };
  seller: {
    username: null;
    feedbackPercentage: null;
    feedbackScore: null;
  };
  locationCountry: string;
  itemCreationDate: null;
  itemEndDate: null;
  discountPercent: null;
  differenceEur: null;
  dealScore: null;
  dealTone: "unknown";
} {
  return {
    itemId: input.itemId,
    title: input.title,
    imageUrl: null,
    itemWebUrl: `https://www.ebay.nl/itm/${encodeURIComponent(input.itemId)}`,
    condition: input.condition ?? "Ungraded",
    language: {
      code: "ENG",
      label: "ENG",
      confidence: "explicit",
      reason: "Title mentions EN, ENG, or English",
    },
    isGradedListing: false,
    gradingReason: null,
    buyingOptions: ["FIXED_PRICE"],
    price: {
      value: input.totalEur,
      currency: "EUR",
      valueEur: input.totalEur,
    },
    shipping: {
      value: null,
      currency: null,
      valueEur: null,
    },
    total: {
      value: input.totalEur,
      currency: "EUR",
      valueEur: input.totalEur,
    },
    seller: {
      username: null,
      feedbackPercentage: null,
      feedbackScore: null,
    },
    locationCountry: "NL",
    itemCreationDate: null,
    itemEndDate: null,
    discountPercent: null,
    differenceEur: null,
    dealScore: null,
    dealTone: "unknown",
  };
}

function mockSearchResults(
  listings: TestListing[],
  scan?: { fetchedCount: number; availableTotal: number | null; capped: boolean }
) {
  ebayMock.searchEbayDeals.mockImplementation(
    async ({
      buyingMode,
      config,
      query,
    }: {
      buyingMode: string;
      config: { marketplaceId: string; deliveryCountry: string | null };
      query: string;
    }) => ({
      query,
      marketplaceId: config.marketplaceId,
      deliveryCountry: config.deliveryCountry,
      buyingMode,
      total: listings.length,
      listings,
      ...(scan ? { scan } : {}),
      directSearchUrl: `https://www.ebay.nl/sch/i.html?_nkw=${encodeURIComponent(
        query
      )}`,
    })
  );
}

describe("GET /api/ebay/deals", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    ebayMock.getEbayRuntimeConfig.mockReturnValue({
      configured: true,
      environment: "production",
      marketplaceId: "EBAY_NL",
      deliveryCountry: "NL",
      categoryId: "183454",
      clientId: "client-id",
      clientSecret: "client-secret",
    });
    ebayMock.getEbayDemandRuntimeConfig.mockReturnValue({
      configured: true,
      environment: "production",
      marketplaceId: "EBAY_US",
      deliveryCountry: "NL",
      categoryId: "183454",
      clientId: "client-id",
      clientSecret: "client-secret",
    });
    ebayMock.buildEbayManualSearchQuery.mockImplementation((query: string) =>
      /\bpokemon\b/i.test(query) ? query : `${query} Pokemon`
    );
    ebayMock.buildEbayCardSearchQuery.mockImplementation(
      (input: { name: string; cardNumber?: string | null }) =>
        [input.name, input.cardNumber, "Pokemon"].filter(Boolean).join(" ")
    );
    ebayMock.buildEbayCardDemandSearchQuery.mockImplementation(
      (input: { name: string; cardNumber?: string | null }) =>
        [input.name, input.cardNumber, "Pokemon"].filter(Boolean).join(" ")
    );
    ebayMock.buildEbaySealedManualSearchQuery.mockImplementation((query: string) =>
      /\bpokemon\b/i.test(query) ? query : `Pokemon ${query}`
    );
    ebayMock.buildEbaySealedSearchQuery.mockImplementation(
      (input: { name: string }) => `Pokemon ${input.name}`
    );
    ebayMock.buildEbayMarketplaceSearchUrl.mockReturnValue(
      "https://www.ebay.nl/sch/i.html"
    );
    ebayMock.compareListingToReference.mockImplementation(
      ({
        referencePriceEur,
        totalPriceEur,
      }: {
        referencePriceEur: number | null;
        totalPriceEur: number | null;
      }) => ({
        discountPercent:
          referencePriceEur && totalPriceEur
            ? Math.round(((referencePriceEur - totalPriceEur) / referencePriceEur) * 100)
            : null,
        differenceEur:
          referencePriceEur != null && totalPriceEur != null
            ? referencePriceEur - totalPriceEur
            : null,
        dealScore:
          referencePriceEur != null && totalPriceEur != null
            ? referencePriceEur - totalPriceEur
            : null,
        dealTone: "good",
      })
    );
    collectionMock.getCollectionMatchedGradedPrice.mockReturnValue(null);
    dbMock.ebayListingCardOverride.findMany.mockResolvedValue([]);
    exchangeMock.convertUsdToEur.mockImplementation((value: number) => value);
    exchangeMock.getUsdToEurRate.mockResolvedValue(1);
    priceHistoryMock.getCardMarketValue.mockImplementation(
      (price: { cm_en_lowest_nm?: number | null } | null) =>
        price?.cm_en_lowest_nm ?? null
    );
    demandMock.recordEbayDemandScan.mockResolvedValue({
      updatedAt: "2026-07-13T12:00:00.000Z",
      marketplaceId: "EBAY_US",
      mode: "raw",
      sample: { observed: 1, clean: 1, capped: false },
      summary: {
        activeCount: 1,
        new7d: 1,
        removed7d: 0,
        removalPressure7d: 0,
        baseline30d: 0,
        pressureChangePercent: 0,
        medianAskEur: 100,
        lowestAskEur: 100,
        auctionCount: 0,
        fixedCount: 1,
      },
      history: [],
    });
  });

  it("adds card matches and per-listing references to manual eBay searches", async () => {
    const card = makeUmbreonCard();
    dbMock.card.findMany
      .mockResolvedValueOnce([{ id: card.id }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    dbMock.card.findUnique.mockResolvedValue(card);
    mockSearchResults([
      makeListing({
        itemId: "matched-1",
        title: "Umbreon ex 161/131 Prismatic Evolutions PRE Pokemon Card",
        totalEur: 500,
      }),
      makeListing({
        itemId: "promo-1",
        title: "Umbreon 161/S-P Japanese Promo Pokemon Card",
        totalEur: 45,
      }),
    ]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/ebay/deals?q=umbreon%20161")
    );
    const body = await response.json();
    const promoListing = body.listings.find(
      (listing: { itemId: string }) => listing.itemId === "promo-1"
    );

    expect(response.status).toBe(200);
    expect(body.listings).toHaveLength(2);
    expect(body.listings[0].itemId).toBe("matched-1");
    expect(body.listings[0].cardMatch).toMatchObject({
      status: "matched",
      source: "auto",
      card: { id: card.id, name: "Umbreon ex" },
    });
    expect(body.listings[0].reference).toMatchObject({
      label: "CardMarket raw",
      valueEur: 899,
      source: "cardmarket",
    });
    expect(body.listings[0].differenceEur).toBe(399);
    expect(promoListing.cardMatch.status).toBe("unmatched");
    expect(promoListing.reference.valueEur).toBeNull();
  });

  it("uses the strict US NM English demand profile and persists only that scan", async () => {
    const card = makeUmbreonCard();
    dbMock.card.findUnique.mockResolvedValue(card);
    mockSearchResults([
      makeListing({
        itemId: "demand-1",
        title: "Umbreon ex 161/131 Prismatic Evolutions English NM Pokemon Card",
        totalEur: 500,
      }),
      makeListing({
        itemId: "review-only",
        title: "Umbreon ex Prismatic Evolutions English NM Pokemon Card",
        totalEur: 25,
      }),
    ]);

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/ebay/deals?cardId=21554&mode=raw&buying=all&profile=demand&limit=50"
      )
    );

    expect(response.status).toBe(200);
    expect(ebayMock.getEbayDemandRuntimeConfig).toHaveBeenCalledTimes(1);
    expect(ebayMock.buildEbayCardDemandSearchQuery).toHaveBeenCalledWith({
      name: "Umbreon ex",
      game: "pokemon",
      cardNumber: "161/131",
    });
    expect(ebayMock.searchEbayDeals).toHaveBeenCalledTimes(1);
    expect(ebayMock.searchEbayDeals).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ marketplaceId: "EBAY_US" }),
        buyingMode: "fixed",
        strictEnglish: true,
        strictNearMint: true,
        excludeGraded: true,
        listingKind: "card",
      })
    );
    expect(demandMock.recordEbayDemandScan).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: "21554",
        marketplaceId: "EBAY_US",
        mode: "raw",
        listings: [expect.objectContaining({ itemId: "demand-1" })],
      })
    );
  });

  it("uses loose full-number demand discovery for Mega Dragonite and keeps exact-card matches", async () => {
    const card = {
      ...makeUmbreonCard(),
      id: "mega-dragonite-295",
      game: "pokemon",
      name: "Mega Dragonite ex",
      card_number: "295",
      printed_card_number: "295/217",
      episode: {
        id: "meg",
        name: "Mega Evolution",
        code: "MEG",
      },
    };
    dbMock.card.findUnique.mockResolvedValue(card);
    mockSearchResults(
      [
        makeListing({
          itemId: "dragonite-exact",
          title: "Mega Dragonite ex 295/217 SIR English NM Pokemon Card",
          totalEur: 250,
        }),
        makeListing({
          itemId: "dragonite-wrong-denominator",
          title: "Mega Dragonite ex 295/198 English NM Pokemon Card",
          totalEur: 20,
        }),
        makeListing({
          itemId: "dragonite-jumbo",
          title: "Jumbo Mega Dragonite ex 295/217 English Pokemon Card",
          totalEur: 10,
        }),
      ],
      { fetchedCount: 160, availableTotal: 160, capped: false }
    );

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/ebay/deals?cardId=mega-dragonite-295&mode=raw&profile=demand&limit=50"
      )
    );

    expect(response.status).toBe(200);
    expect(ebayMock.buildEbayCardDemandSearchQuery).toHaveBeenCalledWith({
      name: "Mega Dragonite ex",
      game: "pokemon",
      cardNumber: "295/217",
    });
    expect(ebayMock.buildEbayCardSearchQuery).not.toHaveBeenCalled();
    expect(ebayMock.searchEbayDeals).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "Mega Dragonite ex 295/217 Pokemon",
        buyingMode: "fixed",
        strictEnglish: true,
        strictNearMint: true,
        excludeGraded: true,
      })
    );
    expect(demandMock.recordEbayDemandScan).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: "mega-dragonite-295",
        listings: [expect.objectContaining({ itemId: "dragonite-exact" })],
        observedCount: 160,
        capped: false,
      })
    );
  });

  it("keeps shared graded demand independent from the user's saved slab grade", async () => {
    const card = {
      ...makeUmbreonCard(),
      collectionItems: [
        {
          grading_company: "PSA",
          grading_grade: "8",
        },
      ],
    };
    dbMock.card.findUnique.mockResolvedValue(card);
    collectionMock.getCollectionMatchedGradedPrice.mockReturnValueOnce({
      label: "PSA 8 eBay sold",
      price: 92,
      source: "ebay_sold_graded",
    });
    mockSearchResults([]);
    demandMock.recordEbayDemandScan.mockResolvedValueOnce({
      updatedAt: "2026-07-13T12:00:00.000Z",
      marketplaceId: "EBAY_US",
      mode: "graded",
      sample: { observed: 0, clean: 0, capped: false },
      summary: {
        activeCount: 0,
        new7d: 0,
        removed7d: 0,
        removalPressure7d: 0,
        baseline30d: 0,
        pressureChangePercent: 0,
        medianAskEur: null,
        lowestAskEur: null,
        auctionCount: 0,
        fixedCount: 0,
      },
      history: [],
    });

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/ebay/deals?cardId=21554&mode=graded&buying=all&profile=demand&limit=50"
      )
    );

    expect(response.status).toBe(200);
    expect(ebayMock.buildEbayCardDemandSearchQuery).toHaveBeenCalledWith({
      name: "Umbreon ex",
      game: "pokemon",
      cardNumber: "161/131",
    });
    expect(ebayMock.buildEbayCardSearchQuery).not.toHaveBeenCalled();
    expect(ebayMock.searchEbayDeals).toHaveBeenCalledWith(
      expect.objectContaining({
        buyingMode: "fixed",
        reference: {
          label: "All graded listings",
          valueEur: null,
          source: "none",
        },
        strictEnglish: true,
        strictNearMint: false,
        excludeGraded: false,
        requireGraded: true,
        listingKind: "graded",
      })
    );
    expect(collectionMock.getCollectionMatchedGradedPrice).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      reference: {
        label: "All graded listings",
        valueEur: null,
        source: "none",
      },
    });
    expect(demandMock.recordEbayDemandScan).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: "21554",
        marketplaceId: "EBAY_US",
        mode: "graded",
        listings: [],
      })
    );
  });

  it("adds graded context to manual graded searches", async () => {
    dbMock.card.findMany.mockResolvedValue([]);
    mockSearchResults([]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/ebay/deals?q=darkrai&mode=graded")
    );

    expect(response.status).toBe(200);
    expect(ebayMock.searchEbayDeals).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "darkrai graded Pokemon",
        requireGraded: true,
        excludeGraded: false,
        listingKind: "graded",
      })
    );
  });

  it("filters graded searches by grading company and grade", async () => {
    dbMock.card.findMany.mockResolvedValue([]);
    mockSearchResults([
      makeListing({
        itemId: "psa-10",
        title: "PSA 10 Charizard 4/102 Base Set Pokemon Card ENG",
        totalEur: 850,
        condition: "Graded",
      }),
      makeListing({
        itemId: "psa-9",
        title: "PSA 9 Charizard 4/102 Base Set Pokemon Card ENG",
        totalEur: 350,
        condition: "Graded",
      }),
      makeListing({
        itemId: "bgs-10",
        title: "BGS 10 Charizard 4/102 Base Set Pokemon Card ENG",
        totalEur: 1_100,
        condition: "Graded",
      }),
    ]);

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/ebay/deals?q=charizard&mode=graded&grader=PSA&grade=10"
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(ebayMock.buildEbayManualSearchQuery).toHaveBeenLastCalledWith(
      "PSA 10 charizard"
    );
    expect(ebayMock.searchEbayDeals).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "PSA 10 charizard Pokemon",
        requireGraded: true,
        listingKind: "graded",
      })
    );
    expect(body.total).toBe(1);
    expect(body.listings.map((listing: { itemId: string }) => listing.itemId)).toEqual([
      "psa-10",
    ]);
    expect(body.listings[0].cardMatch).toMatchObject({
      gradingCompany: "PSA",
      gradingGrade: "10",
    });
  });

  it("uses the exact saved eBay sold graded price as the graded reference", async () => {
    const card = {
      ...makeUmbreonCard(),
      gradedPrices: [{ label: "PSA 8", price: 80 }],
      ebaySoldGradedPrices: [
        {
          source: "ebay_sold",
          label: "PSA 8",
          company: "PSA",
          grade: "8",
          median_price: 100,
          currency: "USD",
          sample_size: 5,
        },
      ],
      collectionItems: [
        {
          grading_company: "PSA",
          grading_grade: "8",
        },
      ],
    };
    collectionMock.getCollectionMatchedGradedPrice.mockReturnValue({
      label: "PSA 8 eBay sold",
      price: 92,
      source: "ebay_sold_graded",
    });
    dbMock.card.findUnique.mockResolvedValue(card);
    mockSearchResults([
      makeListing({
        itemId: "psa-8-umbreon",
        title: "PSA 8 Umbreon ex 161/131 Pokemon",
        totalEur: 75,
        condition: "Graded",
      }),
    ]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/ebay/deals?cardId=21554&mode=graded")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(exchangeMock.getUsdToEurRate).toHaveBeenCalled();
    expect(collectionMock.getCollectionMatchedGradedPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        gradedPrices: card.gradedPrices,
        ebaySoldGradedPrices: card.ebaySoldGradedPrices,
      }),
      expect.objectContaining({
        gradingCompany: "PSA",
        gradingGrade: "8",
        usdToEurRate: 1,
      })
    );
    expect(body.listings[0].reference).toMatchObject({
      label: "PSA 8 eBay sold",
      valueEur: 92,
      source: "ebay_sold_graded",
    });
  });

  it("uses the selected grade instead of the saved slab grade for comparisons", async () => {
    const card = {
      ...makeUmbreonCard(),
      gradedPrices: [
        { label: "PSA 8", price: 80 },
        { label: "PSA 10", price: 900 },
      ],
      collectionItems: [
        {
          grading_company: "PSA",
          grading_grade: "8",
        },
      ],
    };
    dbMock.card.findUnique.mockResolvedValue(card);
    collectionMock.getCollectionMatchedGradedPrice.mockImplementation(
      (_card: unknown, options: { gradingCompany?: string; gradingGrade?: string }) =>
        options.gradingCompany === "PSA" && options.gradingGrade === "10"
          ? {
              label: "PSA 10",
              price: 900,
              source: "cardmarket_graded",
            }
          : null
    );
    mockSearchResults([
      makeListing({
        itemId: "selected-psa-10",
        title: "PSA 10 Umbreon ex 161/131 Prismatic Evolutions Pokemon Card ENG",
        totalEur: 750,
        condition: "Graded",
      }),
    ]);

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/ebay/deals?cardId=21554&mode=graded&grader=PSA&grade=10"
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(collectionMock.getCollectionMatchedGradedPrice).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        gradingCompany: "PSA",
        gradingGrade: "10",
      })
    );
    expect(body.listings).toHaveLength(1);
    expect(body.listings[0].reference).toMatchObject({
      label: "PSA 10",
      valueEur: 900,
      source: "graded",
    });
  });

  it("falls back to a generic graded card query when the saved grade is too narrow", async () => {
    const card = {
      ...makeUmbreonCard(),
      collectionItems: [
        {
          grading_company: "CGC",
          grading_grade: "10",
        },
      ],
    };
    dbMock.card.findUnique.mockResolvedValue(card);
    ebayMock.buildEbayCardSearchQuery.mockImplementation(
      (input: {
        name: string;
        cardNumber?: string | null;
        gradingCompany?: string | null;
        gradingGrade?: string | null;
      }) =>
        [
          input.gradingCompany && input.gradingGrade
            ? `${input.gradingCompany} ${input.gradingGrade}`
            : "graded",
          input.name,
          input.cardNumber,
          "Pokemon",
        ]
          .filter(Boolean)
          .join(" ")
    );
    ebayMock.searchEbayDeals.mockImplementation(
      async ({
        buyingMode,
        config,
        query,
      }: {
        buyingMode: string;
        config: { marketplaceId: string; deliveryCountry: string | null };
        query: string;
      }) => {
        const listings = query.startsWith("CGC 10")
          ? []
          : [
              makeListing({
                itemId: "graded-fallback",
                title: "PSA 10 Umbreon ex 161/131 Pokemon",
                totalEur: 400,
              }),
            ];

        return {
          query,
          marketplaceId: config.marketplaceId,
          deliveryCountry: config.deliveryCountry,
          buyingMode,
          total: listings.length,
          listings,
          directSearchUrl: `https://www.ebay.nl/sch/i.html?_nkw=${encodeURIComponent(query)}`,
        };
      }
    );

    const response = await GET(
      new NextRequest("http://localhost:3000/api/ebay/deals?cardId=21554&mode=graded")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    const searchedQueries = ebayMock.searchEbayDeals.mock.calls.map(
      ([input]) => (input as { query: string }).query
    );
    expect(searchedQueries).toContain("CGC 10 Umbreon ex 161/131 Pokemon");
    expect(searchedQueries).toContain("Umbreon ex 161/131 PRE graded Pokemon");
    expect(searchedQueries).toContain("Umbreon ex graded Pokemon");
    expect(ebayMock.searchEbayDeals).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "Umbreon ex graded Pokemon",
        listingKind: "graded",
      })
    );
    expect(body.listings.map((listing: { itemId: string }) => listing.itemId)).toEqual([
      "graded-fallback",
    ]);
    expect(body.listings[0].cardMatch).toMatchObject({
      status: "matched",
      card: { id: card.id, name: "Umbreon ex" },
    });
    expect(body.listings[0].reference.valueEur).toBe(899);
  });

  it("shows generic graded listings when an exact graded card search has no pinned matches", async () => {
    const card = makeUmbreonCard();
    dbMock.card.findUnique.mockResolvedValue(card);
    dbMock.card.findMany.mockResolvedValue([]);
    mockSearchResults([
      makeListing({
        itemId: "generic-graded",
        title: "PSA 10 Charizard 4/102 Base Set Pokemon",
        totalEur: 300,
        condition: "Graded",
      }),
    ]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/ebay/deals?cardId=21554&mode=graded")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.card.id).toBe(card.id);
    expect(body.total).toBe(1);
    expect(body.listings.map((listing: { itemId: string }) => listing.itemId)).toEqual([
      "generic-graded",
    ]);
    expect(body.listings[0].cardMatch).toMatchObject({
      status: "unmatched",
      card: null,
    });
  });

  it("filters cardId searches to listings matched to that exact card", async () => {
    const card = makeUmbreonCard();
    dbMock.card.findUnique.mockResolvedValue(card);
    mockSearchResults([
      makeListing({
        itemId: "umbreon-ex",
        title: "Umbreon ex 161/131 Prismatic Evolutions PRE Pokemon",
        totalEur: 510,
      }),
      makeListing({
        itemId: "same-name-no-number",
        title: "Umbreon ex Prismatic Evolutions PRE Pokemon Card",
        totalEur: 25,
      }),
      makeListing({
        itemId: "same-name-wrong-number",
        title: "Umbreon ex 013/094 Prismatic Evolutions PRE Pokemon",
        totalEur: 12,
      }),
      makeListing({
        itemId: "same-name-denominator-number",
        title: "Umbreon ex 13/161 Prismatic Evolutions PRE Pokemon",
        totalEur: 12,
      }),
      makeListing({
        itemId: "same-name-promo-code",
        title: "Umbreon ex MEP029 Prismatic Evolutions Promo Pokemon",
        totalEur: 11,
      }),
      makeListing({
        itemId: "same-name-hash-number",
        title: "Umbreon ex Ascended Heroes Black Star Promo Holo Foil #29 Pokemon",
        totalEur: 11,
      }),
      makeListing({
        itemId: "generic-era-listing",
        title: "Prismatic Evolutions Pokemon Cards, Reverse Holo, EX, Ultra Rare, Full Art, English NM",
        totalEur: 10,
      }),
      makeListing({
        itemId: "charizard",
        title: "Charizard 4/102 Base Set Pokemon",
        totalEur: 300,
      }),
    ]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/ebay/deals?cardId=21554")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.card.id).toBe(card.id);
    expect(body.total).toBe(1);
    expect(body.listings.map((listing: { itemId: string }) => listing.itemId)).toEqual([
      "umbreon-ex",
    ]);
    expect(body.listings[0].cardMatch.card.id).toBe(card.id);
    expect(body.listings[0].reference.valueEur).toBe(899);
  });

  it("keeps cardId searches exact even when a stale query is present", async () => {
    const card = makeUmbreonCard();
    dbMock.card.findUnique.mockResolvedValue(card);
    mockSearchResults([]);

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/ebay/deals?cardId=21554&q=erika%20oddish&mode=graded"
      )
    );

    expect(response.status).toBe(200);
    expect(ebayMock.buildEbayCardSearchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Umbreon ex",
        episodeName: "Prismatic Evolutions",
        episodeCode: "PRE",
        cardNumber: "161/131",
        mode: "graded",
      })
    );
    expect(ebayMock.searchEbayDeals).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "Umbreon ex 161/131 Pokemon",
        requireGraded: true,
      })
    );
  });

  it("searches sealed product deals by product title", async () => {
    const product = makeSealedProduct();
    dbMock.sealedProduct.findUnique.mockResolvedValue(product);
    ebayMock.searchEbayDeals.mockImplementation(
      async ({
        buyingMode,
        config,
        query,
      }: {
        buyingMode: string;
        config: { marketplaceId: string; deliveryCountry: string | null };
        query: string;
      }) => {
        const listings = [
          makeListing({
            itemId: "sealed-title",
            title: "Pokemon Mega Evolution Sleeved Booster Pack",
            totalEur: 6,
          }),
        ];

        return {
          query,
          marketplaceId: config.marketplaceId,
          deliveryCountry: config.deliveryCountry,
          buyingMode,
          total: listings.length,
          listings,
          directSearchUrl: `https://www.ebay.nl/sch/i.html?_nkw=${encodeURIComponent(query)}`,
        };
      }
    );

    const response = await GET(
      new NextRequest("http://localhost:3000/api/ebay/deals?productId=sealed-1")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(ebayMock.searchEbayDeals).toHaveBeenCalledTimes(1);
    expect(ebayMock.searchEbayDeals).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "Pokemon Mega Evolution Sleeved Booster",
        buyingMode: "all",
        listingKind: "sealed",
      })
    );
    expect(body.query).toBe("Pokemon Mega Evolution Sleeved Booster");
    expect(body.buyingMode).toBe("all");
    expect(body.listings.map((listing: { itemId: string }) => listing.itemId)).toEqual([
      "sealed-title",
    ]);
    expect(body.reference).toMatchObject({
      label: "CardMarket sealed",
      valueEur: 8,
      source: "sealed",
    });
  });

  it("lets manual overrides win over automatic matching", async () => {
    const card = makeUmbreonCard();
    dbMock.card.findMany.mockResolvedValue([]);
    dbMock.card.findUnique.mockResolvedValue(card);
    dbMock.ebayListingCardOverride.findMany.mockResolvedValue([
      {
        item_id: "manual-1",
        status: "confirmed",
        card: toOverrideCard(card),
      },
    ]);
    mockSearchResults([
      makeListing({
        itemId: "manual-1",
        title: "Umbreon 161/S-P Japanese Promo Pokemon Card",
        totalEur: 45,
      }),
    ]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/ebay/deals?q=umbreon%20161")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.listings[0].cardMatch).toMatchObject({
      status: "matched",
      confidence: 100,
      source: "confirmed",
      card: { id: card.id, name: "Umbreon ex" },
    });
    expect(body.listings[0].reference.valueEur).toBe(899);
    expect(body.listings[0].differenceEur).toBe(854);
  });
});
