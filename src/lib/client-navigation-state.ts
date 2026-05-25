"use client";

export const DUSTYCARDS_HISTORY_INDEX_KEY = "__dustycardsHistoryIndex";

const SCROLL_POSITION_PREFIX = "dustycards:scroll:";

interface StoredScrollPosition {
  x: number;
  y: number;
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

export function saveCurrentScrollPosition(routeKey = getCurrentRouteKey()): void {
  if (!canUseBrowserStorage()) return;

  try {
    const payload: StoredScrollPosition = {
      x: window.scrollX,
      y: window.scrollY,
    };
    window.sessionStorage.setItem(getScrollStorageKey(routeKey), JSON.stringify(payload));
  } catch {
    // Ignore private-mode/session-storage failures; navigation should still work.
  }
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
