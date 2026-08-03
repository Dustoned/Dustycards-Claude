import { describe, expect, it } from "vitest";
import { distributeTotalPurchasePrice } from "@/lib/bulk-purchase-prices";

describe("distributeTotalPurchasePrice", () => {
  it("spreads a total evenly while preserving the exact cent total", () => {
    const prices = distributeTotalPurchasePrice(10, 3);

    expect(prices).toEqual([3.34, 3.33, 3.33]);
    expect(prices.reduce((total, price) => total + Math.round(price * 100), 0)).toBe(1000);
  });

  it("supports zero as an explicit total", () => {
    expect(distributeTotalPurchasePrice(0, 2)).toEqual([0, 0]);
  });

  it("rejects invalid totals and item counts", () => {
    expect(() => distributeTotalPurchasePrice(-1, 2)).toThrow();
    expect(() => distributeTotalPurchasePrice(Number.NaN, 2)).toThrow();
    expect(() => distributeTotalPurchasePrice(10, 0)).toThrow();
  });
});
