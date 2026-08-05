import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "user-1" }),
  authErrorResponse: vi.fn(() => null),
}));

vi.mock("@/lib/db", () => ({
  db: {
    collectionCard: {
      findMany: mocks.findMany,
      update: mocks.update,
      updateMany: mocks.updateMany,
    },
    $transaction: mocks.transaction,
  },
}));

import { DELETE, PATCH, POST } from "@/app/api/collection/cards/sold/route";

describe("POST /api/collection/cards/sold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([{ id: "copy-1" }, { id: "copy-2" }]);
    mocks.update.mockResolvedValue({});
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async (operations: Promise<unknown>[]) => Promise.all(operations));
  });

  it("stores platform and distributes stack price and fees without losing cents", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/collection/cards/sold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemIds: ["copy-1", "copy-2"],
          totalPrice: 100.01,
          feeTotal: 5.01,
          platform: "CardMarket",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: "copy-1" },
      data: expect.objectContaining({
        sale_price: 50.01,
        sale_fee_eur: 2.51,
        sale_platform: "CardMarket",
      }),
    }));
    expect(mocks.update).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: "copy-2" },
      data: expect.objectContaining({
        sale_price: 50,
        sale_fee_eur: 2.5,
        sale_platform: "CardMarket",
      }),
    }));
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      soldTotal: 100.01,
      feeTotal: 5.01,
      netTotal: 95,
    });
  });

  it("rejects negative fees before writing sales", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/collection/cards/sold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemIds: ["copy-1", "copy-2"],
          totalPrice: 100,
          feeTotal: -1,
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("editing sold collection records", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("updates the saved sold price instead of the current market price", async () => {
    const response = await PATCH(
      new NextRequest("http://localhost/api/collection/cards/sold", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: "copy-1",
          salePrice: 44.99,
          feeTotal: 2.5,
          platform: "CardMarket",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "copy-1", user_id: "user-1", sold_at: { not: null } },
      data: {
        sale_price: 44.99,
        sale_fee_eur: 2.5,
        sale_platform: "CardMarket",
      },
    });
  });

  it("restores a mistaken sold entry to the active For Sale list", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost/api/collection/cards/sold", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: ["copy-1"] }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["copy-1"] }, user_id: "user-1", sold_at: { not: null } },
      data: {
        sold_at: null,
        sale_price: null,
        sale_fee_eur: null,
        sale_platform: null,
        for_sale: true,
      },
    });
  });
});
