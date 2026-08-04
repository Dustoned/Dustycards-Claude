import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  outcomeFindMany: vi.fn(),
  outcomeUpdate: vi.fn(),
  dailyFindMany: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    externalSignalOutcome: {
      findMany: mocks.outcomeFindMany,
      update: mocks.outcomeUpdate,
    },
    externalSignalPriceObservation: { findMany: mocks.dailyFindMany },
    $queryRaw: mocks.queryRaw,
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/card-market-history", () => ({
  loadSafeCardMarketHistoryRows: vi.fn(),
}));

import { evaluatePendingExternalSignalOutcomes } from "@/lib/external-signal-forecast-store";

const DAY_MS = 24 * 60 * 60_000;
const entryAt = new Date("2026-01-01T12:00:00.000Z");

function outcome(id = "outcome-1") {
  return {
    id,
    horizon_days: 90,
    entry_observation: {
      card_id: "card-1",
      observed_at: entryAt,
      reference_source: "cardmarket:en-nm",
      reference_price: 44,
      entry_outlook: "strong_up",
      entry_expected_return_pct_180: 120,
      entry_scenario_json: JSON.stringify({
        points: { d90: { low: 70, base: 85, high: 110 } },
      }),
    },
  };
}

function dailyRows() {
  return [
    ...Array.from({ length: 90 }, (_, index) => ({
      card_id: "card-1",
      reference_source: "cardmarket:en-nm",
      reference_price: index < 88 ? 70 : 100,
      observed_at: new Date(entryAt.getTime() + (index + 1) * DAY_MS),
    })),
    {
      card_id: "card-1",
      reference_source: "cardmarket:avg7d",
      reference_price: 500,
      observed_at: new Date(entryAt.getTime() + 90 * DAY_MS),
    },
  ];
}

describe("external signal outcome evaluator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockResolvedValue([]);
    mocks.dailyFindMany.mockResolvedValue(dailyRows());
    mocks.outcomeUpdate.mockResolvedValue({});
    mocks.transaction.mockImplementation((writes: Array<Promise<unknown>>) =>
      Promise.all(writes)
    );
  });

  it("scores a matured forecast only against its frozen daily price family", async () => {
    mocks.outcomeFindMany.mockResolvedValueOnce([outcome()]);

    const result = await evaluatePendingExternalSignalOutcomes(
      new Date(entryAt.getTime() + 91 * DAY_MS)
    );

    expect(result).toEqual({
      matured: 1,
      evaluated: 1,
      complete: 1,
      insufficient: 0,
      truncated: false,
    });
    expect(mocks.outcomeUpdate).toHaveBeenCalledWith({
      where: { id: "outcome-1" },
      data: expect.objectContaining({
        status: "complete",
        observed_days: 90,
        max_reference_price: 100,
        max_multiplier: 100 / 44,
        end_reference_price: 100,
        hit_15x: true,
        hit_2x: true,
        hit_3x: false,
        direction_hit: true,
        band_within: true,
      }),
    });
  });

  it("re-evaluates an insufficient outcome after a later historical backfill", async () => {
    mocks.outcomeFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([outcome("retry-outcome")]);
    mocks.queryRaw.mockResolvedValueOnce([{ id: "retry-outcome" }]);

    const result = await evaluatePendingExternalSignalOutcomes(
      new Date(entryAt.getTime() + 120 * DAY_MS)
    );

    expect(result.complete).toBe(1);
    expect(mocks.outcomeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "retry-outcome" },
        data: expect.objectContaining({ status: "complete" }),
      })
    );
  });
});
