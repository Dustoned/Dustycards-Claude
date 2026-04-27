"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { HeaderPill, SectionHeader } from "@/components/PageHeader";
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
      <SectionHeader
        title="Binder Watch"
        count={watchedItems.length}
        compact
        className="mb-4"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <HeaderPill>{formatCollectionCurrency(threshold)}+</HeaderPill>
            {sectionTrailing}
            <Link
              href="/settings"
              prefetch={false}
              className="text-xs font-medium text-gray-400 transition-colors hover:text-gray-700 dark:text-white/45 dark:hover:text-white/75"
            >
              Change threshold
            </Link>
          </div>
        }
      />

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
