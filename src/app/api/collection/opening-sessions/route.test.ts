import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "user-1" }),
  authErrorResponse: vi.fn(() => null),
}));

vi.mock("@/lib/db", () => ({
  db: {
    collectionSealed: { findFirst: mocks.findFirst },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "@/app/api/collection/opening-sessions/route";

describe("POST /api/collection/opening-sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({
      id: "owned-sealed-1",
      product_id: "product-1",
      quantity: 2,
      purchase_price_per_item: 44,
      product: { id: "product-1", name: "Booster Bundle" },
    });
    mocks.create.mockResolvedValue({ id: "opening-1" });
    mocks.transaction.mockImplementation(async (work) => work({
      sealedOpeningSession: { create: mocks.create },
      collectionSealed: { update: mocks.update, delete: mocks.delete },
    }));
  });

  it("starts the session and removes one opened product from sealed inventory", async () => {
    const response = await POST(new NextRequest("http://localhost/api/collection/opening-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionSealedId: "owned-sealed-1", packsOpened: 6 }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        opened_cost_eur: 44,
        packs_opened: 6,
        sealed_product_id: "product-1",
      }),
    }));
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "owned-sealed-1" },
      data: { quantity: { decrement: 1 } },
    });
    await expect(response.json()).resolves.toEqual({ ok: true, id: "opening-1" });
  });

  it("removes the final inventory row while retaining the new session", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "owned-sealed-1",
      product_id: "product-1",
      quantity: 1,
      purchase_price_per_item: 44,
      product: { id: "product-1", name: "Booster Bundle" },
    });

    const response = await POST(new NextRequest("http://localhost/api/collection/opening-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionSealedId: "owned-sealed-1" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.delete).toHaveBeenCalledWith({ where: { id: "owned-sealed-1" } });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
