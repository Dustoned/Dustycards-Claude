"use client";

export const DUSTYCARDS_HISTORY_INDEX_KEY = "__dustycardsHistoryIndex";

const SCROLL_POSITION_PREFIX = "dustycards:scroll:";

export interface StoredScrollPosition {
  x: number;
  y: number;
}

export interface ScrollPositionSnapshot extends StoredScrollPosition {
  routeKey: string;
}

interface DeferredScrollPositionSaverOptions {
  capture: () => ScrollPositionSnapshot;
  persist: (snapshot: ScrollPositionSnapshot) => void;
  setDelay: (callback: () => void, delayMs: number) => number;
  clearDelay: (handle: number) => void;
  requestIdle?: (callback: () => void, timeoutMs: number) => number;
  cancelIdle?: (handle: number) => void;
  delayMs?: number;
  idleTimeoutMs?: number;
}

export interface DeferredScrollPositionSaver {
  schedule: () => void;
  flush: () => void;
  flushPending: () => void;
  cancel: () => void;
}

function canUseBrowserStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function getCurrentRouteKey(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

function getScrollStorageKey(routeKey: string): string {
  return `${SCROLL_POSITION_PREFIX}${routeKey}`;
}

export function captureCurrentScrollPosition(
  routeKey = getCurrentRouteKey()
): ScrollPositionSnapshot {
  return {
    routeKey,
    x: window.scrollX,
    y: window.scrollY,
  };
}

export function saveScrollPositionSnapshot(snapshot: ScrollPositionSnapshot): void {
  if (!canUseBrowserStorage()) return;

  try {
    const payload: StoredScrollPosition = {
      x: snapshot.x,
      y: snapshot.y,
    };
    window.sessionStorage.setItem(
      getScrollStorageKey(snapshot.routeKey),
      JSON.stringify(payload)
    );
  } catch {
    // Ignore private-mode/session-storage failures; navigation should still work.
  }
}

export function saveCurrentScrollPosition(routeKey = getCurrentRouteKey()): void {
  if (!canUseBrowserStorage()) return;
  saveScrollPositionSnapshot(captureCurrentScrollPosition(routeKey));
}

/**
 * Keeps high-frequency scroll events in memory and persists only after a short
 * quiet period (preferably during idle time). `flushPending` deliberately does
 * not capture again, which lets popstate save the route that was active before
 * the browser changed the URL.
 */
export function createDeferredScrollPositionSaver({
  capture,
  persist,
  setDelay,
  clearDelay,
  requestIdle,
  cancelIdle,
  delayMs = 240,
  idleTimeoutMs = 500,
}: DeferredScrollPositionSaverOptions): DeferredScrollPositionSaver {
  let pending: ScrollPositionSnapshot | null = null;
  let delayHandle: number | null = null;
  let idleHandle: number | null = null;

  const cancelScheduledWork = () => {
    if (delayHandle != null) {
      clearDelay(delayHandle);
      delayHandle = null;
    }
    if (idleHandle != null) {
      cancelIdle?.(idleHandle);
      idleHandle = null;
    }
  };

  const persistPending = () => {
    const snapshot = pending;
    pending = null;
    if (snapshot) persist(snapshot);
  };

  const queueIdleSave = () => {
    delayHandle = null;
    if (!pending) return;

    if (requestIdle) {
      idleHandle = requestIdle(() => {
        idleHandle = null;
        persistPending();
      }, idleTimeoutMs);
      return;
    }

    persistPending();
  };

  return {
    schedule() {
      pending = capture();
      if (delayHandle != null || idleHandle != null) return;
      delayHandle = setDelay(queueIdleSave, delayMs);
    },
    flush() {
      pending = capture();
      cancelScheduledWork();
      persistPending();
    },
    flushPending() {
      cancelScheduledWork();
      persistPending();
    },
    cancel() {
      cancelScheduledWork();
      pending = null;
    },
  };
}

export function readSavedScrollPosition(routeKey: string): StoredScrollPosition | null {
  if (!canUseBrowserStorage()) return null;

  try {
    const raw = window.sessionStorage.getItem(getScrollStorageKey(routeKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredScrollPosition>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      !Number.isFinite(parsed.x) ||
      !Number.isFinite(parsed.y)
    ) {
      return null;
    }

    return {
      x: Math.max(0, parsed.x),
      y: Math.max(0, parsed.y),
    };
  } catch {
    return null;
  }
}

export function getDustyHistoryIndex(): number {
  if (typeof window === "undefined") return 0;
  const state = window.history.state as Record<string, unknown> | null;
  const index = state?.[DUSTYCARDS_HISTORY_INDEX_KEY];
  return typeof index === "number" && Number.isFinite(index) ? index : 0;
}
