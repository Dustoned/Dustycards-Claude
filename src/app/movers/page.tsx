import Link from "next/link";
import { ArrowDownRight, ChevronDown, Clock3, Gem, SlidersHorizontal, Sparkles, TrendingUp } from "lucide-react";
import CollectionValueDrivers from "@/components/CollectionValueDrivers";
import GameFilterSwitch, { SegmentedNavLinks } from "@/components/GameFilterSwitch";
import { HeaderStatCard, type HeaderStat } from "@/components/PageHeader";
import PriceHistoryPanel, { type PriceHistoryValuePoint } from "@/components/PriceHistoryPanel";
import MoversBrowser from "@/app/movers/MoversBrowser";
import SealedMoversBrowser from "@/app/movers/SealedMoversBrowser";
import { loadMoversPageData } from "@/app/movers/page-data";
import type { DirectionFilter } from "@/app/movers/MoversBrowser.utils";
import { requirePageUser } from "@/lib/page-auth";
import { formatCollectionCurrency } from "@/lib/collection";
import {
  GAME_FILTER_OPTIONS,
  GAME_SEARCH_PARAM,
  getGameFilterLabel,
  getGameFilterSearchParamValue,
  parseVisibleGameFilter,
  type TradingCardGameFilter,
} from "@/lib/games";
import { getMoversMode, type MoversMode, type MoversPageScope } from "@/app/movers/routing";
import type { CollectionValueDriversData } from "@/lib/collection-data";
import type { CollectionMoversData, MoversScope } from "@/lib/movers";
import type { SealedMoversData } from "@/lib/sealed-movers";
import type { PriceSource } from "@/lib/user-settings";
import { getServerUserSettings } from "@/lib/user-settings-server";

export const dynamic = "force-dynamic";

type SummaryMetric = HeaderStat;
type MarketTrend = Extract<DirectionFilter, "all" | "risers" | "fallers">;

interface PulseChartData {
  title: string;
  currency: "EUR" | "USD";
  points: PriceHistoryValuePoint[];
  currentValue: number | null;
  subtitle: string;
}

