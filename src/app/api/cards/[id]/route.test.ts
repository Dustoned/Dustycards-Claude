import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  CardSubmissionErrorMock,
  dbMock,
  exchangeMock,
  historyMock,
  jobMock,
  pullRatesMock,
  syncMock,
} = vi.hoisted(() => ({
  CardSubmissionErrorMock: class CardSubmissionError extends Error {
    status: number;

    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  },
  dbMock: {
    $queryRaw: vi.fn(),
    card: {
      findUnique: vi.fn(),
    },
    sealedProduct: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    collectionCard: {
      findMany: vi.fn(),
    },
    cardEbayDemandSnapshot: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
  exchangeMock: {
    convertUsdToEur: vi.fn((value: number) => Number((value * 0.9).toFixed(2))),
    getUsdToEurRate: vi.fn().mockResolvedValue({ rate: 0.9, date: "2026-05-24" }),
  },
  historyMock: {
    loadSafeCardMarketHistoryRows: vi.fn(),
  },
  jobMock: {
    getSubmittedCardRefreshJobSnapshot: vi.fn(),
    startSubmittedCardRefreshJob: vi.fn(),
  },
  pullRatesMock: {
    getPullRateInfoForSetRarity: vi.fn().mockResolvedValue(null),
  },
  syncMock: {
    runCardPriceRefresh: vi.fn(),
    runSingleCardHistoryImport: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({
    id: "user-1",
    email: "user@example.com",
    role: "user",
    disabled: false,
  }),
  requireAdmin: vi.fn().mockResolvedValue({
    id: "admin-1",
    email: "admin@example.com",
    role: "admin",
    disabled: false,
  }),
  authErrorResponse: vi.fn(() => null),
}));

vi.mock("@/lib/db", () => ({
  db: dbMock,
}));

vi.mock("@/lib/card-market-history", () => ({
  loadSafeCardMarketHistoryRows: historyMock.loadSafeCardMarketHistoryRows,
}));

vi.mock("@/lib/exchange-rates", () => ({
  convertUsdToEur: exchangeMock.convertUsdToEur,
  getUsdToEurRate: exchangeMock.getUsdToEurRate,
}));

vi.mock("@/lib/pull-rates", () => ({
  getPullRateInfoForSetRarity: pullRatesMock.getPullRateInfoForSetRarity,
}));

vi.mock("@/lib/sync", () => ({
  runCardPriceRefresh: syncMock.runCardPriceRefresh,
  runSingleCardHistoryImport: syncMock.runSingleCardHistoryImport,
  SyncCancelledError: class SyncCancelledError extends Error {},
  SyncConflictError: class SyncConflictError extends Error {
    activeType = "price";
    startedAt = new Date("2026-05-24T10:00:00.000Z");
  },
}));

vi.mock("@/lib/card-submissions", () => ({
  CardSubmissionError: CardSubmissionErrorMock,
}));

vi.mock("@/lib/sync/submitted-card-refresh-job", () => ({
  getSubmittedCardRefreshJobSnapshot: jobMock.getSubmittedCardRefreshJobSnapshot,
  startSubmittedCardRefreshJob: jobMock.startSubmittedCardRefreshJob,
}));

vi.mock("@/lib/tcggo", () => ({
  isTcggoQuotaExceededError: vi.fn(() => false),
}));

vi.mock("@/app/api/scraper-disabled-response", () => ({
  getScraperDisabledResponse: vi.fn(() => null),
}));

vi.mock("@/lib/user-settings-server", () => ({
  getServerUserSettings: vi.fn().mockResolvedValue({ onePieceLibraryEnabled: true }),
}));

import { GET, POST } from "@/app/api/cards/[id]/route";
import { getCardDetailPayload } from "@/lib/card-detail-data";

function makeCardRecord() {
  return {
    id: "card-1",
    game: "pokemon",
    name: "Pikachu",
    card_number: "001",
    printed_card_number: null,
    rarity: "Illustration Rare",
    hp: 70,
    image_url: null,
    supertype: "Pokemon",
    subtypes: "Basic",
    artist: "Test Artist",
    cardmarket_id: "123",
    cardmarket_url: null,
    tcggo_url: null,
    price_source_status: "synced",
    price_source_checked_at: new Date("2026-05-22T10:00:00.000Z"),
    ebay_sold_graded_status: null,
    ebay_sold_graded_checked_at: null,
    ebay_sold_graded_synced_at: null,
    episode: {
      id: "set-1",
      name: "Test Set",
      code: "TST",
      series: "Test Series",
      release_date: null,
    },
    collectionItems: [],
    wants: [],
    gradedPrices: [],
    ebaySoldGradedPrices: [],
    ebaySoldGradedPriceSnapshots: [],
    gradedPriceSnapshots: [],
    prices: [
      {
        cm_en_lowest_nm: 100,
        cm_de_lowest_nm: null,
        cm_fr_lowest_nm: null,
        cm_es_lowest_nm: null,
        cm_it_lowest_nm: null,
        cm_jp_lowest_nm: null,
        tcp_market: null,
        tcp_mid: null,
        tcp_low: null,
        cm_en_avg_7d: 100,
        cm_en_avg_30d: 100,
        fetched_at: new Date("2026-05-01T10:00:00.000Z"),
      },
      {
        cm_en_lowest_nm: 82,
        cm_de_lowest_nm: null,
        cm_fr_lowest_nm: null,
        cm_es_lowest_nm: null,
        cm_it_lowest_nm: null,
        cm_jp_lowest_nm: null,
        tcp_market: null,
        tcp_mid: null,
        tcp_low: null,
        cm_en_avg_7d: 88,
        cm_en_avg_30d: 100,
        fetched_at: new Date("2026-05-22T10:00:00.000Z"),
      },
    ],
  };
}

const CARD_DETAIL_API_KEYS = [
  "artist",
  "buy_signal",
  "card_number",
  "cardmarket_id",
  "cardmarket_url",
  "characters",
  "collection_item",
  "ebay_sold_graded_checked_at",
  "ebay_sold_graded_price_history",
  "ebay_sold_graded_prices",
  "ebay_sold_graded_status",
  "ebay_sold_graded_synced_at",
  "episode_code",
  "episode_id",
  "episode_name",
  "episode_release_date",
  "episode_series",
  "exchange_rate_date",
  "exchange_rate_usd_eur",
  "game",
  "graded_price_history",
  "graded_prices",
  "hp",
  "id",
  "image_url",
  "is_promo",
  "market_stats",
  "name",
  "price",
  "price_fetched_at",
  "price_history",
  "price_source_checked_at",
  "price_source_status",
  "promo_origins",
  "pull_rate_info",
  "rarity",
  "related_printings",
  "sealed_product_count",
  "sealed_products",
  "subtypes",
  "supertype",
  "tcggo_url",
  "tcp_price_fetched_at",
  "want_item",
] as const;

describe("GET /api/cards/[id]", () => {
  beforeEach(() => {
    dbMock.$queryRaw.mockReset().mockResolvedValue([]);
    dbMock.card.findUnique.mockReset();
    dbMock.sealedProduct.findMany.mockReset().mockResolvedValue([]);
    dbMock.sealedProduct.count.mockReset().mockResolvedValue(0);
    dbMock.collectionCard.findMany.mockReset();
    dbMock.cardEbayDemandSnapshot.findFirst.mockReset().mockResolvedValue(null);
    dbMock.cardEbayDemandSnapshot.findMany.mockReset().mockResolvedValue([]);
    exchangeMock.convertUsdToEur.mockClear();
    exchangeMock.getUsdToEurRate.mockClear();
    pullRatesMock.getPullRateInfoForSetRarity.mockClear();
    historyMock.loadSafeCardMarketHistoryRows.mockReset();
    jobMock.getSubmittedCardRefreshJobSnapshot.mockReset();
    jobMock.startSubmittedCardRefreshJob.mockReset();
    syncMock.runCardPriceRefresh.mockReset();
    syncMock.runSingleCardHistoryImport.mockReset();
  });

  it("includes a safe buy_signal payload in card detail responses", async () => {
    const card = makeCardRecord();
    dbMock.card.findUnique.mockResolvedValue(card);
    historyMock.loadSafeCardMarketHistoryRows.mockResolvedValue(
      new Map([[card.id, card.prices]])
    );

    const response = await GET(new NextRequest("http://localhost:3000/api/cards/card-1"), {
      params: Promise.resolve({ id: "card-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.buy_signal).toEqual(
      expect.objectContaining({
        score: expect.any(Number),
        marker_percent: expect.any(Number),
        label: expect.any(String),
        label_text: expect.any(String),
        confidence: expect.any(String),
        market_mode: "raw",
        evidence: expect.any(Array),
      })
    );
    expect(body.buy_signal.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "eBay sold", value: "Graded only" }),
      ])
    );
    expect(body.market_stats).toEqual(
      expect.objectContaining({
        model: "dustycards-market-v2",
        score: expect.any(Number),
        confidence: "low",
        metrics: expect.objectContaining({
          momentum: expect.any(Number),
          market_depth: expect.any(Number),
        }),
        metric_sources: {
          liquidity: "market_proxy",
          demand: "price_proxy",
        },
      })
    );
    expect(dbMock.card.findUnique.mock.calls[0]?.[0]?.select?.collectionItems?.where).toEqual({
      user_id: "user-1",
      for_sale: false,
      sold_at: null,
    });
    expect(dbMock.card.findUnique.mock.calls[0]?.[0]?.select?.prices).toBeUndefined();
    expect(historyMock.loadSafeCardMarketHistoryRows).toHaveBeenCalledWith([
      expect.objectContaining({ id: "card-1", cardmarketId: "123" }),
    ]);
  });

  it("keeps the newest usable English NM quote when the latest source snapshot has none", async () => {
    const card = makeCardRecord();
    card.prices.push({
      cm_en_lowest_nm: null,
      cm_de_lowest_nm: 54,
      cm_fr_lowest_nm: null,
      cm_es_lowest_nm: null,
      cm_it_lowest_nm: null,
      cm_jp_lowest_nm: null,
      tcp_market: 39.87,
      tcp_mid: 41,
      tcp_low: 37,
      cm_en_avg_7d: null,
      cm_en_avg_30d: null,
      fetched_at: new Date("2026-05-24T10:00:00.000Z"),
    } as unknown as (typeof card.prices)[number]);
    dbMock.card.findUnique.mockResolvedValue(card);
    historyMock.loadSafeCardMarketHistoryRows.mockResolvedValue(
      new Map([[card.id, card.prices]])
    );

    const response = await GET(new NextRequest("http://localhost:3000/api/cards/card-1"), {
      params: Promise.resolve({ id: "card-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.price).toEqual(
      expect.objectContaining({
        cm_en_lowest_nm: 82,
        cm_de_lowest_nm: 54,
        tcp_market: 39.87,
        cm_en_avg_7d: 88,
      })
    );
    expect(body.price_fetched_at).toBe("2026-05-22T10:00:00.000Z");
    expect(body.buy_signal.context).toBe("market");
  });

  it("keeps TCP and language quotes when a newer row contains only CardMarket EN/NM", async () => {
    const card = makeCardRecord();
    card.prices.push(
      {
        cm_en_lowest_nm: null,
        cm_de_lowest_nm: 54,
        cm_fr_lowest_nm: null,
        cm_es_lowest_nm: null,
        cm_it_lowest_nm: null,
        cm_jp_lowest_nm: null,
        tcp_market: 39.87,
        tcp_mid: 41,
        tcp_low: 37,
        cm_en_avg_7d: 88,
        cm_en_avg_30d: 100,
        fetched_at: new Date("2026-05-24T10:00:00.000Z"),
      } as unknown as (typeof card.prices)[number],
      {
        cm_en_lowest_nm: 84,
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
        fetched_at: new Date("2026-05-25T10:00:00.000Z"),
      } as unknown as (typeof card.prices)[number]
    );
    dbMock.card.findUnique.mockResolvedValue(card);
    historyMock.loadSafeCardMarketHistoryRows.mockResolvedValue(
      new Map([[card.id, card.prices]])
    );

    const response = await GET(new NextRequest("http://localhost:3000/api/cards/card-1"), {
      params: Promise.resolve({ id: "card-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.price).toEqual(
      expect.objectContaining({
        cm_en_lowest_nm: 84,
        cm_de_lowest_nm: 54,
        tcp_market: 39.87,
        tcp_mid: 41,
        tcp_low: 37,
        cm_en_avg_7d: 88,
        cm_en_avg_30d: 100,
      })
    );
    expect(body.price_fetched_at).toBe("2026-05-25T10:00:00.000Z");
    expect(body.tcp_price_fetched_at).toBe("2026-05-24T10:00:00.000Z");
  });

  it("returns an API-ready serializable payload for server consumers", async () => {
    const card = makeCardRecord();
    (card.episode as { release_date: string | null }).release_date = "2026-05-01";
    dbMock.card.findUnique.mockResolvedValue(card);
    historyMock.loadSafeCardMarketHistoryRows.mockResolvedValue(
      new Map([[card.id, card.prices]])
    );

    const payload = await getCardDetailPayload(card.id, "user-1");

    expect(payload).toEqual(
      expect.objectContaining({
        id: card.id,
        episode_release_date: "2026-05-01",
      })
    );
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });

  it("includes the sealed origin and its price reference for an owned copy", async () => {
    const card = {
      ...makeCardRecord(),
      collectionItems: [
        {
          id: "copy-1",
          binder_id: null,
          for_sale: false,
          purchase_price: 99,
          condition: "Near Mint",
          language: "English",
          notes: null,
          grading_company: null,
          grading_grade: null,
          grading_subgrades_json: null,
          origin_sealed_product_id: "sealed-1",
          purchase_price_source: "sealed_origin",
          originSealedProduct: {
            id: "sealed-1",
            name: "Test Set Elite Trainer Box",
            image_url: null,
            cm_lowest: 101,
            cm_lowest_eu: 99,
            cm_lowest_de: null,
            cm_lowest_fr: null,
            cm_lowest_es: null,
            cm_lowest_it: null,
            cm_avg_7d: 102,
            cm_avg_30d: 104,
          },
          tags: [],
          binder: null,
        },
      ],
    };
    dbMock.card.findUnique.mockResolvedValue(card);
    historyMock.loadSafeCardMarketHistoryRows.mockResolvedValue(
      new Map([[card.id, card.prices]])
    );

    const payload = await getCardDetailPayload(card.id, "user-1");

    expect(payload?.collection_item).toEqual(
      expect.objectContaining({
        origin_sealed_product_id: "sealed-1",
        purchase_price_source: "sealed_origin",
        origin_sealed_product: {
          id: "sealed-1",
          name: "Test Set Elite Trainer Box",
          image_url: null,
          price_basis: 99,
        },
      })
    );
  });

  it("keeps the existing card detail API key contract", async () => {
    const card = makeCardRecord();
    dbMock.card.findUnique.mockResolvedValue(card);
    historyMock.loadSafeCardMarketHistoryRows.mockResolvedValue(
      new Map([[card.id, card.prices]])
    );

    const response = await GET(new NextRequest("http://localhost:3000/api/cards/card-1"), {
      params: Promise.resolve({ id: card.id }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(Object.keys(body).sort()).toEqual([...CARD_DETAIL_API_KEYS].sort());
  });

  it("returns verified promo origins and only requests explicitly linked sealed products", async () => {
    const card = {
      ...makeCardRecord(),
      episode: {
        id: "promo-set",
        name: "SV Black Star Promos",
        code: "PR-SV",
        series: "Scarlet & Violet",
        release_date: "2023-01-01",
      },
      promoOrigins: [
        {
          id: "origin-1",
          origin_name: "Mimikyu ex Box",
          origin_type: "sealed_product",
          source_name: "Bulbapedia",
          source_url: "https://bulbapedia.example/promo",
          confidence: 0.98,
          product: {
            id: "sealed-1",
            name: "Mimikyu ex Box",
            image_url: null,
            cardmarket_url: null,
            release_date: new Date("2023-03-03T00:00:00.000Z"),
            cm_lowest: 20,
            cm_lowest_eu: 21,
            cm_lowest_de: null,
            cm_lowest_fr: null,
            cm_lowest_es: null,
            cm_lowest_it: null,
            cm_avg_7d: 22,
            cm_avg_30d: 23,
            episode: { id: "set-1", name: "Scarlet & Violet", code: "SVI" },
          },
        },
      ],
    };
    dbMock.card.findUnique.mockResolvedValue(card);
    historyMock.loadSafeCardMarketHistoryRows.mockResolvedValue(
      new Map([[card.id, card.prices]])
    );

    const payload = await getCardDetailPayload(card.id, "user-1");

    expect(payload).toMatchObject({
      is_promo: true,
      promo_origins: [
        {
          name: "Mimikyu ex Box",
          type: "sealed_product",
          product: { id: "sealed-1", match_type: "included_promo" },
        },
      ],
    });
    expect(dbMock.sealedProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          game: "pokemon",
          includedCards: { some: { card_id: card.id } },
        },
      })
    );
  });

  it("refreshes related printings separately without rebuilding the heavy card payload", async () => {
    const card = makeCardRecord();
    dbMock.card.findUnique.mockResolvedValue(card);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/cards/card-1?relatedPrintings=1"),
      { params: Promise.resolve({ id: card.id }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body).toEqual({ related_printings: [] });
    expect(historyMock.loadSafeCardMarketHistoryRows).not.toHaveBeenCalled();
    expect(dbMock.sealedProduct.findMany).not.toHaveBeenCalled();
  });

  it("returns safe empty states without image, history, ownership or wants", async () => {
    const card = makeCardRecord();
    card.prices = [];
    dbMock.card.findUnique.mockResolvedValue(card);
    historyMock.loadSafeCardMarketHistoryRows.mockResolvedValue(new Map([[card.id, []]]));

    const payload = await getCardDetailPayload(card.id, "user-1");

    expect(payload).toEqual(
      expect.objectContaining({
        image_url: null,
        price: null,
        price_fetched_at: null,
        price_history: [],
        graded_prices: [],
        graded_price_history: [],
        ebay_sold_graded_prices: [],
        ebay_sold_graded_price_history: [],
        related_printings: [],
        collection_item: null,
        want_item: null,
        sealed_products: [],
      })
    );
    expect(dbMock.collectionCard.findMany).not.toHaveBeenCalled();
    expect(dbMock.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("returns only the durable submitted-card refresh status when requested", async () => {
    jobMock.getSubmittedCardRefreshJobSnapshot.mockResolvedValue({
      status: "running",
      running: true,
      startedAt: "2026-08-03T18:55:00.000Z",
      finishedAt: null,
      error: null,
    });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/cards/card-1?refreshStatus=1"),
      { params: Promise.resolve({ id: "card-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.refreshJob).toEqual(expect.objectContaining({ status: "running" }));
    expect(jobMock.getSubmittedCardRefreshJobSnapshot).toHaveBeenCalledWith("card-1");
    expect(dbMock.card.findUnique).not.toHaveBeenCalled();
  });
});

describe("POST /api/cards/[id]", () => {
  beforeEach(() => {
    dbMock.card.findUnique.mockReset();
    dbMock.sealedProduct.findMany.mockReset().mockResolvedValue([]);
    dbMock.sealedProduct.count.mockReset().mockResolvedValue(0);
    dbMock.collectionCard.findMany.mockReset();
    dbMock.cardEbayDemandSnapshot.findFirst.mockReset().mockResolvedValue(null);
    dbMock.cardEbayDemandSnapshot.findMany.mockReset().mockResolvedValue([]);
    historyMock.loadSafeCardMarketHistoryRows.mockReset();
    jobMock.startSubmittedCardRefreshJob.mockReset().mockResolvedValue({
      status: "queued",
      running: true,
      startedAt: "2026-08-03T18:55:00.000Z",
      finishedAt: null,
      error: null,
    });
    syncMock.runCardPriceRefresh.mockReset().mockResolvedValue({});
    syncMock.runSingleCardHistoryImport.mockReset();
  });

  it("refreshes user-submitted cards through their CardMarket submission", async () => {
    dbMock.card.findUnique.mockResolvedValueOnce({
      is_user_submitted: true,
      cardSubmissions: [{ id: "submission-1" }],
    });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/cards/card-1", {
        method: "POST",
        body: JSON.stringify({ action: "refresh" }),
      }),
      { params: Promise.resolve({ id: "card-1" }) }
    );

    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.refreshPending).toBe(true);
    expect(jobMock.startSubmittedCardRefreshJob).toHaveBeenCalledWith(
      "card-1",
      "submission-1"
    );
    expect(syncMock.runCardPriceRefresh).not.toHaveBeenCalled();
  });

  it("keeps official cards on the regular TCGGO refresh path", async () => {
    const card = makeCardRecord();
    dbMock.card.findUnique
      .mockResolvedValueOnce({
        is_user_submitted: false,
        cardSubmissions: [],
      })
      .mockResolvedValueOnce(card);
    historyMock.loadSafeCardMarketHistoryRows.mockResolvedValue(
      new Map([[card.id, card.prices]])
    );

    const response = await POST(
      new NextRequest("http://localhost:3000/api/cards/card-1", {
        method: "POST",
        body: JSON.stringify({ action: "refresh" }),
      }),
      { params: Promise.resolve({ id: "card-1" }) }
    );

    expect(response.status).toBe(200);
    expect(syncMock.runCardPriceRefresh).toHaveBeenCalledWith("card-1");
    expect(jobMock.startSubmittedCardRefreshJob).not.toHaveBeenCalled();
  });

  it("returns a useful conflict when a submitted card lost its refresh source", async () => {
    dbMock.card.findUnique.mockResolvedValueOnce({
      is_user_submitted: true,
      cardSubmissions: [],
    });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/cards/card-1", {
        method: "POST",
        body: JSON.stringify({ action: "refresh" }),
      }),
      { params: Promise.resolve({ id: "card-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("active CardMarket refresh source");
  });
});
