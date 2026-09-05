"use client";

import { useId, useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";

export default function MarketFilterToolbar({ search, sort, children, reset, activeFilterCount }: {
  search: ReactNode;
  sort: ReactNode;
  children: ReactNode;
  reset: ReactNode;
  activeFilterCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const filtersId = useId();
  return (
    <div className="grid grid-cols-2 items-end gap-3 lg:flex lg:flex-wrap" data-market-filter-toolbar>
      <div className="col-span-2 min-w-0 lg:min-w-56 lg:flex-[2]">{search}</div>
      <div className="min-w-0 lg:min-w-36 lg:flex-1">{sort}</div>
      <button type="button" aria-expanded={expanded} aria-controls={filtersId} onClick={() => setExpanded((value) => !value)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 px-3 text-sm font-semibold text-[var(--dc-text-secondary)] lg:hidden">
        <SlidersHorizontal className="size-4" aria-hidden="true" />
        {expanded ? "Fewer filters" : "More filters"}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
      </button>
      <div id={filtersId} className={`${expanded ? "contents" : "hidden"} lg:contents [&>label]:min-w-0 lg:[&>label]:min-w-28 lg:[&>label]:flex-1`}>
        {children}
      </div>
      {reset ? <div className="col-span-2 [&>button]:w-full">{reset}</div> : null}
    </div>
  );
}
