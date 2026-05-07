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

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({
    id: "user-1",
    email: "user@example.com",
    role: "user",
    disabled: false,
  }),
  authErrorResponse: vi.fn(() => null),
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

  it("loosely matches card numbers when searching by name plus number", async () => {
    dbMock.card.findMany.mockResolvedValue([
      {
        id: "giratina-124",
        name: "Giratina-EX",
        card_number: "124/124",
        rarity: "Rare Holo EX",
        supertype: "Pokemon",
        image_url: null,
        episode: {
          id: "drx",
          name: "Dragons Exalted",
          code: "DRX",
        },
        prices: [{ cm_en_lowest_nm: 89, tcp_market: 95 }],
      },
    ]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search?q=giratina%20124")
    );
    const body = await response.json();
    const cardQuery = dbMock.card.findMany.mock.calls[0]?.[0];

    expect(response.status).toBe(200);
    expect(body.fuzzy).toBe(false);
    expect(body.singles).toHaveLength(1);
    expect(JSON.stringify(cardQuery.where)).toContain('"card_number":{"startsWith":"124/');
  });

  it("matches numeric card searches with or without leading zeroes", async () => {
    dbMock.card.findMany.mockResolvedValue([
      {
        id: "zygarde-94",
        name: "Mega Zygarde ex",
        card_number: "94",
        rarity: "Double Rare",
        supertype: "Pokemon",
        image_url: null,
        episode: {
          id: "por",
          name: "Perfect Order",
          code: "POR",
        },
        prices: [{ cm_en_lowest_nm: 6, tcp_market: 7 }],
      },
    ]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(new NextRequest("http://localhost:3000/api/search?q=094"));
    const body = await response.json();
    const cardQuery = dbMock.card.findMany.mock.calls[0]?.[0];
    const whereJson = JSON.stringify(cardQuery.where);

    expect(response.status).toBe(200);
    expect(body.singles).toHaveLength(1);
    expect(whereJson).toContain('"card_number":"94"');
    expect(whereJson).toContain('"card_number":"094"');
  });

  it("treats TCGGO slug searches as card name plus number", async () => {
    dbMock.card.findMany.mockResolvedValue([
      {
        id: "alcremie-vmax-73",
        name: "Alcremie VMAX",
        card_number: "73",
        rarity: "Rare Rainbow",
        supertype: "Pokemon",
        image_url: null,
        episode: {
          id: "shf",
          name: "Shining Fates",
          code: "SHF",
        },
        prices: [{ cm_en_lowest_nm: 1.8, tcp_market: 4.54 }],
      },
    ]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search?q=alcremie-vmax-73")
    );
    const body = await response.json();
    const cardQuery = dbMock.card.findMany.mock.calls[0]?.[0];
    const whereJson = JSON.stringify(cardQuery.where);

    expect(response.status).toBe(200);
    expect(body.fuzzy).toBe(false);
    expect(body.parsed).toEqual({
      name: "alcremie vmax",
      cardNumber: "73",
      setCode: null,
      rawCardRef: null,
    });
    expect(body.singles).toHaveLength(1);
    expect(whereJson).toContain("alcremie vmax");
    expect(whereJson).toContain('"card_number":"73"');
    expect(whereJson).not.toContain('"contains":"73"');
  });

  it("parses plain set code plus number without matching larger card numbers", async () => {
    dbMock.card.findMany.mockResolvedValue([
      {
        id: "alcremie-vmax-73",
        name: "Alcremie VMAX",
        card_number: "73",
        rarity: "Rare Rainbow",
        supertype: "Pokemon",
        image_url: null,
        episode: {
          id: "shf",
          name: "Shining Fates",
          code: "SHF",
        },
        prices: [{ cm_en_lowest_nm: 1.8, tcp_market: 4.54 }],
      },
    ]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search?q=Alcremie%20VMAX%20SHF%2073")
    );
    const body = await response.json();
    const cardQuery = dbMock.card.findMany.mock.calls[0]?.[0];
    const whereJson = JSON.stringify(cardQuery.where);

    expect(response.status).toBe(200);
    expect(body.parsed).toEqual({
      name: "Alcremie VMAX",
      cardNumber: "73",
      setCode: "SHF",
      rawCardRef: "SHF73",
    });
    expect(whereJson).toContain('"code":{"equals":"SHF"}');
    expect(whereJson).toContain('"card_number":"73"');
    expect(whereJson).not.toContain('"contains":"73"');
  });

  it("hides redundant subset expansions from search results", async () => {
    dbMock.card.findMany.mockResolvedValue([]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search?q=shiny%20vault")
    );
    const expansionQuery = dbMock.episode.findMany.mock.calls[0]?.[0];
    const whereJson = JSON.stringify(expansionQuery.where).toLowerCase();

    expect(response.status).toBe(200);
    expect(whereJson).toContain("shiny vault");
    expect(whereJson).toContain("trainer gallery");
    expect(whereJson).toContain("galarian gallery");
  });

  it("uses the last path segment from TCGGO URLs", async () => {
    dbMock.card.findMany.mockResolvedValue([
      {
        id: "alcremie-vmax-73",
        name: "Alcremie VMAX",
        card_number: "73",
        rarity: "Rare Rainbow",
        supertype: "Pokemon",
        image_url: null,
        episode: {
          id: "shf",
          name: "Shining Fates",
          code: "SHF",
        },
        prices: [{ cm_en_lowest_nm: 1.8, tcp_market: 4.54 }],
      },
    ]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/search?q=https%3A%2F%2Fwww.tcggo.com%2Fpokemon%2Fshining-fates%2Falcremie-vmax-73"
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.parsed.name).toBe("alcremie vmax");
    expect(body.parsed.cardNumber).toBe("73");
    expect(body.singles[0].id).toBe("alcremie-vmax-73");
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

  it("keeps old numbered cards eligible when the name has a typo", async () => {
    dbMock.card.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "giratina-ex-124",
          name: "Giratina-EX",
          card_number: "124",
          rarity: "Rare Holo EX",
          supertype: "Pokemon",
          image_url: null,
          episode: {
            id: "drx",
            name: "Dragons Exalted",
            code: "DRX",
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "giratina-ex-124",
          name: "Giratina-EX",
          card_number: "124",
          rarity: "Rare Holo EX",
          supertype: "Pokemon",
          image_url: null,
          episode: {
            id: "drx",
            name: "Dragons Exalted",
            code: "DRX",
          },
          prices: [{ cm_en_lowest_nm: 89, tcp_market: 95 }],
        },
      ]);

    dbMock.sealedProduct.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    dbMock.episode.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search?q=gratina%20124")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.fuzzy).toBe(true);
    expect(body.singles).toHaveLength(1);
    expect(body.singles[0].name).toBe("Giratina-EX");

    expect(dbMock.card.findMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        take: 900,
      })
    );
  });

  it("returns direct card and sealed results with the highest prices first", async () => {
    dbMock.card.findMany.mockResolvedValue([
      {
        id: "cheap-card",
        name: "Budget Pikachu",
        card_number: "003",
        rarity: "Common",
        supertype: "Pokemon",
        image_url: null,
        episode: { id: "set", name: "Test Set", code: "TST" },
        prices: [{ cm_en_lowest_nm: 2, tcp_market: 3 }],
      },
      {
        id: "premium-card",
        name: "Premium Pikachu",
        card_number: "001",
        rarity: "Promo",
        supertype: "Pokemon",
        image_url: null,
        episode: { id: "set", name: "Test Set", code: "TST" },
        prices: [{ cm_en_lowest_nm: 150, tcp_market: 120 }],
      },
      {
        id: "mid-card",
        name: "Mid Pikachu",
        card_number: "002",
        rarity: "Rare",
        supertype: "Pokemon",
        image_url: null,
        episode: { id: "set", name: "Test Set", code: "TST" },
        prices: [{ cm_en_lowest_nm: 75, tcp_market: 80 }],
      },
    ]);
    dbMock.sealedProduct.findMany.mockResolvedValue([
      {
        id: "cheap-sealed",
        name: "Budget Pikachu Box",
        image_url: null,
        cardmarket_url: null,
        cm_lowest: 20,
        cm_avg_7d: null,
        cm_avg_30d: null,
        episode: { id: "set", name: "Test Set", code: "TST" },
      },
      {
        id: "premium-sealed",
        name: "Premium Pikachu Box",
        image_url: null,
        cardmarket_url: null,
        cm_lowest: 300,
        cm_avg_7d: null,
        cm_avg_30d: null,
        episode: { id: "set", name: "Test Set", code: "TST" },
      },
    ]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(new NextRequest("http://localhost:3000/api/search?q=pikachu"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.singles.map((card: { id: string }) => card.id)).toEqual([
      "premium-card",
      "mid-card",
      "cheap-card",
    ]);
    expect(body.sealed.map((product: { id: string }) => product.id)).toEqual([
      "premium-sealed",
      "cheap-sealed",
    ]);
  });
});
