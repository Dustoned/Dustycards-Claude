import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  findMany: vi.fn(),
  settings: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "user-1" }),
  authErrorResponse: vi.fn(() => null),
}));
vi.mock("@/lib/collection-data", () => ({
  ACTIVE_COLLECTION_CARD_FILTER: { archived_at: null },
}));
vi.mock("@/lib/collection-overview-cache", () => ({
  getCachedCollectionOverviewData: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/compressed-json-response", () => ({
  compressedJsonResponse: (_request: unknown, payload: unknown) =>
    new Response(JSON.stringify(payload), {
      headers: { "Content-Type": "application/json" },
    }),
}));
vi.mock("@/lib/db", () => ({
  db: {
    collectionWant: {
      count: mocks.count,
      findMany: mocks.findMany,
    },
  },
}));
vi.mock("@/lib/home-overview-insights", () => ({
  buildHomeOverviewInsights: (_data: unknown, extras: unknown) => extras,
  buildForSalePreview: vi.fn(() => ({ total: 0, totalValue: null, items: [] })),
}));
vi.mock("@/lib/movers-snapshot-store", () => ({
  readMoversSnapshot: vi.fn().mockResolvedValue(null),
  SHARED_MOVERS_SNAPSHOT_USER_ID: "shared",
}));
vi.mock("@/lib/sealed-movers", () => ({
  getUpcomingSealedReleases: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/signal-radar-snapshot-store", () => ({
  readSignalRadarSnapshot: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/upcoming-releases", () => ({
  getUpcomingReleaseFeed: vi.fn().mockResolvedValue({ singles: [] }),
}));
vi.mock("@/lib/user-settings-server", () => ({
  getServerUserSettings: mocks.settings,
}));

import { GET } from "@/app/api/collection/home-insights/route";

interface TestPriceRow {
  cm_en_lowest_nm: number | null;
  tcp_market: number | null;
}

const card = {
  id: "card-1",
  name: "Pikachu",
  image_url: null,
  card_number: "025",
  printed_card_number: null,
  episode: { name: "Base Set", code: "BASE" },
};

function mockPriceHistory(rows: TestPriceRow[]) {
  mocks.findMany.mockImplementation(async (args) => {
    const priceWhere = args.select.card.select.prices.where;
    const selected = priceWhere.tcp_market
      ? rows.find((row) => (row.tcp_market ?? 0) > 0)
      : rows.find(
          (row) =>
            (row.cm_en_lowest_nm ?? 0) > 0 && row.cm_en_lowest_nm !== 9001
        );
    return [{ card: { ...card, prices: selected ? [selected] : [] } }];
  });
}

async function loadWants(source: "cm_en" | "tcp") {
  mocks.settings.mockResolvedValue({
    primaryPriceSource: source,
    onePieceLibraryEnabled: false,
  });
  const response = await GET(
    new NextRequest("http://localhost/api/collection/home-insights")
  );
  return response.json();
}

describe("GET /api/collection/home-insights wants prices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.count.mockResolvedValue(1);
  });

  it("keeps an older TCP quote visible behind a newer CM-only row", async () => {
    mockPriceHistory([
      { cm_en_lowest_nm: 12, tcp_market: null },
      { cm_en_lowest_nm: null, tcp_market: 18 },
    ]);

    const body = await loadWants("tcp");

    expect(body.wants.items[0]).toMatchObject({ price: 18, currency: "USD" });
    expect(mocks.findMany.mock.calls[0]?.[0]?.select.card.select.prices.where).toEqual({
      tcp_market: { gt: 0, not: 9001 },
    });
  });

  it("keeps an older CM quote visible behind a newer TCP-only row", async () => {
    mockPriceHistory([
      { cm_en_lowest_nm: null, tcp_market: 18 },
      { cm_en_lowest_nm: 12, tcp_market: null },
    ]);

    const body = await loadWants("cm_en");

    expect(body.wants.items[0]).toMatchObject({ price: 12, currency: "EUR" });
    expect(mocks.findMany.mock.calls[0]?.[0]?.select.card.select.prices.where).toEqual({
      cm_en_lowest_nm: { gt: 0, not: 9001 },
    });
  });
});
