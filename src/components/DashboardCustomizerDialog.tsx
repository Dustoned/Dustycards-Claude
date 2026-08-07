"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  modalBodyClass,
  modalBottomSheetOverlayClass,
  modalBottomSheetPanelClass,
  modalCloseButtonClass,
} from "@/components/modal-glass-styles";

export default function DashboardCustomizerDialog({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("dc-scroll-locked");
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      html.classList.remove("dc-scroll-locked");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      className={`${modalBottomSheetOverlayClass} z-[260] sm:p-5`}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-customizer-title"
        className={`${modalBottomSheetPanelClass} max-w-5xl`}
      >
        <header className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-4 border-b border-white/9 bg-[var(--dc-surface-glass-strong)] px-4 py-3.5 backdrop-blur-2xl sm:px-6 sm:py-5">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.15em] text-[var(--dc-primary)]/70">
              Page layout
            </p>
            <h2 id="dashboard-customizer-title" className="mt-1 text-lg font-black text-white sm:text-2xl">
              {title}
            </h2>
            <p className="mt-1 max-w-2xl text-[11px] leading-5 text-white/42 sm:text-xs">
              {description}
            </p>
          </div>
          <button type="button" onClick={onClose} className={modalCloseButtonClass} aria-label="Close page customization">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className={modalBodyClass}>{children}</div>
      </section>
    </div>,
    document.body
  );
}
