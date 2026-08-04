import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  outcomeFindMany: vi.fn(),
  dailyFindMany: vi.fn(),
  dailyCreateMany: vi.fn(),
  cardFindMany: vi.fn(),
  loadHistory: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    externalSignalOutcome: { findMany: mocks.outcomeFindMany },
    externalSignalPriceObservation: {
      findMany: mocks.dailyFindMany,
      createMany: mocks.dailyCreateMany,
    },
    card: { findMany: mocks.cardFindMany },
  },
}));

vi.mock("@/lib/card-market-history", () => ({
  loadSafeCardMarketHistoryRows: mocks.loadHistory,
}));

import { captureOpenExternalSignalOutcomePrices } from "@/lib/external-signal-forecast-store";

describe("external signal daily outcome capture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.outcomeFindMany.mockResolvedValue([
      {
        entry_observation: {
          card_id: "card-1",
          reference_source: "cardmarket:en-nm",
        },
      },
      {
        entry_observation: {
          card_id: "card-1",
          reference_source: "cardmarket:en-nm",
        },
      },
    ]);
    mocks.dailyFindMany.mockResolvedValue([]);
    mocks.dailyCreateMany.mockResolvedValue({ count: 1 });
    mocks.cardFindMany.mockResolvedValue([
      {
        id: "card-1",
        game: "pokemon",
        episode_id: "set-1",
        name: "Shaymin-EX",
        card_number: "94",
        printed_card_number: "94/99",
        cardmarket_id: 123,
        cardmarket_url: "https://example.test/shaymin",
      },
    ]);
    mocks.loadHistory.mockResolvedValue(
      new Map([
        [
          "card-1",
          [
            {
              card_id: "card-1",
              fetched_at: new Date("2026-08-04T08:00:00.000Z"),
              cm_en_lowest_nm: 99.99,
              cm_en_avg_7d: 15.48,
              cm_de_lowest_nm: 120,
              cm_fr_lowest_nm: 250,
              cm_es_lowest_nm: 40,
              cm_it_lowest_nm: 10.99,
              cm_jp_lowest_nm: null,
            },
          ],
        ],
      ])
    );
  });

  it("stores one same-source observation per card and UTC day", async () => {
    const result = await captureOpenExternalSignalOutcomePrices(
      new Date("2026-08-04T09:00:00.000Z")
    );

    expect(result).toEqual({
      trackedCards: 1,
      captured: 1,
      unavailable: 0,
      observedDay: "2026-08-04",
    });
    expect(mocks.dailyCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          card_id: "card-1",
          reference_source: "cardmarket:en-nm",
          reference_price: 99.99,
          observed_day: "2026-08-04",
          provenance: "scheduler-carry-forward",
        }),
      ],
    });
  });

  it("does not rewrite a day that was already observed", async () => {
    mocks.dailyFindMany.mockResolvedValue([
      { card_id: "card-1", reference_source: "cardmarket:en-nm" },
    ]);

    const result = await captureOpenExternalSignalOutcomePrices(
      new Date("2026-08-04T15:00:00.000Z")
    );

    expect(result.captured).toBe(0);
    expect(mocks.loadHistory).not.toHaveBeenCalled();
    expect(mocks.dailyCreateMany).not.toHaveBeenCalled();
  });
});
