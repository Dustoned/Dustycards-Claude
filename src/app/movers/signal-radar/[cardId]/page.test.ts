import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCardDetailPayload: vi.fn(),
  requirePageUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not found");
  }),
}));
vi.mock("@/components/CardDetailRoutePage", () => ({
  default: () => null,
}));
vi.mock("@/lib/card-detail-data", () => ({
  getCardDetailPayload: mocks.getCardDetailPayload,
}));
vi.mock("@/lib/page-auth", () => ({ requirePageUser: mocks.requirePageUser }));

import SignalRadarCardPage from "@/app/movers/signal-radar/[cardId]/page";

const card = {
  id: "1693",
  game: "pokemon",
  name: "Unfair Stamp",
  card_number: "165/167",
  image_url: "/unfair-stamp.webp",
  episode_name: "Twilight Masquerade",
  episode_code: "TWM",
  artist: "5ban Graphics",
  rarity: "ACE SPEC Rare",
  price: { cm_en_lowest_nm: 8.49 },
  price_history: [{ date: "2026-07-19", label: "19 Jul", cm_market_en: 8.49 }],
  ebay_sold_graded_price_history: [],
  graded_price_history: [],
};

describe("Signal Radar card detail loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePageUser.mockResolvedValue({ id: "user-1" });
    mocks.getCardDetailPayload.mockResolvedValue(card);
  });

  it("hosts the shared card detail module instead of a Radar-only implementation", async () => {
    const result = (await SignalRadarCardPage({
      params: Promise.resolve({ cardId: "1693" }),
      searchParams: Promise.resolve({ game: "pokemon" }),
    })) as ReactElement<Record<string, unknown>>;

    expect(mocks.requirePageUser).toHaveBeenCalledWith(
      "/movers/signal-radar/1693?game=pokemon",
    );
    expect(mocks.getCardDetailPayload).toHaveBeenCalledWith("1693", "user-1");
    expect(result.props).toMatchObject({
      card: expect.objectContaining({ id: "1693", game: "pokemon" }),
      backHref: "/movers/signal-radar?game=pokemon",
      backLabel: "Back to Signal Radar",
    });
  });

  it("returns new-release cards to their originating Chase Watch set", async () => {
    const result = (await SignalRadarCardPage({
      params: Promise.resolve({ cardId: "1693" }),
      searchParams: Promise.resolve({ game: "pokemon", fromSet: "episode 42" }),
    })) as ReactElement<Record<string, unknown>>;

    expect(result.props.backHref).toBe(
      "/movers/signal-radar?game=pokemon&set=episode%2042#new-release-chases",
    );
  });
});
