import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authMock, chaseMock, quickActionsMock, settingsMock, refreshMock } = vi.hoisted(() => ({
  authMock: { requireUser: vi.fn(), requireAdmin: vi.fn(), authErrorResponse: vi.fn() },
  chaseMock: {
    getSharedSignalRadarChases: vi.fn(),
    refreshSharedSignalRadarChases: vi.fn(),
  },
  quickActionsMock: { getCardQuickActionMap: vi.fn() },
  settingsMock: { getServerUserSettings: vi.fn() },
  refreshMock: { refreshNewReleaseChasePriceNow: vi.fn() },
}));

vi.mock("@/lib/auth", () => authMock);
vi.mock("@/lib/card-quick-actions-server", () => quickActionsMock);
vi.mock("@/lib/signal-radar-feed-server", () => chaseMock);
vi.mock("@/lib/user-settings-server", () => settingsMock);
vi.mock("@/lib/sync/new-release-chase-price-job", () => refreshMock);

import { GET, POST } from "@/app/api/movers/signal-radar/chase-watch/route";

describe("Signal Radar Chase Watch refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.requireUser.mockResolvedValue({ id: "user-1" });
    authMock.requireAdmin.mockResolvedValue({ id: "admin-1", role: "admin" });
    authMock.authErrorResponse.mockReturnValue(null);
    settingsMock.getServerUserSettings.mockResolvedValue({ onePieceLibraryEnabled: true });
    chaseMock.getSharedSignalRadarChases.mockResolvedValue({
      episode: { id: "episode-415" },
      priceWatch: { state: "current" },
      cards: [{ cardId: "chase-card" }],
    });
    chaseMock.refreshSharedSignalRadarChases.mockResolvedValue({
      episode: { id: "episode-415" },
      priceWatch: { state: "current" },
      cards: [{ cardId: "chase-card" }],
    });
    quickActionsMock.getCardQuickActionMap.mockResolvedValue({});
    refreshMock.refreshNewReleaseChasePriceNow.mockResolvedValue({
      cardId: "card-1",
      status: "updated",
      creditsUsed: 5,
      error: null,
    });
  });

  it("returns only the current set-scoped chase payload without loading the full feed", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/movers/signal-radar/chase-watch?game=one-piece&set=episode-415"
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=60, stale-while-revalidate=300"
    );
    expect(chaseMock.getSharedSignalRadarChases).toHaveBeenCalledWith({
      gameFilter: "one-piece",
      episodeId: "episode-415",
    });
    expect(quickActionsMock.getCardQuickActionMap).toHaveBeenCalledWith("user-1", [
      "chase-card",
    ]);
    expect(body).toEqual({
      newReleaseChases: {
        episode: { id: "episode-415" },
        priceWatch: { state: "current" },
        cards: [{ cardId: "chase-card" }],
      },
      cardQuickActions: {},
    });
  });

  it("returns the authentication response before loading Chase Watch", async () => {
    authMock.requireUser.mockRejectedValue(new Error("Authentication required"));
    authMock.authErrorResponse.mockReturnValue(
      Response.json({ error: "Authentication required" }, { status: 401 })
    );

    const response = await GET(
      new NextRequest("http://localhost/api/movers/signal-radar/chase-watch")
    );

    expect(response.status).toBe(401);
    expect(chaseMock.getSharedSignalRadarChases).not.toHaveBeenCalled();
  });

  it("lets an admin manually refresh one card and returns the updated panel", async () => {
    const response = await POST(
      new NextRequest(
        "http://localhost/api/movers/signal-radar/chase-watch?game=pokemon&set=episode-415",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: "card-1" }),
        }
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(authMock.requireAdmin).toHaveBeenCalledOnce();
    expect(refreshMock.refreshNewReleaseChasePriceNow).toHaveBeenCalledWith("card-1");
    expect(chaseMock.refreshSharedSignalRadarChases).toHaveBeenCalledWith({
      gameFilter: "pokemon",
      episodeId: "episode-415",
    });
    expect(body.ok).toBe(true);
    expect(body.result.status).toBe("updated");
  });

  it("rejects manual refreshes from non-admin users", async () => {
    authMock.requireAdmin.mockRejectedValue(new Error("Forbidden"));
    authMock.authErrorResponse.mockReturnValue(
      Response.json({ error: "Forbidden" }, { status: 403 })
    );

    const response = await POST(
      new NextRequest("http://localhost/api/movers/signal-radar/chase-watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: "card-1" }),
      })
    );

    expect(response.status).toBe(403);
    expect(refreshMock.refreshNewReleaseChasePriceNow).not.toHaveBeenCalled();
  });
});