function CompactFilterGroup({
  label,
  items,
  ariaLabel,
}: {
  label: string;
  items: readonly { href: string; active: boolean; label: string }[];
  ariaLabel: string;
}) {
  if (items.length <= 0) return null;

  return (
    <div className="min-w-0">
      <p className="mb-1 px-1 text-[8px] font-black uppercase tracking-[0.14em] text-white/32">
        {label}
      </p>
      <nav
        aria-label={ariaLabel}
        className="grid min-w-0 gap-1 rounded-xl border border-white/7 bg-white/[0.035] p-1"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => (
          <Link
            key={`${item.href}:${item.label}`}
            href={item.href}
            prefetch={false}
            aria-current={item.active ? "page" : undefined}
            className={`inline-flex h-7 min-w-0 items-center justify-center rounded-full px-1 text-[9.5px] font-bold leading-none transition-colors min-[390px]:text-[10px] ${
              item.active
                ? "border border-white/70 bg-white text-gray-950 shadow-[0_10px_22px_rgba(255,255,255,0.07)]"
                : "text-white/58 hover:bg-white/[0.07] hover:text-white"
            }`}
          >
            <span className="truncate">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getModeCopy(
  activeScope: MoversPageScope,
  activeItemScope: "collection" | "all"
) {
  if (activeScope === "value") {
    return {
      eyebrow:
        activeItemScope === "all" ? "Value Changes / All Cards" : "Value Changes / Collection",
      title: "Market",
      description:
        activeItemScope === "all"
          ? "Scan all raw cards for the latest CardMarket value changes, with gains and drops loaded as you scroll."
          : "See exactly which collection items explain the latest value change, before jumping into raw, graded, targets, or sealed movers.",
      ranking:
        activeItemScope === "all" ? "Latest all-card value change" : "Latest collection value change",
    };
  }

  if (activeScope === "sealed") {
    return {
      eyebrow: activeItemScope === "collection" ? "Sealed Market / Collection" : "Sealed Market / All Products",
      title: "Market",
      description:
        "Track sealed Pokemon products by recent CardMarket movement, lifetime highs and lows, across owned and all-product views.",
      ranking: "Sealed products",
    };
  }

  if (activeScope === "graded") {
    return {
      eyebrow: activeItemScope === "collection" ? "Graded Market / Collection" : "Graded Market / All Cards",
      title: "Market",
      description:
        "Track every current slab label as its own market item, with recent movement and lifetime context tucked into details.",
      ranking: "Graded prices",
    };
  }

  if (activeScope === "grading") {
    return {
      eyebrow: activeItemScope === "collection" ? "Grade Targets / Collection" : "Grade Targets / All Cards",
      title: "Market",
      description:
        "Find cards where the raw CardMarket price is low compared with the current graded value.",
      ranking: "Raw vs graded upside",
    };
  }

  return {
    eyebrow: activeScope === "all" ? "Raw Market / All Cards" : "Raw Market / Collection",
    title: "Market",
    description:
      activeScope === "all"
        ? "Scan all tracked raw cards by recent risers, drops, and compact market pockets."
        : "Scan your collection by recent risers, drops, and compact market pockets.",
    ranking: activeScope === "all" ? "All raw cards" : "Collection raw cards",
  };
}

function formatSignedCurrency(value: number | null | undefined): string {
  if (value == null) return "--";

  return `${value > 0 ? "+" : ""}${formatCollectionCurrency(value)}`;
}

function normalizeMarketTrend(value: string | null | undefined): MarketTrend {
  return value === "risers" || value === "fallers" ? value : "all";
}

function buildValuePulseChart(data: CollectionValueDriversData): PulseChartData {
  const previousDate = data.previousDate;
  const latestDate = data.latestDate;
  const hasComparison = Boolean(previousDate && latestDate && data.totalChange != null);

  return {
    title: "Value Change",
    currency: "EUR",
    points: hasComparison
      ? [
          {
            date: previousDate as string,
            label: data.previousLabel ?? "Previous",
            value: 0,
          },
          {
            date: latestDate as string,
            label: data.latestLabel ?? "Latest",
            value: data.totalChange,
          },
        ]
      : [],
    currentValue: data.totalChange,
    subtitle:
      data.previousLabel && data.latestLabel
        ? `${data.previousLabel} to ${data.latestLabel}`
        : "Latest collection movement",
  };
}

function buildMoverPulseChart(
  items: Array<{
    name: string;
    currency: "EUR" | "USD";
    currentPrice: number;
    recentPriceSeries: Array<{ date: string; label: string; value: number }>;
  }>,
  fallbackTitle: string
): PulseChartData {
  const selected = items
    .filter((item) => item.recentPriceSeries.length > 1)
    .slice(0, 12);
  const totalsByDate = new Map<string, { label: string; value: number }>();

  for (const item of selected) {
    for (const point of item.recentPriceSeries) {
      const current = totalsByDate.get(point.date) ?? { label: point.label, value: 0 };
      current.value += point.value;
      totalsByDate.set(point.date, current);
    }
  }

  const points = [...totalsByDate.entries()]
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, point]) => ({
      date,
      label: point.label,
      value: Number(point.value.toFixed(2)),
    }));
  const fallbackValue =
    selected.length > 0
      ? Number(selected.reduce((total, item) => total + item.currentPrice, 0).toFixed(2))
      : null;

  return {
    title: "Mover Pulse",
    currency: selected[0]?.currency ?? "EUR",
    points,
    currentValue: points.at(-1)?.value ?? fallbackValue,
    subtitle:
      selected.length > 0
        ? `${selected.length.toLocaleString("en-US")} top cards / ${fallbackTitle}`
        : fallbackTitle,
  };
}

function pickStrongestMover(
  items: CollectionMoversData["movers"],
  metric: "change7dPct" | "change30dPct",
  direction: "up" | "down"
) {
  return (
    [...items]
      .filter((item) =>
        direction === "up" ? (item[metric] ?? 0) > 0 : (item[metric] ?? 0) < 0
      )
      .sort((a, b) =>
        direction === "up"
          ? (b[metric] ?? Number.NEGATIVE_INFINITY) -
            (a[metric] ?? Number.NEGATIVE_INFINITY)
          : (a[metric] ?? Number.POSITIVE_INFINITY) -
            (b[metric] ?? Number.POSITIVE_INFINITY)
      )[0] ?? null
  );
}

