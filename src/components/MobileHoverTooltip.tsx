"use client";

import { useEffect, useRef, useState } from "react";
import {
  hasMobileLongPressMoved,
  MOBILE_LONG_PRESS_MS,
} from "@/lib/mobile-long-press";

function isCoarsePointer() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(hover: none), (pointer: coarse)").matches
  );
}

function getTooltipText(target: EventTarget | null): {
  text: string;
  element: HTMLElement;
} | null {
  if (!(target instanceof Element)) return null;
  if (
    target.closest(
      "[data-readable-tooltip-trigger], [data-mobile-hover-tooltip-ignore]"
    )
  ) {
    return null;
  }

  const element = target.closest<HTMLElement>(
    "[data-mobile-tooltip], [title], [aria-label]"
  );
  if (!element) return null;

  const text =
    element.dataset.mobileTooltip?.trim() ||
    element.getAttribute("title")?.trim() ||
    element.getAttribute("aria-label")?.trim() ||
    "";

  if (!text || text.length < 2) return null;
  return { text, element };
}

export default function MobileHoverTooltip() {
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number; target: HTMLElement } | null>(null);
  const suppressClickUntilRef = useRef(0);

  useEffect(() => {
    if (!isCoarsePointer()) return;

    function clearLongPressTimer() {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    function closeTooltip() {
      clearLongPressTimer();
      startRef.current = null;
      setTooltip(null);
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.pointerType === "mouse") return;

      const match = getTooltipText(event.target);
      if (!match) return;

      clearLongPressTimer();
      startRef.current = {
        x: event.clientX,
        y: event.clientY,
        target: match.element,
      };
      timerRef.current = window.setTimeout(() => {
        const rect = match.element.getBoundingClientRect();
        setTooltip({
          text: match.text,
          x: rect.left + rect.width / 2,
          y: Math.max(rect.top - 10, 12),
        });
        suppressClickUntilRef.current = Date.now() + 650;
      }, MOBILE_LONG_PRESS_MS);
    }

    function handlePointerMove(event: PointerEvent) {
      const start = startRef.current;
      if (!start) return;
      if (
        hasMobileLongPressMoved(
          { x: start.x, y: start.y },
          { x: event.clientX, y: event.clientY }
        )
      ) {
        closeTooltip();
      }
    }

    function handlePointerUp() {
      clearLongPressTimer();
      startRef.current = null;
      if (tooltip) {
        window.setTimeout(() => setTooltip(null), 950);
      }
    }

    function handleClick(event: MouseEvent) {
      if (Date.now() > suppressClickUntilRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClickUntilRef.current = 0;
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerup", handlePointerUp, true);
    document.addEventListener("pointercancel", closeTooltip, true);
    document.addEventListener("click", handleClick, true);

    return () => {
      clearLongPressTimer();
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("pointercancel", closeTooltip, true);
      document.removeEventListener("click", handleClick, true);
    };
  }, [tooltip]);

  if (!tooltip) return null;

  return (
    <div
      className="pointer-events-none fixed z-[140] max-w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-full rounded-2xl border border-white/12 bg-black/88 px-3 py-2 text-center text-xs font-semibold leading-snug text-white/88 shadow-2xl shadow-black/40 backdrop-blur-xl"
      style={{
        left: tooltip.x,
        top: tooltip.y,
      }}
      role="status"
      aria-live="polite"
    >
      {tooltip.text}
    </div>
  );
}
