"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { useSettings } from "@/components/SettingsProvider";
import { formatCollectionCurrency } from "@/lib/collection";
import type { CollectionCardViewItem } from "@/types/collection-view";

const CollectionCardsView = dynamic(() => import("@/components/CollectionCardsView"), {
  loading: () => null,
});

export default function BinderWatchSection({
  items,
  sectionTrailing,
}: {
  items: CollectionCardViewItem[];
  sectionTrailing?: ReactNode;
}) {
  const { settings } = useSettings();
  const threshold = settings.binderWatchMinPrice;

  const watchedItems = useMemo(
    () =>
      items
        .filter((item) => (item.current_value ?? 0) >= threshold)
        .sort((a, b) => (b.current_value ?? -1) - (a.current_value ?? -1)),
    [items, threshold]
  );

  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-white/40">
          Binder Watch
        </h2>
        <span className="rounded-full bg-black/6 px-2 py-0.5 text-xs text-gray-400 dark:bg-white/6 dark:text-white/40">
          {watchedItems.length}
        </span>
        <span className="rounded-full border border-black/8 px-2 py-0.5 text-xs font-medium text-gray-500 dark:border-white/8 dark:text-white/45">
          {formatCollectionCurrency(threshold)}+
        </span>
        <div className="h-px flex-1 bg-black/8 dark:bg-white/10" />
        {sectionTrailing}
        <Link
          href="/settings"
          className="text-xs font-medium text-gray-400 transition-colors hover:text-gray-700 dark:text-white/45 dark:hover:text-white/75"
        >
          Change threshold
        </Link>
      </div>

      <CollectionCardsView
        items={watchedItems}
        emptyTitle="No binder watch hits yet"
        emptyText={`No binder cards above ${formatCollectionCurrency(threshold)} yet.`}
        forcedSortBy="cm_en"
        forcedSortDir="desc"
      />
    </section>
  );
}