export default async function MoversPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; scope?: string; view?: string; game?: string; trend?: string }>;
}) {
  const { source, scope, view, game: gameParam, trend } = await searchParams;
  const requestedParams = new URLSearchParams();
  if (source) requestedParams.set("source", source);
  if (scope) requestedParams.set("scope", scope);
  if (view) requestedParams.set("view", view);
  if (gameParam) requestedParams.set(GAME_SEARCH_PARAM, gameParam);
  if (trend) requestedParams.set("trend", trend);
  const requestedQuery = requestedParams.toString();
  const activeTrend = normalizeMarketTrend(trend);
  const user = await requirePageUser(`/movers${requestedQuery ? `?${requestedQuery}` : ""}`);
  const settings = await getServerUserSettings(user.id);
  const activeGame = parseVisibleGameFilter(gameParam, {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
  const { activePriceSource, activeScope, activeItemScope, data } = await loadMoversPageData(
    source,
    scope,
    view,
    user.id,
    activeGame
  );
  const isValueScope = activeScope === "value";
  const isSealedScope = activeScope === "sealed";
  const isGradedScope = activeScope === "graded";
  const isGradingScope = activeScope === "grading";
  const isRawScope = !isValueScope && !isSealedScope && !isGradedScope && !isGradingScope;
  const activeMode = getMoversMode(activeScope);
  const hasExplicitSource = source === "cm_en" || source === "tcp";

  function buildMoversHref({
    mode = activeMode,
    itemScope = activeItemScope,
    priceSource,
    game = activeGame,
    trend: nextTrend = activeTrend,
  }: {
    mode?: MoversMode;
    itemScope?: "collection" | "all";
    priceSource?: PriceSource;
    game?: TradingCardGameFilter;
    trend?: MarketTrend;
  }) {
    const params = new URLSearchParams();
    const nextSource = priceSource ?? activePriceSource;
    const shouldCarrySource = mode !== "value" && (priceSource != null || hasExplicitSource);
    const gameValue = getGameFilterSearchParamValue(game);

    if (gameValue) {
      params.set(GAME_SEARCH_PARAM, gameValue);
    }

    if (nextTrend !== "all" && mode !== "sealed" && mode !== "targets") {
      params.set("trend", nextTrend);
    }

    if (shouldCarrySource) {
      params.set("source", nextSource);
    }

    if (mode === "value") {
      if (itemScope === "all") {
        params.set("view", "all");
      }
    } else if (mode === "raw") {
      params.set("scope", itemScope === "all" ? "all" : "collection");
    } else if (mode === "graded") {
      params.set("scope", "graded");
      if (itemScope === "collection") params.set("view", "collection");
    } else if (mode === "targets") {
      params.set("scope", "grading");
      if (itemScope === "collection") params.set("view", "collection");
    } else {
      params.set("scope", "sealed");
      if (itemScope === "collection") params.set("view", "collection");
    }

    const query = params.toString();
    return query ? `/movers?${query}` : "/movers";
  }

  const marketSwitchItems = [
    { href: buildMoversHref({ mode: "raw" }), active: activeMode === "raw", label: "Raw" },
    { href: buildMoversHref({ mode: "graded" }), active: activeMode === "graded", label: "Graded" },
    { href: buildMoversHref({ mode: "targets" }), active: activeMode === "targets", label: "Targets" },
    { href: buildMoversHref({ mode: "sealed" }), active: activeMode === "sealed", label: "Sealed" },
  ];
  const movementSwitchItems = [
    { href: buildMoversHref({ trend: "all" }), active: activeTrend === "all", label: "All" },
    { href: buildMoversHref({ trend: "risers" }), active: activeTrend === "risers", label: "Risers" },
    { href: buildMoversHref({ trend: "fallers" }), active: activeTrend === "fallers", label: "Drops" },
  ];
  const scopeSwitchItems = [
    {
      href: buildMoversHref({ itemScope: "collection" }),
      active: activeItemScope === "collection",
      label: "Collection",
    },
    {
      href: buildMoversHref({ itemScope: "all" }),
      active: activeItemScope === "all",
      label: "All Cards",
    },
  ];
  const sourceSwitchItems = [
    {
      href: buildMoversHref({ mode: "raw", priceSource: "cm_en" }),
      active: activePriceSource === "cm_en",
      label: "CardMarket",
    },
    {
      href: buildMoversHref({ mode: "raw", priceSource: "tcp" }),
      active: activePriceSource === "tcp",
      label: "TCGPlayer",
    },
  ];
  const gameSwitchItems = GAME_FILTER_OPTIONS.map((game) => ({
    href: buildMoversHref({ game }),
    active: activeGame === game,
    label: getGameFilterLabel(game),
  }));
  const activeMovementLabel = movementSwitchItems.find((item) => item.active)?.label ?? "All";
  const activeScopeLabel = scopeSwitchItems.find((item) => item.active)?.label ?? "Collection";
  const activeSourceLabel = sourceSwitchItems.find((item) => item.active)?.label ?? "CardMarket";
  const activeSecondaryFilters = [
    (isRawScope || isGradedScope) && !isValueScope ? activeMovementLabel : null,
    activeScopeLabel,
    isRawScope ? activeSourceLabel : null,
  ].filter(Boolean);
  const desktopActiveSecondaryFilters = [
    (isRawScope || isGradedScope) && !isValueScope ? activeMovementLabel : null,
    isRawScope ? activeSourceLabel : null,
  ].filter(Boolean);
  const showDesktopFilterDetails = desktopActiveSecondaryFilters.length > 0;
  function buildMarketPocketHref(pathname: "/movers/cheap-high-rarity" | "/movers/discount-watch") {
    const params = new URLSearchParams();
    const gameValue = getGameFilterSearchParamValue(activeGame);

    if (gameValue) params.set(GAME_SEARCH_PARAM, gameValue);
    if (hasExplicitSource) params.set("source", activePriceSource);
    if (activeScope !== "value") params.set("scope", activeScope);
    if (activeItemScope === "collection") params.set("view", "collection");

    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }
  const modeCopy = getModeCopy(activeScope, activeItemScope);
  const trendCopy =
    activeTrend === "risers"
      ? {
          title: "Recent risers",
          description: "Cards with the clearest positive movement first.",
        }
      : activeTrend === "fallers"
        ? {
            title: "Recent drops",
            description: "Cards that recently moved down or sit weaker versus their history.",
          }
        : {
            title: modeCopy.ranking,
            description: "Risers, drops, and opportunity pockets in one market view.",
          };
  const valueData = isValueScope ? (data as CollectionValueDriversData) : null;
  const sealedData = isSealedScope ? (data as SealedMoversData) : null;
  const cardData = !isValueScope && !isSealedScope ? (data as CollectionMoversData) : null;
  const updatedAt = sealedData?.updatedAt ?? cardData?.movers[0]?.latestFetchedAt ?? null;
  const pulseChart = valueData
    ? buildValuePulseChart(valueData)
    : sealedData
      ? buildMoverPulseChart(sealedData.movers, modeCopy.ranking)
      : cardData
        ? buildMoverPulseChart(cardData.movers, modeCopy.ranking)
        : null;
  const metrics = valueData
    ? ([
        {
          label: "Net Change",
          value: formatSignedCurrency(valueData.totalChange),
          hint:
            valueData.previousLabel && valueData.latestLabel
              ? `${valueData.previousLabel} to ${valueData.latestLabel}`
              : "No comparison snapshot yet.",
          Icon: TrendingUp,
          tone:
            (valueData.totalChange ?? 0) >= 0 ? "emerald" : "rose",
        },
        {
          label: "Gains",
          value: formatSignedCurrency(valueData.gainsTotal),
          hint: `${valueData.gains.length.toLocaleString("en-US")} top gain drivers shown.`,
          Icon: Sparkles,
          tone: "emerald",
        },
        {
          label: "Drops",
          value: formatSignedCurrency(valueData.dropsTotal),
          hint: `${valueData.drops.length.toLocaleString("en-US")} top drop drivers shown.`,
          Icon: ArrowDownRight,
          tone: "rose",
        },
        {
          label: "Items",
          value: (valueData.gains.length + valueData.drops.length).toLocaleString("en-US"),
          hint:
            activeItemScope === "all"
              ? "All raw card-level contributors in the latest snapshot."
              : "Largest item-level contributors in the latest snapshot.",
          Icon: Gem,
          tone: "sky",
        },
      ] satisfies SummaryMetric[])
    : isSealedScope && sealedData
    ? ([
        {
          label: activeItemScope === "all" ? "Tracked Products" : "Collection Products",
          value: sealedData.trackedProducts.toLocaleString("en-US"),
          hint: "Sealed products checked for CardMarket movement.",
          Icon: Gem,
          tone: "amber",
        },
        {
          label: "Moving",
          value: sealedData.eligibleProducts.toLocaleString("en-US"),
          hint: "Priced sealed products in the current market list.",
          Icon: TrendingUp,
          tone: "emerald",
        },
        {
          label: "Entry Picks",
          value: sealedData.cheapestMovers.length.toLocaleString("en-US"),
          hint: "Lower-price sealed products that are already moving.",
          Icon: Sparkles,
          tone: "violet",
        },
        {
          label: "Updated",
          value: updatedAt ? formatShortDate(updatedAt) : "--",
          hint: updatedAt ? formatDateTime(updatedAt) : "No snapshot yet.",
          Icon: Clock3,
          tone: "sky",
        },
      ] satisfies SummaryMetric[])
    : ([
        {
          label: activeItemScope === "all" ? "Tracked Cards" : "Collection Cards",
          value: cardData?.trackedCards.toLocaleString("en-US") ?? "0",
          hint: isGradingScope
            ? "Labels compared with raw CardMarket price."
            : isGradedScope
              ? "Current labels with graded price data."
              : "Cards checked for raw movement.",
          Icon: Gem,
          tone: "amber",
        },
        {
          label: isGradingScope ? "Targets" : isGradedScope ? "Labels Shown" : "Moving",
          value: cardData?.eligibleCards.toLocaleString("en-US") ?? "0",
          hint: isGradingScope
            ? "Positive raw-to-graded upside."
            : isGradedScope
              ? "Current slab labels in the market list."
              : "Cards with meaningful movement.",
          Icon: TrendingUp,
          tone: "emerald",
        },
        {
          label: isGradingScope ? "Cheap Raw" : "Opportunity",
          value: cardData?.cheapestHighRarityMovers.length.toLocaleString("en-US") ?? "0",
          hint: isGradingScope ? "Raw price at or below 15 EUR." : "Lower-price high-rarity picks.",
          Icon: Sparkles,
          tone: "violet",
        },
        {
          label: "Updated",
          value: updatedAt ? formatShortDate(updatedAt) : "--",
          hint: updatedAt ? formatDateTime(updatedAt) : "No snapshot yet.",
          Icon: Clock3,
          tone: "sky",
        },
      ] satisfies SummaryMetric[]);
  const cardSpotlights =
    cardData && !isGradingScope
      ? [
          { title: "Top 7D riser", item: pickStrongestMover(cardData.movers, "change7dPct", "up"), windowKey: "7d" as const },
          { title: "Top 7D drop", item: pickStrongestMover(cardData.movers, "change7dPct", "down"), windowKey: "7d" as const },
        ]
      : [];
  const marketPreviewCards =
    cardData && isRawScope
      ? [
          {
            title: "Cheap rarity",
            eyebrow: "Market pocket",
            description: "Affordable high-rarity cards with movement, kept as a focused pocket inside Market.",
            href: buildMarketPocketHref("/movers/cheap-high-rarity"),
            hrefLabel: "Open pocket",
            items: cardData.cheapestHighRarityMovers,
            reasonMode: "raw" as const,
          },
          {
            title: "Discount watch",
            eyebrow: "Market pocket",
            description: "High-rarity cards that pulled back hard from previous peaks.",
            href: buildMarketPocketHref("/movers/discount-watch"),
            hrefLabel: "Open pocket",
            items: cardData.discountedHighRarity,
            reasonMode: "raw" as const,
          },
        ]
      : [];
  return (
    <div
      className="page-container mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8"
    >
      <div className="flex w-full flex-col gap-5 sm:gap-6">
        <section className="binder-panel relative overflow-hidden rounded-[var(--ui-page-header-radius)] p-3 sm:p-4 lg:p-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(17rem,0.66fr)_minmax(0,1.05fr)] xl:grid-cols-[minmax(18rem,0.62fr)_minmax(0,1fr)_minmax(21rem,0.7fr)] xl:items-stretch">
            <div className="flex min-h-[var(--ui-dashboard-header-panel-min-height)] min-w-0 flex-col justify-between rounded-[var(--ui-page-header-radius)] border border-white/8 bg-black/10 p-[var(--ui-page-header-padding)]">
              <div className="min-w-0">
                <p className="min-w-0 text-[length:var(--ui-page-header-eyebrow-size)] font-semibold uppercase tracking-[0.14em] text-white/42">
                  {modeCopy.eyebrow}
                </p>
                <h1 className="mt-2 text-[length:var(--ui-page-header-title-size)] font-bold leading-tight tracking-tight text-white">
                  {modeCopy.title}
                </h1>
                <p className="mt-3 max-w-md text-[length:var(--ui-page-header-description-size)] leading-[var(--ui-page-header-description-leading)] text-white/56">
                  {activeMode === "raw" || activeMode === "graded"
                    ? trendCopy.description
                    : modeCopy.description}
                </p>
              </div>
            </div>

            <div className="min-w-0 lg:min-h-[var(--ui-dashboard-header-panel-min-height)] [&>section]:h-full">
              {pulseChart ? (
                <PriceHistoryPanel
                  compact
                  title={pulseChart.title}
                  currency={pulseChart.currency}
                  points={pulseChart.points}
                  currentValue={pulseChart.currentValue}
                  emptyText="Not enough market history yet"
                  fixedRange="ALL"
                  hideRangeControls
                  rangeStorageKey={`movers-${activeMode}-${activeItemScope}`}
                />
              ) : (
                <section className="flex h-full min-h-[var(--ui-dashboard-header-panel-min-height)] items-center justify-center rounded-[var(--ui-page-header-radius)] border border-white/8 bg-white/[0.04] text-sm font-semibold text-white/35">
                  Not enough market history yet
                </section>
              )}
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-2 lg:col-span-2 xl:col-span-1 xl:auto-rows-fr">
              {metrics.map((metric) => (
                <HeaderStatCard key={metric.label} {...metric} />
              ))}
            </div>
          </div>
        </section>

        <section className="binder-subpanel w-full overflow-hidden rounded-[var(--ui-page-header-radius)] p-2.5 sm:p-3">
          <div className="flex min-w-0 flex-col gap-1.5 md:hidden">
            {settings.onePieceLibraryEnabled ? (
              <GameFilterSwitch
                items={gameSwitchItems}
                ariaLabel="Market library"
                className="w-full max-w-full !rounded-[1.15rem] !p-0.5 sm:w-fit [&_a]:!h-7 [&_a]:!text-[10px]"
              />
            ) : null}
            <SegmentedNavLinks
              items={marketSwitchItems}
              ariaLabel="Market category"
              className="w-full max-w-full !rounded-[1.15rem] !p-0.5 sm:w-fit [&_a]:!h-7 [&_a]:!text-[10px]"
            />
            <details className="group rounded-[1.15rem] border border-white/8 bg-black/18 p-1">
              <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-2.5 text-[11px] font-bold text-white/66 transition-colors group-open:bg-white/[0.055] group-open:text-white [&::-webkit-details-marker]:hidden">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-violet-200/70" />
                  <span className="shrink-0 uppercase tracking-[0.1em]">Filters</span>
                  <span className="min-w-0 truncate text-[10px] font-semibold normal-case tracking-normal text-white/42">
                    {activeSecondaryFilters.join(" · ")}
                  </span>
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/42 transition-transform group-open:rotate-180" />
              </summary>
              <div className="grid gap-1.5 pt-1.5">
                {(isRawScope || isGradedScope) && !isValueScope ? (
                  <CompactFilterGroup
                    label="Movement"
                    items={movementSwitchItems}
                    ariaLabel="Market movement"
                  />
                ) : null}
                <div className={isRawScope ? "grid min-w-0 grid-cols-2 gap-1.5" : ""}>
                  <CompactFilterGroup
                    label="View"
                    items={scopeSwitchItems}
                    ariaLabel="Market scope"
                  />
                  {isRawScope ? (
                    <CompactFilterGroup
                      label="Source"
                      items={sourceSwitchItems}
                      ariaLabel="Market price source"
                    />
                ) : null}
                </div>
              </div>
            </details>
          </div>

          <div className="hidden min-w-0 flex-col gap-2 md:flex">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {settings.onePieceLibraryEnabled ? (
                <GameFilterSwitch
                  items={gameSwitchItems}
                  ariaLabel="Market library"
                  className="w-full max-w-[21.5rem] sm:w-fit"
                />
              ) : null}
              <SegmentedNavLinks
                items={scopeSwitchItems}
                ariaLabel="Market scope"
                className="w-full max-w-[16rem] sm:w-fit"
              />
            </div>
            {showDesktopFilterDetails ? (
            <details className="group rounded-[1.35rem] border border-white/8 bg-black/18 p-1">
              <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 rounded-[1.1rem] px-3 text-[12px] font-bold text-white/66 transition-colors group-open:bg-white/[0.055] group-open:text-white [&::-webkit-details-marker]:hidden">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 shrink-0 text-violet-200/70" />
                  <span className="shrink-0 uppercase tracking-[0.12em]">Filters</span>
                  <span className="min-w-0 truncate text-[12px] font-semibold normal-case tracking-normal text-white/42">
                    {desktopActiveSecondaryFilters.join(" / ")}
                  </span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-white/42 transition-transform group-open:rotate-180" />
              </summary>
              <div className={`grid gap-2 pt-2 ${isRawScope ? "lg:grid-cols-2" : ""}`}>
                {(isRawScope || isGradedScope) && !isValueScope ? (
                  <CompactFilterGroup
                    label="Movement"
                    items={movementSwitchItems}
                    ariaLabel="Market movement"
                  />
                ) : null}
                {isRawScope ? (
                  <CompactFilterGroup
                    label="Source"
                    items={sourceSwitchItems}
                    ariaLabel="Market price source"
                  />
                ) : null}
              </div>
            </details>
            ) : null}
          </div>
        </section>

        {isValueScope && valueData ? (
          <CollectionValueDrivers data={valueData} activeItemScope={activeItemScope} />
        ) : isSealedScope && sealedData ? (
          <SealedMoversBrowser
            key={`${activeScope}:${activeItemScope}`}
            data={sealedData}
          />
        ) : cardData ? (
          <MoversBrowser
            key={`${activeScope}:${activeItemScope}:${activeTrend}`}
            movers={cardData.movers}
            activeScope={activeScope as MoversScope}
            activeItemScope={activeItemScope}
            initialDirection={isGradingScope ? "all" : activeTrend}
            spotlights={cardSpotlights}
            previewCards={marketPreviewCards}
            emptyTitle={
              isGradingScope
                ? "No grade targets found"
                : isGradedScope
                  ? "No graded market items found"
                  : "No market moves found"
            }
            emptyDescription={
              isGradingScope
                ? "No current graded label has positive raw-to-graded upside with a raw CardMarket price yet."
                : isGradedScope
                  ? "No current graded labels have enough data to show."
                  : "There is not enough recent movement for this filter combination yet."
            }
            eyebrow={
              isGradingScope ? "Grade Targets" : isGradedScope ? "Graded Market" : "Raw Market"
            }
            title={
              isGradingScope ? "Best cards to grade" : isGradedScope ? "Slab market" : trendCopy.title
            }
            description={
              isGradingScope
                ? "Sorted by raw-to-graded upside with the extra details available per card."
                : isGradedScope
                  ? "Every graded label is listed separately, with movement filters nearby."
                  : "Raw cards grouped around risers, drops, and market pockets with the relevant switches nearby."
            }
          />
        ) : null}
      </div>
    </div>
  );
}
