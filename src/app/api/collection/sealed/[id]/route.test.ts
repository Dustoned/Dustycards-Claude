import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
  createMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({
    id: "user-1",
    email: "user@example.com",
    role: "user",
    disabled: false,
  }),
  authErrorResponse: vi.fn(() => null),
}));

vi.mock("@/lib/db", () => ({
  db: {
    collectionSealed: {
      findFirst: mocks.findFirst,
    },
    $transaction: mocks.transaction,
  },
}));

import { PATCH } from "@/app/api/collection/sealed/[id]/route";

describe("PATCH /api/collection/sealed/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({ id: "sealed-copy-1" });
    mocks.transaction.mockImplementation(
      async (
        work: (tx: {
          collectionSealed: { update: typeof mocks.update };
          collectionSealedTag: {
            deleteMany: typeof mocks.deleteMany;
            createMany: typeof mocks.createMany;
          };
        }) => Promise<void>
      ) =>
        work({
          collectionSealed: { update: mocks.update },
          collectionSealedTag: {
            deleteMany: mocks.deleteMany,
            createMany: mocks.createMany,
          },
        })
    );
  });

  it("updates quantity, price, tags and notes for the user's saved copy", async () => {
    const request = new NextRequest(
      "http://localhost/api/collection/sealed/sealed-copy-1",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity: 2,
          purchasePricePerItem: 125.5,
          tags: "display, long term",
          notes: "Keep sealed",
        }),
      }
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "sealed-copy-1" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "sealed-copy-1", user_id: "user-1" },
      select: { id: true },
    });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "sealed-copy-1" },
      data: {
        quantity: 2,
        purchase_price_per_item: 125.5,
        notes: "Keep sealed",
      },
    });
    expect(mocks.createMany).toHaveBeenCalledWith({
      data: [
        { collection_sealed_id: "sealed-copy-1", label: "display" },
        { collection_sealed_id: "sealed-copy-1", label: "long term" },
      ],
    });
  });

  it("does not update a copy that does not belong to the current user", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const request = new NextRequest(
      "http://localhost/api/collection/sealed/other-copy",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: 1 }),
      }
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "other-copy" }),
    });

    expect(response.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
