"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** Keeps catalogue results close to the top on phones; desktop retains its overview. */
export default function MobileSummaryDisclosure({
  title, summary, children,
}: { title: string; summary: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((value) => !value)}
        className="binder-panel flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left md:hidden"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[var(--dc-text-primary)]">{title}</span>
          <span className="mt-0.5 block text-xs text-[var(--dc-text-secondary)]">{summary}</span>
        </span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      <div id={panelId} className={`${expanded ? "block" : "hidden"} pt-3 md:block md:pt-0`}>
        {children}
      </div>
    </div>
  );
}
