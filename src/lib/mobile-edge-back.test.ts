import { describe, expect, it } from "vitest";
import {
  MOBILE_EDGE_BACK_EVENT,
  dispatchMobileEdgeBackRequest,
  shouldCaptureMobileEdgeBackGesture,
  shouldCompleteMobileEdgeBackGesture,
} from "./mobile-edge-back";

describe("mobile edge back gesture", () => {
  it("captures only clear rightward horizontal intent", () => {
    expect(
      shouldCaptureMobileEdgeBackGesture({ deltaX: 14, deltaY: 3, elapsedMs: 80 })
    ).toBe(true);
    expect(
      shouldCaptureMobileEdgeBackGesture({ deltaX: 9, deltaY: 1, elapsedMs: 80 })
    ).toBe(false);
    expect(
      shouldCaptureMobileEdgeBackGesture({ deltaX: 20, deltaY: 25, elapsedMs: 80 })
    ).toBe(false);
  });

  it("accepts fast native-like swipes and slow deliberate long swipes", () => {
    expect(
      shouldCompleteMobileEdgeBackGesture({
        deltaX: 82,
        deltaY: 8,
        elapsedMs: 250,
      })
    ).toBe(true);
    expect(
      shouldCompleteMobileEdgeBackGesture({
        deltaX: 150,
        deltaY: 12,
        elapsedMs: 900,
      })
    ).toBe(true);
  });

  it("rejects short, leftward, and vertically ambiguous gestures", () => {
    for (const gesture of [
      { deltaX: 60, deltaY: 2, elapsedMs: 100 },
      { deltaX: -140, deltaY: 2, elapsedMs: 100 },
      { deltaX: 140, deltaY: 100, elapsedMs: 200 },
    ]) {
      expect(shouldCompleteMobileEdgeBackGesture(gesture)).toBe(false);
    }
  });

  it("lets an open surface consume Back without requiring browser history", () => {
    const surface = new EventTarget();
    surface.addEventListener(MOBILE_EDGE_BACK_EVENT, (event) => event.preventDefault());

    expect(dispatchMobileEdgeBackRequest(surface)).toBe(true);
    expect(dispatchMobileEdgeBackRequest(new EventTarget())).toBe(false);
  });
});
