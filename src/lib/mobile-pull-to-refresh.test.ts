import { describe, expect, it } from "vitest";
import {
  advanceMobilePullGesture,
  beginMobilePullGesture,
  cancelMobilePullGesture,
  createIdleMobilePullGesture,
  finishMobilePullGesture,
  MOBILE_PULL_REFRESH_TRIGGER_PX,
} from "./mobile-pull-to-refresh";

describe("mobile pull to refresh gesture", () => {
  it("never arms a gesture that did not start at the page top", () => {
    const ignored = beginMobilePullGesture({ x: 120, y: 300 }, false);
    const moved = advanceMobilePullGesture(ignored, {
      x: 120,
      y: 520,
      touchCount: 1,
      rootAtTop: true,
    });
    expect(moved.state.phase).toBe("idle");
    expect(moved.preventDefault).toBe(false);
    expect(finishMobilePullGesture(moved.state).refresh).toBe(false);
  });

  it("waits for clear vertical intent before taking over scrolling", () => {
    const pending = beginMobilePullGesture({ x: 80, y: 100 }, true);
    const tiny = advanceMobilePullGesture(pending, {
      x: 84,
      y: 108,
      touchCount: 1,
      rootAtTop: true,
    });
    expect(tiny.state.phase).toBe("pending");
    expect(tiny.preventDefault).toBe(false);

    const horizontal = advanceMobilePullGesture(pending, {
      x: 110,
      y: 112,
      touchCount: 1,
      rootAtTop: true,
    });
    expect(horizontal.state.phase).toBe("cancelled");
    expect(horizontal.preventDefault).toBe(false);
  });

  it("cancels upward, multitouch, and no-longer-at-top gestures", () => {
    const pending = beginMobilePullGesture({ x: 80, y: 100 }, true);
    for (const move of [
      { x: 80, y: 80, touchCount: 1, rootAtTop: true },
      { x: 80, y: 130, touchCount: 2, rootAtTop: true },
      { x: 80, y: 130, touchCount: 1, rootAtTop: false },
    ]) {
      const result = advanceMobilePullGesture(pending, move);
      expect(result.state.phase).toBe("cancelled");
      expect(result.preventDefault).toBe(false);
      expect(finishMobilePullGesture(result.state).refresh).toBe(false);
    }
  });

  it("refreshes once only when the current pull reaches the threshold", () => {
    const pending = beginMobilePullGesture({ x: 80, y: 100 }, true);
    const short = advanceMobilePullGesture(pending, {
      x: 82,
      y: 100 + MOBILE_PULL_REFRESH_TRIGGER_PX,
      touchCount: 1,
      rootAtTop: true,
    });
    expect(short.preventDefault).toBe(true);
    expect(finishMobilePullGesture(short.state).refresh).toBe(false);

    const ready = advanceMobilePullGesture(pending, {
      x: 82,
      y: 101 + MOBILE_PULL_REFRESH_TRIGGER_PX * 2.4,
      touchCount: 1,
      rootAtTop: true,
    });
    const finished = finishMobilePullGesture(ready.state);
    expect(finished.refresh).toBe(true);
    expect(finishMobilePullGesture(finished.state).refresh).toBe(false);
  });

  it("keeps cancellation sticky until the next touchstart", () => {
    const pending = beginMobilePullGesture({ x: 80, y: 100 }, true);
    const cancelled = advanceMobilePullGesture(pending, {
      x: 150,
      y: 108,
      touchCount: 1,
      rootAtTop: true,
    }).state;
    const laterVertical = advanceMobilePullGesture(cancelled, {
      x: 80,
      y: 400,
      touchCount: 1,
      rootAtTop: true,
    });
    expect(laterVertical.state.phase).toBe("cancelled");
    expect(laterVertical.preventDefault).toBe(false);
    expect(createIdleMobilePullGesture().phase).toBe("idle");
  });

  it("cancels on a second-finger touchstart even without a following touchmove", () => {
    const pending = beginMobilePullGesture({ x: 80, y: 100 }, true);
    const ready = advanceMobilePullGesture(pending, {
      x: 80,
      y: 100 + MOBILE_PULL_REFRESH_TRIGGER_PX * 2.4,
      touchCount: 1,
      rootAtTop: true,
    }).state;
    expect(ready.phase).toBe("pulling");

    // A second touchstart arrives before any further touchmove.
    const cancelled = cancelMobilePullGesture(ready);
    expect(cancelled.phase).toBe("cancelled");
    expect(cancelled.pullPx).toBe(0);

    // Lifting one finger must keep cancellation sticky until every touch is gone.
    const firstTouchEnd = finishMobilePullGesture(cancelled, 1);
    expect(firstTouchEnd.refresh).toBe(false);
    expect(firstTouchEnd.state.phase).toBe("cancelled");

    const finalTouchEnd = finishMobilePullGesture(firstTouchEnd.state, 0);
    expect(finalTouchEnd.refresh).toBe(false);
    expect(finalTouchEnd.state.phase).toBe("idle");
  });
});
