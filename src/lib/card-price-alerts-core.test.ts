import { describe, expect, it } from "vitest";
import {
  roundCardPriceEur,
  shouldTriggerCardPriceAlert,
} from "@/lib/card-price-alerts-core";

describe("card price alert trigger rules", () => {
  it.each([
    [9.99, 10, true],
    [10, 10, false],
    [10.01, 10, false],
    [9.999, 10.001, false],
    [9.994, 10, true],
  ])(
    "uses a strict cent-level drop comparison: current %s, baseline %s",
    (currentPriceEur, baselinePriceEur, expected) => {
      expect(
        shouldTriggerCardPriceAlert({
          enabled: true,
          kind: "drop",
          targetPriceEur: null,
          baselinePriceEur,
          currentPriceEur,
        })
      ).toBe(expected);
    }
  );

  it.each([
    [8.99, 9, true],
    [9, 9, true],
    [9.01, 9, false],
  ])(
    "uses an inclusive target comparison: current %s, target %s",
    (currentPriceEur, targetPriceEur, expected) => {
      expect(
        shouldTriggerCardPriceAlert({
          enabled: true,
          kind: "target",
          targetPriceEur,
          baselinePriceEur: 10,
          currentPriceEur,
        })
      ).toBe(expected);
    }
  );

  it("does not trigger disabled, malformed, or incomplete alerts", () => {
    expect(
      shouldTriggerCardPriceAlert({
        enabled: false,
        kind: "drop",
        targetPriceEur: null,
        baselinePriceEur: 10,
        currentPriceEur: 9,
      })
    ).toBe(false);
    expect(
      shouldTriggerCardPriceAlert({
        enabled: true,
        kind: "drop",
        targetPriceEur: null,
        baselinePriceEur: null,
        currentPriceEur: 9,
      })
    ).toBe(false);
    expect(
      shouldTriggerCardPriceAlert({
        enabled: true,
        kind: "target",
        targetPriceEur: 9,
        baselinePriceEur: null,
        currentPriceEur: 9001,
      })
    ).toBe(false);
    expect(
      shouldTriggerCardPriceAlert({
        enabled: true,
        kind: "unknown",
        targetPriceEur: 9,
        baselinePriceEur: 10,
        currentPriceEur: 8,
      })
    ).toBe(false);
  });

  it("rounds configured and reported prices to cents", () => {
    expect(roundCardPriceEur(10.005)).toBe(10.01);
    expect(roundCardPriceEur(8.999)).toBe(9);
  });
});
