"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useSettings } from "@/components/SettingsProvider";
import { rarityBadge, formatCurrency } from "@/components/card-modal/utils";
import { KNOWN_RARITY_ORDER } from "@/lib/rarity";
import type { CollectionMoverItem } from "@/lib/movers";
import type { PriceSource } from "@/lib/user-settings";

type SortKey =
  | "move"
  | "7d"
  | "30d"
  | "tracked"
  | "low_rebound"
  | "peak_gap"
  | "price_low"
  | "price_high"
  | "name";
type DirectionFilter = "all" | "risers" | "fallers";

interface PreviewCardConfig {
  title: string;
  eyebrow: string;
  description: string;
  href: string;
  hrefLabel?: string;
  items: CollectionMoverItem[];
}

interface Props {
  movers: CollectionMoverItem[];
  activePriceSource: PriceSource;
  eyebrow?: string;
  title?: string;
  description?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  previewCards?: PreviewCardConfig[];
}

interface FilterChipOption {
  key: string;
  label: string;
  count: number;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatDelta(value: number | null | undefined, currency: "EUR" | "USD"): string {
  if (value == null) {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${formatCurrency(value, currency)}`;
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function sourcePillClasses(source: CollectionMoverItem["source"]) {
  return source === "tcgplayer"
    ? "border-blue-400/18 bg-blue-400/[0.08] text-blue-200"
    : "border-emerald-400/18 bg-emerald-400/[0.08] text-emerald-200";
}

function getMoverTileMinWidth(cardSize: "small" | "medium" | "large", widescreen: boolean): string {
  if (cardSize === "small") {
    return widescreen ? "280px" : "250px";
  }

  if (cardSize === "large") {
    return widescreen ? "380px" : "340px";
  }

  return widescreen ? "320px" : "290px";
}

function getToneClass(value: number | null | undefined): string {
  if (value == null) {
    return "text-gray-500 dark:text-white/45";
  }

  if (value < 0) {
    return "text-rose-600 dark:text-rose-300";
  }

  if (value > 0) {
    return "text-emerald-600 dark:text-emerald-300";
  }

  return "text-gray-500 dark:text-white/45";
}

function getScorePillClass(value: number): string {
  if (value < 0) {
    return "border-rose-400/16 bg-rose-400/[0.08] text-rose-700 dark:text-rose-200";
  }

  if (value > 0) {
    return "border-violet-400/16 bg-violet-400/[0.08] text-violet-700 dark:text-violet-200";
  }

  return "border-black/8 bg-black/[0.04] text-gray-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/60";
}

function buildSortSummary(sortKey: SortKey, direction: DirectionFilter): string {
  switch (sortKey) {
    case "7d":
      return direction === "fallers"
        ? "7D biggest drop -> smallest drop"
        : "7D biggest rise -> biggest drop";
    case "30d":
      return direction === "fallers"
        ? "30D biggest drop -> smallest drop"
        : "30D biggest rise -> biggest drop";
    case "tracked":
      return direction === "fallers"
        ? "Since tracked biggest drop -> smallest drop"
        : "Since tracked biggest rise -> biggest drop";
    case "low_rebound":
      return direction === "fallers"
        ? "From low weakest rebound -> strongest rebound"
        : "From low strongest rebound -> weakest rebound";
    case "peak_gap":
      return "Vs peak deepest discount -> closest to peak";
    case "price_low":
      return "Price low -> high";
    case "price_high":
      return "Price high -> low";
    case "name":
      return "Name A -> Z";
    case "move":
    default:
      return direction === "fallers"
        ? "Move hardest faller -> mildest faller"
        : "Move strongest -> most negative (recent + lifetime)";
  }
}

function matchesDirection(item: CollectionMoverItem, direction: DirectionFilter): boolean {
  if (direction === "risers") {
    return item.moverScore > 0;
  }

  if (direction === "fallers") {
    return item.moverScore < 0;
  }

  return true;
}

function compareMetricValues(
  a: number | null | undefined,
  b: number | null | undefined,
  order: "asc" | "desc"
): number {
  const leftMissing = a == null;
  const rightMissing = b == null;

  if (leftMissing || rightMissing) {
    if (leftMissing && rightMissing) {
      return 0;
    }

    return leftMissing ? 1 : -1;
  }

  return order === "asc" ? a - b : b - a;
}

function compareMoverItems(
  a: CollectionMoverItem,
  b: CollectionMoverItem,
  sortKey: SortKey,
  direction: DirectionFilter
): number {
  const preferMostNegativeFirst = direction === "fallers";

  if (sortKey === "name") {
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
  }

  if (sortKey === "price_low") {
    if (a.currentPrice !== b.currentPrice) {
      return a.currentPrice - b.currentPrice;
    }
  } else if (sortKey === "price_high") {
    if (a.currentPrice !== b.currentPrice) {
      return b.currentPrice - a.currentPrice;
    }
  } else if (sortKey === "7d") {
    const diff = compareMetricValues(
      a.change7dPct,
      b.change7dPct,
      preferMostNegativeFirst ? "asc" : "desc"
    );
    if (diff !== 0) {
      return diff;
    }
  } else if (sortKey === "30d") {
    const diff = compareMetricValues(
      a.change30dPct,
      b.change30dPct,
      preferMostNegativeFirst ? "asc" : "desc"
    );
    if (diff !== 0) {
      return diff;
    }
  } else if (sortKey === "tracked") {
    const diff = compareMetricValues(
      a.changeSinceTrackedPct,
      b.changeSinceTrackedPct,
      preferMostNegativeFirst ? "asc" : "desc"
    );
    if (diff !== 0) {
      return diff;
    }
  } else if (sortKey === "low_rebound") {
    const diff = compareMetricValues(
      a.changeFromLowPct,
      b.changeFromLowPct,
      preferMostNegativeFirst ? "asc" : "desc"
    );
    if (diff !== 0) {
      return diff;
    }
  } else if (sortKey === "peak_gap") {
    const diff = compareMetricValues(a.gapToPeakPct, b.gapToPeakPct, "asc");
    if (diff !== 0) {
      return diff;
    }
  } else {
    if (a.moverScore !== b.moverScore) {
      return preferMostNegativeFirst ? a.moverScore - b.moverScore : b.moverScore - a.moverScore;
    }
  }

  if (a.moverScore !== b.moverScore) {
    return preferMostNegativeFirst ? a.moverScore - b.moverScore : b.moverScore - a.moverScore;
  }

  return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
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

const TILE_SUMMARY_GRID_TEMPLATE = "repeat(auto-fit, minmax(138px, 1fr))";
const TILE_DETAIL_GRID_TEMPLATE = "repeat(auto-fit, minmax(148px, 1fr))";

function MoverTile({ item }: { item: CollectionMoverItem }) {
  return (
    <article className="rounded-[24px] border border-black/8 bg-black/[0.03] p-4 shadow-lg shadow-black/5 dark:border-white/8 dark:bg-white/[0.04]">
      <div className="flex items-start gap-3">
        <div className="relative h-24 w-[4.25rem] shrink-0 overflow-hidden rounded-2xl border border-black/8 bg-black/5 dark:border-white/10 dark:bg-white/[0.05]">
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt={item.name}
              fill
              className="object-contain"
              sizes="68px"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-gray-400 dark:text-white/35">
              {item.name.slice(0, 2)}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate pr-1 text-lg font-semibold leading-tight text-gray-900 dark:text-white">
                {item.name}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-white/46">
                <span>{item.cardNumber ? `#${item.cardNumber}` : "--"}</span>
                <span>/</span>
                <Link
                  href={`/expansions/${item.episodeId}`}
                  className="truncate transition-colors hover:text-gray-900 hover:underline underline-offset-2 dark:hover:text-white"
                >
                  {item.episodeName}
                  {item.episodeCode ? <span className="ml-1 opacity-60">({item.episodeCode})</span> : null}
                </Link>
              </div>
            </div>

            <span
              className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${sourcePillClasses(
                item.source
              )}`}
            >
              {item.sourceLabel}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {item.normalizedRarity && (
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${rarityBadge(
                  item.normalizedRarity
                )}`}
              >
                {item.normalizedRarity}
              </span>
            )}
            <span className="inline-flex rounded-full border border-black/8 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/60">
              x{item.ownedCount} owned
            </span>
          </div>

          <div
            className="mt-4 grid gap-2"
            style={{
              gridTemplateColumns: TILE_SUMMARY_GRID_TEMPLATE,
            }}
          >
            <div className="rounded-2xl border border-emerald-400/14 bg-emerald-400/[0.08] px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700/80 dark:text-emerald-200/72">
                Current
              </p>
              <p className="mt-2 text-lg font-bold tabular-nums text-gray-900 dark:text-white">
                {formatCurrency(item.currentPrice, item.currency)}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-white/46">
                {formatShortDate(item.latestFetchedAt)}
              </p>
            </div>

            <div className="grid gap-2">
              <div className="rounded-2xl border border-black/8 bg-white/80 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.05]">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <span className="min-w-0 text-[10px] font-semibold uppercase tracking-[0.16em] leading-tight text-gray-400 dark:text-white/34">
                    7D
                  </span>
                  <span
                    className={`text-right text-sm font-semibold tabular-nums leading-tight ${getToneClass(
                      item.change7dPct
                    )}`}
                  >
                    {formatPercent(item.change7dPct)}
                  </span>
                </div>
                <p className={`mt-1 text-sm font-semibold leading-tight ${getToneClass(item.change7d)}`}>
                  {formatDelta(item.change7d, item.currency)}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-gray-500 dark:text-white/42">
                  {item.change7dCoveredDays ? `${item.change7dCoveredDays}d window` : "Recent window"}
                </p>
              </div>

              <div className="rounded-2xl border border-black/8 bg-white/80 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.05]">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <span className="min-w-0 text-[10px] font-semibold uppercase tracking-[0.16em] leading-tight text-gray-400 dark:text-white/34">
                    30D
                  </span>
                  <span
                    className={`text-right text-sm font-semibold tabular-nums leading-tight ${getToneClass(
                      item.change30dPct
                    )}`}
                  >
                    {formatPercent(item.change30dPct)}
                  </span>
                </div>
                <p className={`mt-1 text-sm font-semibold leading-tight ${getToneClass(item.change30d)}`}>
                  {formatDelta(item.change30d, item.currency)}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-gray-500 dark:text-white/42">
                  {item.change30dCoveredDays ? `${item.change30dCoveredDays}d window` : "Recent window"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs leading-snug text-gray-500 dark:text-white/46">
              {item.historyPoints} recent / {item.lifetimeHistoryPoints} lifetime points
            </p>
            <span
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold tabular-nums ${getScorePillClass(
                item.moverScore
              )}`}
            >
              Score {item.moverScore.toFixed(1)}
            </span>
          </div>

          <div
            className="mt-3 grid gap-2"
            style={{
              gridTemplateColumns: TILE_DETAIL_GRID_TEMPLATE,
            }}
          >
            <div className="rounded-2xl border border-black/8 bg-white/80 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.05]">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <span className="min-w-0 text-[10px] font-semibold uppercase tracking-[0.16em] leading-tight text-gray-400 dark:text-white/34">
                  Since Tracked
                </span>
                <span
                  className={`text-right text-sm font-semibold tabular-nums leading-tight ${getToneClass(
                    item.changeSinceTrackedPct
                  )}`}
                >
                  {formatPercent(item.changeSinceTrackedPct)}
                </span>
              </div>
              <p className={`mt-1 text-sm font-semibold leading-tight ${getToneClass(item.changeSinceTracked)}`}>
                {formatDelta(item.changeSinceTracked, item.currency)}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-gray-500 dark:text-white/42">
                {item.firstTrackedAt
                  ? `Started ${formatShortDate(item.firstTrackedAt)}${
                      item.trackedDays != null ? ` / ${item.trackedDays}d` : ""
                    }`
                  : item.trackedDays != null
                    ? `${item.trackedDays}d tracked`
                    : "No lifetime window"}
              </p>
            </div>

            <div className="rounded-2xl border border-black/8 bg-white/80 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.05]">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <span className="min-w-0 text-[10px] font-semibold uppercase tracking-[0.16em] leading-tight text-gray-400 dark:text-white/34">
                  From Low
                </span>
                <span
                  className={`text-right text-sm font-semibold tabular-nums leading-tight ${getToneClass(
                    item.changeFromLowPct
                  )}`}
                >
                  {formatPercent(item.changeFromLowPct)}
                </span>
              </div>
              <p className={`mt-1 text-sm font-semibold leading-tight ${getToneClass(item.changeFromLow)}`}>
                {formatDelta(item.changeFromLow, item.currency)}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-gray-500 dark:text-white/42">
                {item.lowPrice != null
                  ? `Low ${formatCurrency(item.lowPrice, item.currency)}${
                      item.lowAt ? ` / ${formatShortDate(item.lowAt)}` : ""
                    }`
                  : "No low recorded"}
              </p>
            </div>

            <div className="rounded-2xl border border-black/8 bg-white/80 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.05]">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <span className="min-w-0 text-[10px] font-semibold uppercase tracking-[0.16em] leading-tight text-gray-400 dark:text-white/34">
                  Vs Peak
                </span>
                <span
                  className={`text-right text-sm font-semibold tabular-nums leading-tight ${getToneClass(
                    item.gapToPeakPct
                  )}`}
                >
                  {formatPercent(item.gapToPeakPct)}
                </span>
              </div>
              <p className={`mt-1 text-sm font-semibold leading-tight ${getToneClass(item.gapToPeak)}`}>
                {formatDelta(item.gapToPeak, item.currency)}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-gray-500 dark:text-white/42">
                {item.highPrice != null
                  ? `Peak ${formatCurrency(item.highPrice, item.currency)}${
                      item.highAt ? ` / ${formatShortDate(item.highAt)}` : ""
                    }`
                  : "No peak recorded"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function PocketPreviewCard({
  title,
  eyebrow,
  description,
  items,
  href,
  hrefLabel = "Open page",
}: {
  title: string;
  eyebrow: string;
  description: string;
  items: CollectionMoverItem[];
  href: string;
  hrefLabel?: string;
}) {
  return (
    <article className="rounded-[24px] border border-black/8 bg-black/[0.03] p-4 shadow-lg shadow-black/5 dark:border-white/8 dark:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/36">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-gray-900 dark:text-white">
            {title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-white/48">{description}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {items.length.toLocaleString()}
          </p>
          <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400 dark:text-white/34">
            cards
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.slice(0, 4).map((item) => (
          <div
            key={`${href}-${item.cardId}`}
            className="rounded-2xl border border-black/8 bg-white/75 px-3 py-3 dark:border-white/8 dark:bg-white/[0.05]"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                {item.name}
              </p>
              <span className={`text-xs font-semibold tabular-nums ${getToneClass(item.moverScore)}`}>
                {item.moverScore >= 0 ? "+" : ""}
                {item.moverScore.toFixed(1)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-white/46">
              <span className="truncate">
                {item.episodeName}
                {item.episodeCode ? ` (${item.episodeCode})` : ""}
              </span>
              <span>{formatCurrency(item.currentPrice, item.currency)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <Link
          href={href}
          className="inline-flex items-center rounded-full border border-black/8 bg-white/80 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:border-black/16 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/75 dark:hover:border-white/16 dark:hover:text-white"
        >
          {hrefLabel}
        </Link>
      </div>
    </article>
  );
}

export default function MoversBrowser({
  movers,
  activePriceSource,
  eyebrow = "Main Movers",
  title = "Full collection movers",
  description,
  emptyTitle = "Geen movers voor deze filtercombinatie",
  emptyDescription = "Pas je zoekterm of filters aan om weer kaarten te zien.",
  previewCards = [],
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
  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const moverTileMinWidth = getMoverTileMinWidth(settings.cardSize, settings.widescreen);
  const visiblePreviewCards = previewCards.filter((card) => card.items.length > 0);
  const priceSourceHref = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());

    return (source: PriceSource) => {
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

  return (
    <div className="space-y-10">
      {visiblePreviewCards.length > 0 && (
        <section className="grid gap-4 xl:grid-cols-2">
          {visiblePreviewCards.map((card) => (
            <PocketPreviewCard
              key={card.href}
              eyebrow={card.eyebrow}
              title={card.title}
              description={card.description}
              items={card.items}
              href={card.href}
              hrefLabel={card.hrefLabel}
            />
          ))}
        </section>
      )}

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 dark:text-white/36">
              {eyebrow}
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              {title}
            </h2>
            {description ? (
              <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-white/48">{description}</p>
            ) : null}
          </div>
          <p className="text-sm text-gray-500 dark:text-white/46">
            {visibleMovers.length.toLocaleString()} / {movers.length.toLocaleString()} visible
          </p>
        </div>

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
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-900 dark:text-white/35 dark:hover:text-white"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <span className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/70 px-3 py-1.5 text-[11px] font-medium text-gray-500 dark:border-white/8 dark:bg-white/[0.04] dark:text-white/55">
                {buildSortSummary(sortKey, direction)}
              </span>
              <button
                type="button"
                onClick={() => setFiltersExpanded((current) => !current)}
                className={filterButtonClass(filtersExpanded || filterBadgeCount > 0)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
                {filterBadgeCount > 0 && (
                  <span className={countBadgeClass(filtersExpanded || filterBadgeCount > 0)}>
                    {filterBadgeCount}
                  </span>
                )}
              </button>
              {filterBadgeCount > 0 && (
                <button type="button" onClick={clearAllFilters} className={filterButtonClass(false)}>
                  Clear all
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/35">
                Sort
              </span>
              <div className="inline-flex overflow-hidden rounded-xl border border-black/8 bg-black/[0.03] dark:border-white/8 dark:bg-white/[0.03]">
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
                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
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

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/35">
                Direction
              </span>
              <div className="inline-flex overflow-hidden rounded-xl border border-black/8 bg-black/[0.03] dark:border-white/8 dark:bg-white/[0.03]">
                {[
                  { key: "all", label: "All" },
                  { key: "risers", label: "Risers" },
                  { key: "fallers", label: "Fallers" },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setDirection(option.key as DirectionFilter)}
                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
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

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/35">
                Source
              </span>
              <div className="inline-flex overflow-hidden rounded-xl border border-black/8 bg-black/[0.03] dark:border-white/8 dark:bg-white/[0.03]">
                {[
                  { key: "cm_en", label: "CM" },
                  { key: "tcp", label: "TCP" },
                ].map((option) => {
                  const active = activePriceSource === option.key;

                  return (
                    <Link
                      key={option.key}
                      href={priceSourceHref(option.key as PriceSource)}
                      className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
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

          {activeFilterLabels.length > 0 && (
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
          )}

          {filtersExpanded && (
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
          )}
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
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${moverTileMinWidth}, 1fr))`,
            }}
          >
            {visibleMovers.map((item) => (
              <MoverTile key={item.cardId} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
