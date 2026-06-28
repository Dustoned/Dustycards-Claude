"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

const TRIGGER_PX = 72;
const MAX_PULL_PX = 110;
const RESISTANCE = 2.4;
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

// Skip when the gesture starts inside an open dialog/overlay so its own
// scrolling is not hijacked by a page refresh.
function isInsideOverlay(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("[role='dialog'], [data-no-pull-refresh]"));
}

export default function MobilePullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);

  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const trackingRef = useRef(false);
  const activeRef = useRef(false);
  const startYRef = useRef(0);

  useEffect(() => {
    pullRef.current = pull;
  }, [pull]);
  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    function reset() {
      trackingRef.current = false;
      activeRef.current = false;
      setDragging(false);
      if (!refreshingRef.current) setPull(0);
    }

    function onStart(event: TouchEvent) {
      if (refreshingRef.current) return;
      if (!isMobileViewport()) return;
      if (event.touches.length !== 1) return;
      if (!isAtTop()) return;
      if (isInsideOverlay(event.target)) return;

      trackingRef.current = true;
      activeRef.current = false;
      startYRef.current = event.touches[0]?.clientY ?? 0;
    }

    function onMove(event: TouchEvent) {
      if (!trackingRef.current || refreshingRef.current) return;
      const touch = event.touches[0];
      if (!touch) return;

      const dy = touch.clientY - startYRef.current;
      if (dy <= 0) {
        // Pulling up / normal scroll — let the page handle it.
        if (!activeRef.current) trackingRef.current = false;
        return;
      }
      if (!isAtTop()) {
        reset();
        return;
      }

      activeRef.current = true;
      setDragging(true);
      const distance = Math.min(MAX_PULL_PX, dy / RESISTANCE);
      setPull(distance);
      // Suppress the browser's native overscroll bounce while we handle it.
      if (event.cancelable) event.preventDefault();
    }

    function onEnd() {
      if (!trackingRef.current) return;
      trackingRef.current = false;

      setDragging(false);
      if (activeRef.current && pullRef.current >= TRIGGER_PX) {
        setRefreshing(true);
        setPull(TRIGGER_PX);
        router.refresh();
        window.setTimeout(() => {
          setRefreshing(false);
          setPull(0);
        }, SPIN_HOLD_MS);
      } else {
        setPull(0);
      }
      activeRef.current = false;
    }

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", reset, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", reset);
    };
  }, [router]);

  const visible = pull > 0 || refreshing;
  const progress = Math.min(1, pull / TRIGGER_PX);

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
