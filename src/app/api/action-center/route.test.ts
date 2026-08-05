import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, dbMock } = vi.hoisted(() => ({
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
    feedback: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => authMock);
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { GET } from "@/app/api/action-center/route";

const pendingAccount = {
  id: "pending-1",
  email: "collector@example.com",
  updated_at: new Date("2026-08-05T10:00:00.000Z"),
};

describe("Action Center account approvals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.authErrorResponse.mockReturnValue(null);
    authMock.requireUser.mockResolvedValue({ id: "admin-1", role: "admin" });
    dbMock.cardPriceAlert.findMany.mockResolvedValue([]);
    dbMock.collectionPriceAlert.findMany.mockResolvedValue([]);
    dbMock.ebayWatchedListing.findMany.mockResolvedValue([]);
    dbMock.externalSignalOutcome.findMany.mockResolvedValue([]);
    dbMock.feedback.findMany.mockResolvedValue([]);
    dbMock.user.findMany.mockResolvedValue([pendingAccount]);
    dbMock.actionCenterReceipt.findMany.mockResolvedValue([]);
  });

  it("shows one admin-only notification linking directly to the pending account", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(dbMock.user.findMany).toHaveBeenCalledWith({
      where: { disabled: true },
      orderBy: { updated_at: "desc" },
      take: 12,
      select: { id: true, email: true, updated_at: true },
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
});
