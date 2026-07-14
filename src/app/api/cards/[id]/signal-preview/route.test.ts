import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, dbMock, historyMock, signalMock, settingsMock } = vi.hoisted(() => ({
  authMock: {
    requireUser: vi.fn(),
    authErrorResponse: vi.fn(),
  },
  dbMock: {
    card: { findUnique: vi.fn() },
  },
  historyMock: {
    loadLatestSafeEnglishNmPrices: vi.fn(),
  },
  signalMock: {
    buildOnDemandExternalCardSignal: vi.fn(),
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

vi.mock("@/lib/card-market-history", () => ({
  loadLatestSafeEnglishNmPrices: historyMock.loadLatestSafeEnglishNmPrices,
}));

vi.mock("@/lib/external-signal-intelligence", () => ({
  buildOnDemandExternalCardSignal: signalMock.buildOnDemandExternalCardSignal,
}));

vi.mock("@/lib/user-settings-server", () => ({
  getServerUserSettings: settingsMock.getServerUserSettings,
}));

import { GET } from "@/app/api/cards/[id]/signal-preview/route";

describe("GET /api/cards/[id]/signal-preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.requireUser.mockResolvedValue({ id: "user-1" });
    authMock.authErrorResponse.mockReturnValue(null);
    settingsMock.getServerUserSettings.mockResolvedValue({ onePieceLibraryEnabled: true });
    dbMock.card.findUnique.mockResolvedValue({
      id: "card-1",
      game: "pokemon",
      episode_id: "episode-1",
      name: "Eevee",
      image_url: null,
      card_number: "11",
      printed_card_number: "11/53",
      rarity: "Promo",
      cardmarket_id: "cm-1",
      cardmarket_url: "https://www.cardmarket.com/Pokemon/Products?idProduct=1",
      episode: { name: "Wizards Black Star Promos", code: "PR" },
    });
    historyMock.loadLatestSafeEnglishNmPrices.mockResolvedValue(
      new Map([["card-1", { value: 275 }]])
    );
    signalMock.buildOnDemandExternalCardSignal.mockResolvedValue({
      cardId: "card-1",
      externalScore: 60,
    });
  });

  it("uses the shared safe English NM quote for the local preview", async () => {
    const response = await GET(new Request("http://localhost/api/cards/card-1/signal-preview"), {
      params: Promise.resolve({ id: "card-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(dbMock.card.findUnique.mock.calls[0]?.[0]?.select?.prices).toBeUndefined();
    expect(historyMock.loadLatestSafeEnglishNmPrices).toHaveBeenCalledWith([
      expect.objectContaining({ id: "card-1", cardmarketId: "cm-1" }),
    ]);
    expect(signalMock.buildOnDemandExternalCardSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "card-1",
        currentPrice: 275,
      })
    );
    expect(body).toMatchObject({ ok: true, signal: { cardId: "card-1" } });
  });

  it("does not expose One Piece previews when that account library is disabled", async () => {
    dbMock.card.findUnique.mockResolvedValue({
      id: "one-piece:1",
      game: "one-piece",
      episode_id: "episode-op01",
      name: "Nami",
      image_url: null,
      card_number: "OP01-016",
      printed_card_number: "OP01-016",
      rarity: "Rare",
      cardmarket_id: "cm-op-1",
      cardmarket_url: null,
      episode: { name: "Romance Dawn", code: "OP01" },
    });
    settingsMock.getServerUserSettings.mockResolvedValue({ onePieceLibraryEnabled: false });

    const response = await GET(new Request("http://localhost/api/cards/one-piece:1/signal-preview"), {
      params: Promise.resolve({ id: "one-piece:1" }),
    });

    expect(response.status).toBe(404);
    expect(signalMock.buildOnDemandExternalCardSignal).not.toHaveBeenCalled();
  });
});
