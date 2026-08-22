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

  it("searches set names, codes and common product abbreviations together", async () => {
    mocks.products.mockResolvedValue([
      product({
        id: "pitch-etb",
        name: "Pitch Black Elite Trainer Box",
        episode: { id: "pitch", name: "Pitch Black", code: "PBL" },
      }),
      product({
        id: "pitch-box",
        name: "Pitch Black Booster Box",
        episode: { id: "pitch", name: "Pitch Black", code: "PBL" },
      }),
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/openings/sealed-products?q=PBL%20ETB")
    );

    await expect(response.json()).resolves.toMatchObject({
      total: 1,
      items: [{ productId: "pitch-etb" }],
    });
    const where = mocks.products.mock.calls[0]?.[0]?.where;
    expect(where.game).toEqual({ in: ["pokemon"] });
    expect(JSON.stringify(where)).toContain('"contains":"elite"');
    expect(JSON.stringify(where)).toContain('"contains":"trainer"');
    expect(JSON.stringify(where)).toContain('"contains":"box"');
  });

  it("keeps released products whose dates are stored as ISO strings", async () => {
    mocks.products.mockResolvedValue([
      product({
        id: "pitch-box",
        name: "Pitch Black Booster Box",
        release_date: "2026-07-17T00:00:00.000Z",
        episode: {
          id: "pitch",
          name: "Pitch Black",
          code: "PBL",
          release_date: "2026-07-17T00:00:00.000Z",
        },
      }),
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/openings/sealed-products?q=Pitch%20Black")
    );

    await expect(response.json()).resolves.toMatchObject({
      total: 1,
      items: [{ productId: "pitch-box" }],
    });
  });
});
