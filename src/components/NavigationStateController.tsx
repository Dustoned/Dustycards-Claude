"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  DUSTYCARDS_HISTORY_INDEX_KEY,
  getCurrentRouteKey,
  readSavedScrollPosition,
  saveCurrentScrollPosition,
} from "@/lib/client-navigation-state";

const HISTORY_INDEX_STORAGE_KEY = "dustycards:history-index";
const PENDING_RESTORE_STORAGE_KEY = "dustycards:pending-scroll-restore";
const RESTORE_ATTEMPTS = 56;

function isStateObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function withHistoryIndex(state: unknown, index: number): Record<string, unknown> {
  return {
    ...(isStateObject(state) ? state : {}),
    [DUSTYCARDS_HISTORY_INDEX_KEY]: index,
  };
}

function writeStoredHistoryIndex(index: number) {
  try {
    window.sessionStorage.setItem(HISTORY_INDEX_STORAGE_KEY, String(index));
  } catch {
    // Session storage can fail in private contexts.
  }
}

function markPendingRestore(routeKey = getCurrentRouteKey()) {
  try {
    window.sessionStorage.setItem(PENDING_RESTORE_STORAGE_KEY, routeKey);
  } catch {
    // Best effort only.
  }
}

function takePendingRestore(routeKey: string): boolean {
  try {
    const pending = window.sessionStorage.getItem(PENDING_RESTORE_STORAGE_KEY);
    if (pending !== routeKey) return false;
    window.sessionStorage.removeItem(PENDING_RESTORE_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function restoreScrollPosition(routeKey: string) {
  const position = readSavedScrollPosition(routeKey);
  if (!position) return;

  let attempts = 0;
  const { documentElement } = document;
  documentElement.dataset.restoringScroll = "true";

  const applyRestore = () => {
    const maxY = Math.max(0, documentElement.scrollHeight - window.innerHeight);
    const top = Math.min(position.y, maxY);
    window.scrollTo({ left: position.x, top, behavior: "auto" });
  };

  const tick = () => {
    attempts += 1;
    const maxY = Math.max(0, documentElement.scrollHeight - window.innerHeight);

    if (position.y <= maxY + 8 || attempts >= RESTORE_ATTEMPTS) {
      applyRestore();
      window.setTimeout(applyRestore, 80);
      window.setTimeout(applyRestore, 260);
      window.setTimeout(() => {
        applyRestore();
        delete documentElement.dataset.restoringScroll;
      }, 700);
      return;
    }

    window.requestAnimationFrame(tick);
  };

  window.requestAnimationFrame(tick);
}

export default function NavigationStateController() {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const routeKey = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    let currentIndex =
      typeof window.history.state?.[DUSTYCARDS_HISTORY_INDEX_KEY] === "number"
        ? window.history.state[DUSTYCARDS_HISTORY_INDEX_KEY]
        : 0;
    writeStoredHistoryIndex(currentIndex);

    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);

    originalReplaceState(withHistoryIndex(window.history.state, currentIndex), "", window.location.href);

    window.history.pushState = (state, title, url) => {
      saveCurrentScrollPosition();
      currentIndex += 1;
      writeStoredHistoryIndex(currentIndex);
      return originalPushState(withHistoryIndex(state, currentIndex), title, url);
    };

    window.history.replaceState = (state, title, url) => {
      const nextIndex =
        isStateObject(state) && typeof state[DUSTYCARDS_HISTORY_INDEX_KEY] === "number"
          ? state[DUSTYCARDS_HISTORY_INDEX_KEY]
          : currentIndex;
      currentIndex = nextIndex;
      writeStoredHistoryIndex(currentIndex);
      return originalReplaceState(withHistoryIndex(state, currentIndex), title, url);
    };

    let scrollFrame = 0;
    const saveSoon = () => {
      if (scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0;
        saveCurrentScrollPosition();
      });
    };

    const handleDocumentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.altKey ||
        event.ctrlKey ||
        event.shiftKey
      ) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target || anchor.hasAttribute("download")) return;

      try {
        const url = new URL(anchor.href);
        if (url.origin === window.location.origin) {
          saveCurrentScrollPosition();
        }
      } catch {
        // Ignore invalid anchors.
      }
    };

    const handlePopState = (event: PopStateEvent) => {
      const nextIndex =
        isStateObject(event.state) && typeof event.state[DUSTYCARDS_HISTORY_INDEX_KEY] === "number"
          ? event.state[DUSTYCARDS_HISTORY_INDEX_KEY]
          : currentIndex;
      currentIndex = nextIndex;
      writeStoredHistoryIndex(currentIndex);
      markPendingRestore();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        saveCurrentScrollPosition();
      }
    };
    const handlePageExit = () => saveCurrentScrollPosition();

    window.addEventListener("scroll", saveSoon, { passive: true });
    window.addEventListener("pagehide", handlePageExit);
    window.addEventListener("beforeunload", handlePageExit);
    window.addEventListener("popstate", handlePopState);
    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.history.scrollRestoration = previousScrollRestoration;
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      window.removeEventListener("scroll", saveSoon);
      window.removeEventListener("pagehide", handlePageExit);
      window.removeEventListener("beforeunload", handlePageExit);
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("click", handleDocumentClick, true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (takePendingRestore(routeKey)) {
      restoreScrollPosition(routeKey);
    }
  }, [routeKey]);

  return null;
}
