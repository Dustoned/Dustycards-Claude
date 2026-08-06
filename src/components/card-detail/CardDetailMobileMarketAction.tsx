"use client";

import { ExternalLink, ShoppingCart } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import {
  hasMobileLongPressMoved,
  MOBILE_LONG_PRESS_MS,
  type MobileLongPressPoint,
} from "@/lib/mobile-long-press";

interface CardDetailMobileMarketActionProps {
  cardMarketHref?: string;
  ebayHref: string;
  onOpenCardMarket?: () => void | Promise<void>;
  className?: string;
}

interface ActivePress extends MobileLongPressPoint {
  pointerId: number;
}

export default function CardDetailMobileMarketAction({
  cardMarketHref,
  ebayHref,
  onOpenCardMarket,
  className = "",
}: CardDetailMobileMarketActionProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);
  const pressRef = useRef<ActivePress | null>(null);
  const pressTimerRef = useRef<number | null>(null);
  const longPressOpenedRef = useRef(false);
  const suppressClickUntilRef = useRef(0);
  const focusMenuOnOpenRef = useRef(false);
  const menuId = `${useId().replace(/:/g, "")}-mobile-market-menu`;

  function clearPressTimer() {
    if (pressTimerRef.current == null) return;
    window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = null;
  }

  function closeMenu({ restoreFocus = false } = {}) {
    setOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
    }
  }

  function openMenu(focusMenu = false) {
    focusMenuOnOpenRef.current = focusMenu;
    setOpen(true);
  }

  useEffect(() => {
    return () => clearPressTimer();
  }, []);

  useEffect(() => {
    if (!open) return;

    function closeFromOutside(event: globalThis.PointerEvent) {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      closeMenu();
    }

    function closeFromEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeMenu({ restoreFocus: true });
    }

    document.addEventListener("pointerdown", closeFromOutside, true);
    window.addEventListener("keydown", closeFromEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside, true);
      window.removeEventListener("keydown", closeFromEscape, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !focusMenuOnOpenRef.current) return;
    focusMenuOnOpenRef.current = false;
    const animationFrame = window.requestAnimationFrame(() => {
      rootRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus({
        preventScroll: true,
      });
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [open]);

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    clearPressTimer();
    pressRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pressTimerRef.current = window.setTimeout(() => {
      pressTimerRef.current = null;
      longPressOpenedRef.current = true;
      suppressClickUntilRef.current = Number.POSITIVE_INFINITY;
      openMenu(false);
    }, MOBILE_LONG_PRESS_MS);
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    if (
      hasMobileLongPressMoved(press, {
        x: event.clientX,
        y: event.clientY,
      })
    ) {
      clearPressTimer();
      pressRef.current = null;
    }
  }

  function finishPress(event: PointerEvent<HTMLElement>) {
    if (pressRef.current?.pointerId !== event.pointerId) return;
    clearPressTimer();
    pressRef.current = null;
    if (longPressOpenedRef.current) {
      longPressOpenedRef.current = false;
      suppressClickUntilRef.current = Date.now() + 700;
    }
  }

  function handleTriggerClick(event: MouseEvent<HTMLElement>) {
    if (Date.now() <= suppressClickUntilRef.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickUntilRef.current = 0;
      return;
    }
    closeMenu();
    if (!cardMarketHref) void onOpenCardMarket?.();
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    openMenu(true);
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[role=menuitem]")
    );
    if (items.length === 0) return;
    const activeIndex = items.indexOf(document.activeElement as HTMLElement);
    let nextIndex = activeIndex;
    if (event.key === "ArrowDown") nextIndex = (Math.max(activeIndex, -1) + 1) % items.length;
    if (event.key === "ArrowUp") nextIndex = (activeIndex - 1 + items.length) % items.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    items[nextIndex]?.focus({ preventScroll: true });
  }

  const triggerInteractionProps = {
    "aria-controls": menuId,
    "aria-expanded": open,
    "aria-haspopup": "menu" as const,
    "aria-label": "Open CardMarket. Hold for eBay Deals.",
    draggable: false,
    onClick: handleTriggerClick,
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      if (pressRef.current) {
        longPressOpenedRef.current = true;
        suppressClickUntilRef.current = Number.POSITIVE_INFINITY;
      } else {
        suppressClickUntilRef.current = Date.now() + 700;
      }
      openMenu(false);
    },
    onKeyDown: handleTriggerKeyDown,
    onPointerCancel: finishPress,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: finishPress,
  };
  const triggerContent = (
    <>
      <ShoppingCart className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate" data-card-detail-mobile-market-label>
        CardMarket
      </span>
    </>
  );
  const menuItemClass =
    "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-[13px] font-bold text-white/76 outline-none transition hover:bg-white/[0.07] hover:text-white focus-visible:bg-violet-500/18 focus-visible:text-white";

  return (
    <div
      ref={rootRef}
      className="relative grid min-h-11 w-full min-w-0 max-w-full"
      data-card-detail-mobile-market
      data-mobile-hover-tooltip-ignore
    >
      {cardMarketHref ? (
        <a
          ref={triggerRef as React.RefObject<HTMLAnchorElement>}
          href={cardMarketHref}
          target="_blank"
          rel="noopener noreferrer"
          className={`${className} box-border h-full !w-full !max-w-full overflow-hidden touch-manipulation select-none [-webkit-touch-callout:none]`}
          {...triggerInteractionProps}
        >
          {triggerContent}
        </a>
      ) : (
        <button
          ref={triggerRef as React.RefObject<HTMLButtonElement>}
          type="button"
          className={`${className} box-border h-full !w-full !max-w-full overflow-hidden touch-manipulation select-none [-webkit-touch-callout:none]`}
          {...triggerInteractionProps}
        >
          {triggerContent}
        </button>
      )}

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="More market links"
          data-card-detail-mobile-market-menu
          onKeyDown={handleMenuKeyDown}
          className="absolute bottom-[calc(100%+0.7rem)] right-0 z-[280] w-[10rem] rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.9)] bg-[var(--dc-surface-glass-strong)] p-1.5 shadow-[0_20px_52px_var(--dc-shadow-color)] backdrop-blur-2xl"
        >
          <span
            aria-hidden="true"
            className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 border-b border-r border-[rgb(var(--dc-border-rgb)/0.9)] bg-[var(--dc-surface-primary)]"
          />
          <a
            href={ebayHref}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className={menuItemClass}
            onClick={() => closeMenu()}
          >
            <span>eBay Deals</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </a>
        </div>
      ) : null}
    </div>
  );
}
