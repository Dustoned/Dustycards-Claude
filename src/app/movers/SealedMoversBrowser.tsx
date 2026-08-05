"use client";

import dynamic from "next/dynamic";
import {
  type KeyboardEvent,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ExternalLink, Package, Search, X } from "lucide-react";
import {
  CardListTile,
  CardListTileBody,
  CardListTileMedia,
  CardListTileMetrics,
  CardListTilePrice,
} from "@/components/CardListTile";
import { SectionHeader } from "@/components/PageHeader";
import CachedImage from "@/components/CachedImage";
import type { SealedModalProductData } from "@/components/sealed-modal/types";
import { textMatchesSearchQuery } from "@/lib/card-search";
import { buildSealedEbaySearchUrl } from "@/lib/ebay-search-url";
import { formatCurrency } from "@/lib/format";
import type { SealedMoverBrowserItem } from "@/lib/sealed-movers";

const SealedProductModal = dynamic(() => import("@/components/SealedProductModal"), {
  ssr: false,
  loading: () => null,
});

type DirectionFilter = "all" | "risers" | "fallers";
type SealedFocusFilter = "all" | "entry" | "owned";
type SealedSortKey =
  | "move"
  | "7d"
  | "30d"
  | "tracked"
  | "low_rebound"
  | "peak_gap"
  | "price_low"
  | "price_high"
  | "name";

interface Props {
  movers: SealedMoverBrowserItem[];
}

interface FilterChipOption {
  key: string;
  label: string;
  count: number;
}

const SELECT_OPTION_CLASS = "bg-white text-gray-950 dark:bg-gray-950 dark:text-white";
function formatPercent(value: number | null | undefined): string {
  if (value == null) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function toneClass(value: number | null | undefined): string {
  if (value == null || value === 0) return "text-gray-500 dark:text-white/45";
  return value > 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300";
}

function compareMetricValues(
  a: number | null | undefined,
  b: number | null | undefined,
  order: "asc" | "desc"
): number {
  const leftMissing = a == null;
  const rightMissing = b == null;

  if (leftMissing || rightMissing) {
    if (leftMissing && rightMissing) return 0;
    return leftMissing ? 1 : -1;
  }

  return order === "asc" ? a - b : b - a;
}

function compareSealedMovers(
  a: SealedMoverBrowserItem,
  b: SealedMoverBrowserItem,
  sortKey: SealedSortKey,
  direction: DirectionFilter
): number {
  const preferMostNegativeFirst = direction === "fallers";

  if (sortKey === "name") {
    return a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true });
  }

  if (sortKey === "price_low") {
    if (a.currentPrice !== b.currentPrice) return a.currentPrice - b.currentPrice;
  } else if (sortKey === "price_high") {
    if (a.currentPrice !== b.currentPrice) return b.currentPrice - a.currentPrice;
  } else if (sortKey === "7d") {
    const diff = compareMetricValues(
      a.change7dPct,
      b.change7dPct,
      preferMostNegativeFirst ? "asc" : "desc"
    );
    if (diff !== 0) return diff;
  } else if (sortKey === "30d") {
    const diff = compareMetricValues(
      a.change30dPct,
      b.change30dPct,
      preferMostNegativeFirst ? "asc" : "desc"
    );
    if (diff !== 0) return diff;
  } else if (sortKey === "tracked") {
    const diff = compareMetricValues(
      a.changeSinceTrackedPct,
      b.changeSinceTrackedPct,
      preferMostNegativeFirst ? "asc" : "desc"
    );
    if (diff !== 0) return diff;
  } else if (sortKey === "low_rebound") {
    const diff = compareMetricValues(
      a.changeFromLowPct,
      b.changeFromLowPct,
      preferMostNegativeFirst ? "asc" : "desc"
    );
    if (diff !== 0) return diff;
  } else if (sortKey === "peak_gap") {
    const diff = compareMetricValues(a.gapToPeakPct, b.gapToPeakPct, "asc");
    if (diff !== 0) return diff;
  } else if (a.rankingScore !== b.rankingScore) {
    return preferMostNegativeFirst
      ? a.movementScore - b.movementScore
      : b.rankingScore - a.rankingScore;
  }

  return a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true });
}

