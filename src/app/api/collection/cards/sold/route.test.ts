import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
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
    },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "@/app/api/collection/cards/sold/route";

describe("POST /api/collection/cards/sold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([{ id: "copy-1" }, { id: "copy-2" }]);
    mocks.update.mockResolvedValue({});
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
