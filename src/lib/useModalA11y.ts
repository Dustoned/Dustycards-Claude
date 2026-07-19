"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export default function useModalA11y({
  dialogRef,
  enabled = true,
  initialFocus = "first",
  initialFocusRef,
  onClose,
  restoreFocusDelayFrames = 1,
}: {
  dialogRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
  initialFocus?: "first" | "dialog";
  initialFocusRef?: { readonly current: HTMLElement | null };
  onClose: () => void;
  restoreFocusDelayFrames?: number;
}) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!enabled) return;

    const dialogElement = dialogRef.current;
    if (!dialogElement) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusable = () =>
      Array.from(dialogElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.getClientRects().length > 0
      );

    const initialFocusAnimationFrame = window.requestAnimationFrame(() => {
      const preferredInitialFocus = initialFocusRef?.current;
      const initialFocusElement =
        preferredInitialFocus &&
        dialogElement.contains(preferredInitialFocus) &&
        preferredInitialFocus.getClientRects().length > 0
          ? preferredInitialFocus
          : initialFocus === "dialog"
            ? dialogElement
            : focusable()[0] ?? dialogElement;

      initialFocusElement.focus({
        preventScroll: true,
      });
    });

    function handleKeyDown(event: KeyboardEvent) {
      const currentDialog = dialogRef.current;
      if (!currentDialog) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        currentDialog.focus({ preventScroll: true });
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !currentDialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.cancelAnimationFrame(initialFocusAnimationFrame);
      document.removeEventListener("keydown", handleKeyDown, true);
      // A still-connected dialog is being temporarily suspended (for example,
      // while a nested fullscreen dialog is open), not closed. Restoring its
      // original page trigger here would move focus behind the nested modal.
      if (!dialogElement.isConnected && previouslyFocused?.isConnected) {
        const restoreFocus = (framesRemaining: number) => {
          window.requestAnimationFrame(() => {
            if (framesRemaining > 1) {
              restoreFocus(framesRemaining - 1);
              return;
            }
            if (previouslyFocused.isConnected) {
              previouslyFocused.focus({ preventScroll: true });
            }
          });
        };
        restoreFocus(Math.max(1, Math.floor(restoreFocusDelayFrames)));
      }
    };
  }, [dialogRef, enabled, initialFocus, initialFocusRef, restoreFocusDelayFrames]);
}
