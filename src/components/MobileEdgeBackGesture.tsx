"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  getDustyHistoryIndex,
  saveCurrentScrollPosition,
} from "@/lib/client-navigation-state";
import {
  dispatchMobileEdgeBackRequest,
  shouldCaptureMobileEdgeBackGesture,
  shouldCompleteMobileEdgeBackGesture,
} from "@/lib/mobile-edge-back";

const EDGE_START_PX = 26;
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

  if (
    target.closest(
      "input, select, textarea, [contenteditable='true'], [role='slider'], [data-no-edge-swipe-back]"
    )
  ) {
    return true;
  }

  // A CardModal is an in-app surface rather than a history entry. Let the
  // edge gesture start over its large media/action controls as it would in a
  // native detail sheet; the completed gesture closes the modal locally.
  if (target.closest("[data-card-modal-root]")) return false;

  return Boolean(
    target.closest(["a", "button", "summary", "[role='button']"].join(","))
  );
}

function getGestureDelta(gesture: GestureState) {
  return {
    deltaX: gesture.lastX - gesture.startX,
    deltaY: Math.abs(gesture.lastY - gesture.startY),
    elapsedMs: Math.max(1, performance.now() - gesture.startedAt),
  };
}

export default function MobileEdgeBackGesture() {
  const pathname = usePathname() ?? "/";
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
    gestureRef.current.tracking = false;
  }, [pathname]);

  useEffect(() => {
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
        return;
      }

      if (
        event.cancelable &&
        shouldCaptureMobileEdgeBackGesture(getGestureDelta(gesture))
      ) {
        event.preventDefault();
      }
    }

    function finishGesture(event: TouchEvent) {
      const gesture = gestureRef.current;
      if (!gesture.tracking) return;

      const finalTouch = event.changedTouches?.[0];
      if (finalTouch) {
        gesture.lastX = finalTouch.clientX;
        gesture.lastY = finalTouch.clientY;
      }

      resetGesture();
      const now = performance.now();
      if (
        (lastNavigateAtRef.current > 0 &&
          now - lastNavigateAtRef.current < NAVIGATE_COOLDOWN_MS) ||
        !shouldCompleteMobileEdgeBackGesture(getGestureDelta(gesture))
      ) {
        return;
      }

      lastNavigateAtRef.current = now;
      if (dispatchMobileEdgeBackRequest()) {
        return;
      }
      if (getDustyHistoryIndex() <= 0) {
        return;
      }

      saveCurrentScrollPosition();
      window.history.back();
    }

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", finishGesture, { passive: true });
    // WebKit can still report a cancellation after taking over an edge
    // overscroll. Use its final touch position instead of silently dropping an
    // otherwise complete gesture.
    window.addEventListener("touchcancel", finishGesture, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", finishGesture);
      window.removeEventListener("touchcancel", finishGesture);
    };
  }, []);

  return null;
}
