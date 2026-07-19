import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authMock, priceAlertMock, PriceAlertErrorMock } = vi.hoisted(() => {
  class PriceAlertError extends Error {
    status: number;

    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  }

  return {
    PriceAlertErrorMock: PriceAlertError,
    authMock: {
      requireUser: vi.fn(),
      authErrorResponse: vi.fn(),
    },
    priceAlertMock: {
      getCardPriceAlertState: vi.fn(),
      saveCardPriceAlertForUser: vi.fn(),
      deleteCardPriceAlertForUser: vi.fn(),
    },
  };
});

vi.mock("@/lib/auth", () => ({
  requireUser: authMock.requireUser,
  authErrorResponse: authMock.authErrorResponse,
}));
vi.mock("@/lib/card-price-alerts", () => ({
  CardPriceAlertError: PriceAlertErrorMock,
  getCardPriceAlertState: priceAlertMock.getCardPriceAlertState,
  saveCardPriceAlertForUser: priceAlertMock.saveCardPriceAlertForUser,
  deleteCardPriceAlertForUser: priceAlertMock.deleteCardPriceAlertForUser,
}));

import { DELETE, GET, PUT } from "@/app/api/cards/[id]/price-alert/route";

const emptyState = {
  ok: true,
  alert: null,
  currentPriceEur: 12.34,
  currentPriceAt: "2026-07-19T20:00:00.000Z",
  mailConfigured: true,
};

describe("/api/cards/[id]/price-alert", () => {
  beforeEach(() => {
    authMock.requireUser.mockReset().mockResolvedValue({ id: "user-1" });
    authMock.authErrorResponse.mockReset().mockReturnValue(null);
    priceAlertMock.getCardPriceAlertState.mockReset().mockResolvedValue(emptyState);
    priceAlertMock.saveCardPriceAlertForUser.mockReset().mockResolvedValue(emptyState);
    priceAlertMock.deleteCardPriceAlertForUser.mockReset().mockResolvedValue(emptyState);
  });

  it("returns the current alert state for the authenticated user", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/cards/card-1/price-alert"),
      { params: Promise.resolve({ id: "card-1" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(emptyState);
    expect(priceAlertMock.getCardPriceAlertState).toHaveBeenCalledWith("card-1", "user-1");
  });

  it("passes a target rule to the service", async () => {
    const response = await PUT(
      new NextRequest("http://localhost:3000/api/cards/card-1/price-alert", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "target", targetPriceEur: 9.5 }),
      }),
      { params: Promise.resolve({ id: "card-1" }) }
    );

    expect(response.status).toBe(200);
    expect(priceAlertMock.saveCardPriceAlertForUser).toHaveBeenCalledWith({
      cardId: "card-1",
      userId: "user-1",
      kind: "target",
      targetPriceEur: 9.5,
    });
  });

  it("deletes only the authenticated user's alert", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/cards/card-1/price-alert", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "card-1" }) }
    );

    expect(response.status).toBe(200);
    expect(priceAlertMock.deleteCardPriceAlertForUser).toHaveBeenCalledWith(
      "card-1",
      "user-1"
    );
  });

  it("returns a useful client error from the alert service", async () => {
    priceAlertMock.saveCardPriceAlertForUser.mockRejectedValue(
      new PriceAlertErrorMock("Target price must be below the current price", 400)
    );

    const response = await PUT(
      new NextRequest("http://localhost:3000/api/cards/card-1/price-alert", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "target", targetPriceEur: 15 }),
      }),
      { params: Promise.resolve({ id: "card-1" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Target price must be below the current price",
    });
  });

  it("rejects malformed JSON before calling the service", async () => {
    const response = await PUT(
      new NextRequest("http://localhost:3000/api/cards/card-1/price-alert", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{not-json",
      }),
      { params: Promise.resolve({ id: "card-1" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Malformed JSON body" });
    expect(priceAlertMock.saveCardPriceAlertForUser).not.toHaveBeenCalled();
  });
});
