"use client";

import { Info } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState } from "react";

interface TooltipPosition {
  left: number;
  top: number;
  width: number;
  placeAbove: boolean;
  maxHeight: number;
}

const VIEWPORT_MARGIN = 12;
const TOOLTIP_GAP = 10;
const MAX_TOOLTIP_WIDTH = 320;

export function dismissReadableTooltipOnEscape(
  event: Pick<KeyboardEvent, "key" | "preventDefault" | "stopPropagation">,
  close: () => void
) {
  if (event.key !== "Escape") return false;
  event.preventDefault();
  event.stopPropagation();
  close();
  return true;
}

export default function ReadableInfoTooltip({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    if (
      rect.bottom < VIEWPORT_MARGIN ||
      rect.top > window.innerHeight - VIEWPORT_MARGIN ||
      rect.right < VIEWPORT_MARGIN ||
      rect.left > window.innerWidth - VIEWPORT_MARGIN
    ) {
      setOpen(false);
      return;
    }
    const width = Math.min(MAX_TOOLTIP_WIDTH, Math.max(220, window.innerWidth - VIEWPORT_MARGIN * 2));
    const left = Math.min(
      window.innerWidth - width - VIEWPORT_MARGIN,
      Math.max(VIEWPORT_MARGIN, rect.left + rect.width / 2 - width / 2)
    );
    const estimatedHeight = 126;
    const placeAbove = rect.top >= estimatedHeight + TOOLTIP_GAP + VIEWPORT_MARGIN;
    const top = placeAbove ? rect.top - TOOLTIP_GAP : rect.bottom + TOOLTIP_GAP;
    const availableHeight = placeAbove
      ? Math.max(96, rect.top - TOOLTIP_GAP - VIEWPORT_MARGIN)
      : Math.max(96, window.innerHeight - rect.bottom - TOOLTIP_GAP - VIEWPORT_MARGIN);
    setPosition({ left, top, width, placeAbove, maxHeight: availableHeight });
  }, []);

  const show = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    updatePosition();
    setOpen(true);
  }, [updatePosition]);

  const scheduleClose = useCallback(() => {
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 140);
  }, []);

  useEffect(
    () => () => {
      if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    const reposition = () => updatePosition();
    const closeOnEscape = (event: KeyboardEvent) => {
      dismissReadableTooltipOnEscape(event, () => setOpen(false));
    };
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || tooltipRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    // Capture on window so an open tooltip consumes Escape before modal-level
    // document capture handlers can interpret the same keypress as a close.
    window.addEventListener("keydown", closeOnEscape, true);
    window.addEventListener("pointerdown", closeOutside);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("keydown", closeOnEscape, true);
      window.removeEventListener("pointerdown", closeOutside);
    };
  }, [open, updatePosition]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        data-mobile-tooltip={description}
        data-readable-tooltip-trigger
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") show();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") scheduleClose();
        }}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onClick={() => {
          if (!open) show();
        }}
        className="group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:!outline-none md:h-10 md:w-10"
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full text-white/38 transition-colors group-hover:bg-white/[0.075] group-hover:text-cyan-100 group-focus-visible:bg-white/[0.08] group-focus-visible:text-cyan-100 group-focus-visible:ring-2 group-focus-visible:ring-cyan-200/45">
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </button>

      {open && position && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={tooltipRef}
              id={tooltipId}
              role="tooltip"
              data-readable-info-tooltip
              onPointerEnter={() => {
                if (closeTimerRef.current != null) {
                  window.clearTimeout(closeTimerRef.current);
                  closeTimerRef.current = null;
                }
              }}
              onPointerLeave={scheduleClose}
              className="z-[500] overflow-y-auto rounded-2xl border border-cyan-100/18 bg-[#071012]/98 px-4 py-3 text-left text-[13px] font-semibold leading-[1.55] text-white/88 shadow-[0_24px_80px_rgba(0,0,0,0.68)] backdrop-blur-2xl"
              style={{
                position: "fixed",
                left: position.left,
                top: position.top,
                width: position.width,
                maxHeight: position.maxHeight,
                transform: position.placeAbove ? "translateY(-100%)" : undefined,
              }}
            >
              <span
                aria-hidden="true"
                className="mb-1 block text-[11px] font-black uppercase tracking-[0.1em] text-cyan-100/72"
              >
                {label}
              </span>
              {description}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
