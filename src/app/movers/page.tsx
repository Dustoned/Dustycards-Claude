import { ArrowDownRight, Clock3, Gem, Sparkles, TrendingUp } from "lucide-react";
import CollectionValueDrivers from "@/components/CollectionValueDrivers";
import GameFilterSwitch, { SegmentedNavLinks } from "@/components/GameFilterSwitch";
import { HeaderStatCard, type HeaderStat } from "@/components/PageHeader";
import PriceHistoryPanel, { type PriceHistoryValuePoint } from "@/components/PriceHistoryPanel";
import MoversBrowser from "@/app/movers/MoversBrowser";
import SealedMoversBrowser from "@/app/movers/SealedMoversBrowser";
import { loadMoversPageData } from "@/app/movers/page-data";
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

interface PulseChartData {
  title: string;
  currency: "EUR" | "USD";
  points: PriceHistoryValuePoint[];
  currentValue: number | null;
  subtitle: string;
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
      title: "Movers",
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
      eyebrow: activeItemScope === "collection" ? "Sealed Movers / Collection" : "Sealed Movers / All Products",
      title: "Movers",
      description:
        "Track sealed Pokemon products by recent CardMarket movement, lifetime highs and lows, across owned and all-product views.",
      ranking: "Sealed products",
    };
  }

  if (activeScope === "graded") {
    return {
      eyebrow: activeItemScope === "collection" ? "Graded Market / Collection" : "Graded Market / All Cards",
      title: "Movers",
      description:
        "Track every current slab label as its own market item, with recent movement and lifetime context tucked into details.",
      ranking: "Graded prices",
    };
  }

  if (activeScope === "grading") {
    return {
      eyebrow: activeItemScope === "collection" ? "Grade Targets / Collection" : "Grade Targets / All Cards",
      title: "Movers",
      description:
        "Find cards where the raw CardMarket price is low compared with the current graded value.",
      ranking: "Raw vs graded upside",
    };
  }

  return {
    eyebrow: activeScope === "all" ? "Raw Movers / All Cards" : "Raw Movers / Collection",
    title: "Movers",
    description:
      activeScope === "all"
        ? "Scan all tracked raw cards for the clearest recent price movement."
        : "Scan your collection for raw cards with the clearest recent price movement.",
    ranking: activeScope === "all" ? "All raw cards" : "Collection raw cards",
  };
}

function formatSignedCurrency(value: number | null | undefined): string {
  if (value == null) return "--";

  return `${value > 0 ? "+" : ""}${formatCollectionCurrency(value)}`;
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
        ? `${selected.length.toLocaleString("en-US")} top movers / ${fallbackTitle}`
        : fallbackTitle,
  };
}

