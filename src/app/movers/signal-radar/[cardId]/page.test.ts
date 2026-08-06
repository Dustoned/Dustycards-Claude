import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCardDetailPayload: vi.fn(),
  getCachedExternalCardResearch: vi.fn(),
  buildOnDemandExternalCardSignal: vi.fn(),
  getExternalSignalRadarDetailContext: vi.fn(),
  readSignalRadarSnapshot: vi.fn(),
  requirePageUser: vi.fn(),
  getServerUserSettings: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not found");
  }),
}));
vi.mock("@/app/movers/signal-radar/[cardId]/SignalRadarDetailClient", () => ({
  default: () => null,
}));
vi.mock("@/lib/card-detail-data", () => ({
  getCardDetailPayload: mocks.getCardDetailPayload,
}));
vi.mock("@/lib/external-card-research", () => ({
  getCachedExternalCardResearch: mocks.getCachedExternalCardResearch,
}));
vi.mock("@/lib/external-signal-intelligence", () => ({
  buildOnDemandExternalCardSignal: mocks.buildOnDemandExternalCardSignal,
}));
vi.mock("@/lib/external-signal-persisted", () => ({
  getExternalSignalRadarDetailContext: mocks.getExternalSignalRadarDetailContext,
}));
vi.mock("@/lib/signal-radar-snapshot-store", () => ({
  readSignalRadarSnapshot: mocks.readSignalRadarSnapshot,
}));
vi.mock("@/lib/page-auth", () => ({ requirePageUser: mocks.requirePageUser }));
vi.mock("@/lib/user-settings-server", () => ({
  getServerUserSettings: mocks.getServerUserSettings,
}));

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

const focusedSignal = {
  cardId: "1693",
  rank: 0,
  game: "pokemon",
  name: "Unfair Stamp",
  marketIntelligence: {
    graded: { label: null, currency: "EUR" },
  },
};

describe("Signal Radar card detail loader", () => {
  beforeEach(() => {
    mocks.requirePageUser.mockResolvedValue({ id: "user-1" });
    mocks.getServerUserSettings.mockResolvedValue({
      onePieceLibraryEnabled: true,
      modalSize: "medium",
    });
    mocks.getCardDetailPayload.mockResolvedValue(card);
    mocks.getCachedExternalCardResearch.mockResolvedValue(null);
    mocks.buildOnDemandExternalCardSignal.mockResolvedValue(focusedSignal);
    mocks.readSignalRadarSnapshot.mockResolvedValue(null);
    mocks.getExternalSignalRadarDetailContext.mockResolvedValue({
      generatedAt: "2026-07-20T12:00:00.000Z",
      rank: 7,
      runId: "competitive-run-7",
    });
  });

  it("enriches only the requested card and preserves its persisted rank", async () => {
    const result = (await SignalRadarCardPage({
      params: Promise.resolve({ cardId: "1693" }),
      searchParams: Promise.resolve({ game: "pokemon" }),
    })) as ReactElement<{ children: ReactElement<Record<string, unknown>> }>;
    const detailProps = result.props.children.props;

    expect(mocks.getExternalSignalRadarDetailContext).toHaveBeenCalledWith(
      "1693",
      "pokemon"
    );
    expect(mocks.buildOnDemandExternalCardSignal).toHaveBeenCalledTimes(1);
    expect(mocks.buildOnDemandExternalCardSignal).toHaveBeenCalledWith(
      expect.objectContaining({ id: "1693", currentPrice: 8.49 }),
      { observationRunId: "competitive-run-7" }
    );
    expect(detailProps.signal).toMatchObject({ cardId: "1693", rank: 7 });
    expect(detailProps.priceHistory).toMatchObject({
      modelDate: "2026-07-20T12:00:00.000Z",
    });
  });

  it("keeps an unranked focused analysis available", async () => {
    mocks.getExternalSignalRadarDetailContext.mockResolvedValue({
      generatedAt: "2026-07-20T12:00:00.000Z",
      rank: null,
      runId: "competitive-run-8",
    });

    const result = (await SignalRadarCardPage({
      params: Promise.resolve({ cardId: "1693" }),
      searchParams: Promise.resolve({}),
    })) as ReactElement<{ children: ReactElement<Record<string, unknown>> }>;

    expect(result.props.children.props.signal).toBe(focusedSignal);
  });

  it("reuses the durable ranked signal instead of rebuilding market intelligence", async () => {
    const storedSignal = { ...focusedSignal, rank: 3 };
    mocks.readSignalRadarSnapshot.mockResolvedValue({
      writtenAt: "2026-07-20T12:05:00.000Z",
      data: {
        generatedAt: "2026-07-20T12:04:00.000Z",
        signals: [storedSignal],
        sources: [],
        unmatchedCount: 0,
        scannedDeckCount: 0,
      },
    });

    const result = (await SignalRadarCardPage({
      params: Promise.resolve({ cardId: "1693" }),
      searchParams: Promise.resolve({ game: "pokemon" }),
    })) as ReactElement<{ children: ReactElement<Record<string, unknown>> }>;

    expect(mocks.getExternalSignalRadarDetailContext).not.toHaveBeenCalled();
    expect(mocks.buildOnDemandExternalCardSignal).not.toHaveBeenCalled();
    expect(result.props.children.props.signal).toBe(storedSignal);
    expect(result.props.children.props.priceHistory).toMatchObject({
      modelDate: "2026-07-20T12:04:00.000Z",
    });
  });
});
