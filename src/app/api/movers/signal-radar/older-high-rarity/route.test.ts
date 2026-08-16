import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authMock, discoveryMock, quickActionsMock } = vi.hoisted(() => ({
  authMock: { requireUser: vi.fn(), authErrorResponse: vi.fn() },
  discoveryMock: { getOlderHighRarityValueSignals: vi.fn() },
  quickActionsMock: { getCardQuickActionMap: vi.fn() },
}));

vi.mock("@/lib/auth", () => authMock);
vi.mock("@/lib/older-high-rarity-value-server", () => discoveryMock);
vi.mock("@/lib/card-quick-actions-server", () => quickActionsMock);

import { GET } from "@/app/api/movers/signal-radar/older-high-rarity/route";

describe("old high-rarity value Radar feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.requireUser.mockResolvedValue({ id: "user-1" });
    authMock.authErrorResponse.mockReturnValue(null);
    discoveryMock.getOlderHighRarityValueSignals.mockResolvedValue([
      { cardId: "old-card-1" },
      { cardId: "old-card-2" },
    ]);
    quickActionsMock.getCardQuickActionMap.mockResolvedValue({
      "old-card-1": { owned: false },
    });
  });

  it("returns the complete discovery cohort instead of the capped general Radar", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/movers/signal-radar/older-high-rarity"
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=300, stale-while-revalidate=3600"
    );
    expect(quickActionsMock.getCardQuickActionMap).toHaveBeenCalledWith(
      "user-1",
      ["old-card-1", "old-card-2"]
    );
    expect(body.total).toBe(2);
    expect(body.signals).toHaveLength(2);
  });

  it("does not query the cohort for unauthenticated requests", async () => {
    authMock.requireUser.mockRejectedValue(new Error("Authentication required"));
    authMock.authErrorResponse.mockReturnValue(
      Response.json({ error: "Authentication required" }, { status: 401 })
    );

    const response = await GET(
      new NextRequest(
        "http://localhost/api/movers/signal-radar/older-high-rarity"
      )
    );

    expect(response.status).toBe(401);
    expect(discoveryMock.getOlderHighRarityValueSignals).not.toHaveBeenCalled();
  });
});
