import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authMock, chaseMock, settingsMock } = vi.hoisted(() => ({
  authMock: { requireUser: vi.fn(), authErrorResponse: vi.fn() },
  chaseMock: { getExpansionChaseRadarData: vi.fn() },
  settingsMock: { getServerUserSettings: vi.fn() },
}));

vi.mock("@/lib/auth", () => authMock);
vi.mock("@/lib/expansion-chase-radar", () => chaseMock);
vi.mock("@/lib/user-settings-server", () => settingsMock);

import { GET } from "@/app/api/movers/signal-radar/chase-watch/route";

describe("Signal Radar Chase Watch refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.requireUser.mockResolvedValue({ id: "user-1" });
    authMock.authErrorResponse.mockReturnValue(null);
    settingsMock.getServerUserSettings.mockResolvedValue({ onePieceLibraryEnabled: true });
    chaseMock.getExpansionChaseRadarData.mockResolvedValue({
      episode: { id: "episode-415" },
      priceWatch: { state: "current" },
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
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(chaseMock.getExpansionChaseRadarData).toHaveBeenCalledWith({
      gameFilter: "one-piece",
      episodeId: "episode-415",
    });
    expect(body).toEqual({
      newReleaseChases: {
        episode: { id: "episode-415" },
        priceWatch: { state: "current" },
      },
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
    expect(chaseMock.getExpansionChaseRadarData).not.toHaveBeenCalled();
  });
});
