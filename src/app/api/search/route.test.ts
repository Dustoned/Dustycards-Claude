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
    user: {
      findUnique: vi.fn(),
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
    dbMock.user.findUnique.mockReset();
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
    expect(dbMock.card.findMany.mock.calls[0]?.[0]?.select?.prices).toEqual(
      expect.objectContaining({
        where: { cm_en_lowest_nm: { gt: 0, not: 9001 } },
        take: 1,
      })
    );
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

  it("treats two space-separated numbers as a printed card reference", async () => {
    dbMock.card.findMany.mockResolvedValue([
      {
        id: "umbreon-161",
        name: "Umbreon ex",
        card_number: "161",
        printed_card_number: "161/131",
        rarity: "Special Illustration Rare",
        supertype: "Pokemon",
        image_url: null,
        episode: {
          id: "pre",
          name: "Prismatic Evolutions",
          code: "PRE",
        },
        prices: [{ cm_en_lowest_nm: 1240, tcp_market: 1320 }],
      },
    ]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(new NextRequest("http://localhost:3000/api/search?q=161%20131"));
    const body = await response.json();
    const cardQuery = dbMock.card.findMany.mock.calls[0]?.[0];
    const whereJson = JSON.stringify(cardQuery.where);

    expect(response.status).toBe(200);
    expect(body.parsed).toEqual({
      name: null,
      cardNumber: "161/131",
      setCode: null,
      rawCardRef: null,
    });
    expect(body.singles[0].card_number).toBe("161/131");
    expect(whereJson).toContain('"printed_card_number":{"startsWith":"161/131"}');
    expect(whereJson).not.toContain('"contains":"161/131"');
  });

  it("supports names before space-separated printed references", async () => {
    dbMock.card.findMany.mockResolvedValue([
      {
        id: "umbreon-161",
        name: "Umbreon ex",
        card_number: "161",
        printed_card_number: "161/131",
        rarity: "Special Illustration Rare",
        supertype: "Pokemon",
        image_url: null,
        episode: {
          id: "pre",
          name: "Prismatic Evolutions",
          code: "PRE",
        },
        prices: [{ cm_en_lowest_nm: 1240, tcp_market: 1320 }],
      },
    ]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search?q=umbreon%20161%20131")
    );
    const body = await response.json();
    const cardQuery = dbMock.card.findMany.mock.calls[0]?.[0];
    const whereJson = JSON.stringify(cardQuery.where);

    expect(response.status).toBe(200);
    expect(body.parsed).toEqual({
      name: "umbreon",
      cardNumber: "161/131",
      setCode: null,
      rawCardRef: null,
    });
    expect(whereJson).toContain('"name":{"contains":"umbreon"');
    expect(whereJson).toContain('"printed_card_number":{"startsWith":"161/131"}');
    expect(whereJson).not.toContain('"contains":"161/131"');
  });

  it("keeps full printed card number searches exact", async () => {
    dbMock.card.findMany.mockResolvedValue([
      {
        id: "card-002-203",
        name: "Exact Card",
        card_number: "002",
        printed_card_number: "002/203",
        rarity: "Rare",
        supertype: "Pokemon",
        image_url: null,
        episode: {
          id: "set",
          name: "Exact Set",
          code: "EXA",
        },
        prices: [{ cm_en_lowest_nm: 12, tcp_market: 14 }],
      },
    ]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(new NextRequest("http://localhost:3000/api/search?q=002%2F203"));
    const body = await response.json();
    const cardQuery = dbMock.card.findMany.mock.calls[0]?.[0];
    const whereJson = JSON.stringify(cardQuery.where);

    expect(response.status).toBe(200);
    expect(body.fuzzy).toBe(false);
    expect(body.parsed).toEqual({
      name: null,
      cardNumber: "002/203",
      setCode: null,
      rawCardRef: null,
    });
    expect(whereJson).toContain('"printed_card_number":{"startsWith":"002/203"}');
    expect(whereJson).toContain('"printed_card_number":{"startsWith":"2/203"}');
    expect(whereJson).not.toContain('"contains":"2/203"');
    expect(whereJson).not.toContain('"startsWith":"002/"');
  });

  it("supports compact printed card number searches without slash or spaces", async () => {
    dbMock.card.findMany.mockResolvedValue([
      {
        id: "card-002-203",
        name: "Exact Card",
        card_number: "002",
        printed_card_number: "002/203",
        rarity: "Rare",
        supertype: "Pokemon",
        image_url: null,
        episode: {
          id: "set",
          name: "Exact Set",
          code: "EXA",
        },
        prices: [{ cm_en_lowest_nm: 12, tcp_market: 14 }],
      },
    ]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(new NextRequest("http://localhost:3000/api/search?q=002203"));
    const body = await response.json();
    const cardQuery = dbMock.card.findMany.mock.calls[0]?.[0];
    const whereJson = JSON.stringify(cardQuery.where);

    expect(response.status).toBe(200);
    expect(body.fuzzy).toBe(false);
    expect(body.parsed).toEqual({
      name: null,
      cardNumber: "002/203",
      setCode: null,
      rawCardRef: null,
    });
    expect(whereJson).toContain('"printed_card_number":{"startsWith":"002/203"}');
    expect(whereJson).not.toContain('"contains":"2/203"');
  });

  it("supports unpadded space-separated printed card number searches", async () => {
    dbMock.card.findMany.mockResolvedValue([
      {
        id: "card-002-203",
        name: "Exact Card",
        card_number: "002",
        printed_card_number: "002/203",
        rarity: "Rare",
        supertype: "Pokemon",
        image_url: null,
        episode: {
          id: "set",
          name: "Exact Set",
          code: "EXA",
        },
        prices: [{ cm_en_lowest_nm: 12, tcp_market: 14 }],
      },
    ]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(new NextRequest("http://localhost:3000/api/search?q=2%20203"));
    const body = await response.json();
    const cardQuery = dbMock.card.findMany.mock.calls[0]?.[0];
    const whereJson = JSON.stringify(cardQuery.where);

    expect(response.status).toBe(200);
    expect(body.fuzzy).toBe(false);
    expect(body.parsed).toEqual({
      name: null,
      cardNumber: "2/203",
      setCode: null,
      rawCardRef: null,
    });
    expect(whereJson).toContain('"printed_card_number":{"startsWith":"2/203"}');
    expect(whereJson).toContain('"printed_card_number":{"startsWith":"002/203"}');
    expect(whereJson).not.toContain('"contains":"2/203"');
  });

  it("matches exact printed card numbers when the total is typed with leading zeroes", async () => {
    dbMock.card.findMany.mockResolvedValue([
      {
        id: "card-230-91",
        name: "Paldean Student",
        card_number: "230",
        printed_card_number: "230/91",
        rarity: "Rare",
        supertype: "Trainer",
        image_url: null,
        episode: {
          id: "set",
          name: "Paldean Fates",
          code: "PAF",
        },
        prices: [{ cm_en_lowest_nm: 2, tcp_market: 3 }],
      },
    ]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(new NextRequest("http://localhost:3000/api/search?q=230%2F091"));
    const body = await response.json();
    const cardQuery = dbMock.card.findMany.mock.calls[0]?.[0];
    const whereJson = JSON.stringify(cardQuery.where);

    expect(response.status).toBe(200);
    expect(body.fuzzy).toBe(false);
    expect(body.singles[0].card_number).toBe("230/91");
    expect(whereJson).toContain('"printed_card_number":{"startsWith":"230/091"}');
    expect(whereJson).toContain('"printed_card_number":{"startsWith":"230/91"}');
    expect(whereJson).not.toContain('"contains":"230/91"');
  });

  it("matches partially typed printed card numbers as a prefix", async () => {
    dbMock.card.findMany.mockResolvedValue([
      {
        id: "card-185-196",
        name: "Prefix Card",
        card_number: "185",
        printed_card_number: "185/196",
        rarity: "Rare",
        supertype: "Pokemon",
        image_url: null,
        episode: {
          id: "set",
          name: "Prefix Set",
          code: "PFX",
        },
        prices: [{ cm_en_lowest_nm: 9, tcp_market: 10 }],
      },
    ]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(new NextRequest("http://localhost:3000/api/search?q=185%2F19"));
    const body = await response.json();
    const cardQuery = dbMock.card.findMany.mock.calls[0]?.[0];
    const whereJson = JSON.stringify(cardQuery.where);

    expect(response.status).toBe(200);
    expect(body.fuzzy).toBe(false);
    expect(body.parsed).toEqual({
      name: null,
      cardNumber: "185/19",
      setCode: null,
      rawCardRef: null,
    });
    expect(body.singles).toHaveLength(1);
    expect(body.singles[0].card_number).toBe("185/196");
    expect(whereJson).toContain('"card_number":{"startsWith":"185/19"}');
    expect(whereJson).toContain('"printed_card_number":{"startsWith":"185/19"}');
    expect(whereJson).not.toContain('"contains":"185/19"');
  });

  it("matches partially typed numbers in name plus number searches and ranks the exact number first", async () => {
    dbMock.card.findMany.mockResolvedValue([
      {
        id: "umbreon-161",
        name: "Umbreon ex",
        card_number: "161",
        printed_card_number: "161/131",
        rarity: "Special Illustration Rare",
        supertype: "Pokemon",
        image_url: null,
        episode: {
          id: "pre",
          name: "Prismatic Evolutions",
          code: "PRE",
        },
        prices: [{ cm_en_lowest_nm: 1240, tcp_market: 1320 }],
      },
      {
        id: "umbreon-16",
        name: "Umbreon ex",
        card_number: "16",
        printed_card_number: "16/131",
        rarity: "Rare",
        supertype: "Pokemon",
        image_url: null,
        episode: {
          id: "pre",
          name: "Prismatic Evolutions",
          code: "PRE",
        },
        prices: [{ cm_en_lowest_nm: 1, tcp_market: 1.5 }],
      },
    ]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search?q=umbreon%2016")
    );
    const body = await response.json();
    const cardQuery = dbMock.card.findMany.mock.calls[0]?.[0];
    const whereJson = JSON.stringify(cardQuery.where);

    expect(response.status).toBe(200);
    expect(body.parsed).toEqual({
      name: "umbreon",
      cardNumber: "16",
      setCode: null,
      rawCardRef: null,
    });
    expect(whereJson).toContain('"card_number":{"startsWith":"16"}');
    expect(body.singles.map((card: { id: string }) => card.id)).toEqual([
      "umbreon-16",
      "umbreon-161",
    ]);
  });

  it("does not fuzzy fallback for missing exact printed card number searches", async () => {
    dbMock.card.findMany.mockResolvedValue([]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(new NextRequest("http://localhost:3000/api/search?q=002%2F203"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.fuzzy).toBe(false);
    expect(body.total).toBe(0);
    expect(dbMock.card.findMany).toHaveBeenCalledTimes(1);
    expect(dbMock.sealedProduct.findMany).not.toHaveBeenCalled();
    expect(dbMock.episode.findMany).not.toHaveBeenCalled();
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
    expect(whereJson).toContain('"code":{"contains":"SHF"}');
    expect(whereJson).not.toContain('"name":{"contains":"SHF"}');
    expect(whereJson).toContain('"card_number":"73"');
    expect(whereJson).not.toContain('"contains":"73"');
  });

  it("matches One Piece card references by exact stored card number", async () => {
    dbMock.user.findUnique.mockResolvedValue({
      settings_json: JSON.stringify({ onePieceLibraryEnabled: true, settingsVersion: 3 }),
    });
    dbMock.card.findMany.mockResolvedValue([
      {
        id: "one-piece:28798",
        name: "Roronoa Zoro",
        card_number: "OP12-113",
        rarity: "LEADER",
        supertype: null,
        image_url: null,
        episode: {
          id: "one-piece:361",
          name: "Legacy of the Master",
          code: "OP12",
        },
        prices: [{ cm_en_lowest_nm: 12.5, tcp_market: null }],
      },
    ]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search?q=OP12-113&game=one-piece")
    );
    const body = await response.json();
    const cardQuery = dbMock.card.findMany.mock.calls[0]?.[0];
    const whereJson = JSON.stringify(cardQuery.where);

    expect(response.status).toBe(200);
    expect(body.fuzzy).toBe(false);
    expect(body.parsed).toEqual({
      name: null,
      cardNumber: "113",
      setCode: "OP12",
      rawCardRef: "OP12-113",
    });
    expect(body.singles).toHaveLength(1);
    expect(whereJson).toContain('"game":"one-piece"');
    expect(whereJson).toContain('"card_number":"OP12-113"');
    expect(whereJson).not.toContain('"contains":"113"');
  });

  it("matches One Piece unpadded number references to padded stored card numbers", async () => {
    dbMock.user.findUnique.mockResolvedValue({
      settings_json: JSON.stringify({ onePieceLibraryEnabled: true, settingsVersion: 3 }),
    });
    dbMock.card.findMany.mockResolvedValue([
      {
        id: "one-piece:op01-016",
        name: "Nami",
        card_number: "OP01-016",
        rarity: "R",
        supertype: "Character",
        image_url: null,
        episode: {
          id: "one-piece:op01",
          name: "Romance Dawn",
          code: "OP01",
        },
        prices: [{ cm_en_lowest_nm: 8, tcp_market: null }],
      },
    ]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search?q=OP01%2016&game=one-piece")
    );
    const body = await response.json();
    const cardQuery = dbMock.card.findMany.mock.calls[0]?.[0];
    const whereJson = JSON.stringify(cardQuery.where);

    expect(response.status).toBe(200);
    expect(body.fuzzy).toBe(false);
    expect(body.parsed).toEqual({
      name: null,
      cardNumber: "16",
      setCode: "OP01",
      rawCardRef: "OP01-16",
    });
    expect(body.singles[0].card_number).toBe("OP01-016");
    expect(whereJson).toContain('"card_number":"OP01-16"');
    expect(whereJson).toContain('"card_number":"OP01-016"');
    expect(whereJson).not.toContain('"contains":"16"');
  });

  it("keeps One Piece space-separated references exact and skips fuzzy fallback", async () => {
    dbMock.user.findUnique.mockResolvedValue({
      settings_json: JSON.stringify({ onePieceLibraryEnabled: true, settingsVersion: 3 }),
    });
    dbMock.card.findMany.mockResolvedValue([]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search?q=OP05%20119&game=one-piece")
    );
    const body = await response.json();
    const cardQuery = dbMock.card.findMany.mock.calls[0]?.[0];
    const whereJson = JSON.stringify(cardQuery.where);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      singles: [],
      sealed: [],
      expansions: [],
      total: 0,
      fuzzy: false,
      parsed: {
        name: null,
        cardNumber: "119",
        setCode: "OP05",
        rawCardRef: "OP05-119",
      },
    });
    expect(whereJson).toContain('"card_number":"OP05-119"');
    expect(dbMock.card.findMany).toHaveBeenCalledTimes(1);
    expect(dbMock.sealedProduct.findMany).not.toHaveBeenCalled();
    expect(dbMock.episode.findMany).not.toHaveBeenCalled();
  });

  it("treats One Piece set-code searches as broad set and card-prefix matches", async () => {
    dbMock.user.findUnique.mockResolvedValue({
      settings_json: JSON.stringify({ onePieceLibraryEnabled: true, settingsVersion: 3 }),
    });
    dbMock.card.findMany.mockResolvedValue(
      Array.from({ length: 101 }, (_, index) => {
        const number = String(index + 1).padStart(3, "0");
        return {
          id: `one-piece:op05-${number}`,
          name: `OP05 Card ${number}`,
          card_number: `OP05-${number}`,
          rarity: "R",
          supertype: null,
          image_url: null,
          episode: {
            id: "one-piece:372",
            name: "Awakening of the New Era",
            code: "OP05",
          },
          prices: [{ cm_en_lowest_nm: 2.5, tcp_market: null }],
        };
      })
    );
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([
      {
        id: "one-piece:372",
        name: "Awakening of the New Era",
        code: "OP05",
        logo_url: null,
      },
    ]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search?q=OP05&game=one-piece")
    );
    const body = await response.json();
    const cardQuery = dbMock.card.findMany.mock.calls[0]?.[0];
    const expansionQuery = dbMock.episode.findMany.mock.calls[0]?.[0];
    const whereJson = JSON.stringify(cardQuery.where);

    expect(response.status).toBe(200);
    expect(body.fuzzy).toBe(false);
    expect(body.parsed).toEqual({
      name: null,
      cardNumber: null,
      setCode: "OP05",
      rawCardRef: null,
    });
    expect(body.singles).toHaveLength(101);
    expect(body.singles[0].card_number).toBe("OP05-001");
    expect(body.expansions[0].code).toBe("OP05");
    expect(whereJson).toContain('"code":{"contains":"OP05"}');
    expect(whereJson).toContain('"card_number":{"startsWith":"OP05-"}');
    expect(whereJson).not.toContain('"card_number":"OP-05"');
    expect(JSON.stringify(expansionQuery.where)).toContain('"code":{"contains":"OP05"}');
  });

  it("auto-switches Pokemon searches to One Piece when a structured One Piece code matches there", async () => {
    dbMock.user.findUnique.mockResolvedValue({
      settings_json: JSON.stringify({ onePieceLibraryEnabled: true, settingsVersion: 3 }),
    });
    dbMock.card.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "one-piece:op05-001",
          name: "Sabo",
          card_number: "OP05-001",
          rarity: "LEADER",
          supertype: null,
          image_url: null,
          episode: {
            id: "one-piece:372",
            name: "Awakening of the New Era",
            code: "OP05",
          },
          prices: [{ cm_en_lowest_nm: 2.5, tcp_market: null }],
        },
      ]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([
      {
        id: "one-piece:372",
        name: "Awakening of the New Era",
        code: "OP05",
        logo_url: null,
      },
    ]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search?q=OP05&game=pokemon")
    );
    const body = await response.json();
    const firstCardQuery = dbMock.card.findMany.mock.calls[0]?.[0];
    const secondCardQuery = dbMock.card.findMany.mock.calls[1]?.[0];

    expect(response.status).toBe(200);
    expect(body.fuzzy).toBe(false);
    expect(body.game).toBe("one-piece");
    expect(body.autoSwitchedFrom).toBe("pokemon");
    expect(body.parsed).toEqual({
      name: null,
      cardNumber: null,
      setCode: "OP05",
      rawCardRef: null,
    });
    expect(body.singles[0].card_number).toBe("OP05-001");
    expect(body.expansions[0].code).toBe("OP05");
    expect(JSON.stringify(firstCardQuery.where)).toContain('"game":"pokemon"');
    expect(JSON.stringify(secondCardQuery.where)).toContain('"game":"one-piece"');
    expect(JSON.stringify(secondCardQuery.where)).toContain('"card_number":{"startsWith":"OP05-"}');
    expect(dbMock.card.findMany).toHaveBeenCalledTimes(2);
  });

  it("does not run fuzzy fallback in all-game searches when either game has direct matches", async () => {
    dbMock.user.findUnique.mockResolvedValue({
      settings_json: JSON.stringify({ onePieceLibraryEnabled: true, settingsVersion: 3 }),
    });
    dbMock.card.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "one-piece:op05-001",
          name: "Sabo",
          card_number: "OP05-001",
          rarity: "LEADER",
          supertype: null,
          image_url: null,
          episode: {
            id: "one-piece:372",
            name: "Awakening of the New Era",
            code: "OP05",
          },
          prices: [{ cm_en_lowest_nm: 2.5, tcp_market: null }],
        },
      ]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([
      {
        id: "one-piece:372",
        name: "Awakening of the New Era",
        code: "OP05",
        logo_url: null,
      },
    ]);

    const response = await GET(new NextRequest("http://localhost:3000/api/search?q=OP05"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.fuzzy).toBe(false);
    expect(body.game).toBe("all");
    expect(body.singles[0].card_number).toBe("OP05-001");
    expect(dbMock.card.findMany).toHaveBeenCalledTimes(2);
  });

  it("auto-switches One Piece searches back to Pokemon when only Pokemon has direct matches", async () => {
    dbMock.user.findUnique.mockResolvedValue({
      settings_json: JSON.stringify({ onePieceLibraryEnabled: true, settingsVersion: 3 }),
    });
    dbMock.card.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "base1-4",
          name: "Charizard",
          card_number: "4",
          rarity: "Rare Holo",
          supertype: "Pokemon",
          image_url: null,
          episode: {
            id: "base1",
            name: "Base Set",
            code: "base1",
          },
          prices: [{ cm_en_lowest_nm: 199.99, tcp_market: 205 }],
        },
      ]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search?q=charizard&game=one-piece")
    );
    const body = await response.json();
    const firstCardQuery = dbMock.card.findMany.mock.calls[0]?.[0];
    const secondCardQuery = dbMock.card.findMany.mock.calls[1]?.[0];

    expect(response.status).toBe(200);
    expect(body.fuzzy).toBe(false);
    expect(body.game).toBe("pokemon");
    expect(body.autoSwitchedFrom).toBe("one-piece");
    expect(body.parsed).toEqual({
      name: "charizard",
      cardNumber: null,
      setCode: null,
      rawCardRef: null,
    });
    expect(body.singles[0].id).toBe("base1-4");
    expect(JSON.stringify(firstCardQuery.where)).toContain('"game":"one-piece"');
    expect(JSON.stringify(secondCardQuery.where)).toContain('"game":"pokemon"');
    expect(dbMock.card.findMany).toHaveBeenCalledTimes(2);
  });

  it("keeps manual game-switch searches on the selected game even when another game has matches", async () => {
    dbMock.user.findUnique.mockResolvedValue({
      settings_json: JSON.stringify({ onePieceLibraryEnabled: true, settingsVersion: 3 }),
    });
    dbMock.card.findMany.mockResolvedValue([]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search?q=119&game=one-piece&autoswitch=0")
    );
    const body = await response.json();
    const cardQuery = dbMock.card.findMany.mock.calls[0]?.[0];
    const cardQueryJson = dbMock.card.findMany.mock.calls
      .map((call) => JSON.stringify(call[0]?.where))
      .join("\n");

    expect(response.status).toBe(200);
    expect(body.game).toBe("one-piece");
    expect(body.autoSwitchedFrom).toBeUndefined();
    expect(body.total).toBe(0);
    expect(body.parsed).toEqual({
      name: null,
      cardNumber: "119",
      setCode: null,
      rawCardRef: null,
    });
    expect(JSON.stringify(cardQuery.where)).toContain('"game":"one-piece"');
    expect(cardQueryJson).not.toContain('"game":"pokemon"');
  });

  it("allows set name plus number searches to match episode names directly", async () => {
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
      new NextRequest("http://localhost:3000/api/search?q=shining%20fates%2073")
    );
    const body = await response.json();
    const cardQuery = dbMock.card.findMany.mock.calls[0]?.[0];
    const whereJson = JSON.stringify(cardQuery.where).toLowerCase();

    expect(response.status).toBe(200);
    expect(body.fuzzy).toBe(false);
    expect(body.singles[0].id).toBe("alcremie-vmax-73");
    expect(whereJson).toContain("shining fates");
    expect(whereJson).toContain("episode");
    expect(whereJson).toContain('"card_number":"73"');
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

  it("does not return weak partial fuzzy expansion matches for multi-word searches", async () => {
    dbMock.card.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    dbMock.sealedProduct.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    dbMock.episode.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "dragon-vault",
          name: "Dragon Vault",
          code: "DRV",
          logo_url: null,
        },
      ]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search?q=shiny%20vault")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.fuzzy).toBe(true);
    expect(body.expansions).toEqual([]);
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

  it("keeps ordinary short words in card names instead of treating them as set codes", async () => {
    dbMock.card.findMany.mockResolvedValue([
      {
        id: "mew-ex",
        name: "Mew ex",
        card_number: "193",
        rarity: "Special Illustration Rare",
        supertype: "Pokemon",
        image_url: null,
        episode: { id: "set", name: "Paldean Fates", code: "PAF" },
        prices: [{ cm_en_lowest_nm: 75, tcp_market: 80 }],
      },
    ]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(new NextRequest("http://localhost:3000/api/search?q=Mew%20ex"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.parsed).toEqual({
      name: "Mew ex",
      cardNumber: null,
      setCode: null,
      rawCardRef: null,
    });
    expect(body.singles[0].id).toBe("mew-ex");
  });

  it("does not parse card names ending in a number as compact set references", async () => {
    dbMock.card.findMany.mockResolvedValue([
      {
        id: "porygon2",
        name: "Porygon2",
        card_number: "72",
        rarity: "Rare",
        supertype: "Pokemon",
        image_url: null,
        episode: { id: "set", name: "Test Set", code: "TST" },
        prices: [{ cm_en_lowest_nm: 4, tcp_market: 5 }],
      },
    ]);
    dbMock.sealedProduct.findMany.mockResolvedValue([]);
    dbMock.episode.findMany.mockResolvedValue([]);

    const response = await GET(new NextRequest("http://localhost:3000/api/search?q=Porygon2"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.parsed).toEqual({
      name: "Porygon2",
      cardNumber: null,
      setCode: null,
      rawCardRef: null,
    });
  });

  it("ranks exact direct matches before more expensive partial matches", async () => {
    dbMock.card.findMany.mockResolvedValue([
      {
        id: "exact-card",
        name: "Pikachu",
        card_number: "004",
        rarity: "Common",
        supertype: "Pokemon",
        image_url: null,
        episode: { id: "set", name: "Test Set", code: "TST" },
        prices: [{ cm_en_lowest_nm: 1, tcp_market: 1.5 }],
      },
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
        id: "exact-sealed",
        name: "Pikachu",
        image_url: null,
        cardmarket_url: null,
        cm_lowest: 5,
        cm_avg_7d: null,
        cm_avg_30d: null,
        episode: { id: "set", name: "Test Set", code: "TST" },
      },
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
      "exact-card",
      "premium-card",
      "mid-card",
      "cheap-card",
    ]);
    expect(body.sealed.map((product: { id: string }) => product.id)).toEqual([
      "exact-sealed",
      "premium-sealed",
      "cheap-sealed",
    ]);
  });

  it("keeps fuzzy relevance ahead of price after loading card details", async () => {
    const exactTypoCandidate = {
      id: "exact-typo",
      name: "Charzrd",
      card_number: "001",
      rarity: "Rare",
      supertype: "Pokemon",
      image_url: null,
      episode: { id: "set", name: "Test Set", code: "TST" },
    };
    const expensiveFuzzyCandidate = {
      ...exactTypoCandidate,
      id: "expensive-fuzzy",
      name: "Charizard",
      card_number: "002",
    };

    dbMock.card.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([expensiveFuzzyCandidate, exactTypoCandidate])
      .mockResolvedValueOnce([
        {
          ...expensiveFuzzyCandidate,
          prices: [{ cm_en_lowest_nm: 500, tcp_market: 520 }],
        },
        {
          ...exactTypoCandidate,
          prices: [{ cm_en_lowest_nm: 2, tcp_market: 3 }],
        },
      ]);
    dbMock.sealedProduct.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    dbMock.episode.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const response = await GET(new NextRequest("http://localhost:3000/api/search?q=charzrd"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.fuzzy).toBe(true);
    expect(body.singles.map((card: { id: string }) => card.id)).toEqual([
      "exact-typo",
      "expensive-fuzzy",
    ]);
  });
});
