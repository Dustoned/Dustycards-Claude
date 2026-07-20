import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  CardSubmissionErrorMock,
  dbMock,
  exchangeMock,
  historyMock,
  pullRatesMock,
  submissionMock,
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
  pullRatesMock: {
    getPullRateInfoForSetRarity: vi.fn().mockResolvedValue(null),
  },
  submissionMock: {
    refreshAdminCardSubmission: vi.fn(),
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
  refreshAdminCardSubmission: submissionMock.refreshAdminCardSubmission,
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
  "game",
  "graded_price_history",
  "graded_prices",
  "hp",
  "id",
  "image_url",
  "market_stats",
  "name",
  "price",
  "price_fetched_at",
  "price_history",
  "price_source_checked_at",
  "price_source_status",
  "pull_rate_info",
  "rarity",
  "sealed_product_count",
  "sealed_products",
  "subtypes",
  "supertype",
  "tcggo_url",
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
    submissionMock.refreshAdminCardSubmission.mockReset();
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
    expect(Object.keys(body).sort()).toEqual([...CARD_DETAIL_API_KEYS].sort());
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
        collection_item: null,
        want_item: null,
        sealed_products: [],
      })
    );
    expect(dbMock.collectionCard.findMany).not.toHaveBeenCalled();
    expect(dbMock.$queryRaw).toHaveBeenCalledTimes(2);
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
    submissionMock.refreshAdminCardSubmission.mockReset().mockResolvedValue({});
    syncMock.runCardPriceRefresh.mockReset().mockResolvedValue({});
    syncMock.runSingleCardHistoryImport.mockReset();
  });

  it("refreshes user-submitted cards through their CardMarket submission", async () => {
    const card = makeCardRecord();
    dbMock.card.findUnique
      .mockResolvedValueOnce({
        is_user_submitted: true,
        cardSubmissions: [{ id: "submission-1" }],
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
    expect(submissionMock.refreshAdminCardSubmission).toHaveBeenCalledWith("submission-1");
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
    expect(submissionMock.refreshAdminCardSubmission).not.toHaveBeenCalled();
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
