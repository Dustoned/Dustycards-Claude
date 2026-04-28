"use client";

import Image from "next/image";
import Link from "next/link";
import { Images } from "lucide-react";
import { useMemo } from "react";
import { SectionHeader } from "@/components/PageHeader";
import { getCachedImageUrl } from "@/lib/image-cache";
import { useIncrementalItems } from "@/lib/use-incremental-items";
import type { IllustratorSummary } from "./page";

interface IllustratorTileConfig {
  minWidth: string;
  tileClass: string;
  imageWrapClass: string;
  titleClass: string;
  metaClass: string;
}

interface IllustratorGroup {
  group: string;
  entries: IllustratorSummary[];
}

interface VisibleIllustratorEntry {
  group: string;
  groupTotal: number;
  illustrator: IllustratorSummary;
  globalIndex: number;
}

interface Props {
  groups: IllustratorGroup[];
  gridTemplateColumns: string;
  priorityGroups: string[];
  tileConfig: IllustratorTileConfig;
}

const INITIAL_ILLUSTRATORS = 72;
const ILLUSTRATOR_BATCH_SIZE = 72;

const EUR_FORMATTER = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(value: number | null): string {
  if (value == null) return "--";
  return EUR_FORMATTER.format(value);
}

function formatCount(value: number): string {
  return value.toLocaleString("nl-NL");
}

export default function IllustratorGridClient({
  groups,
  gridTemplateColumns,
  priorityGroups,
  tileConfig,
}: Props) {
  const allEntries = useMemo<VisibleIllustratorEntry[]>(() => {
    let globalIndex = 0;

    return groups.flatMap(({ group, entries }) =>
      entries.map((illustrator) => ({
        group,
        groupTotal: entries.length,
        illustrator,
        globalIndex: globalIndex++,
      }))
    );
  }, [groups]);

  const visibleEntries = useIncrementalItems(allEntries, {
    initialCount: INITIAL_ILLUSTRATORS,
    batchSize: ILLUSTRATOR_BATCH_SIZE,
    delayMs: 100,
  });

  const visibleGroups = useMemo(() => {
    const grouped = new Map<string, { groupTotal: number; entries: VisibleIllustratorEntry[] }>();

    for (const entry of visibleEntries) {
      const existing = grouped.get(entry.group);
      if (existing) {
        existing.entries.push(entry);
      } else {
        grouped.set(entry.group, { groupTotal: entry.groupTotal, entries: [entry] });
      }
    }

    return [...grouped.entries()].map(([group, value]) => ({ group, ...value }));
  }, [visibleEntries]);

  const hasMore = visibleEntries.length < allEntries.length;

  return (
    <div className="space-y-12">
      {visibleGroups.map(({ group, groupTotal, entries }) => (
        <section key={group}>
          <SectionHeader title={group} count={groupTotal} compact />

          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns,
              justifyContent: "start",
            }}
          >
            {entries.map(({ illustrator, globalIndex }) => (
              <Link
                key={illustrator.artist}
                href={`/illustrators/${encodeURIComponent(illustrator.artist)}`}
                prefetch={false}
                className={`group glass relative flex flex-col overflow-hidden text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/8 hover:shadow-xl hover:shadow-black/8 active:scale-[0.98] dark:hover:bg-white/6 dark:hover:shadow-black/35 ${tileConfig.tileClass}`}
              >
                <div
                  className={`relative overflow-hidden rounded-2xl border border-black/6 bg-black/[0.03] shadow-md shadow-black/10 dark:border-white/8 dark:bg-white/[0.03] ${tileConfig.imageWrapClass}`}
                >
                  {illustrator.topCard?.image_url ? (
                    <Image
                      src={
                        getCachedImageUrl(illustrator.topCard.image_url) ??
                        illustrator.topCard.image_url
                      }
                      alt={illustrator.topCard.name}
                      fill
                      className="object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                      sizes={tileConfig.minWidth}
                      priority={globalIndex < 4 && priorityGroups.includes(group)}
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="text-sm font-medium text-gray-400 dark:text-white/35">
                        {illustrator.artist.slice(0, 2)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <p
                    className={`line-clamp-2 font-bold leading-snug text-gray-900 transition-colors group-hover:text-black dark:text-white dark:group-hover:text-white ${tileConfig.titleClass}`}
                  >
                    {illustrator.artist}
                  </p>
                  <div className={`space-y-0.5 text-gray-400 dark:text-white/40 ${tileConfig.metaClass}`}>
                    <p className="truncate">{illustrator.topCard?.name ?? "No featured card yet"}</p>
                    {illustrator.topCard ? (
                      <p className="truncate">
                        {illustrator.topCard.episode_name}
                        {illustrator.topCard.episode_code
                          ? ` (${illustrator.topCard.episode_code})`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-auto border-t border-black/6 pt-3 dark:border-white/8">
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-black/8 bg-white/60 px-2.5 py-1 text-[11px] font-semibold text-gray-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/55">
                      <Images className="h-3 w-3" />
                      {formatCount(illustrator.cardCount)}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-black/8 bg-white/60 px-2.5 py-1 text-[11px] font-semibold text-gray-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/55">
                      {formatCount(illustrator.expansionCount)} sets
                    </span>
                    <span className="inline-flex items-center rounded-full border border-black/8 bg-white/60 px-2.5 py-1 text-[11px] font-semibold text-gray-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/55">
                      {formatCount(illustrator.pricedCount)} priced
                    </span>
                  </div>

                  <div className="mt-3 flex items-end justify-between gap-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/35">
                      Top card value
                    </p>
                    <p className="shrink-0 whitespace-nowrap text-base font-bold tabular-nums text-gray-900 dark:text-white">
                      {formatCurrency(illustrator.topPrice)}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}

      {hasMore && (
        <p className="text-center text-xs font-medium text-gray-400 dark:text-white/35">
          Loading more illustrators...
        </p>
      )}
    </div>
  );
}
