"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  Images,
  Layers3,
  Palette,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { SectionHeader } from "@/components/PageHeader";
import IllustratorSortToggle from "@/app/illustrators/IllustratorSortToggle";
import { textMatchesSearchQuery } from "@/lib/card-search";
import { getCardImageClassName } from "@/lib/card-image-display";
import { formatCurrency } from "@/lib/format";
import { getCachedImageUrl } from "@/lib/image-cache";
import type { IllustratorSort } from "@/lib/illustrators";
import type { IllustratorFeaturedCard, IllustratorSummary } from "./page";

interface IllustratorTileConfig {
  minWidth: string;
  tileClass: string;
  mediaClass: string;
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
  gameQueryParam?: string | null;
  activeSort: IllustratorSort;
}

const INITIAL_ILLUSTRATORS = 24;
const ILLUSTRATOR_BATCH_SIZE = 24;

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export default function IllustratorGridClient({
  groups,
  gridTemplateColumns,
  priorityGroups,
  tileConfig,
  gameQueryParam,
  activeSort,
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
      const secondCard = entry.illustrator.secondCard;
      return textMatchesSearchQuery([
        entry.illustrator.artist,
        topCard?.name,
        topCard?.episode_name,
        topCard?.episode_code,
        secondCard?.name,
        secondCard?.episode_name,
        secondCard?.episode_code,
      ], normalizedQuery);
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
      <div className="binder-panel sticky top-[calc(var(--ui-app-header-height)+0.75rem)] z-20 rounded-[1.4rem] p-2.5 shadow-xl shadow-black/32 sm:p-3">
        <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-white/34" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search illustrator, featured card, or set..."
                className="h-11 w-full rounded-xl border border-white/9 bg-black/25 pl-10 pr-10 text-sm font-semibold text-white shadow-inner shadow-black/18 transition-colors placeholder:font-medium placeholder:text-white/30 focus:border-violet-300/28 focus:bg-black/18 focus:outline-none"
                autoComplete="off"
                spellCheck={false}
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-white/34 transition-colors hover:bg-white/8 hover:text-white/78"
                  aria-label="Clear illustrator search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <span className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04] px-3 text-xs font-bold tabular-nums text-white/52">
              {formatCount(filteredEntries.length)}
              <span className="ml-1 hidden font-semibold text-white/30 sm:inline">artists</span>
            </span>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden h-9 shrink-0 items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/32 xl:inline-flex">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Sort
            </span>
            <div className="min-w-0 flex-1 sm:flex-none">
              <IllustratorSortToggle activeSort={activeSort} />
            </div>
          </div>
        </div>

        <label className="relative mt-2.5 block sm:hidden">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-bold uppercase tracking-[0.14em] text-white/32">
            Browse
          </span>
          <select
            value={effectiveActiveGroup}
            onChange={(event) => setActiveGroup(event.target.value)}
            aria-label="Filter illustrators by first letter"
            className="h-10 w-full appearance-none rounded-xl border border-white/8 bg-black/20 pl-[4.35rem] pr-9 text-xs font-bold text-white/76 outline-none transition-colors focus:border-violet-300/28"
          >
            <option value="All">All illustrators</option>
            {alphabetGroups.map((group) => (
              <option key={group} value={group}>
                {group === "#" ? "Other names" : `Starts with ${group}`}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-white/36">
            ▼
          </span>
        </label>

        <div className="-mx-0.5 mt-2.5 hidden overflow-x-auto px-0.5 [scrollbar-width:none] sm:block [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max min-w-full items-center gap-1 rounded-xl border border-white/7 bg-black/20 p-1">
            <button
              type="button"
              onClick={() => setActiveGroup("All")}
              aria-pressed={activeGroup === "All"}
              className={`inline-flex h-8 min-w-12 shrink-0 items-center justify-center rounded-lg border px-3 text-xs font-bold transition-all ${
                effectiveActiveGroup === "All"
                  ? "border-violet-300/28 bg-violet-500/85 text-white shadow-[0_6px_18px_rgba(124,58,237,0.2)]"
                  : "border-transparent bg-transparent text-white/40 hover:bg-white/[0.055] hover:text-white"
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
                className={`inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg border px-2.5 text-xs font-bold transition-all ${
                  effectiveActiveGroup === group
                    ? "border-violet-300/28 bg-violet-500/85 text-white shadow-[0_6px_18px_rgba(124,58,237,0.2)]"
                    : "border-transparent bg-transparent text-white/40 hover:bg-white/[0.055] hover:text-white"
                }`}
              >
                {group}
              </button>
            ))}
          </div>
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
            className="grid grid-cols-1 gap-3 sm:[grid-template-columns:var(--illustrator-grid-columns)]"
            style={
              {
                "--illustrator-grid-columns": gridTemplateColumns,
                justifyContent: "stretch",
              } as CSSProperties
            }
          >
            {entries.map(({ illustrator, globalIndex }) => {
              const featuredCards = [illustrator.topCard, illustrator.secondCard].filter(
                (card): card is IllustratorFeaturedCard & { image_url: string } =>
                  typeof card?.image_url === "string" && card.image_url.length > 0
              );
              const imageUrl = illustrator.topCard?.image_url
                ? getCachedImageUrl(illustrator.topCard.image_url) ?? illustrator.topCard.image_url
                : null;
              return (
                <Link
                  key={illustrator.artist}
                  href={
                    gameQueryParam
                      ? `/illustrators/${encodeURIComponent(illustrator.artist)}?game=${gameQueryParam}`
                      : `/illustrators/${encodeURIComponent(illustrator.artist)}`
                  }
                  prefetch={false}
                  className={`group relative flex min-h-full flex-col overflow-hidden border border-[rgb(var(--dc-border-rgb)/0.88)] bg-[linear-gradient(145deg,rgb(var(--dc-surface-elevated-rgb)/0.94),rgb(var(--dc-surface-primary-rgb)/0.97))] text-left shadow-[0_12px_34px_rgba(0,0,0,0.16)] transition-[border-color,box-shadow,transform] duration-200 before:pointer-events-none before:absolute before:inset-x-8 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-violet-300/50 before:to-transparent hover:-translate-y-0.5 hover:border-[rgb(var(--dc-border-hover-rgb)/0.96)] hover:shadow-[0_18px_42px_rgba(0,0,0,0.28)] active:scale-[0.985] ${tileConfig.tileClass}`}
                >
                  <div className={`relative isolate min-h-24 w-full overflow-hidden rounded-2xl border border-white/8 bg-black/24 ${tileConfig.mediaClass}`}>
                    {imageUrl ? (
                      <>
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(139,92,246,0.18),transparent_58%),linear-gradient(110deg,rgba(5,6,10,0.9),rgba(14,15,24,0.55)_48%,rgba(5,6,10,0.88))] transition duration-300 group-hover:brightness-110" />
                        <div className="absolute inset-0 z-10 flex items-center justify-center gap-1.5 p-2.5 sm:gap-2">
                          {featuredCards.map((card) => {
                            const cardImageUrl =
                              getCachedImageUrl(card.image_url) ?? card.image_url;

                            return (
                              <div
                                key={card.id}
                                className={featuredCards.length > 1 ? "relative h-full w-[46%]" : "relative h-full w-full"}
                              >
                                <Image
                                  src={cardImageUrl}
                                  alt={card.name}
                                  fill
                                  className={getCardImageClassName(
                                    card.image_url,
                                    "rounded-[4.75%] object-contain drop-shadow-[0_12px_22px_rgba(0,0,0,0.42)] transition-transform duration-300 group-hover:scale-[1.035]"
                                  )}
                                  sizes={featuredCards.length > 1 ? `calc(${tileConfig.minWidth} / 2)` : tileConfig.minWidth}
                                  priority={globalIndex < 4 && priorityGroups.includes(group)}
                                  unoptimized
                                />
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_15%,rgba(139,92,246,0.18),transparent_58%)] text-white/34">
                        <Palette className="h-6 w-6" />
                        <span className="mt-2 text-sm font-bold uppercase tracking-[0.18em]">
                          {illustrator.artist.slice(0, 2)}
                        </span>
                      </div>
                    )}
                    <span className="absolute left-2.5 top-2.5 z-20 inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/45 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white/62 backdrop-blur-md">
                      <Sparkles className="h-2.5 w-2.5 text-amber-200/80" />
                      Featured work
                    </span>
                  </div>

                  <div className="mt-3 flex min-h-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-violet-200/48">
                          Illustrator
                        </p>
                        <h3 className={`mt-1 line-clamp-2 font-extrabold leading-tight tracking-tight text-white transition-colors group-hover:text-violet-100 ${tileConfig.titleClass}`}>
                          {illustrator.artist}
                        </h3>
                      </div>
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04] text-white/34 transition-all group-hover:border-violet-300/20 group-hover:bg-violet-400/10 group-hover:text-violet-100">
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </span>
                    </div>

                    <div className={`mt-2 min-h-[2.35rem] text-white/42 ${tileConfig.metaClass}`}>
                      <p className="truncate font-semibold text-white/62">
                        {illustrator.topCard?.name ?? "No featured card yet"}
                      </p>
                      {illustrator.topCard ? (
                        <p className="mt-0.5 truncate">
                          {illustrator.topCard.episode_name}
                          {illustrator.topCard.episode_code
                            ? ` · ${illustrator.topCard.episode_code}`
                            : ""}
                        </p>
                      ) : null}
                    </div>

                    <div className="mt-3 grid grid-cols-2 divide-x divide-white/7 overflow-hidden rounded-xl border border-white/7 bg-black/18">
                      <div className="min-w-0 px-2 py-2">
                        <Images className="mb-1 h-3 w-3 text-violet-200/58" />
                        <p className="truncate text-[9px] font-bold uppercase tracking-[0.1em] text-white/28">Cards</p>
                        <p className="mt-0.5 truncate text-xs font-extrabold tabular-nums text-white/78">{formatCount(illustrator.cardCount)}</p>
                      </div>
                      <div className="min-w-0 px-2 py-2">
                        <Layers3 className="mb-1 h-3 w-3 text-sky-200/58" />
                        <p className="truncate text-[9px] font-bold uppercase tracking-[0.1em] text-white/28">Sets</p>
                        <p className="mt-0.5 truncate text-xs font-extrabold tabular-nums text-white/78">{formatCount(illustrator.expansionCount)}</p>
                      </div>
                    </div>

                    <div className="mt-3 border-t border-white/7 pt-3">
                      <div className="flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/28">Top card</p>
                          <p className="mt-0.5 truncate text-[10px] font-semibold text-white/38">Market value</p>
                        </div>
                        <p className="shrink-0 whitespace-nowrap text-base font-extrabold tabular-nums text-white">
                          {formatCurrency(illustrator.topPrice)}
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
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
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/9 bg-white/[0.045] px-5 text-sm font-bold text-white/58 shadow-sm shadow-black/20 transition-all hover:border-violet-300/20 hover:bg-violet-400/[0.08] hover:text-white"
          >
            Load more illustrators ({formatCount(visibleEntries.length)} /{" "}
            {formatCount(filteredEntries.length)})
          </button>
        </div>
      )}
    </div>
  );
}
