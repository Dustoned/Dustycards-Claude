import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@/lib/db", () => ({ db: { sealedProduct: { findMany: mocks.findMany } } }));

import { loadExpansionSealedProducts } from "@/lib/expansion-sealed-products";

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "one-piece:34044",
    name: "The World's Strongest Warriors Booster",
    image_url: null,
    tcggo_url: null,
    cardmarket_url: "https://www.cardmarket.com/en/OnePiece/Products/Boosters/x",
    cardmarket_id: "873068",
    tcgplayer_id: null,
    cm_lowest: 5.5,
    cm_lowest_eu: 5.5,
    cm_lowest_de: null,
    cm_lowest_fr: 4.8,
    cm_lowest_es: null,
    cm_lowest_it: null,
    cm_avg_7d: 7.53,
    cm_avg_30d: 8.33,
    ...overrides,
  };
}

describe("loadExpansionSealedProducts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the expansion's stored sealed products stamped with the requested game", async () => {
    mocks.findMany.mockResolvedValue([row()]);

    const products = await loadExpansionSealedProducts("one-piece:417", "one-piece");

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { episode_id: "one-piece:417" } })
    );
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      id: "one-piece:34044",
      game: "one-piece",
      name: "The World's Strongest Warriors Booster",
      price: { cm_lowest: 5.5, cm_avg_30d: 8.33, cm_lowest_fr: 4.8 },
    });
  });

  it("returns an empty list when nothing is stored", async () => {
    mocks.findMany.mockResolvedValue([]);
    expect(await loadExpansionSealedProducts("one-piece:511", "one-piece")).toEqual([]);
  });
});
