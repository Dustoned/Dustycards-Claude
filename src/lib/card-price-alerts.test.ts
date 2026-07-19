import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, historyMock, mailMock, originMock, settingsMock } = vi.hoisted(() => ({
  dbMock: {
    card: {
      findUnique: vi.fn(),
    },
    cardPriceAlert: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
  historyMock: {
    loadLatestSafeEnglishNmPrices: vi.fn(),
  },
  mailMock: {
    isMailConfigured: vi.fn(),
    sendCardPriceAlertDigest: vi.fn(),
  },
  originMock: {
    getMailPublicOrigin: vi.fn(),
  },
  settingsMock: {
    getServerUserSettings: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/card-market-history", () => ({
  loadLatestSafeEnglishNmPrices: historyMock.loadLatestSafeEnglishNmPrices,
}));
vi.mock("@/lib/mail", () => ({
  isMailConfigured: mailMock.isMailConfigured,
  sendCardPriceAlertDigest: mailMock.sendCardPriceAlertDigest,
}));
vi.mock("@/lib/public-origin", () => ({
  getMailPublicOrigin: originMock.getMailPublicOrigin,
}));
vi.mock("@/lib/user-settings-server", () => ({
  getServerUserSettings: settingsMock.getServerUserSettings,
}));

import {
  saveCardPriceAlertForUser,
  sweepCardPriceAlerts,
} from "@/lib/card-price-alerts";

const now = new Date("2026-07-19T20:00:00.000Z");

function card(id: string, name: string) {
  return {
    id,
    game: "pokemon",
    episode_id: "set-1",
    name,
    card_number: "001",
    printed_card_number: "001/100",
    cardmarket_id: `market-${id}`,
    cardmarket_url: `https://example.test/${id}`,
    episode: { name: "Test Set", code: "TST" },
  };
}

function alert(input: {
  id: string;
  cardId: string;
  name: string;
  kind: "drop" | "target";
  baseline?: number | null;
  target?: number | null;
}) {
  return {
    id: input.id,
    card_id: input.cardId,
    kind: input.kind,
    target_price_eur: input.target ?? null,
    baseline_price_eur: input.baseline ?? null,
    baseline_price_at: now,
    enabled: true,
    triggered_at: null,
    triggered_price_eur: null,
    created_at: now,
    updated_at: now,
    user: { id: "user-1", email: "collector@example.com" },
    card: card(input.cardId, input.name),
  };
}

describe("card price alert service", () => {
  beforeEach(() => {
    dbMock.card.findUnique.mockReset();
    dbMock.cardPriceAlert.findUnique.mockReset();
    dbMock.cardPriceAlert.findMany.mockReset().mockResolvedValue([]);
    dbMock.cardPriceAlert.upsert.mockReset();
    dbMock.cardPriceAlert.updateMany.mockReset().mockResolvedValue({ count: 1 });
    dbMock.cardPriceAlert.deleteMany.mockReset().mockResolvedValue({ count: 1 });
    historyMock.loadLatestSafeEnglishNmPrices.mockReset().mockResolvedValue(new Map());
    mailMock.isMailConfigured.mockReset().mockReturnValue(true);
    mailMock.sendCardPriceAlertDigest.mockReset().mockResolvedValue(undefined);
    originMock.getMailPublicOrigin.mockReset().mockReturnValue("https://dustycards.test");
    settingsMock.getServerUserSettings
      .mockReset()
      .mockResolvedValue({ onePieceLibraryEnabled: true });
  });

  it("groups multiple triggered cards into one email and pauses them after success", async () => {
    dbMock.cardPriceAlert.findMany.mockResolvedValue([
      alert({ id: "alert-1", cardId: "card-1", name: "Pikachu", kind: "drop", baseline: 10 }),
      alert({ id: "alert-2", cardId: "card-2", name: "Eevee", kind: "target", target: 8 }),
    ]);
    historyMock.loadLatestSafeEnglishNmPrices.mockResolvedValue(
      new Map([
        ["card-1", { value: 9.5, fetchedAt: now }],
        ["card-2", { value: 8, fetchedAt: now }],
      ])
    );

    const result = await sweepCardPriceAlerts();

    expect(dbMock.cardPriceAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          enabled: true,
          user: {
            disabled: false,
            email_verified_at: { not: null },
          },
        },
      })
    );
    expect(mailMock.sendCardPriceAlertDigest).toHaveBeenCalledTimes(1);
    expect(mailMock.sendCardPriceAlertDigest).toHaveBeenCalledWith({
      to: "collector@example.com",
      items: [
        expect.objectContaining({
          name: "Pikachu",
          kind: "drop",
          currentPriceEur: 9.5,
        }),
        expect.objectContaining({
          name: "Eevee",
          kind: "target",
          currentPriceEur: 8,
          targetPriceEur: 8,
        }),
      ],
    });
    expect(dbMock.cardPriceAlert.updateMany).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      configured: true,
      checked: 2,
      triggered: 2,
      emailsSent: 1,
      alertsSent: 2,
      errors: [],
    });
  });

  it("does not query or change alerts when SMTP is not configured", async () => {
    mailMock.isMailConfigured.mockReturnValue(false);

    await expect(sweepCardPriceAlerts()).resolves.toEqual({
      configured: false,
      checked: 0,
      triggered: 0,
      emailsSent: 0,
      alertsSent: 0,
      errors: [],
    });
    expect(dbMock.cardPriceAlert.findMany).not.toHaveBeenCalled();
    expect(dbMock.cardPriceAlert.updateMany).not.toHaveBeenCalled();
  });

  it("leaves triggered alerts armed when email delivery fails", async () => {
    dbMock.cardPriceAlert.findMany.mockResolvedValue([
      alert({ id: "alert-1", cardId: "card-1", name: "Pikachu", kind: "drop", baseline: 10 }),
    ]);
    historyMock.loadLatestSafeEnglishNmPrices.mockResolvedValue(
      new Map([["card-1", { value: 9, fetchedAt: now }]])
    );
    mailMock.sendCardPriceAlertDigest.mockRejectedValue(new Error("SMTP unavailable"));

    const result = await sweepCardPriceAlerts();

    expect(dbMock.cardPriceAlert.updateMany).not.toHaveBeenCalled();
    expect(result.emailsSent).toBe(0);
    expect(result.alertsSent).toBe(0);
    expect(result.errors[0]).toContain("SMTP unavailable");
  });

  it("re-arms an existing target alert with a fresh safe-price baseline", async () => {
    const selectedCard = card("card-1", "Pikachu");
    const storedAlert = {
      ...alert({
        id: "alert-1",
        cardId: "card-1",
        name: "Pikachu",
        kind: "target",
        baseline: 10,
        target: 8,
      }),
      target_price_eur: 7.5,
    };
    dbMock.card.findUnique.mockResolvedValue(selectedCard);
    historyMock.loadLatestSafeEnglishNmPrices.mockResolvedValue(
      new Map([["card-1", { value: 10.12, fetchedAt: now }]])
    );
    dbMock.cardPriceAlert.upsert.mockResolvedValue(storedAlert);

    const state = await saveCardPriceAlertForUser({
      cardId: "card-1",
      userId: "user-1",
      kind: "target",
      targetPriceEur: 7.5,
    });

    expect(dbMock.cardPriceAlert.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          kind: "target",
          target_price_eur: 7.5,
          baseline_price_eur: 10.12,
          baseline_price_at: now,
          enabled: true,
          triggered_at: null,
          triggered_price_eur: null,
        }),
      })
    );
    expect(state.alert).toEqual(expect.objectContaining({ enabled: true, targetPriceEur: 7.5 }));
    expect(state.currentPriceEur).toBe(10.12);
  });

  it("rejects a target that has already been reached", async () => {
    dbMock.card.findUnique.mockResolvedValue(card("card-1", "Pikachu"));
    historyMock.loadLatestSafeEnglishNmPrices.mockResolvedValue(
      new Map([["card-1", { value: 10, fetchedAt: now }]])
    );

    await expect(
      saveCardPriceAlertForUser({
        cardId: "card-1",
        userId: "user-1",
        kind: "target",
        targetPriceEur: 10,
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "Target price must be below the current price",
    });
    expect(dbMock.cardPriceAlert.upsert).not.toHaveBeenCalled();
  });
});
