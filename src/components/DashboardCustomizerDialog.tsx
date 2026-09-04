"use client";

import { X } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  modalBodyClass,
  modalBottomSheetOverlayClass,
  modalBottomSheetPanelClass,
  modalCloseButtonClass,
} from "@/components/modal-glass-styles";
import useModalA11y from "@/lib/useModalA11y";
import useBodyScrollLock from "@/lib/useBodyScrollLock";
import { SettingsSaveFeedback } from "@/components/SettingsProvider";

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
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useModalA11y({ dialogRef, initialFocus: "dialog", onClose });
  useBodyScrollLock();

  return createPortal(
    <div
      className={`${modalBottomSheetOverlayClass} z-[260] sm:p-5`}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        data-dashboard-customizer
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={`${modalBottomSheetPanelClass} max-w-5xl`}
      >
        <header className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-4 border-b border-white/9 bg-[var(--dc-surface-glass-strong)] px-4 py-3.5 backdrop-blur-2xl sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold text-white sm:text-2xl">
              {title}
            </h2>
            <p id={descriptionId} className="mt-1 max-w-2xl text-sm leading-6 text-white/60">
              {description}
            </p>
          </div>
          <button type="button" onClick={onClose} className={modalCloseButtonClass} aria-label="Close page customization">
            <X className="h-4 w-4" />
          </button>
        </header>
        <SettingsSaveFeedback inline />
        <div className={modalBodyClass}>{children}</div>
      </section>
    </div>,
    document.body
  );
}
