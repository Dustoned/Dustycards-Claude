"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { SectionHeader } from "@/components/PageHeader";
import { useSettings } from "@/components/SettingsProvider";
import type { ModalCardData } from "@/components/card-modal/types";
import { rarityBadge } from "@/components/card-modal/utils";
import { KNOWN_RARITY_ORDER } from "@/lib/rarity";
import type { CollectionMoverItem, MoversScope } from "@/lib/movers";
import { useIncrementalItems } from "@/lib/use-incremental-items";
import type { PriceSource } from "@/lib/user-settings";
import {
  compareMoverItems,
  getMoverTileMinWidth,
  matchesDirection,
  type DirectionFilter,
  type SortKey,
} from "./MoversBrowser.utils";

const CardModal = dynamic(() => import("@/components/CardModal"), {
  ssr: false,
  loading: () => null,
});
const MoverSpotlightSections = dynamic(
  () => import("./MoverCards").then((module) => module.MoverSpotlightSections),
  {
    ssr: false,
    loading: () => null,
  }
);
const MoverGrid = dynamic(() => import("./MoverCards").then((module) => module.MoverGrid), {
  ssr: false,
  loading: () => <MoverGridFallback />,
});

const INITIAL_MOVER_RENDER_COUNT = 24;
const MOVER_RENDER_BATCH_SIZE = 36;

interface PreviewCardConfig {
  title: string;
  eyebrow: string;
  description: string;
  href: string;
  hrefLabel?: string;
  items: CollectionMoverItem[];
}

interface SpotlightConfig {
  title: string;
  item: CollectionMoverItem | null;
  windowKey: "7d" | "30d";
}

interface Props {
  movers: CollectionMoverItem[];
  activePriceSource: PriceSource;
  activeScope: MoversScope;
  eyebrow?: string;
  title?: string;
  description?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  previewCards?: PreviewCardConfig[];
  spotlights?: SpotlightConfig[];
}

interface FilterChipOption {
  key: string;
  label: string;
  count: number;
}

function filterButtonClass(active: boolean): string {
  return `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
    active
      ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
      : "border-black/8 bg-white/75 text-gray-600 hover:border-black/15 hover:text-gray-900 dark:border-white/8 dark:bg-white/[0.05] dark:text-white/60 dark:hover:border-white/16 dark:hover:text-white"
  }`;
}

function countBadgeClass(active: boolean): string {
  return `rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
    active
      ? "bg-black/12 text-current dark:bg-white/12"
      : "bg-black/6 text-gray-400 dark:bg-white/8 dark:text-white/35"
  }`;
}

function formatMoverSourceLabel(source: string): string {
  if (source === "tcgplayer") {
    return "TCGPlayer";
  }

  if (source === "graded") {
    return "Graded";
  }

  return "CardMarket";
}

function MoverGridFallback() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-80 animate-pulse rounded-[24px] border border-black/8 bg-black/[0.03] dark:border-white/8 dark:bg-white/[0.04]"
        />
      ))}
    </div>
  );
}

