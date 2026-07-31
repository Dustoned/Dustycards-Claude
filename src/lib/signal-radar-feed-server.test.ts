import { beforeEach, describe, expect, it, vi } from "vitest";

const { chaseMock, enrichMock, persistedMock, snapshotMock } = vi.hoisted(() => ({
  chaseMock: { getExpansionChaseRadarData: vi.fn() },
  enrichMock: { enrichExternalSignalRadarData: vi.fn() },
  persistedMock: { getExternalSignalRadarPageData: vi.fn() },
  snapshotMock: {
    readSignalRadarChaseSnapshot: vi.fn(),
    readSignalRadarSnapshot: vi.fn(),
    writeSignalRadarChaseSnapshot: vi.fn(),
    writeSignalRadarSnapshots: vi.fn(),
  },
}));

vi.mock("@/lib/expansion-chase-radar", () => chaseMock);
vi.mock("@/lib/external-signal-intelligence", () => enrichMock);
vi.mock("@/lib/external-signal-persisted", () => persistedMock);
vi.mock("@/lib/signal-radar-snapshot-store", () => snapshotMock);

import {
  clearSharedSignalRadarFeedCache,
  getSharedSignalRadarFeedData,
} from "@/lib/signal-radar-feed-server";

describe("shared Signal Radar feed cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSharedSignalRadarFeedCache();
    snapshotMock.readSignalRadarChaseSnapshot.mockResolvedValue(null);
    snapshotMock.readSignalRadarSnapshot.mockResolvedValue(null);
    snapshotMock.writeSignalRadarChaseSnapshot.mockResolvedValue(undefined);
    snapshotMock.writeSignalRadarSnapshots.mockResolvedValue(undefined);
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

  it("serves the durable snapshot without recalculating market intelligence", async () => {
    const snapshotSignals = [{ cardId: "snapshot-card" }];
    snapshotMock.readSignalRadarSnapshot.mockResolvedValue({
      writtenAt: "2026-07-29T20:00:00.000Z",
      data: { signals: snapshotSignals },
    });

    const result = await getSharedSignalRadarFeedData({
      gameFilter: "pokemon",
      episodeId: null,
    });

    expect(result.signals).toBe(snapshotSignals);
    expect(persistedMock.getExternalSignalRadarPageData).not.toHaveBeenCalled();
    expect(enrichMock.enrichExternalSignalRadarData).not.toHaveBeenCalled();
  });

  it("serves a durable Chase Watch snapshot without recalculating the set", async () => {
    const chaseSnapshot = {
      generatedAt: "2026-07-29T20:00:00.000Z",
      cards: [{ cardId: "snapshot-chase" }],
    };
    snapshotMock.readSignalRadarChaseSnapshot.mockResolvedValue({
      writtenAt: new Date().toISOString(),
      data: chaseSnapshot,
    });

    const result = await getSharedSignalRadarFeedData({
      gameFilter: "pokemon",
      episodeId: "set-a",
    });

    expect(result.newReleaseChases).toBe(chaseSnapshot);
    expect(chaseMock.getExpansionChaseRadarData).not.toHaveBeenCalled();
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
