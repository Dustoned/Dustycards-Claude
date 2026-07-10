"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { SectionHeader } from "@/components/PageHeader";
import { useSettings } from "@/components/SettingsProvider";
import type { ModalCardData } from "@/components/card-modal/types";
import type { BuySignalLabel } from "@/lib/buy-signal";
import { textMatchesSearchQuery } from "@/lib/card-search";
import type { CollectionMoverItem, MoversItemScope, MoversScope } from "@/lib/movers";
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

const INITIAL_MOVER_RENDER_COUNT = 12;
const MOVER_RENDER_BATCH_SIZE = 24;

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
  activeScope: MoversScope;
  activeItemScope: MoversItemScope;
  marketMode?: "standard" | "sudden_drops";
  eyebrow?: string;
  title?: string;
  description?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  previewCards?: PreviewCardConfig[];
  spotlights?: SpotlightConfig[];
  initialDirection?: DirectionFilter;
  highlightedCardId?: string | null;
  metricWindowLabel?: string;
}

type FocusFilter =
  | "all"
  | "cheap"
  | "older_value"
  | "high_rarity"
  | "owned"
  | "grading_upside"
  | "strong_drop"
  | "weighted_pick";
type BuySignalFilter = "all" | BuySignalLabel;
type FocusFilterOption = { value: FocusFilter; label: string };

const SELECT_OPTION_CLASS = "bg-gray-950 text-white";
const SUDDEN_DROP_STRONG_AMOUNT = 100;
const SUDDEN_DROP_CHEAP_PRICE = 120;
const BUY_SIGNAL_FILTER_OPTIONS: Array<{ value: BuySignalFilter; label: string }> = [
  { value: "all", label: "Every Buy Signal" },
  { value: "strong_buy", label: "STRONG BUY" },
  { value: "buy", label: "BUY" },
  { value: "hold", label: "HOLD" },
  { value: "sell", label: "SELL" },
  { value: "strong_sell", label: "STRONG SELL" },
];

function isGradeTenLabel(label: string | null | undefined): boolean {
  if (!label) return false;

  const normalized = label.toUpperCase().replace(/[^A-Z0-9.]+/g, " ");
  return /\b(?:PSA|BGS|CGC|SGC)?\s*10\b/.test(normalized) || normalized.includes("GEM MINT");
}

function getRecentDropAmount(item: Pick<CollectionMoverItem, "change7d" | "change30d">): number {
  return Math.max(
    item.change7d != null && item.change7d < 0 ? Math.abs(item.change7d) : 0,
    item.change30d != null && item.change30d < 0 ? Math.abs(item.change30d) : 0
  );
}

function matchesFocusFilter(
  item: CollectionMoverItem,
  focusFilter: FocusFilter,
  options: { isGradingScope: boolean; isSuddenDropMode: boolean }
): boolean {
  if (focusFilter === "all") return true;

  if (focusFilter === "strong_drop") {
    return getRecentDropAmount(item) >= SUDDEN_DROP_STRONG_AMOUNT;
  }

  if (focusFilter === "weighted_pick") {
    return item.rankingScore >= 8 || item.opportunityScore >= 8;
  }

  if (focusFilter === "cheap") {
    const cheapReferencePrice = options.isGradingScope ? item.grading?.rawPrice : item.currentPrice;
    const maxPrice = options.isSuddenDropMode ? SUDDEN_DROP_CHEAP_PRICE : 15;
    return cheapReferencePrice != null && cheapReferencePrice <= maxPrice;
  }

  if (focusFilter === "older_value") {
    const valueReferencePrice = options.isGradingScope ? item.grading?.rawPrice : item.currentPrice;
    return (
      item.olderValueScore >= 4 &&
      valueReferencePrice != null &&
      (!options.isGradingScope || isGradeTenLabel(item.gradedLabel))
    );
  }

  if (focusFilter === "high_rarity") {
    return item.rarityWeight >= 1.15;
  }

  if (focusFilter === "grading_upside") {
    return (
      options.isGradingScope &&
      (item.grading?.valueMultiplier ?? 0) >= 3 &&
      (item.grading?.valueGap ?? 0) >= 20
    );
  }

  if (focusFilter === "owned") {
    return item.ownedCount >= 2;
  }

  return true;
}

