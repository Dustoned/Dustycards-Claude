import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  deleteSession: vi.fn(),
  deletePulls: vi.fn(),
  restoreInventory: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "user-1" }),
  authErrorResponse: vi.fn(() => null),
}));

vi.mock("@/lib/db", () => ({
  db: { $transaction: mocks.transaction },
}));

import { DELETE } from "@/app/api/collection/opening-sessions/[id]/route";

function request() {
  return new NextRequest("http://localhost/api/collection/opening-sessions/opening-1", {
    method: "DELETE",
  });
}

function context() {
  return { params: Promise.resolve({ id: "opening-1" }) };
}

describe("DELETE /api/collection/opening-sessions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deletePulls.mockResolvedValue({ count: 2 });
    mocks.restoreInventory.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async (work) => work({
      sealedOpeningSession: {
        findFirst: mocks.findFirst,
        delete: mocks.deleteSession,
      },
      collectionCard: { deleteMany: mocks.deletePulls },
      collectionSealed: { updateMany: mocks.restoreInventory },
    }));
  });

  it("cancels an open session, removes its pulls and restores owned inventory", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "opening-1",
      status: "open",
      collection_sealed_id: "sealed-copy-1",
      _count: { cards: 2 },
    });

    const response = await DELETE(request(), context());

    expect(response.status).toBe(200);
    expect(mocks.deletePulls).toHaveBeenCalledWith({
      where: { opening_session_id: "opening-1", user_id: "user-1" },
    });
    expect(mocks.restoreInventory).toHaveBeenCalledWith({
      where: { id: "sealed-copy-1", user_id: "user-1" },
      data: { quantity: { increment: 1 } },
    });
    await expect(response.json()).resolves.toEqual({
      ok: true,
      action: "cancelled",
      pullsRemoved: 2,
      inventoryRestored: true,
    });
  });

  it("deletes completed history without deleting its collected pulls", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "opening-1",
      status: "closed",
      collection_sealed_id: "sealed-copy-1",
      _count: { cards: 4 },
    });

    const response = await DELETE(request(), context());

    expect(response.status).toBe(200);
    expect(mocks.deletePulls).not.toHaveBeenCalled();
    expect(mocks.restoreInventory).not.toHaveBeenCalled();
    expect(mocks.deleteSession).toHaveBeenCalledWith({ where: { id: "opening-1" } });
    await expect(response.json()).resolves.toEqual({
      ok: true,
      action: "deleted",
      pullsKept: 4,
    });
  });

  it("cancels a catalogue opening without inventing collection inventory", async () => {
    mocks.deletePulls.mockResolvedValueOnce({ count: 0 });
    mocks.findFirst.mockResolvedValue({
      id: "opening-1",
      status: "open",
      collection_sealed_id: null,
      _count: { cards: 0 },
    });

    const response = await DELETE(request(), context());

    expect(response.status).toBe(200);
    expect(mocks.restoreInventory).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      ok: true,
      action: "cancelled",
      pullsRemoved: 0,
      inventoryRestored: false,
    });
  });

  it("does not reveal another user's opening session", async () => {
    mocks.findFirst.mockResolvedValue(null);

    const response = await DELETE(request(), context());

    expect(response.status).toBe(404);
    expect(mocks.deleteSession).not.toHaveBeenCalled();
  });
});
