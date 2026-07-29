import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authMock, feedMock, quickActionsMock, settingsMock } =
  vi.hoisted(() => ({
    authMock: { requireUser: vi.fn(), authErrorResponse: vi.fn() },
    feedMock: { getSharedSignalRadarFeedData: vi.fn() },
    quickActionsMock: { getCardQuickActionMap: vi.fn() },
    settingsMock: { getServerUserSettings: vi.fn() },
  }));

vi.mock("@/lib/auth", () => authMock);
vi.mock("@/lib/card-quick-actions-server", () => quickActionsMock);
vi.mock("@/lib/signal-radar-feed-server", () => feedMock);
vi.mock("@/lib/user-settings-server", () => settingsMock);

import { GET } from "@/app/api/movers/signal-radar/feed/route";

describe("progressive Signal Radar feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.requireUser.mockResolvedValue({ id: "user-1" });
    authMock.authErrorResponse.mockReturnValue(null);
    settingsMock.getServerUserSettings.mockResolvedValue({ onePieceLibraryEnabled: true });
    feedMock.getSharedSignalRadarFeedData.mockResolvedValue({
      signals: [{ cardId: "signal-card" }],
      newReleaseChases: {
        cards: [{ cardId: "chase-card" }],
      },
    });
    quickActionsMock.getCardQuickActionMap.mockResolvedValue({});
  });

  it("uses persisted radar data and honors game and set for the deferred chase read", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/movers/signal-radar/feed?game=one-piece&set=episode-415"
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=60, stale-while-revalidate=300"
    );
    expect(response.headers.get("Vary")).toContain("Cookie");
    expect(response.headers.get("Vary")).toContain("Accept-Encoding");
    expect(feedMock.getSharedSignalRadarFeedData).toHaveBeenCalledWith({
      gameFilter: "one-piece",
      episodeId: "episode-415",
    });
    expect(quickActionsMock.getCardQuickActionMap).toHaveBeenCalledWith("user-1", [
      "signal-card",
      "chase-card",
    ]);
    expect(body.newReleaseChases.cards[0].cardId).toBe("chase-card");
  });

  it("returns the authentication response before loading the feed", async () => {
    authMock.requireUser.mockRejectedValue(new Error("Authentication required"));
    authMock.authErrorResponse.mockReturnValue(
      Response.json({ error: "Authentication required" }, { status: 401 })
    );

    const response = await GET(
      new NextRequest("http://localhost/api/movers/signal-radar/feed")
    );

    expect(response.status).toBe(401);
    expect(feedMock.getSharedSignalRadarFeedData).not.toHaveBeenCalled();
  });
});
