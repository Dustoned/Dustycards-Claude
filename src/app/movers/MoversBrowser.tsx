"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { SectionHeader } from "@/components/PageHeader";
import { useSettings } from "@/components/SettingsProvider";
import type { ModalCardData } from "@/components/card-modal/types";
import type { CollectionMoverItem, MoversItemScope, MoversScope } from "@/lib/movers";
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
  reasonMode?: "raw" | "graded" | "target";
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
  activeItemScope: MoversItemScope;
  eyebrow?: string;
  title?: string;
  description?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  previewCards?: PreviewCardConfig[];
  spotlights?: SpotlightConfig[];
}

type FocusFilter = "all" | "cheap" | "older_value" | "high_rarity" | "owned" | "grading_upside";

function filterButtonClass(active: boolean): string {
  return `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
    active
      ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
      : "border-black/8 bg-white/75 text-gray-600 hover:border-black/15 hover:text-gray-900 dark:border-white/8 dark:bg-white/[0.05] dark:text-white/60 dark:hover:border-white/16 dark:hover:text-white"
  }`;
}

const SELECT_OPTION_CLASS = "bg-white text-gray-950 dark:bg-gray-950 dark:text-white";

function isGradeTenLabel(label: string | null | undefined): boolean {
  if (!label) return false;

  const normalized = label.toUpperCase().replace(/[^A-Z0-9.]+/g, " ");
  return /\b(?:PSA|BGS|CGC|SGC)?\s*10\b/.test(normalized) || normalized.includes("GEM MINT");
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
  activeItemScope,
  eyebrow = "Main Movers",
  title = "Full collection movers",
  description,
  emptyTitle = "No movers for this filter combination",
  emptyDescription = "Adjust your search or filters to bring cards back.",
  previewCards = [],
  spotlights = [],
}: Props) {
  const { displaySettings } = useSettings();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>(
    activeScope === "grading" ? "grade_score" : "move"
  );
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [focusFilter, setFocusFilter] = useState<FocusFilter>("all");
  const [selectedCard, setSelectedCard] = useState<ModalCardData | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<string | null>(null);
  const [cardDetailCache, setCardDetailCache] = useState<Record<string, ModalCardData>>({});
  const [detailError, setDetailError] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const isGradingScope = activeScope === "grading";
  const isGradedScope = activeScope === "graded";
  const isRawScope = !isGradedScope && !isGradingScope;
  const moverTileMinWidth = getMoverTileMinWidth(
    displaySettings.cardSize,
    displaySettings.widescreen
  );
  const visiblePreviewCards = previewCards.filter((card) => card.items.length > 0);
  const visibleSpotlights = spotlights.filter((spotlight) => spotlight.item);
  const scopeHref = useMemo(() => {
    return (itemScope: MoversItemScope) => {
      const params = new URLSearchParams(searchParams.toString());

      if (isRawScope) {
        params.delete("view");
        if (itemScope === "collection") {
          params.delete("scope");
        } else {
          params.set("scope", "all");
        }
      } else {
        params.set("scope", isGradingScope ? "grading" : "graded");
        if (itemScope === "collection") {
          params.set("view", "collection");
        } else {
          params.delete("view");
        }
      }

      const query = params.toString();
      return query ? `${pathname}?${query}` : pathname;
    };
  }, [isGradingScope, isRawScope, pathname, searchParams]);
  const priceSourceHref = useMemo(() => {
    return (source: PriceSource) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("source", source);
      const query = params.toString();
      return query ? `${pathname}?${query}` : pathname;
    };
  }, [pathname, searchParams]);
  const modeHref = useMemo(() => {
    return (mode: "raw" | "graded" | "targets" | "sealed") => {
      const params = new URLSearchParams(searchParams.toString());

      if (mode === "raw") {
        params.delete("view");
        if (activeItemScope === "all") {
          params.set("scope", "all");
        } else {
          params.delete("scope");
        }
      } else if (mode === "graded") {
        params.set("scope", "graded");
        if (activeItemScope === "collection") {
          params.set("view", "collection");
        } else {
          params.delete("view");
        }
      } else if (mode === "targets") {
        params.set("scope", "grading");
        if (activeItemScope === "collection") {
          params.set("view", "collection");
        } else {
          params.delete("view");
        }
      } else {
        params.set("scope", "sealed");
        if (activeItemScope === "collection") {
          params.set("view", "collection");
        } else {
          params.delete("view");
        }
      }

      const query = params.toString();
      return query ? `${pathname}?${query}` : pathname;
    };
  }, [activeItemScope, pathname, searchParams]);

  const sortOptions = useMemo(() => {
    if (activeScope === "grading") {
      return [
        { key: "grade_score" as const, label: "Best targets" },
        { key: "older_value" as const, label: "Older value" },
        { key: "grade_multiplier" as const, label: "Multiplier" },
        { key: "grade_gap" as const, label: "Value gap" },
        { key: "raw_price_low" as const, label: "Raw price" },
        { key: "name" as const, label: "Name" },
      ];
    }

    return [
      { key: "move" as const, label: "Best movers" },
      { key: "older_value" as const, label: "Older value" },
      { key: "7d" as const, label: "7 days" },
      { key: "30d" as const, label: "30 days" },
      { key: "price_low" as const, label: "Price low" },
      { key: "name" as const, label: "Name" },
    ];
  }, [activeScope]);

  const visibleMovers = useMemo(() => {
    const filtered = movers.filter((item) => {
      if (!isGradingScope && direction !== "all" && !matchesDirection(item, direction)) {
        return false;
      }

      if (focusFilter === "cheap") {
        const cheapReferencePrice = isGradingScope ? item.grading?.rawPrice : item.currentPrice;
        if (cheapReferencePrice == null || cheapReferencePrice > 15) {
          return false;
        }
      }

      if (focusFilter === "older_value") {
        const valueReferencePrice = isGradingScope ? item.grading?.rawPrice : item.currentPrice;
        if (
          item.olderValueScore < 4 ||
          valueReferencePrice == null ||
          (isGradingScope && !isGradeTenLabel(item.gradedLabel))
        ) {
          return false;
        }
      }

      if (focusFilter === "high_rarity" && item.rarityWeight < 1.15) {
        return false;
      }

      if (
        isGradingScope &&
        focusFilter === "grading_upside" &&
        ((item.grading?.valueMultiplier ?? 0) < 3 || (item.grading?.valueGap ?? 0) < 20)
      ) {
        return false;
      }

      if (focusFilter === "owned" && item.ownedCount < 2) {
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
    focusFilter,
    isGradingScope,
    normalizedSearch,
    sortKey,
  ]);
  const [renderState, setRenderState] = useState({ key: "", limit: INITIAL_MOVER_RENDER_COUNT });
  const renderKey = `${visibleMovers.length}:${visibleMovers[0]?.cardId ?? ""}:${
    visibleMovers[visibleMovers.length - 1]?.cardId ?? ""
  }:${sortKey}:${direction}`;
  const renderLimit = renderState.key === renderKey ? renderState.limit : INITIAL_MOVER_RENDER_COUNT;
  const renderedMovers = useMemo(
    () => visibleMovers.slice(0, renderLimit),
    [renderLimit, visibleMovers]
  );
  const hasMoreMovers = renderLimit < visibleMovers.length;
  const hasDirectionFilter = !isGradingScope && direction !== "all";

  useEffect(() => {
    if (!hasMoreMovers) {
      return;
    }

    const loadMoreElement = loadMoreRef.current;
    if (!loadMoreElement) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        setRenderState((current) => {
          const currentLimit =
            current.key === renderKey ? current.limit : INITIAL_MOVER_RENDER_COUNT;
          const nextLimit = Math.min(
            currentLimit + MOVER_RENDER_BATCH_SIZE,
            visibleMovers.length
          );

          if (current.key === renderKey && nextLimit === current.limit) {
            return current;
          }

          return {
            key: renderKey,
            limit: nextLimit,
          };
        });
      },
      { rootMargin: "700px 0px" }
    );

    observer.observe(loadMoreElement);

    return () => {
      observer.disconnect();
    };
  }, [hasMoreMovers, renderKey, renderLimit, visibleMovers.length]);

  const hasActiveControls =
    search.trim().length > 0 ||
    hasDirectionFilter ||
    focusFilter !== "all" ||
    sortKey !== (isGradingScope ? "grade_score" : "move");

  function clearAllFilters() {
    setDirection("all");
    setFocusFilter("all");
    setSortKey(isGradingScope ? "grade_score" : "move");
    setSearch("");
  }

  const openMoverCard = useCallback(
    async (cardId: string) => {
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
        setDetailError(
          error instanceof Error ? error.message : "Could not load card details"
        );
      } finally {
        setLoadingCardId((current) => (current === cardId ? null : current));
      }
    },
    [cardDetailCache]
  );
  const handleOpenMoverCard = useCallback(
    (cardId: string) => {
      void openMoverCard(cardId);
    },
    [openMoverCard]
  );

  return (
    <div className="space-y-10">
      <div className="rounded-2xl border border-black/8 bg-white/70 p-3 shadow-sm shadow-black/5 dark:border-white/8 dark:bg-white/[0.04]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <div className="min-w-0">
            <span className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">
              Market
            </span>
            <div className="mt-1 flex flex-wrap gap-1 rounded-xl border border-black/8 bg-black/[0.035] p-1 dark:border-white/8 dark:bg-white/[0.04]">
              {[
                {
                  key: "raw" as const,
                  label: "Raw Singles",
                  active: isRawScope,
                },
                {
                  key: "graded" as const,
                  label: "Graded Cards",
                  active: isGradedScope,
                },
                {
                  key: "targets" as const,
                  label: "Grade Targets",
                  active: isGradingScope,
                },
                {
                  key: "sealed" as const,
                  label: "Sealed Products",
                  active: false,
                },
              ].map((option) => (
                <Link
                  key={option.key}
                  href={modeHref(option.key)}
                  prefetch={false}
                  className={`inline-flex h-9 min-w-[8rem] flex-1 items-center justify-center rounded-lg px-3 text-xs font-semibold transition-colors sm:flex-none ${
                    option.active
                      ? "bg-gray-950 text-white shadow-sm shadow-black/10 dark:bg-white dark:text-gray-950"
                      : "text-gray-500 hover:bg-black/[0.05] hover:text-gray-900 dark:text-white/58 dark:hover:bg-white/[0.07] dark:hover:text-white"
                  }`}
                  aria-current={option.active ? "page" : undefined}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">
                Scope
              </span>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "collection" as const, label: "Collection" },
                  { key: "all" as const, label: "All Cards" },
                ].map((option) => {
                  const active = activeItemScope === option.key;

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
            </div>

            {isRawScope ? (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">
                  Source
                </span>
                <div className="flex flex-wrap gap-2">
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
        </div>
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
              {visibleMovers.length.toLocaleString("en-US")} /{" "}
              {movers.length.toLocaleString("en-US")} visible
            </p>
          }
        />

        {detailError ? (
          <div className="mb-4 rounded-2xl border border-rose-400/20 bg-rose-400/[0.08] px-4 py-3 text-sm text-rose-700 dark:text-rose-200">
            {detailError}
          </div>
        ) : null}

        <div className="glass mb-4 rounded-2xl border border-black/8 px-4 py-4 shadow-sm shadow-black/5 dark:border-white/8">
          <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_repeat(3,minmax(9rem,12rem))_auto] lg:items-end">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">
                Search
              </span>
              <span className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-white/35" />
                <input
                  type="text"
                  placeholder="Card, set, number"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-11 w-full rounded-xl border border-black/8 bg-white/78 pl-10 pr-10 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-black/14 dark:border-white/8 dark:bg-white/[0.05] dark:text-white dark:placeholder:text-white/28 dark:focus:border-white/14"
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
              </span>
            </label>

            {!isGradingScope ? (
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">
                  Trend
                </span>
                <select
                  value={direction}
                  onChange={(event) => setDirection(event.target.value as DirectionFilter)}
                  className="h-11 w-full rounded-xl border border-black/8 bg-white/78 px-3 text-sm font-semibold text-gray-900 outline-none transition-colors focus:border-black/14 dark:border-white/8 dark:bg-white/[0.05] dark:text-white dark:focus:border-white/14"
                >
                  <option className={SELECT_OPTION_CLASS} value="all">All moves</option>
                  <option className={SELECT_OPTION_CLASS} value="risers">Risers</option>
                  <option className={SELECT_OPTION_CLASS} value="fallers">Fallers</option>
                </select>
              </label>
            ) : (
              <div className="hidden lg:block" />
            )}

            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">
                Sort
              </span>
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
                className="h-11 w-full rounded-xl border border-black/8 bg-white/78 px-3 text-sm font-semibold text-gray-900 outline-none transition-colors focus:border-black/14 dark:border-white/8 dark:bg-white/[0.05] dark:text-white dark:focus:border-white/14"
              >
                {sortOptions.map((option) => (
                  <option className={SELECT_OPTION_CLASS} key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">
                Focus
              </span>
              <select
                value={focusFilter}
                onChange={(event) => setFocusFilter(event.target.value as FocusFilter)}
                className="h-11 w-full rounded-xl border border-black/8 bg-white/78 px-3 text-sm font-semibold text-gray-900 outline-none transition-colors focus:border-black/14 dark:border-white/8 dark:bg-white/[0.05] dark:text-white dark:focus:border-white/14"
              >
                <option className={SELECT_OPTION_CLASS} value="all">Everything</option>
                <option className={SELECT_OPTION_CLASS} value="cheap">
                  {isGradingScope ? "Raw <= 15" : "Cheap <= 15"}
                </option>
                <option className={SELECT_OPTION_CLASS} value="older_value">
                  {isGradingScope ? "Older cheap 10s" : "Older value"}
                </option>
                {!isGradingScope ? (
                  <option className={SELECT_OPTION_CLASS} value="high_rarity">High rarity</option>
                ) : null}
                {isGradingScope ? (
                  <option className={SELECT_OPTION_CLASS} value="grading_upside">3x+ upside</option>
                ) : null}
                <option className={SELECT_OPTION_CLASS} value="owned">Owned x2+</option>
              </select>
            </label>

            {hasActiveControls ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="h-11 rounded-xl border border-black/8 bg-white/78 px-4 text-sm font-semibold text-gray-600 transition-colors hover:border-black/14 hover:text-gray-900 dark:border-white/8 dark:bg-white/[0.05] dark:text-white/62 dark:hover:border-white/16 dark:hover:text-white"
              >
                Reset
              </button>
            ) : null}
          </div>
        </div>

        {visibleMovers.length === 0 ? (
          <div className="rounded-2xl border border-black/8 bg-black/[0.03] px-5 py-7 text-center dark:border-white/8 dark:bg-white/[0.04] sm:rounded-[24px] sm:px-8 sm:py-8">
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {emptyTitle}
            </p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500 dark:text-white/48">
              {emptyDescription}
            </p>
            {activeItemScope === "collection" ? (
              <Link
                href={scopeHref("all")}
                prefetch={false}
                className="mt-4 inline-flex items-center rounded-full border border-black/8 bg-white/80 px-3.5 py-2 text-sm font-semibold text-gray-800 transition-colors hover:border-black/15 hover:bg-white dark:border-white/10 dark:bg-white/8 dark:text-white/78 dark:hover:border-white/18 dark:hover:bg-white/12"
              >
                View all cards
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            <MoverGrid
              movers={renderedMovers}
              minTileWidth={moverTileMinWidth}
              loadingCardId={loadingCardId}
              displayMode={isGradingScope ? "target" : isGradedScope ? "graded" : "raw"}
              onOpenCard={handleOpenMoverCard}
            />
            {hasMoreMovers ? (
              <div
                ref={loadMoreRef}
                className="mt-5 flex h-10 items-center justify-center text-xs font-semibold text-gray-400 dark:text-white/35"
                aria-live="polite"
              >
                Loading more movers ({renderedMovers.length.toLocaleString("en-US")} /{" "}
                {visibleMovers.length.toLocaleString("en-US")})
              </div>
            ) : null}
          </>
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
