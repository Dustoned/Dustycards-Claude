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

  it("allows a same-game consumer box even when contents metadata is incomplete", async () => {
    mocks.findProduct.mockResolvedValue({
      id: "other-box",
      game: "pokemon",
      name: "Mega Lucario ex Box",
    });

    await expect(isValidCollectionSealedOrigin("other-box", [card])).resolves.toBe(true);
  });

  it("rejects cases, displays and products from another game", async () => {
    mocks.findProduct.mockResolvedValue({
      id: "case",
      game: "pokemon",
      name: "Elite Trainer Box Case",
    });
    await expect(isValidCollectionSealedOrigin("case", [card])).resolves.toBe(false);

    mocks.findProduct.mockResolvedValue({
      id: "other-game",
      game: "one-piece",
      name: "Booster Box",
    });
    await expect(isValidCollectionSealedOrigin("other-game", [card])).resolves.toBe(false);
  });
});