function sealedReasonChip(item: SealedMoverBrowserItem): {
  label: string;
  className: string;
} | null {
  if (item.priceQuality.status === "suspicious") {
    return {
      label: item.priceQuality.reason ?? "Outlier ignored",
      className: "border-rose-400/18 bg-rose-400/[0.08] text-rose-700 dark:text-rose-200",
    };
  }

  if (item.priceQuality.status === "thin_history") {
    return {
      label: item.priceQuality.reason ?? "Thin history",
      className: "border-amber-400/18 bg-amber-400/[0.08] text-amber-700 dark:text-amber-200",
    };
  }

  if (item.movementScore > 0) {
    return {
      label: "Recent move",
      className: "border-emerald-400/18 bg-emerald-400/[0.08] text-emerald-700 dark:text-emerald-200",
    };
  }

  return null;
}

function buildSealedProductData(item: SealedMoverBrowserItem): SealedModalProductData {
  return {
    id: item.productId,
    name: item.name,
    image_url: item.imageUrl,
    cardmarket_url: null,
    price: {
      cm_lowest: null,
      cm_lowest_eu: item.currentPrice,
      cm_lowest_de: null,
      cm_lowest_fr: null,
      cm_lowest_es: null,
      cm_lowest_it: null,
      cm_avg_7d: null,
      cm_avg_30d: null,
    },
    episode: {
      id: item.episodeId,
      name: item.episodeName,
      code: item.episodeCode,
    },
  };
}

const INITIAL_SEALED_RENDER_COUNT = 12;
const SEALED_RENDER_BATCH_SIZE = 24;

