import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, dbMock, settingsMock } = vi.hoisted(() => ({
  authMock: {
    authErrorResponse: vi.fn(),
    requireUser: vi.fn(),
  },
  dbMock: {
    actionCenterReceipt: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    cardPriceAlert: { findMany: vi.fn() },
    collectionPriceAlert: { findMany: vi.fn() },
    ebayWatchedListing: { findMany: vi.fn() },
    externalSignalOutcome: { findMany: vi.fn() },
    card: { findMany: vi.fn() },
    feedback: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
  settingsMock: {
    getServerUserSettings: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => authMock);
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/user-settings-server", () => settingsMock);

import { GET } from "@/app/api/action-center/route";

const pendingAccount = {
  id: "pending-1",
  email: "collector@example.com",
  approval_requested_at: new Date("2026-08-05T10:00:00.000Z"),
};

describe("Action Center", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.authErrorResponse.mockReturnValue(null);
    authMock.requireUser.mockResolvedValue({ id: "admin-1", role: "admin" });
    settingsMock.getServerUserSettings.mockResolvedValue({ onePieceLibraryEnabled: true });
    dbMock.cardPriceAlert.findMany.mockResolvedValue([]);
    dbMock.collectionPriceAlert.findMany.mockResolvedValue([]);
    dbMock.ebayWatchedListing.findMany.mockResolvedValue([]);
    dbMock.externalSignalOutcome.findMany.mockResolvedValue([]);
    dbMock.card.findMany.mockResolvedValue([]);
    dbMock.feedback.findMany.mockResolvedValue([]);
    dbMock.user.findMany.mockResolvedValue([pendingAccount]);
    dbMock.actionCenterReceipt.findMany.mockResolvedValue([]);
  });

  it("shows one admin-only notification linking directly to the pending account", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(dbMock.user.findMany).toHaveBeenCalledWith({
      where: { disabled: true, approval_requested_at: { not: null } },
      orderBy: { approval_requested_at: "desc" },
      take: 12,
      select: { id: true, email: true, approval_requested_at: true },
    });
    expect(body).toEqual({
      ok: true,
      count: 1,
      items: [
        {
          id: "account-approval-pending-1-1785924000000",
          kind: "account",
          title: "Account waiting for approval",
          detail: "collector@example.com",
          href: "/account?tab=users&user=pending-1",
          occurredAt: "2026-08-05T10:00:00.000Z",
          tone: "warning",
        },
      ],
    });
  });

  it("keeps a read approval hidden without creating duplicate notifications", async () => {
    dbMock.actionCenterReceipt.findMany.mockResolvedValue([
      { item_key: "account-approval-pending-1-1785924000000" },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(body).toEqual({ ok: true, count: 0, items: [] });
  });

  it("does not expose pending accounts to regular users", async () => {
    authMock.requireUser.mockResolvedValue({ id: "user-1", role: "user" });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(dbMock.user.findMany).not.toHaveBeenCalled();
    expect(body).toEqual({ ok: true, count: 0, items: [] });
  });

  it("links a signal result to the exact shared card detail with its game", async () => {
    dbMock.user.findMany.mockResolvedValue([]);
    dbMock.externalSignalOutcome.findMany.mockResolvedValue([
      {
        id: "outcome-1",
        horizon_days: 30,
        meaningful_direction_hit: false,
        evaluated_at: new Date("2026-08-17T04:00:00.000Z"),
        updated_at: new Date("2026-08-17T04:00:00.000Z"),
        entry_observation: {
          card_id: "one-piece:card-42",
          card_name: "Shanks",
          game: "one-piece",
        },
      },
    ]);
    dbMock.card.findMany.mockResolvedValue([
      { id: "one-piece:card-42", game: "one-piece" },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(dbMock.card.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["one-piece:card-42"] } },
      select: { id: true, game: true },
    });
    expect(body.items).toEqual([
      expect.objectContaining({
        id: "signal-outcome-1",
        kind: "signal",
        href: "/movers/signal-radar/one-piece%3Acard-42?game=one-piece",
      }),
    ]);
  });

  it("does not show dead or disabled-library signal destinations", async () => {
    dbMock.user.findMany.mockResolvedValue([]);
    settingsMock.getServerUserSettings.mockResolvedValue({ onePieceLibraryEnabled: false });
    dbMock.externalSignalOutcome.findMany.mockResolvedValue([
      {
        id: "pokemon-gone",
        horizon_days: 30,
        meaningful_direction_hit: true,
        evaluated_at: new Date("2026-08-17T05:00:00.000Z"),
        updated_at: new Date("2026-08-17T05:00:00.000Z"),
        entry_observation: { card_id: "gone-card", card_name: "Gone", game: "pokemon" },
      },
      {
        id: "one-piece-hidden",
        horizon_days: 30,
        meaningful_direction_hit: false,
        evaluated_at: new Date("2026-08-17T04:00:00.000Z"),
        updated_at: new Date("2026-08-17T04:00:00.000Z"),
        entry_observation: {
          card_id: "one-piece:card-42",
          card_name: "Shanks",
          game: "one-piece",
        },
      },
    ]);
    dbMock.card.findMany.mockResolvedValue([]);

    const response = await GET();
    const body = await response.json();

    expect(dbMock.card.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["gone-card", "one-piece:card-42"] },
        game: { not: "one-piece" },
      },
      select: { id: true, game: true },
    });
    expect(body).toEqual({ ok: true, count: 0, items: [] });
  });
});
