import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authMock, dbMock, rateLimitMock, researchMock, settingsMock } = vi.hoisted(() => ({
  authMock: {
    requireUser: vi.fn(),
    authErrorResponse: vi.fn(),
  },
  dbMock: {
    card: { findUnique: vi.fn() },
  },
  rateLimitMock: {
    consumeRateLimit: vi.fn(),
  },
  researchMock: {
    researchExternalRadarCard: vi.fn(),
  },
  settingsMock: {
    getServerUserSettings: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  requireUser: authMock.requireUser,
  authErrorResponse: authMock.authErrorResponse,
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));

vi.mock("@/lib/rate-limit", () => ({
  consumeRateLimit: rateLimitMock.consumeRateLimit,
}));

vi.mock("@/lib/user-settings-server", () => ({
  getServerUserSettings: settingsMock.getServerUserSettings,
}));

vi.mock("@/lib/external-card-research", () => ({
  ExternalCardResearchError: class ExternalCardResearchError extends Error {
    status: number;

    constructor(message: string, status = 500) {
      super(message);
      this.status = status;
    }
  },
  researchExternalRadarCard: researchMock.researchExternalRadarCard,
}));

import { POST } from "@/app/api/movers/signal-radar/[cardId]/research/route";

function request(cardId = "card-1") {
  return POST(new NextRequest(`http://localhost/api/movers/signal-radar/${cardId}/research`), {
    params: Promise.resolve({ cardId }),
  });
}

describe("signal radar card research API", () => {
  beforeEach(() => {
    authMock.requireUser.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      role: "user",
      disabled: false,
    });
    authMock.authErrorResponse.mockReturnValue(null);
    rateLimitMock.consumeRateLimit.mockReturnValue(false);
    settingsMock.getServerUserSettings.mockResolvedValue({ onePieceLibraryEnabled: true });
    dbMock.card.findUnique.mockResolvedValue({
      id: "card-1",
      game: "pokemon",
      name: "Umbreon ex",
      card_number: "161",
      printed_card_number: "161/131",
      artist: "YASHIRO Nanaco",
      rarity: "Special Illustration Rare",
      episode: { name: "Prismatic Evolutions", code: "PRE" },
    });
    researchMock.researchExternalRadarCard.mockResolvedValue({
      cardId: "card-1",
      generatedAt: "2026-07-13T12:00:00.000Z",
      cached: false,
      provider: "tavily",
      creditsUsed: 3,
      queriesRun: 3,
      results: [],
    });
  });

  it("requires a user and researches the exact persisted card identity", async () => {
    const response = await request();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body).toMatchObject({ ok: true, research: { cardId: "card-1" } });
    expect(authMock.requireUser).toHaveBeenCalledTimes(1);
    expect(rateLimitMock.consumeRateLimit).toHaveBeenCalledWith(
      "external-card-research:user:user-1",
      8,
      60 * 60_000
    );
    expect(researchMock.researchExternalRadarCard).toHaveBeenCalledWith({
      cardId: "card-1",
      game: "pokemon",
      name: "Umbreon ex",
      cardNumber: "161/131",
      episodeName: "Prismatic Evolutions",
      episodeCode: "PRE",
      artist: "YASHIRO Nanaco",
      rarity: "Special Illustration Rare",
    });
  });

  it("returns the authentication response before touching the limiter or database", async () => {
    authMock.requireUser.mockRejectedValue(new Error("Authentication required"));
    authMock.authErrorResponse.mockImplementation((error: unknown) =>
      error instanceof Error && error.message === "Authentication required"
        ? Response.json({ error: error.message }, { status: 401 })
        : null
    );

    const response = await request();

    expect(response.status).toBe(401);
    expect(rateLimitMock.consumeRateLimit).not.toHaveBeenCalled();
    expect(dbMock.card.findUnique).not.toHaveBeenCalled();
    expect(researchMock.researchExternalRadarCard).not.toHaveBeenCalled();
  });

  it("enforces the per-user rate limit before database and provider work", async () => {
    rateLimitMock.consumeRateLimit.mockReturnValue(true);

    const response = await request();
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toContain("Too many card research requests");
    expect(dbMock.card.findUnique).not.toHaveBeenCalled();
    expect(researchMock.researchExternalRadarCard).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown card without invoking research", async () => {
    dbMock.card.findUnique.mockResolvedValue(null);

    const response = await request("missing-card");

    expect(response.status).toBe(404);
    expect(researchMock.researchExternalRadarCard).not.toHaveBeenCalled();
  });

  it("hides One Piece research when the account library is disabled", async () => {
    dbMock.card.findUnique.mockResolvedValue({
      id: "one-piece:1",
      game: "one-piece",
      name: "Nami",
      card_number: "OP01-016",
      printed_card_number: "OP01-016",
      artist: null,
      rarity: "Rare",
      episode: { name: "Romance Dawn", code: "OP01" },
    });
    settingsMock.getServerUserSettings.mockResolvedValue({ onePieceLibraryEnabled: false });

    const response = await request("one-piece:1");

    expect(response.status).toBe(404);
    expect(researchMock.researchExternalRadarCard).not.toHaveBeenCalled();
  });
});
