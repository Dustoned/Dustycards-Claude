"use client";

import { CheckCircle2, Tag } from "lucide-react";
import { useState, type ReactNode } from "react";

export default function SellingInventoryTabs({
  activeCount,
  soldCount,
  repeatedSoldPrice,
  activeContent,
  soldContent,
}: {
  activeCount: number;
  soldCount: number;
  repeatedSoldPrice?: { amount: string; count: number } | null;
  activeContent: ReactNode;
  soldContent: ReactNode;
}) {
  const [view, setView] = useState<"active" | "sold">(activeCount > 0 ? "active" : "sold");
  const showingSold = view === "sold";

  return (
    <section className="overflow-hidden rounded-[var(--ui-page-header-radius)] border border-white/8 bg-[linear-gradient(145deg,rgba(20,20,28,0.72),rgba(9,9,13,0.84))]">
      <div className="border-b border-white/8 p-2.5 sm:p-3">
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/8 bg-black/16 p-1">
          <button
            type="button"
            onClick={() => setView("active")}
            aria-pressed={!showingSold}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 text-xs font-black transition-colors ${
              !showingSold
                ? "bg-violet-500/[0.2] text-violet-50 shadow-sm"
                : "text-white/42 hover:bg-white/[0.035] hover:text-white/72"
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
            className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 text-xs font-black transition-colors ${
              showingSold
                ? "bg-emerald-500/[0.16] text-emerald-50 shadow-sm"
                : "text-white/42 hover:bg-white/[0.035] hover:text-white/72"
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Sold ledger
            <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[9px] tabular-nums">{soldCount}</span>
          </button>
        </div>
        <p className="px-1 pt-2 text-[10px] leading-4 text-white/36">
          {showingSold
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
      <div className="p-2.5 sm:p-3">{showingSold ? soldContent : activeContent}</div>
    </section>
  );
}
