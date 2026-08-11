import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  $queryRawUnsafe: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));

import { hydrateLatestCardMarketFields } from "@/lib/current-card-prices";

const emptyCm = {
  cm_en_lowest_nm: null,
  cm_de_lowest_nm: null,
  cm_fr_lowest_nm: null,
  cm_es_lowest_nm: null,
  cm_it_lowest_nm: null,
  cm_jp_lowest_nm: null,
};

describe("hydrateLatestCardMarketFields", () => {
  beforeEach(() => dbMock.$queryRawUnsafe.mockReset());

  it("merges an older valid CM quote without replacing the newest TCP value", async () => {
    dbMock.$queryRawUnsafe.mockResolvedValue([
      {
        card_id: "card-1",
        ...emptyCm,
        cm_en_lowest_nm: 24.5,
        cm_de_lowest_nm: 23,
        tcp_market: 31,
        tcp_mid: null,
        tcp_low: null,
      },
    ]);

    const [card] = await hydrateLatestCardMarketFields([
      { id: "card-1", prices: [{ ...emptyCm, tcp_market: 31 }] },
    ]);

    expect(card?.prices[0]).toEqual(
      expect.objectContaining({
        cm_en_lowest_nm: 24.5,
        cm_de_lowest_nm: 23,
        tcp_market: 31,
      })
    );
    expect(dbMock.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringMatching(/cm_en_lowest_nm[\s\S]*tcp_market/),
      "card-1"
    );
  });

  it("does no query for cards without a selected market row", async () => {
    const cards = [{ id: "card-1", prices: [] as Array<typeof emptyCm> }];
    await expect(hydrateLatestCardMarketFields(cards)).resolves.toEqual(cards);
    expect(dbMock.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("merges an older TCP quote when the newest row is source-pure CM", async () => {
    dbMock.$queryRawUnsafe.mockResolvedValue([
      {
        card_id: "card-1",
        ...emptyCm,
        cm_en_lowest_nm: 24.5,
        tcp_market: 31,
        tcp_mid: 32,
        tcp_low: 29,
      },
    ]);

    const [card] = await hydrateLatestCardMarketFields([
      { id: "card-1", prices: [{ ...emptyCm, cm_en_lowest_nm: 24.5, tcp_market: null }] },
    ]);

    expect(card?.prices[0]).toEqual(
      expect.objectContaining({
        cm_en_lowest_nm: 24.5,
        tcp_market: 31,
        tcp_mid: 32,
        tcp_low: 29,
      })
    );
    expect(dbMock.$queryRawUnsafe).toHaveBeenCalledOnce();
  });
});
