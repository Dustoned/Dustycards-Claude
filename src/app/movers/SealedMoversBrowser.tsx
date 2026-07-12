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
import { CalendarDays, Clock3, ExternalLink, Package, Search, X } from "lucide-react";
import { SectionHeader } from "@/components/PageHeader";
import CachedImage from "@/components/CachedImage";
import type { SealedModalProductData } from "@/components/sealed-modal/types";
import { textMatchesSearchQuery } from "@/lib/card-search";
import { buildSealedEbaySearchUrl } from "@/lib/ebay-search-url";
import { formatCurrency } from "@/lib/format";
import type {
  SealedMoverItem,
  SealedMoversData,
  UpcomingSealedRelease,
} from "@/lib/sealed-movers";

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
  data: SealedMoversData;
}

interface FilterChipOption {
  key: string;
  label: string;
  count: number;
}

const SELECT_OPTION_CLASS = "bg-white text-gray-950 dark:bg-gray-950 dark:text-white";
const RELEASE_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

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
  a: SealedMoverItem,
  b: SealedMoverItem,
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

function sealedReasonChip(item: SealedMoverItem): {
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

function buildSealedProductData(item: SealedMoverItem): SealedModalProductData {
  return {
    id: item.productId,
    name: item.name,
    image_url: item.imageUrl,
    cardmarket_url: null,
    price: {
      cm_lowest: item.currentPrice,
      cm_lowest_eu: null,
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

function UpcomingReleaseCard({
  release,
  matchedMover,
  onOpen,
}: {
  release: UpcomingSealedRelease;
  matchedMover: SealedMoverItem | null;
  onOpen: (item: SealedMoverItem) => void;
}) {
  return (
    <article className="group flex min-w-0 items-center gap-3.5 rounded-2xl border border-white/8 bg-white/[0.035] p-3.5 transition-colors hover:border-violet-400/22 hover:bg-violet-400/[0.045] sm:gap-4 sm:p-4">
      <div className="relative h-[5.5rem] w-[5.5rem] shrink-0 overflow-hidden rounded-xl border border-white/8 bg-black/20 sm:h-24 sm:w-24">
        {release.imageUrl ? (
          <CachedImage
            sourceUrl={release.imageUrl}
            alt={release.name}
            fill
            sizes="(max-width: 640px) 88px, 96px"
            className="object-contain p-2"
            unoptimized
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-white/28">
            <Package className="h-7 w-7" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="rounded-full border border-violet-400/18 bg-violet-400/[0.09] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-violet-200">
            Product
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/42">
            <Clock3 className="h-3 w-3" />
            {release.daysUntil === 0 ? "Today" : `${release.daysUntil} days`}
          </span>
        </div>
        <h3 className="line-clamp-2 text-sm font-semibold leading-[1.2rem] text-white sm:text-[15px] sm:leading-5">
          {release.name}
        </h3>
        <p className="mt-1 text-[11.5px] font-semibold text-violet-200/78 sm:text-xs">
          {RELEASE_DATE_FORMATTER.format(new Date(release.releaseDate))}
        </p>

        <div className="mt-2 flex items-center gap-2">
          {matchedMover ? (
            <button
              type="button"
              onClick={() => onOpen(matchedMover)}
              className="text-[10px] font-semibold text-white/55 transition-colors hover:text-white"
            >
              View product
            </button>
          ) : null}
          {release.sourceUrl ? (
            <a
              href={release.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/38 transition-colors hover:text-white/75"
            >
              {release.sourceName}
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          ) : (
            <span className="text-[10px] font-medium text-white/30">{release.sourceName}</span>
          )}
        </div>
      </div>
    </article>
  );
}

const SealedMoverTile = memo(function SealedMoverTile({
  item,
  onOpen,
}: {
  item: SealedMoverItem;
  onOpen: (item: SealedMoverItem) => void;
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
    <article
      role="button"
      tabIndex={0}
      aria-label={`Open sealed details for ${item.name}`}
      onClick={openDetails}
      onKeyDown={handleKeyDown}
      className="group flex h-full cursor-pointer flex-col rounded-2xl border border-white/8 bg-white/[0.035] p-2.5 outline-none transition-colors hover:border-white/14 hover:bg-white/[0.055] focus-visible:ring-2 focus-visible:ring-emerald-400/50 sm:p-3"
    >
      <div className="flex min-w-0 items-start gap-2.5 text-left sm:gap-3">
        <span className="relative aspect-square w-[3.5rem] shrink-0 overflow-hidden rounded-lg bg-black/20 sm:w-[4.25rem]">
          {item.imageUrl ? (
            <CachedImage
              sourceUrl={item.imageUrl}
              alt={item.name}
              fill
              sizes="(max-width: 640px) 56px, 68px"
              className="object-contain p-1.5"
              unoptimized
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-white/35">
              <Package className="h-5 w-5 sm:h-6 sm:w-6" />
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2 sm:gap-3">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white sm:text-[15px]">
                {item.name}
              </span>
              <span className="mt-0.5 block truncate text-[10.5px] font-medium text-white/42 sm:text-[11px]">
                {item.episodeName}
                {item.episodeCode ? ` · ${item.episodeCode}` : ""}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-base font-bold leading-none tabular-nums text-white sm:text-lg">
                {formatCurrency(item.currentPrice, "EUR")}
              </span>
              <span className="mt-1 block text-[9px] font-medium uppercase tracking-[0.12em] text-white/32 sm:text-[9.5px]">
                Current
              </span>
            </span>
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1 sm:mt-2 sm:gap-1.5">
            <span className="rounded-md border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-white/55">
              {item.categoryLabel}
            </span>
            {item.ownedCount > 0 ? (
              <span className="rounded-md border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium tabular-nums text-white/45">
                {item.ownedCount}× owned
              </span>
            ) : null}
            {reason ? (
              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${reason.className}`}>
                {reason.label}
              </span>
            ) : null}
          </span>
        </span>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-x-2 border-t border-white/8 pt-2 sm:mt-3 sm:gap-x-3 sm:pt-2.5">
        <div className="min-w-0">
          <p className="text-[9.5px] font-medium uppercase tracking-[0.13em] text-white/30">7D</p>
          <p className={`mt-0.5 text-[12px] font-semibold tabular-nums sm:text-[13px] ${toneClass(item.change7dPct)}`}>
            {formatPercent(item.change7dPct)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[9.5px] font-medium uppercase tracking-[0.13em] text-white/30">30D</p>
          <p className={`mt-0.5 text-[12px] font-semibold tabular-nums sm:text-[13px] ${toneClass(item.change30dPct)}`}>
            {formatPercent(item.change30dPct)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[9.5px] font-medium uppercase tracking-[0.13em] text-white/30">Low / Peak</p>
          <p className="mt-0.5 whitespace-nowrap text-[12px] font-semibold tabular-nums text-white/82 sm:text-[13px]">
            {formatCurrency(item.lowPrice, "EUR")} / {formatCurrency(item.highPrice, "EUR")}
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 text-[10px] font-medium text-white/35">
        <span className="tabular-nums">
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
          className="inline-flex items-center gap-1 rounded-md border border-white/8 px-2 py-1 font-semibold text-white/60 transition-colors hover:bg-white/[0.05] hover:text-white/80"
          onClick={(event) => event.stopPropagation()}
        >
          Deals
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </article>
  );
});

export default function SealedMoversBrowser({ data }: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SealedSortKey>("move");
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [focusFilter, setFocusFilter] = useState<SealedFocusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<SealedModalProductData | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const upcomingReleases = data.upcomingReleases ?? [];
  const visibleUpcomingReleases = showAllUpcoming
    ? upcomingReleases
    : upcomingReleases.slice(0, 12);

  const categoryOptions = useMemo<FilterChipOption[]>(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const item of data.movers) {
      const current = counts.get(item.category) ?? { label: item.categoryLabel, count: 0 };
      current.count += 1;
      counts.set(item.category, current);
    }

    return [...counts.entries()]
      .sort(([, a], [, b]) => b.count - a.count || a.label.localeCompare(b.label))
      .map(([key, value]) => ({ key, label: value.label, count: value.count }));
  }, [data.movers]);

  const visibleMovers = useMemo(() => {
    const filtered = data.movers.filter((item) => {
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
    data.movers,
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

  const handleOpenSealedProduct = useCallback((item: SealedMoverItem) => {
    setSelectedProduct(buildSealedProductData(item));
  }, []);
  const moverByProductId = useMemo(
    () => new Map(data.movers.map((item) => [item.productId, item])),
    [data.movers]
  );

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
      <section aria-label="Upcoming sealed releases">
        <SectionHeader
          eyebrow="Release watch"
          title="Upcoming sealed products"
          description="Confirmed upcoming ETBs, boxes, collections, tins, bundles and other sealed products, ordered by their own product release date."
          actions={
            upcomingReleases.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/16 bg-violet-400/[0.08] px-2.5 py-1 text-xs font-semibold text-violet-200">
                <CalendarDays className="h-3.5 w-3.5" />
                {upcomingReleases.length} scheduled
              </span>
            ) : null
          }
        />

        {upcomingReleases.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 min-[2500px]:grid-cols-5 min-[3800px]:grid-cols-6">
            {visibleUpcomingReleases.map((release) => (
              <UpcomingReleaseCard
                key={release.id}
                release={release}
                matchedMover={
                  release.productId ? moverByProductId.get(release.productId) ?? null : null
                }
                onOpen={handleOpenSealedProduct}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.025] px-4 py-3.5 sm:px-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-400/14 bg-violet-400/[0.07] text-violet-200/70">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white/78">No confirmed upcoming products yet</p>
              <p className="mt-0.5 text-xs leading-5 text-white/38">
                New sealed products appear here after the scheduled source check confirms their product date.
              </p>
            </div>
          </div>
        )}
        {upcomingReleases.length > 12 ? (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => setShowAllUpcoming((current) => !current)}
              className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2 text-xs font-semibold text-white/58 transition-colors hover:border-violet-400/24 hover:bg-violet-400/[0.06] hover:text-white"
            >
              {showAllUpcoming ? "Show fewer products" : `Show all ${upcomingReleases.length} products`}
            </button>
          </div>
        ) : null}
      </section>

      <section>
        <SectionHeader
          eyebrow="Sealed Market"
          title="Sealed market list"
          description="Sealed products ranked by current price movement, with quick links into exact eBay sealed searches."
          actions={
            <p className="shrink-0 text-sm text-gray-500 dark:text-white/46">
              {visibleMovers.length.toLocaleString("en-US")} /{" "}
              {data.movers.length.toLocaleString("en-US")} visible
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
            <div className="grid auto-rows-fr items-stretch gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3 2xl:grid-cols-4">
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
