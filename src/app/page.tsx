import nextDynamic from "next/dynamic";
import Link from "next/link";
import { Suspense } from "react";
import {
  Activity,
  BarChart3,
  Box,
  CheckCircle2,
  Euro,
  Layers3,
  PackageCheck,
  Sparkles,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { HeaderStatCard, type HeaderStat } from "@/components/PageHeader";
import CollectionInstantTabs from "@/components/CollectionInstantTabs";
import { CollectionPriceVisibilityButton } from "@/components/CollectionPricePrivacy";
import GameFilterSwitch from "@/components/GameFilterSwitch";
import ProgressiveHomeOverviewInsights from "@/components/ProgressiveHomeOverviewInsights";
import ProgressiveCollectionOverviewSections, {
  CompleteCollectionSkeleton,
} from "@/components/ProgressiveCollectionOverviewSections";
import VendorBuyEstimate from "@/components/VendorBuyEstimate";
import { formatCollectionCurrency } from "@/lib/collection";
import type {
  CollectionOverviewData,
  CollectionPageTab,
} from "@/lib/collection-data";
import { getCachedCollectionOverviewData } from "@/lib/collection-overview-cache";
import { getServerUserSettings } from "@/lib/user-settings-server";
import {
  GAME_FILTER_OPTIONS,
  GAME_SEARCH_PARAM,
  getGameFilterLabel,
  getGameFilterSearchParamValue,
  ONE_PIECE_GAME,
  parseVisibleGameFilter,
  type TradingCardGameFilter,
} from "@/lib/games";
import { requirePageUser } from "@/lib/page-auth";
import { FAST_SUDDEN_DROP_MIN_AMOUNT } from "@/lib/home-sudden-drops-server";
import CollectionValueHistoryPanel from "@/components/CollectionValueHistoryPanel";
import EmptyState from "@/components/EmptyState";
import HomePageLoading from "@/components/HomePageLoading";
import { getSocialTradeOpportunities } from "@/lib/social";

const CollectionCardsView = nextDynamic(() => import("@/components/CollectionCardsView"));
const CollectionSealedView = nextDynamic(() => import("@/components/CollectionSealedView"));
const BinderOverviewGrid = nextDynamic(() => import("@/components/BinderOverviewGrid"));
const CreateBinderButton = nextDynamic(() => import("@/components/CreateBinderButton"));
const TradeOpportunitiesPanel = nextDynamic(
  () => import("@/components/TradeOpportunitiesPanel")
);
const SellingInventoryTabs = nextDynamic(
  () => import("@/components/SellingInventoryTabs")
);

export const dynamic = "force-dynamic";

function isGradedCollectionCard(item: {
  grading_company: string | null;
  grading_grade: string | null;
}) {
  return Boolean(item.grading_company && item.grading_grade);
}

function CollectionValueSummaryCard({
  currentValue,
  pnl,
  rangeLabel,
  className = "",
}: {
  currentValue: number;
  pnl: number;
  rangeLabel: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[var(--ui-header-stat-radius)] border border-white/8 bg-white/[0.045] px-2.5 py-2 sm:px-3 sm:py-2.5 ${className}`}
    >
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[length:var(--ui-header-stat-label-size)] font-semibold uppercase tracking-[0.12em] text-white/42">
            Collection Value
          </p>
          <p className="mt-1 whitespace-nowrap text-[length:var(--ui-header-stat-value-size)] font-bold leading-tight tabular-nums text-white">
            {formatCollectionCurrency(currentValue)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={`text-xs font-semibold tabular-nums sm:text-sm ${
              pnl >= 0 ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            {pnl >= 0 ? "+" : ""}
            {formatCollectionCurrency(pnl)}
          </p>
          <p className="mt-0.5 text-[length:var(--ui-header-stat-hint-size)] text-white/42">
            P&amp;L
          </p>
        </div>
      </div>
      <p className="mt-1.5 truncate text-[length:var(--ui-header-stat-hint-size)] text-white/42">
        {rangeLabel}
      </p>
    </div>
  );
}

function sumCardViewValue(items: CollectionOverviewData["cards"]): number {
  return Number(
    items.reduce((total, item) => total + (item.current_value ?? 0), 0).toFixed(2)
  );
}

function formatSignedCurrency(value: number | null | undefined): string {
  if (value == null) return "--";
  if (value === 0) return formatCollectionCurrency(0);
  return `${value > 0 ? "+" : "-"}${formatCollectionCurrency(Math.abs(value))}`;
}

function formatPlainPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return `${value.toFixed(value >= 10 || value === 0 ? 0 : 1)}%`;
}

function ratioPercent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function TopSetsProgressPanel({
  binders,
  viewAllHref,
}: {
  binders: CollectionOverviewData["binders"];
  viewAllHref: string;
}) {
  const rankedBinders = binders
    .filter(
      (binder) =>
        binder.totalCards != null && binder.totalCards > 0 && binder.ownedCards >= 0
    )
    .sort((a, b) => (b.completionPct ?? 0) - (a.completionPct ?? 0))
    .slice(0, 5);

  if (rankedBinders.length === 0) return null;

  return (
    <section className="binder-panel overflow-hidden rounded-[var(--ui-page-header-radius)] p-2.5 sm:p-3">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 className="text-base font-black tracking-tight text-white">
          Top Sets Progress
        </h2>
        <Link
          href={viewAllHref}
          prefetch={false}
          className="shrink-0 text-[12px] font-semibold text-violet-300 transition-colors hover:text-violet-200"
        >
          View all
        </Link>
      </div>

      <div className="grid gap-2">
        {rankedBinders.map((binder) => {
          const completion = binder.completionPct == null
            ? 0
            : Math.min(100, Math.max(0, binder.completionPct));
          const total = binder.totalCards ?? 0;
          const accent = binder.accent_color ?? "var(--dc-primary)";
          const logoUrl = binder.episode?.logo_url ?? null;
          return (
            <Link
              key={binder.id}
              href={`/binders/${binder.id}`}
              prefetch={false}
              className="group flex min-w-0 items-center gap-2.5"
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.05]"
                style={{
                  borderColor: binder.accent_color
                    ? `${binder.accent_color}55`
                    : "rgb(var(--dc-primary-rgb) / 0.33)",
                }}
              >
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt={binder.name}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-[9px] font-black text-white/62">
                    {binder.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white/82 group-hover:text-white">
                {binder.name}
              </span>
              <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-white/8 sm:block">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${completion}%`,
                    background: `linear-gradient(90deg, ${accent}, var(--dc-primary-soft))`,
                  }}
                />
              </div>
              <span className="shrink-0 text-[11px] font-black tabular-nums text-white">
                {completion.toFixed(0)}%
              </span>
              <span className="hidden shrink-0 text-[11px] font-semibold tabular-nums text-white/42 min-[480px]:inline">
                {binder.ownedCards.toLocaleString("en-US")} / {total.toLocaleString("en-US")}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function HomeCollectionLinks({
  cardsHref,
  bindersHref,
  sealedHref,
  gradedHref,
  sellingHref,
}: {
  cardsHref: string;
  bindersHref: string;
  sealedHref: string;
  gradedHref: string;
  sellingHref: string;
}) {
  const links = [
    {
      href: cardsHref,
      label: "Complete Collection",
      hint: "All categories in one organized view",
      Icon: Layers3,
    },
    { href: bindersHref, label: "Binders", hint: "Open set binders and progress", Icon: BarChart3 },
    { href: sealedHref, label: "Sealed", hint: "Manage sealed products", Icon: PackageCheck },
    { href: gradedHref, label: "Graded", hint: "View slabs and graded pricing", Icon: Sparkles },
    { href: sellingHref, label: "For Sale", hint: "Cards set aside to sell", Icon: WalletCards },
  ];

  return (
    <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {links.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          prefetch={false}
          className="group rounded-[var(--ui-header-stat-radius)] border border-white/8 bg-white/[0.035] p-2.5 transition-colors hover:border-white/16 hover:bg-white/[0.065]"
        >
          <div className="flex items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-white/68">
              <item.Icon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-black leading-tight text-white">
                {item.label}
              </span>
              <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-white/42">
                {item.hint}
              </span>
            </span>
          </div>
        </Link>
      ))}
    </section>
  );
}

function FirstRunCollectionPanel({
  browseHref,
  collectionTitle,
}: {
  browseHref: string;
  collectionTitle: string;
}) {
  return (
    <div className="grid gap-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-200/68">
          Welcome to DustyCards
        </p>
        <h1 className="mt-1 text-[length:var(--ui-page-header-title-size)] font-bold tracking-tight text-white">
          {collectionTitle}
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-white/56">
          Add your first item and DustyCards will build the value, progress, and market views automatically.
        </p>
      </div>

      <section className="binder-panel overflow-hidden rounded-[var(--ui-page-header-radius)] p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <Link
            href="/search"
            prefetch={false}
            className="group rounded-2xl border border-white/8 bg-white/[0.035] p-4 transition hover:border-violet-300/25 hover:bg-violet-500/[0.08]"
          >
            <Sparkles className="h-5 w-5 text-violet-200" />
            <p className="mt-3 font-semibold text-white">Find a card</p>
            <p className="mt-1 text-sm leading-5 text-white/48">Search by card, set, or product and save it directly.</p>
          </Link>
          <Link
            href={browseHref}
            prefetch={false}
            className="group rounded-2xl border border-white/8 bg-white/[0.035] p-4 transition hover:border-sky-300/25 hover:bg-sky-500/[0.07]"
          >
            <Layers3 className="h-5 w-5 text-sky-200" />
            <p className="mt-3 font-semibold text-white">Browse sets</p>
            <p className="mt-1 text-sm leading-5 text-white/48">Explore cards and sealed products by expansion.</p>
          </Link>
          <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
            <PackageCheck className="h-5 w-5 text-emerald-200" />
            <p className="mt-3 font-semibold text-white">Start a binder</p>
            <p className="mt-1 text-sm leading-5 text-white/48">Track a set goal or build a custom collection.</p>
            <CreateBinderButton className="mt-3 min-h-11 w-full justify-center rounded-xl" />
          </div>
        </div>
      </section>
    </div>
  );
}

async function HomePageContent({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; graded?: string; game?: string }>;
}) {
  const user = await requirePageUser("/");
  const [settings, params] = await Promise.all([
    getServerUserSettings(user.id),
    searchParams,
  ]);
  const { tab, graded, game: gameParam } = params;
  const activeGame = parseVisibleGameFilter(gameParam, {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
  const browseHref = activeGame === ONE_PIECE_GAME ? "/one-piece/expansions" : "/expansions";
  const normalizedTab = tab === "cards" ? "complete" : tab;
  const activeTab: CollectionPageTab =
    normalizedTab === "complete" ||
    normalizedTab === "singles" ||
    normalizedTab === "binders" ||
    normalizedTab === "sealed" ||
    normalizedTab === "graded" ||
    normalizedTab === "selling"
      ? normalizedTab
      : graded === "1"
        ? "graded"
        : "overview";
  const [data, tradeOpportunities] = await Promise.all([
    getCachedCollectionOverviewData({
      userId: user.id,
      activeTab,
      game: activeGame,
      deferDetailedRows: activeTab === "complete" || activeTab === "overview",
    }),
    activeTab === "selling"
      ? getSocialTradeOpportunities(user.id, activeGame)
      : Promise.resolve([]),
  ]);
  const totalTrackedItems = data.overview.totalCards + data.overview.totalSealedUnits;
  const collectionRoi =
    data.overview.investment > 0 ? (data.overview.pnl / data.overview.investment) * 100 : null;
  const averageTrackedValue =
    totalTrackedItems > 0 ? data.overview.currentValue / totalTrackedItems : null;

  const linkedBindersForCompletion = data.binders.filter(
    (binder) => binder.totalCards != null && binder.totalCards > 0
  );
  const linkedOwnedTotal = linkedBindersForCompletion.reduce(
    (total, binder) => total + binder.ownedCards,
    0
  );
  const linkedSetTotal = linkedBindersForCompletion.reduce(
    (total, binder) => total + (binder.totalCards ?? 0),
    0
  );
  const setCompletion = ratioPercent(linkedOwnedTotal, linkedSetTotal);

  const summaryCards = [
    {
      label: "ROI",
      value:
        collectionRoi == null
          ? "--"
          : `${collectionRoi > 0 ? "+" : ""}${collectionRoi.toFixed(1)}%`,
      hint: "Return on overall spend",
      Icon: TrendingUp,
      tone: data.overview.pnl >= 0 ? "emerald" : "rose",
    },
    {
      label: "Overall Spend",
      value: formatCollectionCurrency(data.overview.investment),
      hint: data.overview.investment > 0 ? "Across saved items" : "No cost basis yet",
      Icon: WalletCards,
      tone: "amber",
    },
    {
      label: "Total Profit",
      value: formatSignedCurrency(data.overview.pnl),
      hint: "Current value minus overall spend",
      Icon: Euro,
      tone: data.overview.pnl >= 0 ? "sky" : "rose",
    },
    {
      label: "Avg Item Value",
      value: averageTrackedValue == null ? "--" : formatCollectionCurrency(averageTrackedValue),
      hint: "Cards & sealed",
      Icon: Activity,
      tone: "slate",
    },
    {
      label: "Collection Completion",
      value: formatPlainPercent(setCompletion),
      hint:
        linkedSetTotal > 0
          ? `${linkedOwnedTotal.toLocaleString("en-US")} / ${linkedSetTotal.toLocaleString("en-US")}`
          : "No linked sets",
      Icon: CheckCircle2,
      tone: "violet",
    },
    {
      label: "Total Items",
      value: totalTrackedItems.toLocaleString("en-US"),
      hint: "Cards & sealed",
      Icon: Box,
      tone: "slate",
    },
  ] satisfies HeaderStat[];

  const hasCollection =
    data.overview.totalCards > 0 ||
    data.overview.totalSealedUnits > 0 ||
    data.overview.totalBinders > 0;
  const gradedCards = data.cards.filter(isGradedCollectionCard);
  const rawLooseSingles = data.looseSingles.filter((item) => !isGradedCollectionCard(item));
  const forSaleValue = sumCardViewValue(data.forSaleCards);
  const forSaleInvestment = Number(
    data.forSaleCards.reduce((total, item) => total + (item.purchase_price ?? 0), 0).toFixed(2)
  );
  const forSalePricedCards = data.forSaleCards.filter((item) => item.current_value != null).length;
  const soldTotal = data.saleSummary.soldTotal;
  const soldCount = data.saleSummary.soldCards;
  const soldFees = data.saleSummary.soldFees;
  const soldNet = data.saleSummary.soldNet;
  const soldPnl = data.saleSummary.soldNetPnl;
  const soldPriceCounts = new Map<number, number>();
  for (const item of data.soldCards) {
    if (item.sale_price == null) continue;
    const cents = Math.round(item.sale_price * 100);
    soldPriceCounts.set(cents, (soldPriceCounts.get(cents) ?? 0) + 1);
  }
  const repeatedSoldPriceEntry = [...soldPriceCounts.entries()].sort(
    (left, right) => right[1] - left[1]
  )[0];
  const repeatedSoldPrice =
    repeatedSoldPriceEntry &&
    repeatedSoldPriceEntry[1] >= 8 &&
    repeatedSoldPriceEntry[1] / Math.max(1, data.soldCards.length) >= 0.6
      ? {
          amount: formatCollectionCurrency(repeatedSoldPriceEntry[0] / 100),
          count: repeatedSoldPriceEntry[1],
        }
      : null;

  function buildCollectionHref(tabValue: CollectionPageTab) {
    const params = new URLSearchParams();
    const gameValue = getGameFilterSearchParamValue(activeGame);
    if (gameValue) {
      params.set(GAME_SEARCH_PARAM, gameValue);
    }
    if (tabValue !== "overview") {
      params.set("tab", tabValue);
    }
    const query = params.toString();
    return query ? `/?${query}` : "/";
  }

  function buildGameHref(game: TradingCardGameFilter) {
    const params = new URLSearchParams();
    const gameValue = getGameFilterSearchParamValue(game);
    if (gameValue) {
      params.set(GAME_SEARCH_PARAM, gameValue);
    }
    if (activeTab !== "overview") {
      params.set("tab", activeTab);
    }
    const query = params.toString();
    return query ? `/?${query}` : "/";
  }

  function buildValueDriversHref() {
    const params = new URLSearchParams();
    const gameValue = getGameFilterSearchParamValue(activeGame);

    params.set("scope", "value");
    if (gameValue) {
      params.set(GAME_SEARCH_PARAM, gameValue);
    }

    return `/movers?${params.toString()}`;
  }

  function buildSuddenDropsHref() {
    const params = new URLSearchParams();
    const gameValue = getGameFilterSearchParamValue(activeGame);

    params.set("scope", "all");
    params.set("minDrop", String(FAST_SUDDEN_DROP_MIN_AMOUNT));
    if (gameValue) {
      params.set(GAME_SEARCH_PARAM, gameValue);
    }

    return `/movers/sudden-drops?${params.toString()}`;
  }

  function buildSuddenDropsApiHref() {
    const params = new URLSearchParams();
    const gameValue = getGameFilterSearchParamValue(activeGame);

    if (gameValue) {
      params.set(GAME_SEARCH_PARAM, gameValue);
    }

    const query = params.toString();
    return query ? `/api/movers/sudden-drops?${query}` : "/api/movers/sudden-drops";
  }

  function buildHomeInsightsApiHref() {
    const gameValue = getGameFilterSearchParamValue(activeGame);
    return gameValue
      ? `/api/collection/home-insights?${GAME_SEARCH_PARAM}=${encodeURIComponent(gameValue)}`
      : "/api/collection/home-insights";
  }

  function buildCollectionValueHistoryApiHref() {
    const gameValue = getGameFilterSearchParamValue(activeGame);
    return gameValue
      ? `/api/collection/value-history?${GAME_SEARCH_PARAM}=${encodeURIComponent(gameValue)}`
      : "/api/collection/value-history";
  }

  const gameSwitchItems = GAME_FILTER_OPTIONS.map((game) => ({
    href: buildGameHref(game),
    active: activeGame === game,
    label: getGameFilterLabel(game),
  }));
  const valueRangePoints = data.overview.chart.filter((point) => point.value != null);
  const collectionValueRange =
    valueRangePoints.length > 1
      ? `${valueRangePoints[0].label} - ${valueRangePoints[valueRangePoints.length - 1].label}`
      : valueRangePoints[0]?.label ?? "No history yet";
  const showCollectionChart = valueRangePoints.length > 1;
  const latestCollectionChartValue =
    valueRangePoints[valueRangePoints.length - 1]?.value ?? null;
  const collectionTitle =
    activeGame === ONE_PIECE_GAME ? "One Piece Collection" : "My Collection";
  const collectionTabs = [
    {
      key: "complete" as const,
      href: buildCollectionHref("complete"),
      active: activeTab === "complete",
      label: "All",
      title: "Complete Collection",
      summary: `${data.overview.totalCards.toLocaleString("en-US")} cards / ${data.overview.totalBinders.toLocaleString(
        "en-US"
      )} binders / ${data.overview.totalSealedUnits.toLocaleString("en-US")} sealed`,
    },
    {
      key: "singles" as const,
      href: buildCollectionHref("singles"),
      active: activeTab === "singles",
      label: "Loose",
      title: "Loose Singles",
      summary: `${rawLooseSingles.length.toLocaleString("en-US")} loose singles`,
    },
    {
      key: "binders" as const,
      href: buildCollectionHref("binders"),
      active: activeTab === "binders",
      label: "Binders",
      title: "Binders",
      summary: `${data.overview.totalBinders.toLocaleString("en-US")} binders`,
    },
    {
      key: "sealed" as const,
      href: buildCollectionHref("sealed"),
      active: activeTab === "sealed",
      label: "Sealed",
      title: "Sealed Collection",
      summary: `${data.overview.totalSealedUnits.toLocaleString("en-US")} sealed units`,
    },
    {
      key: "graded" as const,
      href: buildCollectionHref("graded"),
      active: activeTab === "graded",
      label: "Graded",
      title: "Graded Collection",
      summary: `${gradedCards.length.toLocaleString("en-US")} graded cards`,
    },
    {
      key: "selling" as const,
      href: buildCollectionHref("selling"),
      active: activeTab === "selling",
      label: "Sell",
      title: "For Sale",
      summary: `${formatCollectionCurrency(forSaleValue)} / ${data.forSaleCards.length.toLocaleString(
        "en-US"
      )} cards`,
    },
  ];
  // Keep only the visible tab in the RSC payload. Other tabs navigate normally
  // and stream their own data instead of being serialized and hydrated up front.
  const instantTabs: CollectionPageTab[] = [activeTab];

  return (
    <CollectionInstantTabs
      key={activeTab}
      initialTab={activeTab}
      tabs={collectionTabs}
      instantTabs={instantTabs}
      gameControls={
        settings.onePieceLibraryEnabled ? (
          <GameFilterSwitch
            items={gameSwitchItems}
            ariaLabel="Collection library"
            className="w-full max-w-full sm:w-fit"
          />
        ) : null
      }
      overviewSlot={
        activeTab === "overview" ? hasCollection ? (
        <div className="space-y-2.5 sm:space-y-3">
          <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="min-w-0 text-[length:var(--ui-page-header-title-size)] font-bold leading-tight tracking-tight text-white">
                {collectionTitle}
              </h1>
              <p className="mt-1 max-w-md text-[length:var(--ui-page-header-description-size)] leading-[var(--ui-page-header-description-leading)] text-white/52">
                {data.overview.totalCards.toLocaleString("en-US")} cards
                {data.overview.totalBinders > 0
                  ? ` • ${data.overview.totalBinders.toLocaleString("en-US")} binders`
                  : ""}
                {data.overview.totalSealedUnits > 0
                  ? ` • ${data.overview.totalSealedUnits.toLocaleString("en-US")} sealed`
                  : ""}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
              {settings.onePieceLibraryEnabled ? (
                <GameFilterSwitch
                  items={gameSwitchItems}
                  ariaLabel="Collection library"
                  className="max-w-[21rem]"
                />
              ) : null}
              <CollectionPriceVisibilityButton compact />
            </div>
          </div>

          <section className="grid min-w-0 gap-2.5 sm:gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-stretch">
            <div data-collection-summary-financial className="binder-panel relative flex w-full min-w-0 flex-col overflow-hidden rounded-[var(--ui-page-header-radius)] p-2.5 sm:p-3 lg:p-4">
              <div className="min-w-0 flex-1 [&>section]:h-full [&>section]:w-full">
                {showCollectionChart ? (
                  <CollectionValueHistoryPanel
                    initialPoints={data.overview.chart}
                    currentValue={data.overview.currentValue}
                    deltaValue={latestCollectionChartValue}
                    subtitle={`P&L ${data.overview.pnl >= 0 ? "+" : ""}${formatCollectionCurrency(
                      data.overview.pnl
                    )}`}
                    endpoint={buildCollectionValueHistoryApiHref()}
                  />
                ) : (
                  <CollectionValueSummaryCard
                    currentValue={data.overview.currentValue}
                    pnl={data.overview.pnl}
                    rangeLabel={collectionValueRange}
                    className="flex w-full flex-col justify-center px-3 py-3 sm:px-4"
                  />
                )}
              </div>
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-1.5 sm:gap-2 xl:grid-rows-3">
              {summaryCards.map((stat) => (
                <div
                  key={stat.label}
                  className="contents"
                  data-collection-summary-financial={
                    stat.label === "Overall Spend" || stat.label === "Total Profit"
                      ? "true"
                      : undefined
                  }
                >
                  <HeaderStatCard {...stat} />
                </div>
              ))}
            </div>
          </section>

          {hasCollection && (
            <ProgressiveHomeOverviewInsights
              endpoint={buildHomeInsightsApiHref()}
              cacheScope={user.id}
              valueDriversHref={buildValueDriversHref()}
              suddenDropsApiHref={buildSuddenDropsApiHref()}
              suddenDropsHref={buildSuddenDropsHref()}
              collectionHref={buildCollectionHref("complete")}
              topSetsSlot={
                <TopSetsProgressPanel
                  binders={data.binders}
                  viewAllHref={buildCollectionHref("binders")}
                />
              }
            />
          )}

          <HomeCollectionLinks
            cardsHref={buildCollectionHref("complete")}
            bindersHref={buildCollectionHref("binders")}
            sealedHref={buildCollectionHref("sealed")}
            gradedHref={buildCollectionHref("graded")}
            sellingHref={buildCollectionHref("selling")}
          />
        </div>
        ) : (
          <FirstRunCollectionPanel browseHref={browseHref} collectionTitle={collectionTitle} />
        ) : null
      }
      emptySlot={null}
      completeSlot={
        activeTab === "complete" ? (
        <Suspense key={activeGame} fallback={<CompleteCollectionSkeleton />}>
          <ProgressiveCollectionOverviewSections
            userId={user.id}
            game={activeGame}
            binderWatchMinPrice={settings.binderWatchMinPrice}
          />
        </Suspense>
        ) : null
      }
      singlesSlot={
        activeTab === "singles" ? (
        <CollectionCardsView
          items={rawLooseSingles}
          allowCollectionRemoval
          allowSaleListing
          showGradedSlabPreview
          emptyTitle="No loose singles in your collection"
          emptyText="Cards saved without a binder appear here."
          showFilters
        />
        ) : null
      }
      gradedSlot={
        activeTab === "graded" ? (
        <CollectionCardsView
          items={gradedCards}
          allowCollectionRemoval
          allowSaleListing
          showGradedSlabPreview
          emptyTitle="No graded cards in your collection"
          emptyText="Cards with a grading company and grade will appear here."
          showFilters
        />
        ) : null
      }
      bindersSlot={
        activeTab === "binders" ? (
        <div className="space-y-4">
          {data.binders.length === 0 ? (
            <div className="binder-panel rounded-2xl px-5 py-7 text-center sm:rounded-3xl sm:px-8 sm:py-9">
              <p className="mb-1 font-medium text-white/76">No binders yet</p>
              <p className="mx-auto max-w-xl text-sm leading-6 text-white/42">
                Type a set name for an automatic set binder, or create a custom binder.
              </p>
            </div>
          ) : (
            <BinderOverviewGrid binders={data.binders} />
          )}
        </div>
        ) : null
      }
      sealedSlot={
        activeTab === "sealed" ? (
        <CollectionSealedView
          items={data.sealed}
          emptyTitle="No sealed in your collection"
          emptyText="Use the + button on any sealed product to add it here."
        />
        ) : null
      }
      sellingSlot={
        activeTab === "selling" ? (
        data.forSaleCards.length === 0 && data.soldCards.length === 0 ? (
          <div className="space-y-3">
            <TradeOpportunitiesPanel opportunities={tradeOpportunities} game={activeGame} />
            <EmptyState
              title="Nothing marked for sale yet"
              description="Open a saved card, choose Edit, and enable For Sale. It will appear here with its estimated value and sale tracking."
              actionHref="/search"
              actionLabel="Find cards"
            />
          </div>
        ) : (
        <div className="space-y-3">
          <TradeOpportunitiesPanel opportunities={tradeOpportunities} game={activeGame} />
          <section className="binder-subpanel grid gap-2.5 rounded-[var(--ui-page-header-radius)] p-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">
                Estimated Sale Value
              </p>
              <p className="mt-1 text-xl font-black tabular-nums text-white">
                {formatCollectionCurrency(forSaleValue)}
              </p>
              <VendorBuyEstimate estimatedValue={forSaleValue} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">
                Active Cards
              </p>
              <p className="mt-1 text-xl font-black tabular-nums text-white">
                {data.forSaleCards.length.toLocaleString("en-US")}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">
                Priced / Paid
              </p>
              <p className="mt-1 text-xl font-black tabular-nums text-white">
                {forSalePricedCards.toLocaleString("en-US")} / {formatCollectionCurrency(forSaleInvestment)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">
                Net Sold
              </p>
              <p className="mt-1 text-xl font-black tabular-nums text-white">
                {formatCollectionCurrency(soldNet)}
              </p>
              <p className="mt-0.5 truncate text-[11px] font-semibold tabular-nums text-white/42">
                {soldCount.toLocaleString("en-US")} sold · gross {formatCollectionCurrency(soldTotal)} · fees {formatCollectionCurrency(soldFees)} · P&amp;L{" "}
                <span className={soldPnl >= 0 ? "text-emerald-300" : "text-rose-300"}>
                  {formatSignedCurrency(soldPnl)}
                </span>
              </p>
            </div>
          </section>
          <SellingInventoryTabs
            activeCount={data.forSaleCards.length}
            soldCount={data.soldCards.length}
            repeatedSoldPrice={repeatedSoldPrice}
            activeContent={
              <CollectionCardsView
                items={data.forSaleCards}
                allowCollectionRemoval
                allowSoldMarking
                showGradedSlabPreview
                emptyTitle="No cards marked for sale"
                emptyText="Cards you save to For Sale will appear here."
                showFilters
                collectionRemovalLabel="For Sale"
                collectionRemovalWarning="This removes the saved For Sale entry entirely."
              />
            }
            soldContent={
              <CollectionCardsView
                items={data.soldCards}
                readOnlyCollectionItems
                salesLedger
                allowSaleRecordEditing
                showGradedSlabPreview
                showFilters
                emptyTitle="No completed sales"
                emptyText="Cards only move here after you explicitly mark them sold."
              />
            }
          />
        </div>
        )
        ) : null
      }
    />
  );
}

export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; graded?: string; game?: string }>;
}) {
  return (
    <Suspense fallback={<HomePageLoading />}>
      <HomePageContent searchParams={searchParams} />
    </Suspense>
  );
}
