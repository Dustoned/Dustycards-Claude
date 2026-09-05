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

// Portaled dialogs are siblings in the DOM. Only the most recently opened
// dialog may own keyboard input or move focus.
const modalStack: HTMLElement[] = [];

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
    const parentModal = modalStack.at(-1);
    modalStack.push(dialogElement);
    const isTopModal = () => modalStack.at(-1) === dialogElement;

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusable = () =>
      Array.from(dialogElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.getClientRects().length > 0
      );

    const initialFocusAnimationFrame = window.requestAnimationFrame(() => {
      if (!isTopModal()) return;
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
      if (!currentDialog || !isTopModal()) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
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

      if (event.shiftKey && (active === first || active === currentDialog || !currentDialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || active === currentDialog || !currentDialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.cancelAnimationFrame(initialFocusAnimationFrame);
      document.removeEventListener("keydown", handleKeyDown, true);
      const wasTopModal = isTopModal();
      const stackIndex = modalStack.lastIndexOf(dialogElement);
      if (stackIndex !== -1) modalStack.splice(stackIndex, 1);
      // A still-connected dialog is being temporarily suspended (for example,
      // while a nested fullscreen dialog is open), not closed. Restoring its
      // original page trigger here would move focus behind the nested modal.
      if (wasTopModal && !dialogElement.isConnected && previouslyFocused?.isConnected) {
        const restoreFocus = (framesRemaining: number) => {
          window.requestAnimationFrame(() => {
            if (framesRemaining > 1) {
              restoreFocus(framesRemaining - 1);
              return;
            }
            const currentTop = modalStack.at(-1);
            // Mobile action bars can be portaled outside their owning dialog.
            // Restore their trigger while that same parent still owns focus.
            if (previouslyFocused.isConnected && (!currentTop || currentTop === parentModal || currentTop.contains(previouslyFocused))) {
              previouslyFocused.focus({ preventScroll: true });
            }
          });
        };
        restoreFocus(Math.max(1, Math.floor(restoreFocusDelayFrames)));
      }
    };
  }, [dialogRef, enabled, initialFocus, initialFocusRef, restoreFocusDelayFrames]);
}
