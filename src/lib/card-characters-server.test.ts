import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  card: {
    findMany: vi.fn(),
  },
  $queryRawUnsafe: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { getCharacterPageData } from "@/lib/card-characters-server";

describe("character page current prices", () => {
  beforeEach(() => {
    dbMock.card.findMany.mockReset();
    dbMock.$queryRawUnsafe.mockReset();
  });

  it("resolves CardMarket and TCGPlayer independently for the exact card", async () => {
    dbMock.card.findMany
      .mockResolvedValueOnce([
        {
          id: "eevee-1",
          game: "pokemon",
          name: "Eevee",
          supertype: "PokÃ©mon",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "eevee-1",
          game: "pokemon",
          name: "Eevee",
          card_number: "101",
          printed_card_number: "101/100",
          rarity: "Rare",
          hp: 60,
          image_url: null,
          supertype: "PokÃ©mon",
          subtypes: null,
          artist: "Test Artist",
          cardmarket_id: "101",
          cardmarket_url: null,
          tcggo_url: null,
          price_source_status: "live",
          price_source_checked_at: new Date("2026-08-11T11:00:00.000Z"),
          episode: {
            id: "set-1",
            name: "Test Set",
            code: "TST",
            release_date: "2025-01-01",
          },
          wants: [],
        },
      ]);
    dbMock.$queryRawUnsafe.mockResolvedValue([
      {
        card_id: "eevee-1",
        cm_fetched_at: new Date("2026-08-10T09:00:00.000Z"),
        aux_fetched_at: null,
        tcp_fetched_at: new Date("2026-08-11T09:00:00.000Z"),
        cm_en_lowest_nm: 12.5,
        cm_de_lowest_nm: null,
        cm_fr_lowest_nm: null,
        cm_es_lowest_nm: null,
        cm_it_lowest_nm: null,
        cm_jp_lowest_nm: null,
        tcp_market: 18,
        tcp_mid: null,
        tcp_low: null,
        cm_en_avg_7d: null,
        cm_en_avg_30d: null,
      },
    ]);

    const result = await getCharacterPageData("pokemon", "eevee", "user-1");
    const sql = String(dbMock.$queryRawUnsafe.mock.calls[0]?.[0] ?? "");

    expect(result?.cards[0]?.price).toMatchObject({
      cm_en_lowest_nm: 12.5,
      tcp_market: 18,
    });
    expect(result?.cards[0]?.price_fetched_at).toBe("2026-08-10T09:00:00.000Z");
    expect(sql).toContain("PARTITION BY p.card_id");
    expect(sql).toContain("p.cm_en_lowest_nm <> 9001");
    expect(sql).toContain("p.tcp_market <> 9001");
    expect(dbMock.$queryRawUnsafe).toHaveBeenCalledWith(expect.any(String), "eevee-1");
  });
});