const SealedMoverTile = memo(function SealedMoverTile({
  item,
  onOpen,
}: {
  item: SealedMoverBrowserItem;
  onOpen: (item: SealedMoverBrowserItem) => void;
}) {
  const reason = sealedReasonChip(item);
  const openDetails = () => onOpen(item);
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetails();
    }
  };

  return (
    <CardListTile
      interactive
      accent="market"
      role="button"
      tabIndex={0}
      aria-label={`Open sealed details for ${item.name}`}
      onClick={openDetails}
      onKeyDown={handleKeyDown}
      className="focus-visible:ring-emerald-400/50"
    >
      <CardListTileMedia imageUrl={item.imageUrl} kind="product" emptyLabel="Product image">
        {item.imageUrl ? (
          <CachedImage
            sourceUrl={item.imageUrl}
            alt={item.name}
            fill
            sizes="(max-width: 640px) 104px, 92px"
            className="object-contain p-2"
            unoptimized
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-white/35">
            <Package className="h-7 w-7" />
          </span>
        )}
      </CardListTileMedia>

      <CardListTileBody>
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold leading-[1.15rem] text-white transition-colors group-hover/card-list:text-violet-100 sm:text-[15px] sm:leading-5">
              {item.name}
            </h3>
            <p className="mt-0.5 truncate text-[10.5px] font-medium text-white/42 sm:text-[11px]">
              {item.episodeName}
              {item.episodeCode ? ` · ${item.episodeCode}` : ""}
            </p>
          </div>
          <CardListTilePrice
            label="Current"
            value={formatCurrency(item.currentPrice, "EUR")}
          />
        </div>

        <div className="mt-1.5 flex max-h-6 flex-wrap items-start gap-1 overflow-hidden sm:mt-2 sm:max-h-none sm:gap-1.5">
          <span className="rounded-md border border-[rgb(var(--dc-border-rgb)/0.78)] bg-[rgb(var(--dc-surface-hover-rgb)/0.5)] px-2 py-0.5 text-[10px] font-medium text-white/55">
            {item.categoryLabel}
          </span>
          {item.ownedCount > 0 ? (
            <span className="rounded-md border border-[rgb(var(--dc-border-rgb)/0.72)] bg-[rgb(var(--dc-surface-hover-rgb)/0.4)] px-2 py-0.5 text-[10px] font-medium tabular-nums text-white/45">
              {item.ownedCount}× owned
            </span>
          ) : null}
          {reason ? (
            <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${reason.className}`}>
              {reason.label}
            </span>
          ) : null}
        </div>

        <CardListTileMetrics
          className="gap-x-2 sm:gap-x-3"
          style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
        >
          <div className="min-w-0">
            <p className="text-[9px] font-medium uppercase tracking-[0.13em] text-white/30">7D</p>
            <p className={`mt-0.5 text-[12px] font-semibold tabular-nums sm:text-[13px] ${toneClass(item.change7dPct)}`}>
              {formatPercent(item.change7dPct)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-medium uppercase tracking-[0.13em] text-white/30">30D</p>
            <p className={`mt-0.5 text-[12px] font-semibold tabular-nums sm:text-[13px] ${toneClass(item.change30dPct)}`}>
              {formatPercent(item.change30dPct)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-medium uppercase tracking-[0.13em] text-white/30">Range</p>
            <p className="mt-0.5 truncate text-[11px] font-semibold tabular-nums text-white/82 sm:text-[12px]">
              {formatCurrency(item.lowPrice, "EUR")}–{formatCurrency(item.highPrice, "EUR")}
            </p>
          </div>
        </CardListTileMetrics>

        <div className="mt-2 flex min-w-0 items-center justify-between gap-2 text-[10px] font-medium text-white/35">
          <span className="min-w-0 truncate tabular-nums">
            {item.historyPoints.toLocaleString("en-US")} recent /{" "}
            {item.lifetimeHistoryPoints.toLocaleString("en-US")} lifetime
          </span>
          <a
            href={buildSealedEbaySearchUrl({
              name: item.name,
              episodeName: item.episodeName,
              episodeCode: item.episodeCode,
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="relative z-10 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-[rgb(var(--dc-border-rgb)/0.82)] px-2.5 font-semibold text-white/60 transition-colors hover:bg-[rgb(var(--dc-surface-hover-rgb)/0.62)] hover:text-white/80 sm:min-h-9 sm:px-2"
            onClick={(event) => event.stopPropagation()}
          >
            Deals
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardListTileBody>
    </CardListTile>
  );
});

export default function SealedMoversBrowser({ movers }: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SealedSortKey>("move");
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [focusFilter, setFocusFilter] = useState<SealedFocusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState<SealedModalProductData | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim().toLowerCase();

  const categoryOptions = useMemo<FilterChipOption[]>(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const item of movers) {
      const current = counts.get(item.category) ?? { label: item.categoryLabel, count: 0 };
      current.count += 1;
      counts.set(item.category, current);
    }

    return [...counts.entries()]
      .sort(([, a], [, b]) => b.count - a.count || a.label.localeCompare(b.label))
      .map(([key, value]) => ({ key, label: value.label, count: value.count }));
  }, [movers]);

  const visibleMovers = useMemo(() => {
    const filtered = movers.filter((item) => {
      if (direction === "risers" && item.movementScore <= 0) return false;
      if (direction === "fallers" && item.movementScore >= 0) return false;
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (focusFilter === "entry" && item.currentPrice > 75) return false;
      if (focusFilter === "owned" && item.ownedCount < 2) return false;

      if (!normalizedSearch) return true;

      const haystack = [
        item.name,
        item.episodeName,
        item.episodeCode,
        item.categoryLabel,
      ];
      return textMatchesSearchQuery(haystack, normalizedSearch);
    });

    return [...filtered].sort((a, b) => compareSealedMovers(a, b, sortKey, direction));
  }, [
    categoryFilter,
    movers,
    direction,
    focusFilter,
    normalizedSearch,
    sortKey,
  ]);

  const [renderState, setRenderState] = useState({ key: "", limit: INITIAL_SEALED_RENDER_COUNT });
  const renderKey = `${visibleMovers.length}:${visibleMovers[0]?.productId ?? ""}:${
    visibleMovers[visibleMovers.length - 1]?.productId ?? ""
  }:${sortKey}:${direction}`;
  const renderLimit =
    renderState.key === renderKey ? renderState.limit : INITIAL_SEALED_RENDER_COUNT;
  const renderedMovers = useMemo(
    () => visibleMovers.slice(0, renderLimit),
    [renderLimit, visibleMovers]
  );
  const hasMoreMovers = renderLimit < visibleMovers.length;

  useEffect(() => {
    if (!hasMoreMovers) return;
    const loadMoreElement = loadMoreRef.current;
    if (!loadMoreElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setRenderState((current) => {
          const currentLimit =
            current.key === renderKey ? current.limit : INITIAL_SEALED_RENDER_COUNT;
          const nextLimit = Math.min(
            currentLimit + SEALED_RENDER_BATCH_SIZE,
            visibleMovers.length
          );
          if (current.key === renderKey && nextLimit === current.limit) return current;
          return { key: renderKey, limit: nextLimit };
        });
      },
      { rootMargin: "700px 0px" }
    );

    observer.observe(loadMoreElement);
    return () => observer.disconnect();
  }, [hasMoreMovers, renderKey, renderLimit, visibleMovers.length]);

  const handleOpenSealedProduct = useCallback((item: SealedMoverBrowserItem) => {
    setSelectedProduct(buildSealedProductData(item));
  }, []);
  const hasActiveControls =
    search.trim().length > 0 ||
    direction !== "all" ||
    focusFilter !== "all" ||
    categoryFilter !== "all" ||
    sortKey !== "move";

  function clearAllFilters() {
    setDirection("all");
    setFocusFilter("all");
    setCategoryFilter("all");
    setSortKey("move");
    setSearch("");
  }

  const sortOptions: Array<{ key: SealedSortKey; label: string }> = [
    { key: "move", label: "Best moves" },
    { key: "7d", label: "7 days" },
    { key: "30d", label: "30 days" },
    { key: "price_low", label: "Entry price" },
    { key: "name", label: "Name" },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <section>
        <SectionHeader
          eyebrow="Sealed Market"
          title="Sealed market list"
          description="Sealed products ranked by current price movement, with quick links into exact eBay sealed searches."
          actions={
            <p className="shrink-0 text-sm text-gray-500 dark:text-white/46">
              {visibleMovers.length.toLocaleString("en-US")} /{" "}
              {movers.length.toLocaleString("en-US")} visible
            </p>
          }
        />

        <div className="glass mb-4 rounded-2xl border border-black/8 px-4 py-4 shadow-sm shadow-black/5 dark:border-white/8">
          <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_repeat(4,minmax(8rem,11rem))_auto] lg:items-end">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">
                Search
              </span>
              <span className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-white/35" />
                <input
                  type="text"
                  placeholder="Product, set, type"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] pl-10 pr-10 text-sm text-white outline-none transition-colors placeholder:text-gray-400 focus:border-white/14 dark:border-white/8 dark:bg-white/[0.05] dark:text-white dark:placeholder:text-white/28 dark:focus:border-white/14"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-white dark:text-white/35 dark:hover:text-white"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">
                Trend
              </span>
              <select
                value={direction}
                onChange={(event) => setDirection(event.target.value as DirectionFilter)}
                className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-white/14 dark:border-white/8 dark:bg-white/[0.05] dark:text-white dark:focus:border-white/14"
              >
                <option className={SELECT_OPTION_CLASS} value="all">All moves</option>
                <option className={SELECT_OPTION_CLASS} value="risers">Risers</option>
                <option className={SELECT_OPTION_CLASS} value="fallers">Fallers</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">
                Sort
              </span>
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SealedSortKey)}
                className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-white/14 dark:border-white/8 dark:bg-white/[0.05] dark:text-white dark:focus:border-white/14"
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
                onChange={(event) => setFocusFilter(event.target.value as SealedFocusFilter)}
                className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-white/14 dark:border-white/8 dark:bg-white/[0.05] dark:text-white dark:focus:border-white/14"
              >
                <option className={SELECT_OPTION_CLASS} value="all">Everything</option>
                <option className={SELECT_OPTION_CLASS} value="entry">Entry &lt;= 75</option>
                <option className={SELECT_OPTION_CLASS} value="owned">Owned x2+</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">
                Type
              </span>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-white/14 dark:border-white/8 dark:bg-white/[0.05] dark:text-white dark:focus:border-white/14"
              >
                <option className={SELECT_OPTION_CLASS} value="all">All types</option>
                {categoryOptions.map((option) => (
                  <option className={SELECT_OPTION_CLASS} key={option.key} value={option.key}>
                    {option.label} ({option.count})
                  </option>
                ))}
              </select>
            </label>

            {hasActiveControls ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="h-11 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white/62 transition-colors hover:border-white/16 hover:text-white dark:border-white/8 dark:bg-white/[0.05] dark:text-white/62 dark:hover:border-white/16 dark:hover:text-white"
              >
                Reset
              </button>
            ) : null}
          </div>
        </div>

        {visibleMovers.length === 0 ? (
          <div className="rounded-[24px] border border-black/8 bg-black/[0.03] p-8 text-center dark:border-white/8 dark:bg-white/[0.04]">
            <p className="text-lg font-semibold text-white dark:text-white">
              No sealed market moves found
            </p>
            <p className="mt-2 text-sm text-gray-500 dark:text-white/48">
              Adjust search, product type, or scope to bring sealed products back.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3 2xl:grid-cols-4">
              {renderedMovers.map((item) => (
                <SealedMoverTile
                  key={item.productId}
                  item={item}
                  onOpen={handleOpenSealedProduct}
                />
              ))}
            </div>
            {hasMoreMovers ? (
              <div
                ref={loadMoreRef}
                className="mt-4 flex h-10 items-center justify-center text-xs font-semibold text-white/35"
                aria-live="polite"
              >
                Loading more products ({renderedMovers.length.toLocaleString("en-US")} /{" "}
                {visibleMovers.length.toLocaleString("en-US")})
              </div>
            ) : null}
          </>
        )}
      </section>

      {selectedProduct ? (
        <SealedProductModal
          key={selectedProduct.id}
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      ) : null}
    </div>
  );
}
