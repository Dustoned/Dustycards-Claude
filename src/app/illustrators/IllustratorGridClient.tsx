"use client";

import Image from "next/image";
import Link from "next/link";
import { Images, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { SectionHeader } from "@/components/PageHeader";
import { getCachedImageUrl } from "@/lib/image-cache";
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

const EUR_FORMATTER = new Intl.NumberFormat("en-US", {
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
  return value.toLocaleString("en-US");
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

  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState("All");
  const [renderState, setRenderState] = useState({ key: "", limit: INITIAL_ILLUSTRATORS });

  const alphabetGroups = useMemo(
    () => groups.map(({ group }) => group).filter((group) => group === "#" || /^[A-Z]$/.test(group)),
    [groups]
  );
  const effectiveActiveGroup =
    activeGroup === "All" || groups.some(({ group }) => group === activeGroup) ? activeGroup : "All";

  const normalizedQuery = query.trim().toLowerCase();
  const filteredEntries = useMemo(() => {
    return allEntries.filter((entry) => {
      if (effectiveActiveGroup !== "All" && entry.group !== effectiveActiveGroup) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const topCard = entry.illustrator.topCard;
      return [
        entry.illustrator.artist,
        topCard?.name,
        topCard?.episode_name,
        topCard?.episode_code,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery));
    });
  }, [allEntries, effectiveActiveGroup, normalizedQuery]);
  const renderKey = `${effectiveActiveGroup}:${normalizedQuery}:${filteredEntries.length}:${
    filteredEntries[0]?.illustrator.artist ?? ""
  }:${filteredEntries[filteredEntries.length - 1]?.illustrator.artist ?? ""}`;
  const renderLimit = renderState.key === renderKey ? renderState.limit : INITIAL_ILLUSTRATORS;

  const visibleEntries = useMemo(
    () => filteredEntries.slice(0, renderLimit),
    [filteredEntries, renderLimit]
  );

  const visibleGroups = useMemo(() => {
    const grouped = new Map<string, { groupTotal: number; entries: VisibleIllustratorEntry[] }>();

    for (const entry of filteredEntries) {
      const existing = grouped.get(entry.group);
      if (existing) {
        existing.groupTotal += 1;
      } else {
        grouped.set(entry.group, { groupTotal: 1, entries: [] });
      }
    }

    for (const entry of visibleEntries) {
      const existing = grouped.get(entry.group);
      if (existing) {
        existing.entries.push(entry);
      }
    }

    return [...grouped.entries()]
      .map(([group, value]) => ({ group, ...value }))
      .filter(({ entries }) => entries.length > 0);
  }, [filteredEntries, visibleEntries]);

  const hasMore = visibleEntries.length < filteredEntries.length;

  return (
    <div className="space-y-8 sm:space-y-10">
      <div className="glass rounded-3xl border border-black/8 bg-white/70 p-3 shadow-sm shadow-black/5 dark:border-white/8 dark:bg-white/[0.045] sm:p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search illustrator, card, or set..."
            className="w-full rounded-2xl border border-black/8 bg-white py-3 pl-11 pr-10 text-sm font-medium text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:border-black/20 focus:outline-none dark:border-white/8 dark:bg-white/5 dark:text-white dark:focus:border-white/20"
            autoComplete="off"
            spellCheck={false}
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-white/75"
              aria-label="Clear illustrator search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveGroup("All")}
            aria-pressed={activeGroup === "All"}
            className={`inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors ${
              effectiveActiveGroup === "All"
                ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                : "border-black/8 bg-white/70 text-gray-500 hover:border-black/15 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/45 dark:hover:border-white/18 dark:hover:text-white"
            }`}
          >
            All
          </button>
          {alphabetGroups.map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => setActiveGroup(group)}
              aria-pressed={effectiveActiveGroup === group}
              className={`inline-flex min-h-8 min-w-8 items-center justify-center rounded-full border px-2.5 text-xs font-semibold transition-colors ${
                effectiveActiveGroup === group
                  ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                  : "border-black/8 bg-white/70 text-gray-500 hover:border-black/15 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/45 dark:hover:border-white/18 dark:hover:text-white"
              }`}
            >
              {group}
            </button>
          ))}
          <span className="ml-auto inline-flex min-h-8 items-center rounded-full border border-black/8 bg-white/70 px-3 text-xs font-semibold text-gray-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/42">
            {formatCount(filteredEntries.length)} visible
          </span>
        </div>
      </div>

      {filteredEntries.length === 0 && (
        <div className="rounded-3xl border border-dashed border-black/12 bg-white/60 p-5 text-sm text-gray-500 dark:border-white/12 dark:bg-white/[0.035] dark:text-white/45">
          No illustrators match this filter.
        </div>
      )}

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
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() =>
              setRenderState((current) => ({
                key: renderKey,
                limit: Math.min(
                  (current.key === renderKey ? current.limit : INITIAL_ILLUSTRATORS) +
                    ILLUSTRATOR_BATCH_SIZE,
                  filteredEntries.length
                ),
              }))
            }
            className="inline-flex min-h-10 items-center justify-center rounded-full border border-black/8 bg-white/75 px-4 text-sm font-semibold text-gray-600 shadow-sm shadow-black/5 transition-colors hover:border-black/15 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/58 dark:hover:border-white/18 dark:hover:text-white"
          >
            Load more illustrators ({formatCount(visibleEntries.length)} /{" "}
            {formatCount(filteredEntries.length)})
          </button>
        </div>
      )}
    </div>
  );
}
