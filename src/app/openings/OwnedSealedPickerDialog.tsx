"use client";

import { Check, PackageOpen, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CachedImage from "@/components/CachedImage";
import {
  modalBottomSheetOverlayClass,
  modalBottomSheetPanelClass,
  modalCloseButtonClass,
} from "@/components/modal-glass-styles";
import { formatCollectionCurrency } from "@/lib/collection";
import type { OwnedSealedChoice } from "./OpeningSessionsClient";

export default function OwnedSealedPickerDialog({
  items,
  selectedId,
  onClose,
  onSelect,
}: {
  items: OwnedSealedChoice[];
  selectedId: string | null;
  onClose: () => void;
  onSelect: (item: OwnedSealedChoice) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredItems = useMemo(
    () =>
      normalizedQuery
        ? items.filter((item) => item.name.toLocaleLowerCase().includes(normalizedQuery))
        : items,
    [items, normalizedQuery]
  );

  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("dc-scroll-locked");
    const focusFrame = window.requestAnimationFrame(() => inputRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      html.classList.remove("dc-scroll-locked");
      window.cancelAnimationFrame(focusFrame);
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
        aria-labelledby="owned-sealed-picker-title"
        data-testid="owned-sealed-picker"
        className={`${modalBottomSheetPanelClass} max-w-4xl`}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/9 px-4 py-3.5 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-violet-200/55">
              Your sealed collection
            </p>
            <h2 id="owned-sealed-picker-title" className="mt-1 text-lg font-black text-white sm:text-2xl">
              Choose a product to open
            </h2>
            <p className="mt-1 text-[10px] text-white/38 sm:text-xs">
              Only products you currently own are shown here.
            </p>
          </div>
          <button type="button" onClick={onClose} className={modalCloseButtonClass} aria-label="Close sealed search">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="shrink-0 border-b border-white/8 bg-black/10 px-3 py-3 sm:px-6 sm:py-4">
          <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-white/11 bg-white/[0.045] px-3.5 shadow-inner shadow-black/20 transition-colors focus-within:border-violet-300/32 focus-within:bg-violet-500/[0.055] sm:min-h-14 sm:px-4">
            <Search className="h-4 w-4 shrink-0 text-violet-100/52 sm:h-5 sm:w-5" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="text"
              placeholder="Search your sealed products..."
              className="min-w-0 flex-1 bg-transparent text-base font-semibold text-white outline-none placeholder:text-white/28"
              autoComplete="off"
              spellCheck={false}
              aria-label="Search owned sealed products"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/38 hover:bg-white/[0.07] hover:text-white"
                aria-label="Clear sealed search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 sm:px-6 sm:pb-6 sm:pt-4">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <p className="text-[10px] font-bold text-white/38">
              {filteredItems.length} owned product{filteredItems.length === 1 ? "" : "s"}
            </p>
            <span className="text-[9px] font-bold text-white/24">Tap a product to select it</span>
          </div>

          {filteredItems.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2">
              {filteredItems.map((item) => {
                const selected = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-owned-sealed-result={item.id}
                    onClick={() => onSelect(item)}
                    className={`group flex min-w-0 items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                      selected
                        ? "border-violet-300/32 bg-violet-500/[0.12]"
                        : "border-white/8 bg-white/[0.028] hover:border-white/16 hover:bg-white/[0.055]"
                    }`}
                  >
                    <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/8 bg-black/24 sm:h-[4.5rem] sm:w-[4.5rem]">
                      {item.imageUrl ? (
                        <CachedImage
                          sourceUrl={item.imageUrl}
                          alt=""
                          fill
                          sizes="72px"
                          className="object-contain p-1"
                          unoptimized
                        />
                      ) : (
                        <PackageOpen className="absolute inset-0 m-auto h-5 w-5 text-white/18" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-start justify-between gap-2">
                        <strong className="line-clamp-2 text-xs leading-snug text-white/84 sm:text-sm">
                          {item.name}
                        </strong>
                        {selected ? (
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full border border-white/8 bg-white/[0.035] px-2 py-1 text-[9px] font-black text-white/48">
                          {item.quantity} owned
                        </span>
                        <span className="rounded-full border border-white/8 bg-white/[0.035] px-2 py-1 text-[9px] font-black tabular-nums text-white/48">
                          {item.purchasePricePerItem == null
                            ? "No cost saved"
                            : `${formatCollectionCurrency(item.purchasePricePerItem)} paid`}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/9 bg-white/[0.02] px-4 py-12 text-center">
              <PackageOpen className="mx-auto h-6 w-6 text-white/18" />
              <p className="mt-3 text-sm font-black text-white/56">
                {items.length === 0 ? "No sealed products owned" : "No matching sealed products"}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-[10px] leading-relaxed text-white/30 sm:text-xs">
                {items.length === 0
                  ? "Add a product to your sealed collection before starting an opening."
                  : "Try a shorter product or set name."}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
}
