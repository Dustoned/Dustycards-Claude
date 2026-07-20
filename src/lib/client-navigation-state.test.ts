import { describe, expect, it, vi } from "vitest";
import {
  createDeferredScrollPositionSaver,
  type ScrollPositionSnapshot,
} from "./client-navigation-state";

function createSchedulerHarness(initial: ScrollPositionSnapshot) {
  let current = initial;
  let nextHandle = 1;
  const delays = new Map<number, () => void>();
  const idles = new Map<number, () => void>();
  const persist = vi.fn<(snapshot: ScrollPositionSnapshot) => void>();

  const saver = createDeferredScrollPositionSaver({
    capture: () => ({ ...current }),
    persist,
    setDelay: (callback) => {
      const handle = nextHandle++;
      delays.set(handle, callback);
      return handle;
    },
    clearDelay: (handle) => delays.delete(handle),
    requestIdle: (callback) => {
      const handle = nextHandle++;
      idles.set(handle, callback);
      return handle;
    },
    cancelIdle: (handle) => idles.delete(handle),
  });

  return {
    saver,
    persist,
    delays,
    idles,
    setCurrent(snapshot: ScrollPositionSnapshot) {
      current = snapshot;
    },
    runNextDelay() {
      const entry = delays.entries().next().value as
        | [number, () => void]
        | undefined;
      if (!entry) throw new Error("No delayed callback queued");
      delays.delete(entry[0]);
      entry[1]();
    },
    runNextIdle() {
      const entry = idles.entries().next().value as
        | [number, () => void]
        | undefined;
      if (!entry) throw new Error("No idle callback queued");
      idles.delete(entry[0]);
      entry[1]();
    },
  };
}

describe("deferred scroll-position persistence", () => {
  it("coalesces a scroll burst and persists only the latest position after delay and idle", () => {
    const harness = createSchedulerHarness({ routeKey: "/cards", x: 0, y: 10 });

    harness.saver.schedule();
    harness.setCurrent({ routeKey: "/cards", x: 0, y: 120 });
    harness.saver.schedule();
    harness.setCurrent({ routeKey: "/cards", x: 0, y: 260 });
    harness.saver.schedule();

    expect(harness.delays.size).toBe(1);
    expect(harness.persist).not.toHaveBeenCalled();

    harness.runNextDelay();
    expect(harness.idles.size).toBe(1);
    expect(harness.persist).not.toHaveBeenCalled();

    harness.runNextIdle();
    expect(harness.persist).toHaveBeenCalledTimes(1);
    expect(harness.persist).toHaveBeenLastCalledWith({
      routeKey: "/cards",
      x: 0,
      y: 260,
    });
  });

  it("flushes the current position synchronously and cancels queued work", () => {
    const harness = createSchedulerHarness({ routeKey: "/cards", x: 0, y: 10 });
    harness.saver.schedule();
    harness.setCurrent({ routeKey: "/cards", x: 4, y: 420 });

    harness.saver.flush();

    expect(harness.delays.size).toBe(0);
    expect(harness.idles.size).toBe(0);
    expect(harness.persist).toHaveBeenCalledTimes(1);
    expect(harness.persist).toHaveBeenCalledWith({
      routeKey: "/cards",
      x: 4,
      y: 420,
    });
  });

  it("flushes the pending old route after popstate without recapturing the new URL", () => {
    const harness = createSchedulerHarness({
      routeKey: "/search?q=lugia",
      x: 0,
      y: 880,
    });
    harness.saver.schedule();
    harness.setCurrent({ routeKey: "/cards/42", x: 0, y: 0 });

    harness.saver.flushPending();

    expect(harness.persist).toHaveBeenCalledTimes(1);
    expect(harness.persist).toHaveBeenCalledWith({
      routeKey: "/search?q=lugia",
      x: 0,
      y: 880,
    });
  });

  it("drops pending work when cancelled", () => {
    const harness = createSchedulerHarness({ routeKey: "/cards", x: 0, y: 90 });
    harness.saver.schedule();

    harness.saver.cancel();
    harness.saver.flushPending();

    expect(harness.delays.size).toBe(0);
    expect(harness.idles.size).toBe(0);
    expect(harness.persist).not.toHaveBeenCalled();
  });

  it("persists after the throttle delay when requestIdleCallback is unavailable", () => {
    const persist = vi.fn<(snapshot: ScrollPositionSnapshot) => void>();
    let delayed: (() => void) | null = null;
    const saver = createDeferredScrollPositionSaver({
      capture: () => ({ routeKey: "/mobile", x: 0, y: 315 }),
      persist,
      setDelay: (callback) => {
        delayed = callback;
        return 1;
      },
      clearDelay: () => {
        delayed = null;
      },
    });

    saver.schedule();
    expect(persist).not.toHaveBeenCalled();
    const runDelayed = delayed as (() => void) | null;
    expect(runDelayed).not.toBeNull();
    runDelayed?.();

    expect(persist).toHaveBeenCalledWith({
      routeKey: "/mobile",
      x: 0,
      y: 315,
    });
  });
});
