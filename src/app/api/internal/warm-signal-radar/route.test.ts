import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authMock, feedMock, sealedRadarMock } = vi.hoisted(() => ({
  authMock: { isAuthorizedSchedulerRequest: vi.fn() },
  feedMock: {
    getSharedSignalRadarFeedData: vi.fn(),
  },
  sealedRadarMock: {
    refreshSharedSealedSignalRadarData: vi.fn(),
  },
}));

vi.mock("@/lib/scheduler-secret", () => authMock);
vi.mock("@/lib/signal-radar-feed-server", () => feedMock);
vi.mock("@/lib/sealed-signal-radar-server", () => sealedRadarMock);

import { POST } from "@/app/api/internal/warm-signal-radar/route";

describe("Signal Radar warm-up endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.isAuthorizedSchedulerRequest.mockReturnValue(true);
    feedMock.getSharedSignalRadarFeedData.mockResolvedValue({
      signals: [{ cardId: "signal-1" }, { cardId: "signal-2" }],
      newReleaseChases: {
        generatedAt: "2026-07-29T20:00:00.000Z",
        cards: [{ cardId: "chase-1" }],
      },
    });
    sealedRadarMock.refreshSharedSealedSignalRadarData.mockResolvedValue({ items: [] });
  });

  it("warms both independent Radar paths", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/internal/warm-signal-radar", {
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      signals: 2,
      chaseCards: 1,
    });
    expect(feedMock.getSharedSignalRadarFeedData).toHaveBeenCalledWith(
      { gameFilter: "all", episodeId: null },
      { refreshStaleChases: false }
    );
    expect(sealedRadarMock.refreshSharedSealedSignalRadarData.mock.calls.map(([game]) => game))
      .toEqual(["all", "pokemon", "one-piece"]);
  });

  it("hides the endpoint without the scheduler secret", async () => {
    authMock.isAuthorizedSchedulerRequest.mockReturnValue(false);

    const response = await POST(
      new NextRequest("http://localhost/api/internal/warm-signal-radar", {
        method: "POST",
      })
    );

    expect(response.status).toBe(404);
    expect(feedMock.getSharedSignalRadarFeedData).not.toHaveBeenCalled();
    expect(sealedRadarMock.refreshSharedSealedSignalRadarData).not.toHaveBeenCalled();
  });
});
