import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authMock, feedMock } = vi.hoisted(() => ({
  authMock: { isAuthorizedSchedulerRequest: vi.fn() },
  feedMock: {
    refreshSharedSignalRadarChases: vi.fn(),
    refreshSharedSignalRadarSignals: vi.fn(),
  },
}));

vi.mock("@/lib/scheduler-secret", () => authMock);
vi.mock("@/lib/signal-radar-feed-server", () => feedMock);

import { POST } from "@/app/api/internal/warm-signal-radar/route";

describe("Signal Radar warm-up endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.isAuthorizedSchedulerRequest.mockReturnValue(true);
    feedMock.refreshSharedSignalRadarSignals.mockResolvedValue([
      { cardId: "signal-1" },
      { cardId: "signal-2" },
    ]);
    feedMock.refreshSharedSignalRadarChases.mockResolvedValue({
      generatedAt: "2026-07-29T20:00:00.000Z",
      cards: [{ cardId: "chase-1" }],
    });
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
    expect(feedMock.refreshSharedSignalRadarSignals).toHaveBeenCalledWith("all");
    expect(feedMock.refreshSharedSignalRadarChases).toHaveBeenCalledWith({
      gameFilter: "all",
      episodeId: null,
    });
  });

  it("hides the endpoint without the scheduler secret", async () => {
    authMock.isAuthorizedSchedulerRequest.mockReturnValue(false);

    const response = await POST(
      new NextRequest("http://localhost/api/internal/warm-signal-radar", {
        method: "POST",
      })
    );

    expect(response.status).toBe(404);
    expect(feedMock.refreshSharedSignalRadarSignals).not.toHaveBeenCalled();
  });
});
