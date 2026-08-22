import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findSession: vi.fn(),
  findCards: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
  authErrorResponse: () => null,
}));

vi.mock("@/lib/db", () => ({
  db: {
    sealedOpeningSession: { findFirst: mocks.findSession },
    card: { findMany: mocks.findCards },
  },
}));

import { GET } from "@/app/api/openings/cards/route";

function request(query = "") {
  return new NextRequest(
    `http://localhost/api/openings/cards?sessionId=opening-1&q=${encodeURIComponent(query)}`
  );
}

function card(
  id: string,
  episodeId: string,
  name: string,
  number: string,
  episodeName: string
) {
  return {
    id,
    name,
    card_number: number,
    printed_card_number: null,
    image_url: `${id}.png`,
    rarity: "Rare",
    version: null,
    episode_id: episodeId,
    episode: { name: episodeName, code: episodeId.toUpperCase() },
    prices: [{ cm_en_lowest_nm: 12.5 }],
  };
}

describe("GET /api/openings/cards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.findSession.mockResolvedValue({
      sealedProduct: {
        game: "pokemon",
        episode_id: "main-set",
        contentSets: [{ episode_id: "subset" }],
        includedCards: [{ card_id: "promo-1" }],
      },
    });
    mocks.findCards.mockResolvedValue([
      card("main-1", "main-set", "Main Pikachu", "1/100", "Main Set"),
      card("subset-1", "subset", "Gallery Mew", "TG01", "Gallery"),
      card("promo-1", "promos", "Box Promo", "SWSH001", "Promos"),
      card("unrelated-1", "other-set", "Wrong Charizard", "4/100", "Other Set"),
    ]);
  });

  it("returns only cards from the sealed sets and explicitly included promos", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.singles.map((entry: { id: string }) => entry.id)).toEqual([
      "main-1",
      "subset-1",
      "promo-1",
    ]);
    expect(payload.singles[2]).toMatchObject({
      id: "promo-1",
      included_promo: true,
    });
    expect(mocks.findCards).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          game: "pokemon",
          OR: [
            { episode_id: { in: ["main-set", "subset"] } },
            { id: { in: ["promo-1"] } },
          ],
        },
      })
    );
  });

  it("searches only inside that pool", async () => {
    const response = await GET(request("Box Promo"));
    const payload = await response.json();

    expect(payload.singles).toHaveLength(1);
    expect(payload.singles[0]).toMatchObject({ id: "promo-1", included_promo: true });
  });

  it("does not expose a closed or another user's opening", async () => {
    mocks.findSession.mockResolvedValue(null);

    const response = await GET(request("Pikachu"));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Opening session not found or already closed",
    });
    expect(mocks.findCards).not.toHaveBeenCalled();
  });
});