function buildFocusOptions({
  isGradingScope,
  isSuddenDropMode,
  movers,
}: {
  isGradingScope: boolean;
  isSuddenDropMode: boolean;
  movers: CollectionMoverItem[];
}): FocusFilterOption[] {
  const options: FocusFilterOption[] = isSuddenDropMode
    ? [
        { value: "all", label: "Everything" },
        { value: "strong_drop", label: "100+ drops" },
        { value: "weighted_pick", label: "Weighted picks" },
        { value: "cheap", label: "After fall <= 120" },
        { value: "high_rarity", label: "High rarity" },
      ]
    : [
        { value: "all", label: "Everything" },
        { value: "cheap", label: isGradingScope ? "Raw <= 15" : "Cheap <= 15" },
        {
          value: "older_value",
          label: isGradingScope ? "Older cheap 10s" : "Older value",
        },
        ...(isGradingScope
          ? [{ value: "grading_upside" as const, label: "3x+ upside" }]
          : [{ value: "high_rarity" as const, label: "High rarity" }]),
        { value: "owned", label: "Owned x2+" },
      ];

  return options.filter(
    (option) =>
      option.value === "all" ||
      movers.some((item) =>
        matchesFocusFilter(item, option.value, { isGradingScope, isSuddenDropMode })
      )
  );
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
  activeScope,
  activeItemScope,
  marketMode = "standard",
  eyebrow = "Market",
  title = "Recent market cards",
  description,
  emptyTitle = "No movers for this filter combination",
  emptyDescription = "Adjust your search or filters to bring cards back.",
  previewCards = [],
  spotlights = [],
  initialDirection = "all",
  highlightedCardId = null,
  metricWindowLabel,
}: Props) {
  const { displaySettings } = useSettings();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isGradingScope = activeScope === "grading";
  const isGradedScope = activeScope === "graded";
  const isRawScope = !isGradedScope && !isGradingScope;
  const isSuddenDropMode = marketMode === "sudden_drops";
  const defaultDirection: DirectionFilter = isSuddenDropMode ? "fallers" : initialDirection;
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>(
    activeScope === "grading" ? "grade_score" : "move"
  );
  const [direction, setDirection] = useState<DirectionFilter>(defaultDirection);
  const [focusFilter, setFocusFilter] = useState<FocusFilter>("all");
  const [buySignalFilter, setBuySignalFilter] = useState<BuySignalFilter>("all");
  const [selectedCard, setSelectedCard] = useState<ModalCardData | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<string | null>(null);
  const [cardDetailCache, setCardDetailCache] = useState<Record<string, ModalCardData>>({});
  const [detailError, setDetailError] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const showBuySignalFilter = !isSuddenDropMode;
  const showTrendFilter = !isGradingScope && !isSuddenDropMode;
  const moverTileMinWidth = getMoverTileMinWidth(
    displaySettings.cardSize,
    displaySettings.widescreen
  );
  const matchesBuySignalFilter = useCallback(
    (item: CollectionMoverItem | null | undefined) =>
      Boolean(
        item &&
          (buySignalFilter === "all" || item.buySignal?.label === buySignalFilter)
      ),
    [buySignalFilter]
  );
  const visiblePreviewCards = useMemo(
    () =>
      previewCards
        .map((card) => ({
          ...card,
          items:
            buySignalFilter === "all"
              ? card.items
              : card.items.filter((item) => matchesBuySignalFilter(item)),
        }))
        .filter((card) => card.items.length > 0),
    [buySignalFilter, matchesBuySignalFilter, previewCards]
  );
  const visibleSpotlights = useMemo(
    () => spotlights.filter((spotlight) => matchesBuySignalFilter(spotlight.item)),
    [matchesBuySignalFilter, spotlights]
  );
  const scopeHref = useMemo(() => {
    return (itemScope: MoversItemScope) => {
      const params = new URLSearchParams(searchParams.toString());

      if (isRawScope) {
        params.delete("view");
        if (itemScope === "collection") {
          params.set("scope", "collection");
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

  const sortOptions = useMemo(() => {
    if (isSuddenDropMode) {
      return [
        { key: "move" as const, label: "Fresh biggest drop" },
        { key: "7d" as const, label: "Fresh drop %" },
        { key: "price_low" as const, label: "Price low" },
        { key: "name" as const, label: "Name" },
      ];
    }

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
    { key: "move" as const, label: "Best moves" },
      { key: "older_value" as const, label: "Older value" },
      { key: "7d" as const, label: "7 days" },
      { key: "30d" as const, label: "30 days" },
      { key: "price_low" as const, label: "Price low" },
      { key: "name" as const, label: "Name" },
    ];
  }, [activeScope, isSuddenDropMode]);

  const focusOptions = useMemo(
    () => buildFocusOptions({ isGradingScope, isSuddenDropMode, movers }),
    [isGradingScope, isSuddenDropMode, movers]
  );
  const activeFocusFilter = focusOptions.some((option) => option.value === focusFilter)
    ? focusFilter
    : "all";

  const visibleMovers = useMemo(() => {
    const filtered = movers.filter((item) => {
      if (!isGradingScope && direction !== "all" && !matchesDirection(item, direction)) {
        return false;
      }

      if (buySignalFilter !== "all" && item.buySignal?.label !== buySignalFilter) {
        return false;
      }

      if (!matchesFocusFilter(item, activeFocusFilter, { isGradingScope, isSuddenDropMode })) {
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
      ];

      return textMatchesSearchQuery(haystack, normalizedSearch);
    });

    return [...filtered].sort((a, b) => compareMoverItems(a, b, sortKey, direction));
  }, [
    movers,
    activeFocusFilter,
    buySignalFilter,
    direction,
    isGradingScope,
    isSuddenDropMode,
    normalizedSearch,
    sortKey,
  ]);
  const highlightedVisibleIndex = useMemo(
    () =>
      highlightedCardId
        ? visibleMovers.findIndex((item) => item.cardId === highlightedCardId)
        : -1,
    [highlightedCardId, visibleMovers]
  );
  const [renderState, setRenderState] = useState({ key: "", limit: INITIAL_MOVER_RENDER_COUNT });
  const renderKey = `${visibleMovers.length}:${visibleMovers[0]?.cardId ?? ""}:${
    visibleMovers[visibleMovers.length - 1]?.cardId ?? ""
  }:${sortKey}:${direction}:${activeFocusFilter}:${buySignalFilter}:${normalizedSearch}`;
  const minimumRenderLimit =
    highlightedVisibleIndex >= 0
      ? Math.max(INITIAL_MOVER_RENDER_COUNT, highlightedVisibleIndex + 1)
      : INITIAL_MOVER_RENDER_COUNT;
  const renderLimit =
    renderState.key === renderKey
      ? Math.max(renderState.limit, minimumRenderLimit)
      : minimumRenderLimit;
  const renderedMovers = useMemo(
    () => visibleMovers.slice(0, renderLimit),
    [renderLimit, visibleMovers]
  );
  const hasMoreMovers = renderLimit < visibleMovers.length;
  const hasDirectionFilter = showTrendFilter && direction !== defaultDirection;

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

  useEffect(() => {
    if (!highlightedCardId || highlightedVisibleIndex < 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const target = Array.from(
        document.querySelectorAll<HTMLElement>("[data-mover-card-id]")
      ).find((element) => element.dataset.moverCardId === highlightedCardId);

      if (!target) {
        return;
      }

      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.focus({ preventScroll: true });
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [highlightedCardId, highlightedVisibleIndex, renderKey]);

  const hasActiveControls =
    search.trim().length > 0 ||
    hasDirectionFilter ||
    activeFocusFilter !== "all" ||
    buySignalFilter !== "all" ||
    sortKey !== (isGradingScope ? "grade_score" : "move");

  function clearAllFilters() {
    setDirection(defaultDirection);
    setFocusFilter("all");
    setBuySignalFilter("all");
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
    <div className="space-y-3 sm:space-y-5">
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
            <p className="shrink-0 text-sm text-white/46">
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

        <div className="binder-panel mb-4 rounded-2xl px-3 py-3 sm:px-4 sm:py-4">
          <div
            className={`grid gap-3 lg:items-end ${
              isSuddenDropMode
                ? "lg:grid-cols-[minmax(16rem,1fr)_repeat(2,minmax(9rem,12rem))_auto]"
                : "lg:grid-cols-[minmax(16rem,1fr)_repeat(4,minmax(9rem,12rem))_auto]"
            }`}
          >
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Search
              </span>
              <span className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input
                  type="text"
                  placeholder="Card, set, number"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-11 w-full rounded-xl border border-white/8 bg-white/[0.05] pl-10 pr-10 text-sm text-white outline-none transition-colors placeholder:text-white/28 focus:border-white/16"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 transition-colors hover:text-white"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </span>
            </label>

            {showBuySignalFilter ? (
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Buy Signal
                </span>
                <select
                  value={buySignalFilter}
                  onChange={(event) => setBuySignalFilter(event.target.value as BuySignalFilter)}
                  className="h-11 w-full rounded-xl border border-white/8 bg-white/[0.05] px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-white/16"
                >
                  {BUY_SIGNAL_FILTER_OPTIONS.map((option) => (
                    <option className={SELECT_OPTION_CLASS} key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {showTrendFilter ? (
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Trend
                </span>
                <select
                  value={direction}
                  onChange={(event) => setDirection(event.target.value as DirectionFilter)}
                  className="h-11 w-full rounded-xl border border-white/8 bg-white/[0.05] px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-white/16"
                >
                  <option className={SELECT_OPTION_CLASS} value="all">All moves</option>
                  <option className={SELECT_OPTION_CLASS} value="risers">Risers</option>
                  <option className={SELECT_OPTION_CLASS} value="fallers">Fallers</option>
                </select>
              </label>
            ) : null}

            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Sort
              </span>
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
                className="h-11 w-full rounded-xl border border-white/8 bg-white/[0.05] px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-white/16"
              >
                {sortOptions.map((option) => (
                  <option className={SELECT_OPTION_CLASS} key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Focus
              </span>
              <select
                value={activeFocusFilter}
                onChange={(event) => setFocusFilter(event.target.value as FocusFilter)}
                className="h-11 w-full rounded-xl border border-white/8 bg-white/[0.05] px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-white/16"
              >
                {focusOptions.map((option) => (
                  <option className={SELECT_OPTION_CLASS} key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {hasActiveControls ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="h-11 rounded-xl border border-white/8 bg-white/[0.05] px-4 text-sm font-semibold text-white/62 transition-colors hover:border-white/16 hover:text-white"
              >
                Reset
              </button>
            ) : null}
          </div>
        </div>

        {visibleMovers.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-5 py-7 text-center sm:rounded-[24px] sm:px-8 sm:py-8">
            <p className="text-lg font-semibold text-white">
              {emptyTitle}
            </p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/48">
              {emptyDescription}
            </p>
            {activeItemScope === "collection" ? (
              <Link
                href={scopeHref("all")}
                prefetch={false}
                className="mt-4 inline-flex items-center rounded-full border border-white/10 bg-white/8 px-3.5 py-2 text-sm font-semibold text-white/78 transition-colors hover:border-white/18 hover:bg-white/12"
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
              highlightedCardId={highlightedCardId}
              metricWindowLabel={metricWindowLabel}
              onOpenCard={handleOpenMoverCard}
            />
            {hasMoreMovers ? (
              <div
                ref={loadMoreRef}
                className="mt-5 flex h-10 items-center justify-center text-xs font-semibold text-gray-400 dark:text-white/35"
                aria-live="polite"
              >
                Loading more cards ({renderedMovers.length.toLocaleString("en-US")} /{" "}
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
