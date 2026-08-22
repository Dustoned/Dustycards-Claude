import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  products: vi.fn(),
  profiles: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "user-1" }),
  authErrorResponse: vi.fn(() => null),
}));
vi.mock("@/lib/user-settings-server", () => ({
  getServerUserSettings: vi.fn().mockResolvedValue({ onePieceLibraryEnabled: false }),
}));
vi.mock("@/lib/db", () => ({
  db: {
    sealedProduct: { findMany: mocks.products },
    setPullRateProfile: { findMany: mocks.profiles },
  },
}));

import { GET } from "@/app/api/openings/sealed-products/route";

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "sealed-1",
    name: "Temporal Forces Booster Box",
    image_url: "box.webp",
    game: "pokemon",
    cm_lowest: 109,
    cm_lowest_eu: 105,
    cm_lowest_de: null,
    cm_lowest_fr: null,
    cm_lowest_es: null,
    cm_lowest_it: null,
    cm_avg_7d: 111,
    cm_avg_30d: 115,
    episode: { id: "episode-1", name: "Temporal Forces", code: "TEF" },
    ...overrides,
  };
}

describe("GET /api/openings/sealed-products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.products.mockResolvedValue([
      product(),
      product({ id: "display", name: "Temporal Forces Booster Bundle Display" }),
      product({ id: "sleeves", name: "Temporal Forces Card Sleeves 65-Pack" }),
    ]);
    mocks.profiles.mockResolvedValue([{ set_code: "TEF", packs_per_booster_box: 36 }]);
  });

  it("returns openable catalogue products with best cost and inferred packs", async () => {
    const response = await GET(new NextRequest("http://localhost/api/openings/sealed-products"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      total: 1,
      nextOffset: null,
      items: [{ productId: "sealed-1", marketPrice: 105, suggestedPacks: 36 }],
    });
  });

  it("forwards a search across product and set names", async () => {
    await GET(new NextRequest("http://localhost/api/openings/sealed-products?q=temporal"));
    expect(mocks.products).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.any(Array) }),
    }));
  });
});
