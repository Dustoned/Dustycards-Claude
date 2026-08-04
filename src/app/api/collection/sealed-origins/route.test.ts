import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  cards: vi.fn(),
  products: vi.fn(),
  ownedItems: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "user-1" }),
  authErrorResponse: vi.fn(() => null),
}));

vi.mock("@/lib/db", () => ({
  db: {
    card: { findMany: mocks.cards },
    sealedProduct: { findMany: mocks.products },
    collectionSealed: { findMany: mocks.ownedItems },
  },
}));

import { POST } from "@/app/api/collection/sealed-origins/route";

describe("POST /api/collection/sealed-origins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cards.mockResolvedValue([
      { id: "card-1", game: "pokemon", episode_id: "set-1" },
    ]);
    mocks.products.mockResolvedValue([]);
    mocks.ownedItems.mockResolvedValue([]);
  });

  it("returns known matches first and keeps other same-game boxes as manual fallbacks", async () => {
    mocks.products.mockResolvedValue([
      {
        id: "box-1",
        game: "pokemon",
        episode_id: "set-1",
        name: "Booster Box",
        image_url: null,
        cm_lowest: 120,
        cm_lowest_eu: 118,
        cm_lowest_de: null,
        cm_lowest_fr: null,
        cm_lowest_es: null,
        cm_lowest_it: null,
        cm_avg_7d: 121,
        cm_avg_30d: 125,
        episode: { id: "set-1", name: "Set One", code: "S1" },
        contentSets: [],
        includedCards: [],
      },
      {
        id: "box-other",
        game: "pokemon",
        episode_id: "set-2",
        name: "Unrelated Box",
        image_url: null,
        cm_lowest: 90,
        cm_lowest_eu: 88,
        cm_lowest_de: null,
        cm_lowest_fr: null,
        cm_lowest_es: null,
        cm_lowest_it: null,
        cm_avg_7d: null,
        cm_avg_30d: null,
        episode: { id: "set-2", name: "Set Two", code: "S2" },
        contentSets: [],
        includedCards: [],
      },
    ]);
    mocks.ownedItems.mockResolvedValue([
      { product_id: "box-1", purchase_price_per_item: 99.95 },
    ]);

    const response = await POST(
      new NextRequest("http://localhost/api/collection/sealed-origins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardIds: ["card-1"] }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.options).toEqual([
      expect.objectContaining({
        id: "box-1",
        owned: true,
        matches_cards: true,
        price_basis: 118,
        price_basis_source: "market",
      }),
      expect.objectContaining({
        id: "box-other",
        owned: false,
        matches_cards: false,
        price_basis: 88,
        price_basis_source: "market",
      }),
    ]);
  });

  it("requires every requested card to exist", async () => {
    mocks.cards.mockResolvedValue([]);
    const response = await POST(
      new NextRequest("http://localhost/api/collection/sealed-origins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardIds: ["missing-card"] }),
      })
    );

    expect(response.status).toBe(404);
    expect(mocks.products).not.toHaveBeenCalled();
  });

  it("keeps cases, cartons, displays and loose products out of origin suggestions", async () => {
    const product = (id: string, name: string) => ({
      id,
      game: "pokemon",
      episode_id: "set-1",
      name,
      image_url: null,
      cm_lowest: 100,
      cm_lowest_eu: 95,
      cm_lowest_de: null,
      cm_lowest_fr: null,
      cm_lowest_es: null,
      cm_lowest_it: null,
      cm_avg_7d: null,
      cm_avg_30d: null,
      episode: { id: "set-1", name: "Set One", code: "S1" },
      contentSets: [],
      includedCards: [],
    });
    mocks.products.mockResolvedValue([
      product("box", "Set One Elite Trainer Box"),
      product("case", "Set One Elite Trainer Box Case"),
      product("display", "Set One Booster Bundle Display"),
      product("booster", "Set One Sleeved Booster"),
    ]);

    const response = await POST(
      new NextRequest("http://localhost/api/collection/sealed-origins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardIds: ["card-1"] }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.options.map((option: { id: string }) => option.id)).toEqual(["box"]);
  });
});
