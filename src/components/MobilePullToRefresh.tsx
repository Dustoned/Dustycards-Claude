"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import {
  advanceMobilePullGesture,
  beginMobilePullGesture,
  cancelMobilePullGesture,
  createIdleMobilePullGesture,
  finishMobilePullGesture,
  MOBILE_PULL_REFRESH_EDGE_GUARD_PX,
  MOBILE_PULL_REFRESH_TRIGGER_PX,
} from "@/lib/mobile-pull-to-refresh";

const SPIN_HOLD_MS = 700;

function isMobileViewport(): boolean {
  return (
    window.matchMedia("(pointer: coarse)").matches &&
    window.matchMedia("(max-width: 767px)").matches
  );
}

function isAtTop(): boolean {
  const rootTop = document.scrollingElement?.scrollTop ?? 0;
  return Math.max(
    0,
    window.scrollY,
    rootTop,
    document.documentElement.scrollTop,
    document.body.scrollTop
  ) <= 0.5;
}

function isPullRefreshBlocked(): boolean {
  return (
    document.documentElement.classList.contains("dc-scroll-locked") ||
    document.body.classList.contains("dc-scroll-locked") ||
    Boolean(
      document.querySelector(
        "[data-no-pull-refresh], [data-mobile-more-backdrop], [data-mobile-more-sheet], .dc-modal-overlay, .dc-modal-panel, [role='dialog']"
      )
    )
  );
}

function isExcludedStartTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (
    target.closest(
      "a, button, input, select, textarea, summary, [contenteditable='true'], [role='button'], [role='tab'], [role='tablist'], [role='dialog'], [data-no-pull-refresh], [data-mobile-more-backdrop], [data-mobile-more-sheet], .dc-modal-overlay, .dc-modal-panel, .card-detail-tabs-shell"
    )
  ) return true;

  let element: Element | null = target;
  while (element && element !== document.body && element !== document.documentElement) {
    const style = window.getComputedStyle(element);
    if (style.position === "fixed" || style.position === "sticky") return true;
    const overflowY = style.overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      element.scrollHeight > element.clientHeight + 1
    ) return true;
    element = element.parentElement;
  }
  return false;
}

export default function MobilePullToRefresh() {
  const router = useRouter();
  const indicatorRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<SVGSVGElement>(null);
  const refreshingRef = useRef(false);
  const gestureRef = useRef(createIdleMobilePullGesture());
  const visualRef = useRef({ pull: 0, dragging: false });
  const visualFrameRef = useRef(0);
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    function applyVisual() {
      visualFrameRef.current = 0;
      const indicator = indicatorRef.current;
      const icon = iconRef.current;
      if (!indicator || !icon) return;

      const { pull, dragging } = visualRef.current;
      const refreshing = refreshingRef.current;
      const progress = Math.min(1, pull / MOBILE_PULL_REFRESH_TRIGGER_PX);
      indicator.style.transform = `translateY(${Math.max(0, pull - 28)}px)`;
      indicator.style.opacity = pull > 0 || refreshing ? "1" : "0";
      indicator.style.transition = dragging
        ? "none"
        : "transform 0.2s ease, opacity 0.2s ease";
      icon.classList.toggle("animate-spin", refreshing);
      icon.style.transform = refreshing ? "" : `rotate(${progress * 270}deg)`;
    }

    function updateVisual(pull: number, dragging: boolean, force = false) {
      const current = visualRef.current;
      if (!force && current.pull === pull && current.dragging === dragging) return;
      visualRef.current = { pull, dragging };
      if (visualFrameRef.current) return;
      visualFrameRef.current = window.requestAnimationFrame(applyVisual);
    }

    function reset() {
      gestureRef.current = createIdleMobilePullGesture();
      if (!refreshingRef.current) updateVisual(0, false);
    }

    function onStart(event: TouchEvent) {
      if (refreshingRef.current) return;
      gestureRef.current = createIdleMobilePullGesture();
      updateVisual(0, false);
      if (!isMobileViewport()) return;
      if (event.touches.length !== 1) {
        gestureRef.current = cancelMobilePullGesture(gestureRef.current);
        return;
      }
      if (isPullRefreshBlocked()) return;
      const touch = event.touches[0];
      if (!touch) return;
      const eligible =
        isAtTop() &&
        touch.clientX > MOBILE_PULL_REFRESH_EDGE_GUARD_PX &&
        !isExcludedStartTarget(event.target);
      gestureRef.current = beginMobilePullGesture(
        { x: touch.clientX, y: touch.clientY },
        eligible
      );
    }

    function onMove(event: TouchEvent) {
      if (gestureRef.current.phase === "idle" || gestureRef.current.phase === "cancelled") return;
      if (refreshingRef.current) return;
      const touch = event.touches[0];
      const result = advanceMobilePullGesture(gestureRef.current, {
        x: touch?.clientX ?? gestureRef.current.startX,
        y: touch?.clientY ?? gestureRef.current.startY,
        touchCount: event.touches.length,
        rootAtTop: isAtTop(),
      });
      gestureRef.current = result.state;
      updateVisual(result.state.pullPx, result.state.phase === "pulling");
      if (result.preventDefault && event.cancelable) event.preventDefault();
    }

    function onEnd(event: TouchEvent) {
      if (gestureRef.current.phase === "idle") return;
      const finished = finishMobilePullGesture(
        gestureRef.current,
        event.touches.length
      );
      gestureRef.current = finished.state;
      if (event.touches.length > 0) return;
      if (finished.refresh && !isPullRefreshBlocked()) {
        refreshingRef.current = true;
        updateVisual(MOBILE_PULL_REFRESH_TRIGGER_PX, false, true);
        router.refresh();
        if (refreshTimerRef.current != null) {
          window.clearTimeout(refreshTimerRef.current);
        }
        refreshTimerRef.current = window.setTimeout(() => {
          refreshTimerRef.current = null;
          refreshingRef.current = false;
          updateVisual(0, false, true);
        }, SPIN_HOLD_MS);
      } else {
        updateVisual(0, false);
      }
    }

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    function onCancel(event: TouchEvent) {
      if (event.touches.length > 0) {
        gestureRef.current = cancelMobilePullGesture(gestureRef.current);
        updateVisual(0, false);
        return;
      }
      reset();
    }

    window.addEventListener("touchcancel", onCancel, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onCancel);
      if (visualFrameRef.current) {
        window.cancelAnimationFrame(visualFrameRef.current);
        visualFrameRef.current = 0;
      }
      if (refreshTimerRef.current != null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      refreshingRef.current = false;
    };
  }, [router]);

  return (
    <div
      ref={indicatorRef}
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[120] flex justify-center lg:hidden"
      style={{
        transform: "translateY(0px)",
        opacity: 0,
        transition: "transform 0.2s ease, opacity 0.2s ease",
      }}
    >
      <div className="mt-2 flex h-9 w-9 items-center justify-center rounded-full border border-[rgb(var(--dc-border-rgb)/0.9)] bg-[var(--dc-surface-elevated)] shadow-[0_8px_24px_var(--dc-shadow-color)]">
        <RefreshCw
          ref={iconRef}
          className="h-4 w-4 text-violet-300"
          style={{ transform: "rotate(0deg)" }}
        />
      </div>
    </div>
  );
}
