"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { ExternalLink, Package, Search, X } from "lucide-react";
import { SectionHeader } from "@/components/PageHeader";
import type { SealedModalProductData } from "@/components/sealed-modal/types";
import { getCachedImageUrl } from "@/lib/image-cache";
import { formatCurrency } from "@/lib/format";
import type { MoversItemScope } from "@/lib/movers";
import type { SealedMoverItem, SealedMoversData } from "@/lib/sealed-movers";

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
  activeItemScope: MoversItemScope;
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

function modeHref(
  pathname: string,
  searchParams: { toString(): string },
  mode: "value" | "raw" | "graded" | "targets" | "sealed",
  activeItemScope: MoversItemScope
): string {
  const params = new URLSearchParams(searchParams.toString());

  if (mode === "value") {
    params.delete("scope");
    params.delete("view");
    params.delete("source");
  } else if (mode === "raw") {
    params.delete("view");
    if (activeItemScope === "all") {
      params.set("scope", "all");
    } else {
      params.set("scope", "collection");
    }
  } else if (mode === "graded") {
    params.set("scope", "graded");
    if (activeItemScope === "collection") params.set("view", "collection");
    else params.delete("view");
  } else if (mode === "targets") {
    params.set("scope", "grading");
    if (activeItemScope === "collection") params.set("view", "collection");
    else params.delete("view");
  } else {
    params.set("scope", "sealed");
    if (activeItemScope === "collection") params.set("view", "collection");
    else params.delete("view");
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function scopeHref(
  pathname: string,
  searchParams: { toString(): string },
  itemScope: MoversItemScope
): string {
  const params = new URLSearchParams(searchParams.toString());
  params.set("scope", "sealed");
  if (itemScope === "collection") {
    params.set("view", "collection");
  } else {
    params.delete("view");
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function SealedMoverTile({
  item,
  onOpen,
}: {
  item: SealedMoverItem;
  onOpen: (item: SealedMoverItem) => void;
}) {
  const reason = sealedReasonChip(item);

  return (
    <article
      className="group flex h-full flex-col rounded-2xl border border-black/8 bg-white/72 p-3 shadow-sm shadow-black/5 transition hover:-translate-y-0.5 hover:border-black/14 hover:bg-white/90 dark:border-white/8 dark:bg-white/[0.04] dark:hover:border-white/16 dark:hover:bg-white/[0.06]"
    >
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="grid min-w-0 grid-cols-[5.25rem_minmax(0,1fr)] gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
      >
        <span className="relative aspect-square w-full overflow-hidden rounded-xl bg-black/[0.035] dark:bg-black/24">
          {item.imageUrl ? (
            <Image
              src={getCachedImageUrl(item.imageUrl) ?? item.imageUrl}
              alt={item.name}
              fill
              sizes="88px"
              className="object-contain p-1.5 transition-transform duration-300 group-hover:scale-[1.03]"
              unoptimized
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-gray-400 dark:text-white/35">
              <Package className="h-7 w-7" />
            </span>
          )}
        </span>

        <span className="min-w-0">
          <span className="block truncate text-base font-bold text-gray-950 dark:text-white">
            {item.name}
          </span>
          <span className="mt-1 block truncate text-xs font-medium text-gray-500 dark:text-white/45">
            {item.episodeName}
            {item.episodeCode ? ` / ${item.episodeCode}` : ""}
          </span>
          <span className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-blue-400/16 bg-blue-400/[0.08] px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-200">
              {item.categoryLabel}
            </span>
            <span className="rounded-full border border-black/8 bg-black/[0.035] px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:border-white/8 dark:bg-white/[0.04] dark:text-white/50">
              {item.ownedCount > 0 ? `x${item.ownedCount} owned` : "Not owned"}
            </span>
            {reason ? (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${reason.className}`}>
                {reason.label}
              </span>
            ) : null}
          </span>
        </span>
      </button>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-400/14 bg-emerald-400/[0.07] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700/70 dark:text-emerald-200/65">
            Current
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-gray-950 dark:text-white">
            {formatCurrency(item.currentPrice, "EUR")}
          </p>
        </div>
        <div className="rounded-xl border border-black/8 bg-black/[0.03] px-3 py-2 dark:border-white/8 dark:bg-white/[0.04]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-white/34">
            7D
          </p>
          <p className={`mt-1 text-lg font-bold tabular-nums ${toneClass(item.change7dPct)}`}>
            {formatPercent(item.change7dPct)}
          </p>
        </div>
        <div className="rounded-xl border border-black/8 bg-black/[0.03] px-3 py-2 dark:border-white/8 dark:bg-white/[0.04]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-white/34">
            30D
          </p>
          <p className={`mt-1 text-lg font-bold tabular-nums ${toneClass(item.change30dPct)}`}>
            {formatPercent(item.change30dPct)}
          </p>
        </div>
        <div className="rounded-xl border border-black/8 bg-black/[0.03] px-3 py-2 dark:border-white/8 dark:bg-white/[0.04]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-white/34">
            Low / Peak
          </p>
          <p className="mt-1 truncate text-sm font-bold tabular-nums text-gray-950 dark:text-white">
            {formatCurrency(item.lowPrice, "EUR")} / {formatCurrency(item.highPrice, "EUR")}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-black/8 pt-3 text-xs font-semibold text-gray-500 dark:border-white/8 dark:text-white/45">
        <span>
          {item.historyPoints.toLocaleString("en-US")} recent /{" "}
          {item.lifetimeHistoryPoints.toLocaleString("en-US")} lifetime
        </span>
        <Link
          href={`/deals?mode=sealed&productId=${encodeURIComponent(item.productId)}`}
          prefetch={false}
          className="inline-flex items-center gap-1 rounded-lg border border-black/8 px-2.5 py-1.5 text-gray-700 transition-colors hover:bg-black/[0.035] dark:border-white/8 dark:text-white/70 dark:hover:bg-white/[0.05]"
          onClick={(event) => event.stopPropagation()}
        >
          Deals
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </article>
  );
}

export default function SealedMoversBrowser({ data, activeItemScope }: Props) {
  const pathname = usePathname() ?? "/movers";
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SealedSortKey>("move");
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [focusFilter, setFocusFilter] = useState<SealedFocusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState<SealedModalProductData | null>(null);
  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim().toLowerCase();

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
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
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
    { key: "move", label: "Best movers" },
    { key: "7d", label: "7 days" },
    { key: "30d", label: "30 days" },
    { key: "price_low", label: "Entry price" },
    { key: "name", label: "Name" },
  ];

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
                { key: "value" as const, label: "Value Changes" },
                { key: "raw" as const, label: "Raw Singles" },
                { key: "graded" as const, label: "Graded Cards" },
                { key: "targets" as const, label: "Grade Targets" },
                { key: "sealed" as const, label: "Sealed Products" },
              ].map((option) => (
                <Link
                  key={option.key}
                  href={modeHref(pathname, searchParams, option.key, activeItemScope)}
                  prefetch={false}
                  className={`inline-flex h-9 min-w-[8rem] flex-1 items-center justify-center rounded-lg px-3 text-xs font-semibold transition-colors sm:flex-none ${
                    option.key === "sealed"
                      ? "bg-gray-950 text-white shadow-sm shadow-black/10 dark:bg-white dark:text-gray-950"
                      : "text-gray-500 hover:bg-black/[0.05] hover:text-gray-900 dark:text-white/58 dark:hover:bg-white/[0.07] dark:hover:text-white"
                  }`}
                  aria-current={option.key === "sealed" ? "page" : undefined}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">
              Scope
            </span>
            <div className="flex flex-wrap gap-2">
              {[
                { key: "collection" as const, label: "Collection" },
                { key: "all" as const, label: "All Products" },
              ].map((option) => {
                const active = activeItemScope === option.key;
                return (
                  <Link
                    key={option.key}
                    href={scopeHref(pathname, searchParams, option.key)}
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
        </div>
      </div>

      <section>
        <SectionHeader
          eyebrow="Sealed Movers"
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

            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">
                Sort
              </span>
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SealedSortKey)}
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
                onChange={(event) => setFocusFilter(event.target.value as SealedFocusFilter)}
                className="h-11 w-full rounded-xl border border-black/8 bg-white/78 px-3 text-sm font-semibold text-gray-900 outline-none transition-colors focus:border-black/14 dark:border-white/8 dark:bg-white/[0.05] dark:text-white dark:focus:border-white/14"
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
                className="h-11 w-full rounded-xl border border-black/8 bg-white/78 px-3 text-sm font-semibold text-gray-900 outline-none transition-colors focus:border-black/14 dark:border-white/8 dark:bg-white/[0.05] dark:text-white dark:focus:border-white/14"
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
                className="h-11 rounded-xl border border-black/8 bg-white/78 px-4 text-sm font-semibold text-gray-600 transition-colors hover:border-black/14 hover:text-gray-900 dark:border-white/8 dark:bg-white/[0.05] dark:text-white/62 dark:hover:border-white/16 dark:hover:text-white"
              >
                Reset
              </button>
            ) : null}
          </div>
        </div>

        {visibleMovers.length === 0 ? (
          <div className="rounded-[24px] border border-black/8 bg-black/[0.03] p-8 text-center dark:border-white/8 dark:bg-white/[0.04]">
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              No sealed movers found
            </p>
            <p className="mt-2 text-sm text-gray-500 dark:text-white/48">
              Adjust search, product type, or scope to bring sealed products back.
            </p>
          </div>
        ) : (
          <div className="grid auto-rows-fr items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleMovers.map((item) => (
              <SealedMoverTile
                key={item.productId}
                item={item}
                onOpen={(selected) => setSelectedProduct(buildSealedProductData(selected))}
              />
            ))}
          </div>
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