export default async function MoversPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; scope?: string; view?: string; game?: string }>;
}) {
  const { source, scope, view, game: gameParam } = await searchParams;
  const requestedParams = new URLSearchParams();
  if (source) requestedParams.set("source", source);
  if (scope) requestedParams.set("scope", scope);
  if (view) requestedParams.set("view", view);
  if (gameParam) requestedParams.set(GAME_SEARCH_PARAM, gameParam);
  const requestedQuery = requestedParams.toString();
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
  }: {
    mode?: MoversMode;
    itemScope?: "collection" | "all";
    priceSource?: PriceSource;
    game?: TradingCardGameFilter;
  }) {
    const params = new URLSearchParams();
    const nextSource = priceSource ?? activePriceSource;
    const shouldCarrySource = mode !== "value" && (priceSource != null || hasExplicitSource);
    const gameValue = getGameFilterSearchParamValue(game);

    if (gameValue) {
      params.set(GAME_SEARCH_PARAM, gameValue);
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
    { href: buildMoversHref({ mode: "value" }), active: activeMode === "value", label: "Value" },
    { href: buildMoversHref({ mode: "raw" }), active: activeMode === "raw", label: "Raw" },
    { href: buildMoversHref({ mode: "graded" }), active: activeMode === "graded", label: "Graded" },
    { href: buildMoversHref({ mode: "targets" }), active: activeMode === "targets", label: "Targets" },
    { href: buildMoversHref({ mode: "sealed" }), active: activeMode === "sealed", label: "Sealed" },
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
      label: activeMode === "sealed" ? "All Products" : "All Cards",
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
  const modeCopy = getModeCopy(activeScope, activeItemScope);
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
          label: "Movers",
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
          label: isGradingScope ? "Targets" : isGradedScope ? "Labels Shown" : "Movers",
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
  return (
    <div
      className="page-container mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8"
    >
      <div className="flex w-full flex-col gap-5 sm:gap-6">
        <section className="relative overflow-hidden rounded-[var(--ui-page-header-radius)] border border-black/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.76),rgba(255,255,255,0.52))] p-3 shadow-lg shadow-black/5 dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.032))] dark:shadow-black/20 sm:p-4 lg:p-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/18" />
          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(17rem,0.66fr)_minmax(0,1.05fr)] xl:grid-cols-[minmax(18rem,0.62fr)_minmax(0,1fr)_minmax(21rem,0.7fr)] xl:items-stretch">
            <div className="flex min-h-[var(--ui-dashboard-header-panel-min-height)] min-w-0 flex-col justify-between rounded-[var(--ui-page-header-radius)] border border-black/8 bg-black/[0.018] p-[var(--ui-page-header-padding)] dark:border-white/8 dark:bg-black/10">
              <div className="min-w-0">
                <p className="min-w-0 text-[length:var(--ui-page-header-eyebrow-size)] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-white/42">
                  {modeCopy.eyebrow}
                </p>
                <h1 className="mt-2 text-[length:var(--ui-page-header-title-size)] font-bold leading-tight tracking-tight text-gray-950 dark:text-white">
                  {modeCopy.title}
                </h1>
                <p className="mt-3 max-w-md text-[length:var(--ui-page-header-description-size)] leading-[var(--ui-page-header-description-leading)] text-gray-500 dark:text-white/56">
                  {modeCopy.description}
                </p>
              </div>
              {settings.onePieceLibraryEnabled ? (
                <div className="mt-[var(--ui-page-header-action-margin)]">
                  <GameFilterSwitch
                    items={gameSwitchItems}
                    ariaLabel="Movers library"
                    className="max-w-[21rem]"
                  />
                </div>
              ) : null}
            </div>

            <div className="min-w-0 lg:min-h-[var(--ui-dashboard-header-panel-min-height)] [&>section]:h-full">
              {pulseChart ? (
                <PriceHistoryPanel
                  compact
                  title={pulseChart.title}
                  currency={pulseChart.currency}
                  points={pulseChart.points}
                  currentValue={pulseChart.currentValue}
                  emptyText="Not enough mover history yet"
                  fixedRange="ALL"
                  hideRangeControls
                  rangeStorageKey={`movers-${activeMode}-${activeItemScope}`}
                />
              ) : (
                <section className="flex h-full min-h-[var(--ui-dashboard-header-panel-min-height)] items-center justify-center rounded-[var(--ui-page-header-radius)] border border-black/8 bg-black/[0.03] text-sm font-semibold text-gray-400 dark:border-white/8 dark:bg-white/[0.04] dark:text-white/35">
                  Not enough mover history yet
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

        <section className="w-full overflow-hidden rounded-[var(--ui-page-header-radius)] border border-black/8 bg-black/[0.02] p-3 shadow-sm shadow-black/5 dark:border-white/8 dark:bg-white/[0.03]">
          <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <SegmentedNavLinks
              items={marketSwitchItems}
              ariaLabel="Movers market"
              className="w-fit max-w-full"
            />
            <div className="flex min-w-0 flex-wrap gap-2 xl:justify-end">
              <SegmentedNavLinks
                items={scopeSwitchItems}
                ariaLabel="Movers scope"
                className="w-fit max-w-full"
              />
              {isRawScope ? (
                <SegmentedNavLinks
                  items={sourceSwitchItems}
                  ariaLabel="Movers price source"
                  className="w-fit max-w-full"
                />
              ) : null}
            </div>
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
            key={`${activeScope}:${activeItemScope}`}
            movers={cardData.movers}
            activeScope={activeScope as MoversScope}
            activeItemScope={activeItemScope}
            emptyTitle={
              isGradingScope
                ? "No grade targets found"
                : isGradedScope
                  ? "No graded market items found"
                  : "No movers found"
            }
            emptyDescription={
              isGradingScope
                ? "No current graded label has positive raw-to-graded upside with a raw CardMarket price yet."
                : isGradedScope
                  ? "No current graded labels have enough data to show."
                  : "There is not enough recent movement for this filter combination yet."
            }
            eyebrow={
              isGradingScope ? "Grade Targets" : isGradedScope ? "Graded Market" : "Raw Movers"
            }
            title={
              isGradingScope ? "Best cards to grade" : isGradedScope ? "Slab market" : "Market list"
            }
            description={
              isGradingScope
                ? "Sorted by raw-to-graded upside with the extra details available per card."
                : isGradedScope
                  ? "Every graded label is listed separately, with its own movement and price history."
                  : "Raw cards ranked by recent and lifetime movement, with owned/all and source controls nearby."
            }
          />
        ) : null}
      </div>
    </div>
  );
}
