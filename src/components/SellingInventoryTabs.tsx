"use client";

import { CheckCircle2, PackageSearch, ScanSearch, Tag } from "lucide-react";
import { useState, type ReactNode } from "react";

export type SellingInventoryView = "active" | "sold" | "marktplaats" | "collections";

export default function SellingInventoryTabs({
  activeCount,
  soldCount,
  marktplaatsCount,
  repeatedSoldPrice,
  initialView,
  activeContent,
  soldContent,
  marktplaatsContent,
  collectionsContent,
}: {
  activeCount: number;
  soldCount: number;
  marktplaatsCount: number;
  repeatedSoldPrice?: { amount: string; count: number } | null;
  initialView?: SellingInventoryView;
  activeContent: ReactNode;
  soldContent: ReactNode;
  marktplaatsContent: ReactNode;
  collectionsContent: ReactNode;
}) {
  const fallbackView: SellingInventoryView =
    activeCount > 0 ? "active" : soldCount > 0 ? "sold" : "marktplaats";
  const [view, setView] = useState<SellingInventoryView>(initialView ?? fallbackView);

  const showingSold = view === "sold";
  const showingMarktplaats = view === "marktplaats";
  const showingActive = view === "active";
  const showingCollections = view === "collections";

  return (
    <section className="overflow-hidden rounded-[var(--ui-page-header-radius)] border border-[rgb(var(--dc-border-rgb)/0.86)] bg-[linear-gradient(145deg,rgb(var(--dc-surface-elevated-rgb)/0.94),rgb(var(--dc-surface-primary-rgb)/0.92))] shadow-[0_14px_36px_var(--dc-shadow-color)]">
      <div className="border-b border-[rgb(var(--dc-border-rgb)/0.82)] p-2.5 sm:p-3">
        <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => setView("active")}
            aria-pressed={showingActive}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-2 text-xs font-black transition-colors ${
              showingActive
                ? "border-[rgb(var(--dc-primary-rgb)/0.38)] bg-[rgb(var(--dc-primary-rgb)/0.12)] text-[var(--dc-primary)] shadow-[inset_0_1px_0_var(--dc-sheen)]"
                : "border-[rgb(var(--dc-border-rgb)/0.82)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.7)] text-[rgb(var(--dc-text-primary-rgb)/0.58)] hover:border-[rgb(var(--dc-primary-rgb)/0.26)] hover:text-[var(--dc-text-primary)]"
            }`}
          >
            <Tag className="h-3.5 w-3.5" aria-hidden="true" />
            For sale
            <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[9px] tabular-nums">{activeCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setView("sold")}
            aria-pressed={showingSold}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-2 text-xs font-black transition-colors ${
              showingSold
                ? "border-[rgb(var(--dc-success-rgb)/0.34)] bg-[rgb(var(--dc-success-rgb)/0.1)] text-[var(--dc-success)] shadow-[inset_0_1px_0_var(--dc-sheen)]"
                : "border-[rgb(var(--dc-border-rgb)/0.82)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.7)] text-[rgb(var(--dc-text-primary-rgb)/0.58)] hover:border-[rgb(var(--dc-success-rgb)/0.24)] hover:text-[var(--dc-text-primary)]"
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Sold ledger
            <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[9px] tabular-nums">{soldCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setView("marktplaats")}
            aria-pressed={showingMarktplaats}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-2 text-xs font-black transition-colors ${
              showingMarktplaats
                ? "border-[rgb(var(--dc-warning-rgb)/0.38)] bg-[rgb(var(--dc-warning-rgb)/0.11)] text-[var(--dc-warning)] shadow-[inset_0_1px_0_var(--dc-sheen)]"
                : "border-[rgb(var(--dc-border-rgb)/0.82)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.7)] text-[rgb(var(--dc-text-primary-rgb)/0.58)] hover:border-[rgb(var(--dc-warning-rgb)/0.26)] hover:text-[var(--dc-text-primary)]"
            }`}
          >
            <PackageSearch className="h-3.5 w-3.5" aria-hidden="true" />
            Marktplaats Deals
            <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[9px] tabular-nums">
              {marktplaatsCount}
            </span>
          </button>
          <button type="button" onClick={() => setView("collections")} aria-pressed={showingCollections}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-2 text-xs font-black transition-colors ${showingCollections ? "border-[var(--dc-warning)] bg-[rgb(var(--dc-warning-rgb)/0.11)] text-[var(--dc-warning)]" : "border-[var(--dc-border)] text-[var(--dc-text-muted)] hover:text-[var(--dc-text-primary)]"}`}>
            <ScanSearch className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Pokémon Collecties
          </button>
        </div>
        <p className="px-1 pt-2 text-[10px] leading-4 text-[var(--dc-text-muted)]">
          {showingCollections
            ? "Collection photo inspections, bids and condition-aware estimates from the scheduled Marktplaats scan."
            : showingMarktplaats
            ? "Daily checked Marktplaats selection, with true below-market deals first. Shipping is shown separately."
            : showingSold
              ? "Completed sales only. The amount on each card is the saved sold price, not its current market value."
              : "Cards that are still available for sale. Completed sales are kept in the separate ledger."}
        </p>
        {showingSold && repeatedSoldPrice ? (
          <p className="mx-1 mt-2 rounded-lg border border-amber-300/12 bg-amber-500/[0.055] px-2.5 py-2 text-[10px] leading-4 text-amber-50/62">
            {repeatedSoldPrice.count} cards share {repeatedSoldPrice.amount}. This usually means one
            combined sale total was divided across the selected cards. Use <strong>Edit sale</strong> on
            a card to save its real amount, or move it back to For Sale.
          </p>
        ) : null}
      </div>
      <div className="p-2.5 sm:p-3">
        {showingCollections ? (
          <div key="marktplaats-collections">{collectionsContent}</div>
        ) : showingMarktplaats ? (
          <div key="marktplaats-deals">{marktplaatsContent}</div>
        ) : showingSold ? (
          <div key="sold-ledger">{soldContent}</div>
        ) : (
          <div key="for-sale-active">{activeContent}</div>
        )}
      </div>
    </section>
  );
}