export default function MoversBrowser({
  movers,
  activePriceSource,
  activeScope,
  eyebrow = "Main Movers",
  title = "Full collection movers",
  description,
  emptyTitle = "Geen movers voor deze filtercombinatie",
  emptyDescription = "Pas je zoekterm of filters aan om weer kaarten te zien.",
  previewCards = [],
  spotlights = [],
}: Props) {
  const { settings } = useSettings();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>(
    activeScope === "grading" ? "grade_score" : "move"
  );
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedRarities, setSelectedRarities] = useState<string[]>([]);
  const [cheapOnly, setCheapOnly] = useState(false);
  const [highRarityOnly, setHighRarityOnly] = useState(false);
  const [highGradingUpsideOnly, setHighGradingUpsideOnly] = useState(false);
  const [ownedMultipleOnly, setOwnedMultipleOnly] = useState(false);
  const [selectedCard, setSelectedCard] = useState<ModalCardData | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<string | null>(null);
  const [cardDetailCache, setCardDetailCache] = useState<Record<string, ModalCardData>>({});
  const [detailError, setDetailError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const isGradingScope = activeScope === "grading";
  const isGradedScope = activeScope === "graded";
  const isRawScope = !isGradedScope && !isGradingScope;
  const moverTileMinWidth = getMoverTileMinWidth(settings.cardSize, settings.widescreen);
  const visiblePreviewCards = previewCards.filter((card) => card.items.length > 0);
  const visibleSpotlights = spotlights.filter((spotlight) => spotlight.item);
  const scopeHref = useMemo(() => {
    return (scope: MoversScope) => {
      const params = new URLSearchParams(searchParams.toString());

      if (scope === "collection") {
        params.delete("scope");
      } else {
        params.set("scope", scope);
      }

      const query = params.toString();
      return query ? `${pathname}?${query}` : pathname;
    };
  }, [pathname, searchParams]);
  const priceSourceHref = useMemo(() => {
    return (source: PriceSource) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("source", source);
      const query = params.toString();
      return query ? `${pathname}?${query}` : pathname;
    };
  }, [pathname, searchParams]);
  const modeHref = useMemo(() => {
    return (mode: "raw" | "graded" | "targets") => {
      const params = new URLSearchParams(searchParams.toString());

      if (mode === "raw") {
        params.delete("scope");
      } else if (mode === "graded") {
        params.set("scope", "graded");
      } else {
        params.set("scope", "grading");
      }

      const query = params.toString();
      return query ? `${pathname}?${query}` : pathname;
    };
  }, [pathname, searchParams]);

  const sortOptions = useMemo(() => {
    if (activeScope === "grading") {
      return [
        { key: "grade_score" as const, label: "Grade Score" },
        { key: "grade_multiplier" as const, label: "Multiplier" },
        { key: "grade_gap" as const, label: "Gap" },
        { key: "raw_price_low" as const, label: "Raw Cheap" },
        { key: "price_high" as const, label: "Graded High" },
        { key: "7d" as const, label: "7D" },
        { key: "30d" as const, label: "30D" },
        { key: "name" as const, label: "Name" },
      ];
    }

    return [
      { key: "move" as const, label: "Move" },
      { key: "7d" as const, label: "7D" },
      { key: "30d" as const, label: "30D" },
      { key: "tracked" as const, label: "Tracked" },
      { key: "low_rebound" as const, label: "Low" },
      { key: "peak_gap" as const, label: "Peak" },
      { key: "price_low" as const, label: "Cheap" },
      { key: "price_high" as const, label: "Expensive" },
      { key: "name" as const, label: "Name" },
    ];
  }, [activeScope]);

  const sourceOptions = useMemo<FilterChipOption[]>(() => {
    const counts = new Map<string, number>();
    for (const item of movers) {
      counts.set(item.source, (counts.get(item.source) ?? 0) + 1);
    }

    return [...counts.entries()]
      .sort(([a], [b]) => {
        const order = ["cardmarket", "tcgplayer", "graded"];
        const aIndex = order.indexOf(a);
        const bIndex = order.indexOf(b);
        if (aIndex !== -1 || bIndex !== -1) {
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        }

        return a.localeCompare(b, undefined, { sensitivity: "base" });
      })
      .map(([source, count]) => ({
        key: source,
        label: formatMoverSourceLabel(source),
        count,
      }));
  }, [movers]);
  const showSourceFilter = sourceOptions.length > 1;

  const rarityOptions = useMemo<FilterChipOption[]>(() => {
    const counts = new Map<string, number>();
    for (const item of movers) {
      if (!item.normalizedRarity) continue;
      counts.set(item.normalizedRarity, (counts.get(item.normalizedRarity) ?? 0) + 1);
    }

    return [...counts.entries()]
      .sort(([a], [b]) => {
        const aIndex = KNOWN_RARITY_ORDER.indexOf(a as (typeof KNOWN_RARITY_ORDER)[number]);
        const bIndex = KNOWN_RARITY_ORDER.indexOf(b as (typeof KNOWN_RARITY_ORDER)[number]);

        if (aIndex !== -1 || bIndex !== -1) {
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          if (aIndex !== bIndex) return aIndex - bIndex;
        }

        return a.localeCompare(b, undefined, { sensitivity: "base" });
      })
      .map(([label, count]) => ({ key: label, label, count }));
  }, [movers]);

  const visibleMovers = useMemo(() => {
    const filtered = movers.filter((item) => {
      if (!isGradingScope && direction !== "all" && !matchesDirection(item, direction)) {
        return false;
      }

      if (selectedSources.length > 0 && !selectedSources.includes(item.source)) {
        return false;
      }

      if (
        selectedRarities.length > 0 &&
        (!item.normalizedRarity || !selectedRarities.includes(item.normalizedRarity))
      ) {
        return false;
      }

      if (cheapOnly) {
        const cheapReferencePrice = isGradingScope ? item.grading?.rawPrice : item.currentPrice;
        if (cheapReferencePrice == null || cheapReferencePrice > 15) {
          return false;
        }
      }

      if (highRarityOnly && item.rarityWeight < 1.15) {
        return false;
      }

      if (
        isGradingScope &&
        highGradingUpsideOnly &&
        ((item.grading?.valueMultiplier ?? 0) < 3 || (item.grading?.valueGap ?? 0) < 20)
      ) {
        return false;
      }

      if (ownedMultipleOnly && item.ownedCount < 2) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        item.name,
        item.cardNumber,
        item.episodeName,
        item.episodeCode,
        item.gradedLabel,
        item.normalizedRarity,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });

    return [...filtered].sort((a, b) => compareMoverItems(a, b, sortKey, direction));
  }, [
    movers,
    direction,
    selectedSources,
    selectedRarities,
    cheapOnly,
    highRarityOnly,
    highGradingUpsideOnly,
    isGradingScope,
    ownedMultipleOnly,
    normalizedSearch,
    sortKey,
  ]);
  const renderedMovers = useIncrementalItems(visibleMovers, {
    initialCount: INITIAL_MOVER_RENDER_COUNT,
    batchSize: MOVER_RENDER_BATCH_SIZE,
  });
  const hasDirectionFilter = !isGradingScope && direction !== "all";

  const filterBadgeCount =
    selectedSources.length +
    selectedRarities.length +
    (hasDirectionFilter ? 1 : 0) +
    (cheapOnly ? 1 : 0) +
    (highRarityOnly ? 1 : 0) +
    (isGradingScope && highGradingUpsideOnly ? 1 : 0) +
    (ownedMultipleOnly ? 1 : 0);

  const activeFilterLabels = [
    ...(hasDirectionFilter ? [direction === "risers" ? "Risers" : "Fallers"] : []),
    ...(cheapOnly ? [isGradingScope ? "Raw <= 15" : "Cheap <= 15"] : []),
    ...(highRarityOnly ? ["High rarity"] : []),
    ...(isGradingScope && highGradingUpsideOnly ? ["3x+ graded"] : []),
    ...(ownedMultipleOnly ? ["Owned x2+"] : []),
    ...selectedSources.map(formatMoverSourceLabel),
    ...selectedRarities,
  ];

  function toggleArrayValue(current: string[], value: string) {
    return current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];
  }

  function clearAllFilters() {
    setDirection("all");
    setSelectedSources([]);
    setSelectedRarities([]);
    setCheapOnly(false);
    setHighRarityOnly(false);
    setHighGradingUpsideOnly(false);
    setOwnedMultipleOnly(false);
    setSearch("");
  }

  const openMoverCard = useCallback(async (cardId: string) => {
    const cached = cardDetailCache[cardId];
    if (cached) {
      setSelectedCard(cached);
      setDetailError(null);
      return;
    }

    setLoadingCardId(cardId);
    setDetailError(null);

    try {
      const response = await fetch(`/api/cards/${encodeURIComponent(cardId)}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Could not load card details");
      }

      const data = (await response.json()) as ModalCardData;
      setCardDetailCache((current) => ({ ...current, [cardId]: data }));
      setSelectedCard(data);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Could not load card details");
    } finally {
      setLoadingCardId((current) => (current === cardId ? null : current));
    }
  }, [cardDetailCache]);
  const handleOpenMoverCard = useCallback(
    (cardId: string) => {
      void openMoverCard(cardId);
    },
    [openMoverCard]
  );

  return (
    <div className="space-y-10">
      <div className="space-y-3 rounded-2xl border border-black/8 bg-white/70 p-2 shadow-sm shadow-black/5 dark:border-white/8 dark:bg-white/[0.04]">
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { key: "raw" as const, label: "Raw Movers", active: isRawScope },
            { key: "graded" as const, label: "Graded Market", active: isGradedScope },
            { key: "targets" as const, label: "Grade Targets", active: isGradingScope },
          ].map((option) => (
            <Link
              key={option.key}
              href={modeHref(option.key)}
              prefetch={false}
              className={`inline-flex min-h-10 items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                option.active
                  ? "bg-gray-950 text-white shadow-sm shadow-black/10 dark:bg-white dark:text-gray-950"
                  : "text-gray-500 hover:bg-black/[0.04] hover:text-gray-900 dark:text-white/54 dark:hover:bg-white/[0.06] dark:hover:text-white"
              }`}
              aria-current={option.active ? "page" : undefined}
            >
              {option.label}
            </Link>
          ))}
        </div>

        {isRawScope ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/8 px-2 pt-3 dark:border-white/8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">
                Scope
              </span>
              {[
                { key: "collection" as const, label: "Collection" },
                { key: "all" as const, label: "All Cards" },
              ].map((option) => {
                const active = activeScope === option.key;

                return (
                  <Link
                    key={option.key}
                    href={scopeHref(option.key)}
                    prefetch={false}
                    className={filterButtonClass(active)}
                    aria-current={active ? "page" : undefined}
                  >
                    {option.label}
                  </Link>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">
                Source
              </span>
              {[
                { key: "cm_en", label: "CardMarket" },
                { key: "tcp", label: "TCGPlayer" },
              ].map((option) => {
                const active = activePriceSource === option.key;

                return (
                  <Link
                    key={option.key}
                    href={priceSourceHref(option.key as PriceSource)}
                    prefetch={false}
                    className={filterButtonClass(active)}
                    aria-current={active ? "page" : undefined}
                  >
                    {option.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {visibleSpotlights.length > 0 || visiblePreviewCards.length > 0 ? (
        <MoverSpotlightSections
          spotlights={visibleSpotlights}
          previewCards={visiblePreviewCards}
          loadingCardId={loadingCardId}
          onOpenCard={handleOpenMoverCard}
        />
      ) : null}

      <section>
        <SectionHeader
          eyebrow={eyebrow}
          title={title}
          description={description}
          actions={
            <p className="shrink-0 text-sm text-gray-500 dark:text-white/46">
              {visibleMovers.length.toLocaleString()} / {movers.length.toLocaleString()} visible
            </p>
          }
        />

        {detailError ? (
          <div className="mb-4 rounded-2xl border border-rose-400/20 bg-rose-400/[0.08] px-4 py-3 text-sm text-rose-700 dark:text-rose-200">
            {detailError}
          </div>
        ) : null}

        <div className="glass mb-4 space-y-3 rounded-3xl border border-black/8 px-4 py-4 shadow-sm shadow-black/5 dark:border-white/8">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-white/35" />
              <input
                type="text"
                placeholder="Search card, set, number or rarity"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-2xl border border-black/8 bg-white/78 py-2.5 pl-10 pr-10 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-black/14 dark:border-white/8 dark:bg-white/[0.05] dark:text-white dark:placeholder:text-white/28 dark:focus:border-white/14"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-900 dark:text-white/35 dark:hover:text-white"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <label className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-black/8 bg-white/78 px-3 py-1.5 text-xs font-semibold text-gray-500 dark:border-white/8 dark:bg-white/[0.05] dark:text-white/58">
                Sort
                <select
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as SortKey)}
                  className="bg-transparent text-sm font-semibold text-gray-900 outline-none dark:text-white"
                >
                  {sortOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setFiltersExpanded((current) => !current)}
                className={filterButtonClass(filtersExpanded || filterBadgeCount > 0)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
                {filterBadgeCount > 0 ? (
                  <span className={countBadgeClass(filtersExpanded || filterBadgeCount > 0)}>
                    {filterBadgeCount}
                  </span>
                ) : null}
              </button>
              {filterBadgeCount > 0 ? (
                <button type="button" onClick={clearAllFilters} className={filterButtonClass(false)}>
                  Clear all
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/35">
              Quick
            </span>
            {!isGradingScope ? (
              <>
                {[
                  { key: "all", label: "All" },
                  { key: "risers", label: "Risers" },
                  { key: "fallers", label: "Fallers" },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setDirection(option.key as DirectionFilter)}
                    className={filterButtonClass(direction === option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </>
            ) : null}
            <button
              type="button"
              onClick={() => setCheapOnly((current) => !current)}
              className={filterButtonClass(cheapOnly)}
            >
              {isGradingScope ? "Raw <= 15" : "Cheap <= 15"}
            </button>
            {isGradingScope ? (
              <button
                type="button"
                onClick={() => setHighGradingUpsideOnly((current) => !current)}
                className={filterButtonClass(highGradingUpsideOnly)}
              >
                3x+ graded
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setHighRarityOnly((current) => !current)}
              className={filterButtonClass(highRarityOnly)}
            >
              High rarity
            </button>
          </div>

          {activeFilterLabels.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {activeFilterLabels.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center rounded-full border border-black/8 bg-black/[0.035] px-2.5 py-1 text-xs font-medium text-gray-600 dark:border-white/8 dark:bg-white/[0.04] dark:text-white/60"
                >
                  {label}
                </span>
              ))}
            </div>
          ) : null}

          {filtersExpanded ? (
            <div
              className={`grid gap-3 ${
                showSourceFilter
                  ? "xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.4fr)]"
                  : "xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]"
              }`}
            >
              <section className="overflow-hidden rounded-2xl border border-black/8 bg-white/72 px-3 py-3 shadow-sm shadow-black/5 dark:border-white/8 dark:bg-white/[0.04] dark:shadow-black/20">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/35">
                    Quick Filters
                  </p>
                  <span className="text-[11px] text-gray-400 dark:text-white/35">
                    {Number(cheapOnly) +
                      Number(highRarityOnly) +
                      Number(isGradingScope && highGradingUpsideOnly) +
                      Number(ownedMultipleOnly)}{" "}
                    active
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCheapOnly((current) => !current)}
                    className={filterButtonClass(cheapOnly)}
                  >
                    {isGradingScope ? "Raw <= 15" : "Cheap <= 15"}
                  </button>
                  {isGradingScope ? (
                    <button
                      type="button"
                      onClick={() => setHighGradingUpsideOnly((current) => !current)}
                      className={filterButtonClass(highGradingUpsideOnly)}
                    >
                      3x+ graded
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setHighRarityOnly((current) => !current)}
                    className={filterButtonClass(highRarityOnly)}
                  >
                    High rarity
                  </button>
                  <button
                    type="button"
                    onClick={() => setOwnedMultipleOnly((current) => !current)}
                    className={filterButtonClass(ownedMultipleOnly)}
                  >
                    Owned x2+
                  </button>
                </div>
              </section>

              {showSourceFilter ? (
                <section className="overflow-hidden rounded-2xl border border-black/8 bg-white/72 px-3 py-3 shadow-sm shadow-black/5 dark:border-white/8 dark:bg-white/[0.04] dark:shadow-black/20">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/35">
                      Source
                    </p>
                    <span className="text-[11px] text-gray-400 dark:text-white/35">
                      {selectedSources.length || sourceOptions.length} selected
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {sourceOptions.map((option) => {
                      const active = selectedSources.includes(option.key);
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() =>
                            setSelectedSources((current) => toggleArrayValue(current, option.key))
                          }
                          className={filterButtonClass(active)}
                        >
                          {option.label}
                          <span className={countBadgeClass(active)}>{option.count}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <section className="overflow-hidden rounded-2xl border border-black/8 bg-white/72 px-3 py-3 shadow-sm shadow-black/5 dark:border-white/8 dark:bg-white/[0.04] dark:shadow-black/20">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/35">
                    Rarity
                  </p>
                  <span className="text-[11px] text-gray-400 dark:text-white/35">
                    {selectedRarities.length || rarityOptions.length} selected
                  </span>
                </div>
                <div className="mt-3 flex max-h-40 flex-wrap gap-2 overflow-y-auto pr-1">
                  {rarityOptions.map((option) => {
                    const active = selectedRarities.includes(option.key);
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() =>
                          setSelectedRarities((current) => toggleArrayValue(current, option.key))
                        }
                        className={`${filterButtonClass(active)} ${
                          option.label ? rarityBadge(option.label) : ""
                        }`}
                      >
                        {option.label}
                        <span className={countBadgeClass(active)}>{option.count}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          ) : null}
        </div>

        {visibleMovers.length === 0 ? (
          <div className="rounded-[24px] border border-black/8 bg-black/[0.03] p-8 text-center dark:border-white/8 dark:bg-white/[0.04]">
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {emptyTitle}
            </p>
            <p className="mt-2 text-sm text-gray-500 dark:text-white/48">
              {emptyDescription}
            </p>
          </div>
        ) : (
          <MoverGrid
            movers={renderedMovers}
            minTileWidth={moverTileMinWidth}
            loadingCardId={loadingCardId}
            displayMode={isGradingScope ? "target" : isGradedScope ? "graded" : "raw"}
            onOpenCard={handleOpenMoverCard}
          />
        )}
      </section>

      {selectedCard ? (
        <CardModal
          key={`${selectedCard.id}:${selectedCard.price_fetched_at ?? "none"}`}
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
        />
      ) : null}
    </div>
  );
}
