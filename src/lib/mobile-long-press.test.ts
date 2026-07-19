import { describe, expect, it } from "vitest";
import {
  hasMobileLongPressMoved,
  MOBILE_LONG_PRESS_MOVE_CANCEL_DISTANCE,
  MOBILE_LONG_PRESS_MS,
} from "./mobile-long-press";

describe("mobile long press interaction", () => {
  it("shares the established mobile hold timing", () => {
    expect(MOBILE_LONG_PRESS_MS).toBe(420);
    expect(MOBILE_LONG_PRESS_MOVE_CANCEL_DISTANCE).toBe(10);
  });

  it("cancels only after movement exceeds the shared tolerance", () => {
    expect(hasMobileLongPressMoved({ x: 10, y: 10 }, { x: 16, y: 18 })).toBe(false);
    expect(hasMobileLongPressMoved({ x: 10, y: 10 }, { x: 10, y: 20.01 })).toBe(true);
  });
});
