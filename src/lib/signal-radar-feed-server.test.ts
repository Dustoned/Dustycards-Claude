import { beforeEach, describe, expect, it, vi } from "vitest";

const { chaseMock, enrichMock, persistedMock } = vi.hoisted(() => ({
  chaseMock: { getExpansionChaseRadarData: vi.fn() },
  enrichMock: { enrichExternalSignalRadarData: vi.fn() },
  persistedMock: { getExternalSignalRadarPageData: vi.fn() },
}));

vi.mock("@/lib/expansion-chase-radar", () => chaseMock);
vi.mock("@/lib/external-signal-intelligence", () => enrichMock);
vi.mock("@/lib/external-signal-persisted", () => persistedMock);

import {
  clearSharedSignalRadarFeedCache,
  getSharedSignalRadarFeedData,
} from "@/lib/signal-radar-feed-server";

describe("shared Signal Radar feed cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSharedSignalRadarFeedCache();
    persistedMock.getExternalSignalRadarPageData.mockResolvedValue({
      signals: [{ cardId: "persisted-card" }],
    });
    enrichMock.enrichExternalSignalRadarData.mockResolvedValue({
      signals: [{ cardId: "enriched-card" }],
    });
    chaseMock.getExpansionChaseRadarData.mockResolvedValue({
      cards: [{ cardId: "chase-card" }],
    });
  });

  it("deduplicates the expensive enrichment for identical feed requests", async () => {
    const options = { gameFilter: "pokemon" as const, episodeId: null };

    const first = await getSharedSignalRadarFeedData(options);
    const second = await getSharedSignalRadarFeedData(options);

    expect(second.signals).toBe(first.signals);
    expect(second.newReleaseChases).toBe(first.newReleaseChases);
    expect(persistedMock.getExternalSignalRadarPageData).toHaveBeenCalledTimes(1);
    expect(enrichMock.enrichExternalSignalRadarData).toHaveBeenCalledTimes(1);
    expect(chaseMock.getExpansionChaseRadarData).toHaveBeenCalledTimes(1);
  });

  it("reuses general signals while keeping set-specific chase entries separate", async () => {
    await getSharedSignalRadarFeedData({
      gameFilter: "pokemon",
      episodeId: "set-a",
    });
    await getSharedSignalRadarFeedData({
      gameFilter: "pokemon",
      episodeId: "set-b",
    });

    expect(enrichMock.enrichExternalSignalRadarData).toHaveBeenCalledTimes(1);
    expect(chaseMock.getExpansionChaseRadarData).toHaveBeenCalledTimes(2);
  });
});
