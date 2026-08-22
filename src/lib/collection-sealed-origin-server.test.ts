import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findProduct: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    sealedProduct: { findUnique: mocks.findProduct },
  },
}));

import { isValidCollectionSealedOrigin } from "@/lib/collection-sealed-origin-server";

const card = { id: "card-1", game: "pokemon", episode_id: "set-1" };

describe("isValidCollectionSealedOrigin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows cards from the product set, declared content sets and included promos", async () => {
    mocks.findProduct.mockResolvedValue({
      id: "other-box",
      game: "pokemon",
      name: "Main Set Elite Trainer Box",
      episode_id: "set-1",
      episode: { name: "Main Set", code: "MAIN" },
      contentSets: [{ episode_id: "set-2" }],
      includedCards: [{ card_id: "promo-1" }],
    });

    await expect(isValidCollectionSealedOrigin("other-box", [card])).resolves.toBe(true);
    await expect(
      isValidCollectionSealedOrigin("other-box", [
        { id: "card-2", game: "pokemon", episode_id: "set-2" },
      ])
    ).resolves.toBe(true);
    await expect(
      isValidCollectionSealedOrigin("other-box", [
        { id: "promo-1", game: "pokemon", episode_id: "promo-era" },
      ])
    ).resolves.toBe(true);
  });

  it("allows unrelated same-game pulls for random boxes with unknown packs", async () => {
    mocks.findProduct.mockResolvedValue({
      id: "box",
      game: "pokemon",
      name: "Mega Lucario ex Box",
      episode_id: "set-1",
      episode: { name: "Mega Evolution", code: "MEG" },
      contentSets: [],
      includedCards: [],
    });
    await expect(
      isValidCollectionSealedOrigin("box", [
        { id: "card-3", game: "pokemon", episode_id: "another-set" },
      ])
    ).resolves.toBe(true);
  });

  it("rejects cases, displays and products from another game", async () => {

    mocks.findProduct.mockResolvedValue({
      id: "case",
      game: "pokemon",
      name: "Elite Trainer Box Case",
      episode_id: "set-1",
      episode: { name: "Main Set", code: "MAIN" },
      contentSets: [],
      includedCards: [],
    });
    await expect(isValidCollectionSealedOrigin("case", [card])).resolves.toBe(false);

    mocks.findProduct.mockResolvedValue({
      id: "other-game",
      game: "one-piece",
      name: "Booster Box",
      episode_id: "set-1",
      episode: { name: "Main Set", code: "MAIN" },
      contentSets: [],
      includedCards: [],
    });
    await expect(isValidCollectionSealedOrigin("other-game", [card])).resolves.toBe(false);
  });
});
