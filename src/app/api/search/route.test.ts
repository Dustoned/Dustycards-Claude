import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    card: {
      findMany: vi.fn(),
    },
    sealedProduct: {
      findMany: vi.fn(),
    },
    episode: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: dbMock,
}));

import { GET } from "@/app/api/search/route";

describe("GET /api/search", () => {
  beforeEach(() => {
    dbMock.card.findMany.mockReset();
    dbMock.sealedProduct.findMany.mockReset();
    dbMock.episode.findMany.mockReset();
  });

  it("adds the hidden-expansion visibility filter to direct card searches", async () => {
    dbMock.card.findMany.mockResolvedValue([
      {
        id: "card-1",
        name: "Pikachu",
        card_number: "001",
        rarity: "Promo",
        supertype: "Pokemon",
        image_url: null,
        episode: {
          id: "100",
          name: "Sword & Shield Promo Cards",
          code: "swsh",
        },
        prices: [{ cm_en_lowest_nm: 3.5, tcp_market: 4.25 }],
      },
    ]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search?q=swsh001")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.fuzzy).toBe(false);
    expect(body.parsed).toEqual({
      name: null,
      cardNumber: "001",
      setCode: "swsh",
      rawCardRef: "swsh001",
    });
    expect(body.singles).toHaveLength(1);
    expect(dbMock.card.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              episode: expect.objectContaining({
                NOT: expect.any(Array),
              }),
            }),
          ]),
        }),
      })
    );
  });

  it("uses capped fuzzy candidate queries instead of reading the full tables", async () => {
    dbMock.card.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "card-fuzzy-1",
          name: "Charizard",
          card_number: "4",
          rarity: "Rare Holo",
          supertype: "Pokemon",
          image_url: null,
          episode: {
            id: "base",
            name: "Base Set",
            code: "base1",
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "card-fuzzy-1",
          name: "Charizard",
          card_number: "4",
          rarity: "Rare Holo",
          supertype: "Pokemon",
          image_url: null,
          episode: {
            id: "base",
            name: "Base Set",
            code: "base1",
          },
          prices: [{ cm_en_lowest_nm: 199.99, tcp_market: 205 }],
        },
      ]);

    dbMock.sealedProduct.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    dbMock.episode.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "base",
          name: "Base Set",
          code: "base1",
          logo_url: null,
        },
      ]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search?q=charzrd")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.fuzzy).toBe(true);
    expect(body.singles).toHaveLength(1);

    expect(dbMock.card.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        take: 180,
      })
    );
    expect(dbMock.sealedProduct.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        take: 80,
      })
    );
    expect(dbMock.episode.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        take: 48,
      })
    );
  });
});
