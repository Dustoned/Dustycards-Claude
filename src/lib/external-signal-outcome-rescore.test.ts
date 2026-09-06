import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  outcomeFindMany: vi.fn(),
  outcomeUpdate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    externalSignalOutcome: {
      findMany: mocks.outcomeFindMany,
      update: mocks.outcomeUpdate,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/card-market-history", () => ({
  loadSafeCardMarketHistoryRows: vi.fn(),
}));

import { rescoreExternalSignalOutcomeVerdicts } from "@/lib/external-signal-forecast-store";

function completeRow(input: {
  id: string;
  entryPrice: number;
  realizedReturnPct: number;
  absoluteChangeEur: number;
  entryOutlook: string;
  meaningfulMove: boolean;
  meaningfulDirectionHit: boolean;
}) {
  return {
    id: input.id,
    realized_return_pct: input.realizedReturnPct,
    absolute_change_eur: input.absoluteChangeEur,
    direction_hit: input.realizedReturnPct > 2,
    meaningful_move: input.meaningfulMove,
    meaningful_direction_hit: input.meaningfulDirectionHit,
    entry_observation: {
      reference_price: input.entryPrice,
      entry_outlook: input.entryOutlook,
    },
  };
}

describe("rescoreExternalSignalOutcomeVerdicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.outcomeUpdate.mockResolvedValue({});
    mocks.transaction.mockImplementation((writes: Array<Promise<unknown>>) =>
      Promise.all(writes)
    );
  });

  it("rewrites only verdicts that disagree with the current meaningful-move rule", async () => {
    mocks.outcomeFindMany
      .mockResolvedValueOnce([
        // Scored under the old flat EUR 10 floor: a cheap card that doubled
        // was recorded as a miss and must become a hit.
        completeRow({
          id: "stale-cheap",
          entryPrice: 5,
          realizedReturnPct: 80,
          absoluteChangeEur: 4,
          entryOutlook: "strong_up",
          meaningfulMove: false,
          meaningfulDirectionHit: false,
        }),
        // Already consistent with the current rule: untouched.
        completeRow({
          id: "fresh",
          entryPrice: 200,
          realizedReturnPct: 30,
          absoluteChangeEur: 60,
          entryOutlook: "strong_up",
          meaningfulMove: true,
          meaningfulDirectionHit: true,
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await rescoreExternalSignalOutcomeVerdicts({ force: true });

    expect(result).toEqual({ checked: 2, updated: 1 });
    expect(mocks.outcomeUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.outcomeUpdate).toHaveBeenCalledWith({
      where: { id: "stale-cheap" },
      data: { meaningful_move: true, meaningful_direction_hit: true },
    });
  });

  it("runs the reconciliation pass once per process", async () => {
    mocks.outcomeFindMany.mockResolvedValue([]);

    await rescoreExternalSignalOutcomeVerdicts({ force: true });
    const second = await rescoreExternalSignalOutcomeVerdicts();

    expect(second).toEqual({ checked: 0, updated: 0, skipped: true });
    expect(mocks.outcomeFindMany).toHaveBeenCalledTimes(1);
  });
});
