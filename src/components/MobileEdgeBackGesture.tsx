"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const EDGE_START_PX = 26;
const MIN_SWIPE_PX = 76;
const MAX_VERTICAL_DRIFT_PX = 64;
const MIN_HORIZONTAL_RATIO = 1.45;
const NAVIGATE_COOLDOWN_MS = 650;
const VISUAL_MAX_SHIFT_PX = 42;
const CANCEL_ANIMATION_MS = 180;
const COMMIT_NAVIGATION_DELAY_MS = 155;
const COMMIT_CLEANUP_MS = 420;

type GestureState = {
  tracking: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startedAt: number;
};

function isMobileGestureViewport(): boolean {
  return (
    window.matchMedia("(pointer: coarse)").matches &&
    window.matchMedia("(max-width: 767px)").matches
  );
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  return Boolean(
    target.closest(
      [
        "a",
        "button",
        "input",
        "select",
        "textarea",
        "[contenteditable='true']",
        "[role='button']",
        "[role='slider']",
        "[data-no-edge-swipe-back]",
      ].join(",")
    )
  );
}

function shouldNavigateBack(gesture: GestureState): boolean {
  const dx = gesture.lastX - gesture.startX;
  const dy = Math.abs(gesture.lastY - gesture.startY);
  const elapsed = Math.max(1, performance.now() - gesture.startedAt);
  const velocity = dx / elapsed;

  return (
    dx >= MIN_SWIPE_PX &&
    dy <= MAX_VERTICAL_DRIFT_PX &&
    dx / Math.max(1, dy) >= MIN_HORIZONTAL_RATIO &&
    velocity > 0.22
  );
}

function clearEdgeBackVisualState() {
  const root = document.documentElement;
  root.classList.remove(
    "edge-swipe-back-dragging",
    "edge-swipe-back-cancel",
    "edge-swipe-back-commit"
  );
  root.style.removeProperty("--edge-back-shift");
}

export default function MobileEdgeBackGesture() {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const currentRoute = `${pathname}?${searchParams.toString()}`;
  const gestureRef = useRef<GestureState>({
    tracking: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    startedAt: 0,
  });
  const lastNavigateAtRef = useRef(0);
  const visualCleanupTimerRef = useRef<number | null>(null);
  const navigateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    clearEdgeBackVisualState();
  }, [currentRoute]);

  useEffect(() => {
    function clearTimers() {
      if (visualCleanupTimerRef.current != null) {
        window.clearTimeout(visualCleanupTimerRef.current);
        visualCleanupTimerRef.current = null;
      }
      if (navigateTimerRef.current != null) {
        window.clearTimeout(navigateTimerRef.current);
        navigateTimerRef.current = null;
      }
    }

    function startVisualState() {
      clearTimers();
      const root = document.documentElement;
      root.classList.remove("edge-swipe-back-cancel", "edge-swipe-back-commit");
      root.classList.add("edge-swipe-back-dragging");
      root.style.setProperty("--edge-back-shift", "0px");
    }

    function updateVisualState(dx: number) {
      const shift = Math.max(0, Math.min(VISUAL_MAX_SHIFT_PX, dx * 0.36));
      const root = document.documentElement;
      root.classList.add("edge-swipe-back-dragging");
      root.style.setProperty("--edge-back-shift", `${shift.toFixed(1)}px`);
    }

    function cancelVisualState() {
      const root = document.documentElement;
      root.classList.remove("edge-swipe-back-dragging", "edge-swipe-back-commit");
      root.classList.add("edge-swipe-back-cancel");
      root.style.setProperty("--edge-back-shift", "0px");
      visualCleanupTimerRef.current = window.setTimeout(() => {
        clearEdgeBackVisualState();
      }, CANCEL_ANIMATION_MS);
    }

    function commitVisualState() {
      const root = document.documentElement;
      root.classList.remove("edge-swipe-back-dragging", "edge-swipe-back-cancel");
      root.classList.add("edge-swipe-back-commit");
      root.style.removeProperty("--edge-back-shift");
    }

    function resetGesture() {
      gestureRef.current.tracking = false;
    }

    function handleTouchStart(event: TouchEvent) {
      if (!isMobileGestureViewport()) return;
      if (event.touches.length !== 1) return;
      if (isInteractiveTarget(event.target)) return;

      const touch = event.touches[0];
      if (!touch || touch.clientX > EDGE_START_PX) return;

      gestureRef.current = {
        tracking: true,
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        startedAt: performance.now(),
      };
      startVisualState();
    }

    function handleTouchMove(event: TouchEvent) {
      const gesture = gestureRef.current;
      if (!gesture.tracking) return;
      if (event.touches.length !== 1) {
        resetGesture();
        return;
      }

      const touch = event.touches[0];
      if (!touch) return;

      gesture.lastX = touch.clientX;
      gesture.lastY = touch.clientY;

      const dx = gesture.lastX - gesture.startX;
      const dy = Math.abs(gesture.lastY - gesture.startY);
      if (dx < -8 || (dy > 32 && dy > Math.abs(dx))) {
        resetGesture();
        cancelVisualState();
        return;
      }

      updateVisualState(dx);
    }

    function handleTouchEnd() {
      const gesture = gestureRef.current;
      if (!gesture.tracking) return;

      resetGesture();
      const now = performance.now();
      if (
        now - lastNavigateAtRef.current < NAVIGATE_COOLDOWN_MS ||
        !shouldNavigateBack(gesture)
      ) {
        cancelVisualState();
        return;
      }

      lastNavigateAtRef.current = now;
      commitVisualState();
      navigateTimerRef.current = window.setTimeout(() => {
        window.history.back();
      }, COMMIT_NAVIGATION_DELAY_MS);
      visualCleanupTimerRef.current = window.setTimeout(() => {
        clearEdgeBackVisualState();
      }, COMMIT_CLEANUP_MS);
    }

    function handleTouchCancel() {
      resetGesture();
      cancelVisualState();
    }

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchCancel, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchCancel);
      clearTimers();
      clearEdgeBackVisualState();
    };
  }, []);

  return null;
}
