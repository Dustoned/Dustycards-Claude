"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  getDustyHistoryIndex,
  saveCurrentScrollPosition,
} from "@/lib/client-navigation-state";

const EDGE_START_PX = 26;
const MIN_SWIPE_PX = 76;
const MAX_VERTICAL_DRIFT_PX = 64;
const MIN_HORIZONTAL_RATIO = 1.45;
const NAVIGATE_COOLDOWN_MS = 650;

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

export default function MobileEdgeBackGesture() {
  const pathname = usePathname() ?? "/";
  const pathnameRef = useRef(pathname);
  const gestureRef = useRef<GestureState>({
    tracking: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    startedAt: 0,
  });
  const lastNavigateAtRef = useRef(0);

  useEffect(() => {
    pathnameRef.current = pathname;
    gestureRef.current.tracking = false;
  }, [pathname]);

  useEffect(() => {
    function resetGesture() {
      gestureRef.current.tracking = false;
    }

    function handleTouchStart(event: TouchEvent) {
      if (pathnameRef.current === "/") return;
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
      }
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
        return;
      }

      lastNavigateAtRef.current = now;
      if (getDustyHistoryIndex() <= 0) {
        return;
      }

      saveCurrentScrollPosition();
      window.history.back();
    }

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", resetGesture, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", resetGesture);
    };
  }, []);

  return null;
}
