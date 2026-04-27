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
  buildSortSummary,
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
  const [sortKey, setSortKey] = useState<SortKey>("move");
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedRarities, setSelectedRarities] = useState<string[]>([]);
  const [cheapOnly, setCheapOnly] = useState(false);
  const [highRarityOnly, setHighRarityOnly] = useState(false);
  const [ownedMultipleOnly, setOwnedMultipleOnly] = useState(false);
  const [selectedCard, setSelectedCard] = useState<ModalCardData | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<string | null>(null);
  const [cardDetailCache, setCardDetailCache] = useState<Record<string, ModalCardData>>({});
  const [detailError, setDetailError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim().toLowerCase();
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

  const sourceOptions = useMemo<FilterChipOption[]>(() => {
    const counts = new Map<string, number>();
    for (const item of movers) {
      counts.set(item.source, (counts.get(item.source) ?? 0) + 1);
    }

    return ["cardmarket", "tcgplayer"].map((source) => ({
      key: source,
      label: source === "tcgplayer" ? "TCGPlayer" : "CardMarket",
      count: counts.get(source) ?? 0,
    }));
  }, [movers]);

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
      if (direction !== "all" && !matchesDirection(item, direction)) {
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

      if (cheapOnly && item.currentPrice > 15) {
        return false;
      }

      if (highRarityOnly && item.rarityWeight < 1.15) {
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
    ownedMultipleOnly,
    normalizedSearch,
    sortKey,
  ]);
  const renderedMovers = useIncrementalItems(visibleMovers, {
    initialCount: INITIAL_MOVER_RENDER_COUNT,
    batchSize: MOVER_RENDER_BATCH_SIZE,
  });

  const filterBadgeCount =
    selectedSources.length +
    selectedRarities.length +
    (direction === "all" ? 0 : 1) +
    (cheapOnly ? 1 : 0) +
    (highRarityOnly ? 1 : 0) +
    (ownedMultipleOnly ? 1 : 0);

  const activeFilterLabels = [
    ...(direction === "all" ? [] : [direction === "risers" ? "Risers" : "Fallers"]),
    ...(cheapOnly ? ["Cheap <= 15"] : []),
    ...(highRarityOnly ? ["High rarity"] : []),
    ...(ownedMultipleOnly ? ["Owned x2+"] : []),
    ...selectedSources.map((source) => (source === "tcgplayer" ? "TCGPlayer" : "CardMarket")),
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
      <div className="flex flex-wrap items-center gap-2 rounded-[24px] border border-black/8 bg-black/[0.03] p-2 shadow-sm shadow-black/5 dark:border-white/8 dark:bg-white/[0.04]">
        {[
          { key: "collection" as const, label: "Collection Movers" },
          { key: "all" as const, label: "All Card Movers" },
        ].map((option) => {
          const active = activeScope === option.key;

          return (
            <Link
              key={option.key}
              href={scopeHref(option.key)}
              prefetch={false}
              className={`inline-flex min-h-[var(--ui-chip-min-height)] items-center rounded-2xl px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold transition-colors ${
                active
                  ? "bg-gray-950 text-white shadow-sm shadow-black/10 dark:bg-white dark:text-gray-950"
                  : "text-gray-500 hover:bg-white/70 hover:text-gray-900 dark:text-white/54 dark:hover:bg-white/[0.06] dark:hover:text-white"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {option.label}
            </Link>
          );
        })}
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
              <span className="inline-flex min-w-0 max-w-full items-center gap-2 truncate rounded-full border border-black/8 bg-white/70 px-3 py-1.5 text-[11px] font-medium text-gray-500 dark:border-white/8 dark:bg-white/[0.04] dark:text-white/55">
                {buildSortSummary(sortKey, direction)}
              </span>
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

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/35">
                Sort
              </span>
              <div className="inline-flex min-w-0 max-w-full overflow-x-auto rounded-xl border border-black/8 bg-black/[0.03] dark:border-white/8 dark:bg-white/[0.03]">
                {[
                  { key: "move", label: "Move" },
                  { key: "7d", label: "7D" },
                  { key: "30d", label: "30D" },
                  { key: "tracked", label: "Tracked" },
                  { key: "low_rebound", label: "Low" },
                  { key: "peak_gap", label: "Peak" },
                  { key: "price_low", label: "Cheap" },
                  { key: "price_high", label: "Expensive" },
                  { key: "name", label: "Name" },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setSortKey(option.key as SortKey)}
                    className={`shrink-0 px-3 py-1.5 text-xs font-semibold transition-colors ${
                      sortKey === option.key
                        ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                        : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="hidden h-5 w-px bg-black/8 dark:bg-white/8 md:block" />

            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/35">
                Direction
              </span>
              <div className="inline-flex min-w-0 max-w-full overflow-x-auto rounded-xl border border-black/8 bg-black/[0.03] dark:border-white/8 dark:bg-white/[0.03]">
                {[
                  { key: "all", label: "All" },
                  { key: "risers", label: "Risers" },
                  { key: "fallers", label: "Fallers" },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setDirection(option.key as DirectionFilter)}
                    className={`shrink-0 px-3 py-1.5 text-xs font-semibold transition-colors ${
                      direction === option.key
                        ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                        : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="hidden h-5 w-px bg-black/8 dark:bg-white/8 md:block" />

            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/35">
                Source
              </span>
              <div className="inline-flex min-w-0 max-w-full overflow-x-auto rounded-xl border border-black/8 bg-black/[0.03] dark:border-white/8 dark:bg-white/[0.03]">
                {[
                  { key: "cm_en", label: "CM" },
                  { key: "tcp", label: "TCP" },
                ].map((option) => {
                  const active = activePriceSource === option.key;

                  return (
                    <Link
                      key={option.key}
                      href={priceSourceHref(option.key as PriceSource)}
                      prefetch={false}
                      className={`shrink-0 px-3 py-1.5 text-xs font-semibold transition-colors ${
                        active
                          ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                          : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                      }`}
                    >
                      {option.label}
                    </Link>
                  );
                })}
              </div>
            </div>
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
            <div className="grid gap-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
              <section className="overflow-hidden rounded-2xl border border-black/8 bg-white/72 px-3 py-3 shadow-sm shadow-black/5 dark:border-white/8 dark:bg-white/[0.04] dark:shadow-black/20">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/35">
                    Quick Filters
                  </p>
                  <span className="text-[11px] text-gray-400 dark:text-white/35">
                    {Number(cheapOnly) + Number(highRarityOnly) + Number(ownedMultipleOnly)} active
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCheapOnly((current) => !current)}
                    className={filterButtonClass(cheapOnly)}
                  >
                    Cheap &lt;= 15
                  </button>
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
