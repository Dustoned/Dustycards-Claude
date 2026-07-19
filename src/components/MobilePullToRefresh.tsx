"use client";

import { useEffect, useRef, useState } from "react";
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
  return (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
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
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);

  const refreshingRef = useRef(false);
  const gestureRef = useRef(createIdleMobilePullGesture());

  useEffect(() => {
    function reset() {
      gestureRef.current = createIdleMobilePullGesture();
      setDragging(false);
      if (!refreshingRef.current) setPull(0);
    }

    function onStart(event: TouchEvent) {
      if (refreshingRef.current) return;
      if (!isMobileViewport()) return;
      if (event.touches.length !== 1) {
        gestureRef.current = cancelMobilePullGesture(gestureRef.current);
        setDragging(false);
        setPull(0);
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
      setDragging(result.state.phase === "pulling");
      setPull(result.state.pullPx);
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
      setDragging(false);
      if (finished.refresh && !isPullRefreshBlocked()) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPull(MOBILE_PULL_REFRESH_TRIGGER_PX);
        router.refresh();
        window.setTimeout(() => {
          refreshingRef.current = false;
          setRefreshing(false);
          setPull(0);
        }, SPIN_HOLD_MS);
      } else {
        setPull(0);
      }
    }

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    function onCancel(event: TouchEvent) {
      if (event.touches.length > 0) {
        gestureRef.current = cancelMobilePullGesture(gestureRef.current);
        setDragging(false);
        setPull(0);
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
    };
  }, [router]);

  const visible = pull > 0 || refreshing;
  const progress = Math.min(1, pull / MOBILE_PULL_REFRESH_TRIGGER_PX);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[120] flex justify-center lg:hidden"
      style={{
        transform: `translateY(${Math.max(0, pull - 28)}px)`,
        opacity: visible ? 1 : 0,
        transition: dragging ? "none" : "transform 0.2s ease, opacity 0.2s ease",
      }}
    >
      <div className="mt-2 flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-[#14141c] shadow-lg shadow-black/40">
        <RefreshCw
          className={`h-4 w-4 text-violet-300 ${refreshing ? "animate-spin" : ""}`}
          style={{ transform: refreshing ? undefined : `rotate(${progress * 270}deg)` }}
        />
      </div>
    </div>
  );
}
