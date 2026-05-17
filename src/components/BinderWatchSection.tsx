"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { SectionHeader } from "@/components/PageHeader";
import { useSettings } from "@/components/SettingsProvider";
import { formatCollectionCurrency } from "@/lib/collection";
import type { CollectionCardViewItem } from "@/types/collection-view";

const CollectionCardsView = dynamic(() => import("@/components/CollectionCardsView"), {
  loading: () => null,
});

function formatThresholdDraft(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function parseThresholdDraft(value: string): number {
  const normalized = value.trim().replace(",", ".");
  return normalized ? Math.max(0, Number(normalized) || 0) : 0;
}

function BinderWatchThresholdInput() {
  const { settings, set } = useSettings();
  const threshold = settings.binderWatchMinPrice;
  const [draft, setDraft] = useState(() => formatThresholdDraft(threshold));
  const [focused, setFocused] = useState(false);
  const inputValue = focused ? draft : formatThresholdDraft(threshold);

  function commitDraft() {
    const next = parseThresholdDraft(draft);
    set("binderWatchMinPrice", next);
    setDraft(formatThresholdDraft(next));
    setFocused(false);
  }

  function handleChange(value: string) {
    setDraft(value);
    set("binderWatchMinPrice", parseThresholdDraft(value));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  }

  return (
    <label
      className="inline-flex h-8 select-none items-center gap-0.5 rounded-full border border-black/8 bg-black/[0.03] px-2 text-xs font-semibold text-gray-800 transition-colors focus-within:border-black/18 dark:border-white/8 dark:bg-white/[0.04] dark:text-white/78 dark:focus-within:border-white/18"
      title="Binder Watch minimum"
    >
      <span className="text-gray-500 dark:text-white/45">€</span>
      <input
        type="text"
        inputMode="decimal"
        value={inputValue}
        onFocus={(event) => {
          setDraft(formatThresholdDraft(threshold));
          setFocused(true);
          event.currentTarget.select();
        }}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={handleKeyDown}
        className="w-[4.4rem] bg-transparent text-center font-bold tabular-nums text-gray-950 outline-none [appearance:textfield] dark:text-white [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        aria-label="Binder Watch minimum price"
      />
      <span className="text-gray-500 dark:text-white/45">+</span>
    </label>
  );
}

export default function BinderWatchSection({
  items,
  showGradedSlabPreview = false,
  sectionTrailing,
}: {
  items: CollectionCardViewItem[];
  showGradedSlabPreview?: boolean;
  sectionTrailing?: ReactNode;
}) {
  const { settings } = useSettings();
  const threshold = settings.binderWatchMinPrice;

  function isGradedItem(item: CollectionCardViewItem) {
    return Boolean(item.grading_company || item.grading_grade);
  }

  const watchedItems = useMemo(
    () =>
      items
        .filter((item) => (item.current_value ?? 0) >= threshold)
        .sort((a, b) => (b.current_value ?? -1) - (a.current_value ?? -1)),
    [items, threshold]
  );
  const hasWatchedGraded = watchedItems.some(isGradedItem);
  const splitBinderWatchByGrading = hasWatchedGraded;

  return (
    <section>
      <SectionHeader
        title="Binder Watch"
        count={watchedItems.length}
        compact
        className="mb-2.5"
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <BinderWatchThresholdInput />
            {sectionTrailing}
          </div>
        }
      />

      <CollectionCardsView
        items={watchedItems}
        emptyTitle="No binder watch hits yet"
        emptyText={`No binder cards above ${formatCollectionCurrency(threshold)} yet.`}
        forcedSortBy="cm_en"
        forcedSortDir="desc"
        showGradedSlabPreview={showGradedSlabPreview}
        splitByGrading={splitBinderWatchByGrading}
      />
    </section>
  );
}
