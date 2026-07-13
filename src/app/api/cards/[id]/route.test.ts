import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { dbMock, exchangeMock, pullRatesMock } = vi.hoisted(() => ({
  dbMock: {
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
  },
  exchangeMock: {
    convertUsdToEur: vi.fn((value: number) => Number((value * 0.9).toFixed(2))),
    getUsdToEurRate: vi.fn().mockResolvedValue({ rate: 0.9, date: "2026-05-24" }),
  },
  pullRatesMock: {
    getPullRateInfoForSetRarity: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({
    id: "user-1",
    email: "user@example.com",
    role: "user",
    disabled: false,
  }),
  requireAdmin: vi.fn(),
  authErrorResponse: vi.fn(() => null),
}));

vi.mock("@/lib/db", () => ({
  db: dbMock,
}));

vi.mock("@/lib/exchange-rates", () => ({
  convertUsdToEur: exchangeMock.convertUsdToEur,
  getUsdToEurRate: exchangeMock.getUsdToEurRate,
}));

vi.mock("@/lib/pull-rates", () => ({
  getPullRateInfoForSetRarity: pullRatesMock.getPullRateInfoForSetRarity,
}));

vi.mock("@/lib/sync", () => ({
  runCardPriceRefresh: vi.fn(),
  runSingleCardHistoryImport: vi.fn(),
  SyncCancelledError: class SyncCancelledError extends Error {},
  SyncConflictError: class SyncConflictError extends Error {
    activeType = "price";
    startedAt = new Date("2026-05-24T10:00:00.000Z");
  },
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

import { GET } from "@/app/api/cards/[id]/route";

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

describe("GET /api/cards/[id]", () => {
  beforeEach(() => {
    dbMock.card.findUnique.mockReset();
    dbMock.sealedProduct.findMany.mockReset().mockResolvedValue([]);
    dbMock.sealedProduct.count.mockReset().mockResolvedValue(0);
    dbMock.collectionCard.findMany.mockReset();
    exchangeMock.convertUsdToEur.mockClear();
    exchangeMock.getUsdToEurRate.mockClear();
    pullRatesMock.getPullRateInfoForSetRarity.mockClear();
  });

  it("includes a safe buy_signal payload in card detail responses", async () => {
    dbMock.card.findUnique.mockResolvedValue(makeCardRecord());

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
    expect(dbMock.card.findUnique.mock.calls[0]?.[0]?.select?.collectionItems?.where).toEqual({
      user_id: "user-1",
      for_sale: false,
      sold_at: null,
    });
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
});
