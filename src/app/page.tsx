import nextDynamic from "next/dynamic";
import { cookies } from "next/headers";
import Link from "next/link";
import { BookOpen, Boxes, Coins, Sparkles } from "lucide-react";
import {
  HeaderAction,
  PageHeroHeader,
  type HeaderStat,
} from "@/components/PageHeader";
import { formatCollectionCurrency } from "@/lib/collection";
import {
  getCollectionOverviewData,
  type CollectionPageTab,
} from "@/lib/collection-data";
import { getFixedTrackGridTemplate, getSupportTileTrackWidth } from "@/lib/display-scale";
import {
  OVERVIEW_SECTION_ORDER_COOKIE_NAME,
  parseOverviewSectionOrderCookie,
} from "@/lib/overview-section-order";
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

const CreateBinderButton = nextDynamic(() => import("@/components/CreateBinderButton"), {
  loading: () => null,
});
const PriceHistoryPanel = nextDynamic(() => import("@/components/PriceHistoryPanel"), {
  loading: () => (
    <section className="h-full rounded-[28px] border border-black/8 bg-black/[0.03] dark:border-white/8 dark:bg-white/[0.04]" />
  ),
});
const CollectionCardsView = nextDynamic(() => import("@/components/CollectionCardsView"));
const CollectionOverviewSections = nextDynamic(() => import("@/components/CollectionOverviewSections"));
const CollectionSealedView = nextDynamic(() => import("@/components/CollectionSealedView"));
const BinderOverviewTile = nextDynamic(() => import("@/components/BinderOverviewTile"));

export const dynamic = "force-dynamic";

function isGradedCollectionCard(item: {
  grading_company: string | null;
  grading_grade: string | null;
}) {
  return Boolean(item.grading_company && item.grading_grade);
}

function TabLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={`shrink-0 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors sm:rounded-xl sm:px-4 sm:text-sm ${
        active
          ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
          : "text-gray-500 hover:text-gray-900 dark:text-white/55 dark:hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
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
      className={`rounded-2xl border border-black/8 bg-black/[0.03] px-3 py-2.5 dark:border-white/8 dark:bg-white/[0.045] ${className}`}
    >
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-white/42">
            Collection Value
          </p>
          <p className="mt-1 truncate text-2xl font-bold leading-tight tabular-nums text-gray-950 dark:text-white sm:text-3xl">
            {formatCollectionCurrency(currentValue)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={`text-sm font-semibold tabular-nums sm:text-base ${
              pnl >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"
            }`}
          >
            {pnl >= 0 ? "+" : ""}
            {formatCollectionCurrency(pnl)}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-white/42">P&amp;L</p>
        </div>
      </div>
      <p className="mt-2 truncate text-[11px] text-gray-500 dark:text-white/42">{rangeLabel}</p>
    </div>
  );
}

const collectionHeaderStatToneClasses: Record<
  NonNullable<HeaderStat["tone"]>,
  { icon: string; surface: string }
> = {
  slate: {
    icon: "text-gray-500 dark:text-white/55",
    surface: "border-black/6 bg-white/75 dark:border-white/10 dark:bg-white/[0.055]",
  },
  emerald: {
    icon: "text-emerald-600 dark:text-emerald-300",
    surface: "border-emerald-400/14 bg-emerald-400/[0.07]",
  },
  amber: {
    icon: "text-amber-600 dark:text-amber-300",
    surface: "border-amber-400/14 bg-amber-400/[0.07]",
  },
  sky: {
    icon: "text-sky-600 dark:text-sky-300",
    surface: "border-sky-400/14 bg-sky-400/[0.07]",
  },
  rose: {
    icon: "text-rose-600 dark:text-rose-300",
    surface: "border-rose-400/14 bg-rose-400/[0.07]",
  },
  violet: {
    icon: "text-violet-600 dark:text-violet-300",
    surface: "border-violet-400/14 bg-violet-400/[0.07]",
  },
  blue: {
    icon: "text-blue-600 dark:text-blue-300",
    surface: "border-blue-400/14 bg-blue-400/[0.07]",
  },
};

function CollectionHeaderStatCard({
  label,
  value,
  hint,
  Icon,
  tone = "slate",
}: HeaderStat) {
  const toneClass = collectionHeaderStatToneClasses[tone];

  return (
    <div className="flex min-h-[8.4rem] min-w-0 flex-col justify-between rounded-2xl border border-black/8 bg-white/70 p-4 shadow-sm shadow-black/5 dark:border-white/10 dark:bg-white/[0.045] dark:shadow-none">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="min-w-0 truncate text-[0.66rem] font-semibold uppercase leading-tight tracking-[0.12em] text-gray-400 dark:text-white/42">
          {label}
        </p>
        {Icon ? (
          <span
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${toneClass.surface} ${toneClass.icon}`}
          >
            <Icon className="h-4.5 w-4.5" />
          </span>
        ) : null}
      </div>
      <div className="min-w-0">
        <p className="truncate whitespace-nowrap text-[clamp(1.45rem,1.45vw,1.75rem)] font-bold leading-tight tracking-tight text-gray-950 dark:text-white">
          {value}
        </p>
        {hint ? (
          <p className="mt-1 truncate text-xs leading-snug text-gray-500 dark:text-white/50">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; graded?: string; game?: string }>;
}) {
  const cookieStore = await cookies();
  const user = await requirePageUser("/");
  const settings = await getServerUserSettings(user.id);
  const binderTileTrackWidth = getSupportTileTrackWidth(settings.uiScale, settings.widescreen);
  const { tab, graded, game: gameParam } = await searchParams;
  const activeGame = parseVisibleGameFilter(gameParam, {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
  const browseHref = activeGame === ONE_PIECE_GAME ? "/one-piece/expansions" : "/expansions";
  const activeTab =
    tab === "cards" ||
    tab === "binders" ||
    tab === "sealed" ||
    tab === "graded"
      ? tab
      : graded === "1"
        ? "graded"
        : "overview";
  const initialOverviewSectionOrder = parseOverviewSectionOrderCookie(
    cookieStore.get(OVERVIEW_SECTION_ORDER_COOKIE_NAME)?.value
  );
  const data = await getCollectionOverviewData({
    userId: user.id,
    activeTab: activeTab as CollectionPageTab,
    game: activeGame,
  });

  const summaryCards = [
    {
      label: "Spent",
      value: formatCollectionCurrency(data.overview.investment),
      Icon: Coins,
      tone: "amber",
    },
    {
      label: "Cards",
      value: data.overview.totalCards.toLocaleString("en-US"),
      Icon: Sparkles,
      tone: "sky",
    },
    {
      label: "Sealed",
      value: data.overview.totalSealedUnits.toLocaleString("en-US"),
      Icon: Boxes,
      tone: "rose",
    },
    {
      label: "Binders",
      value: data.overview.totalBinders.toLocaleString("en-US"),
      Icon: BookOpen,
      tone: "violet",
    },
  ] satisfies HeaderStat[];

  const hasCollection =
    data.overview.totalCards > 0 ||
    data.overview.totalSealedUnits > 0 ||
    data.overview.totalBinders > 0;
  const gradedCards =
    activeTab === "cards" || activeTab === "graded" || activeTab === "overview"
      ? data.cards.filter(isGradedCollectionCard)
      : [];
  const gradedLooseSingles =
    activeTab === "overview" ? data.looseSingles.filter(isGradedCollectionCard) : [];
  const rawLooseSingles =
    activeTab === "overview"
      ? data.looseSingles.filter((item) => !isGradedCollectionCard(item))
      : [];
  const showRawLooseSinglesSection =
    activeTab === "overview" &&
    (rawLooseSingles.length > 0 || data.looseSingles.length === 0);

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
  const valueRangePoints = data.overview.chart.filter((point) => point.value != null);
  const collectionValueRange =
    activeTab !== "overview"
      ? "Live collection summary"
      : valueRangePoints.length > 1
      ? `${valueRangePoints[0].label} - ${valueRangePoints[valueRangePoints.length - 1].label}`
      : valueRangePoints[0]?.label ?? "No history yet";
  const showCollectionChart = activeTab === "overview" && valueRangePoints.length > 1;

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="flex w-full flex-col gap-5 sm:gap-7">
        <PageHeroHeader
          eyebrow="DustyCards"
          title={activeGame === ONE_PIECE_GAME ? "One Piece Collection" : "DustyCards Collection"}
          description={
            activeGame === ONE_PIECE_GAME
              ? "Track your One Piece singles separately from Pokemon while using the same collection tools."
              : "Keep track of your singles, binders and sealed with the same live market data you already use everywhere else."
          }
          className="xl:[--ui-page-header-title-size:2rem] 2xl:[--ui-page-header-title-size:2.15rem] max-[640px]:[--ui-page-header-action-margin:0.45rem] max-[640px]:[--ui-page-header-grid-gap:0.55rem] max-[640px]:[--ui-page-header-padding:0.7rem] max-[640px]:[--ui-page-header-title-size:1.35rem] max-[640px]:[--ui-header-action-gap:0.4rem] max-[640px]:[--ui-header-action-x:0.65rem] max-[640px]:[--ui-header-action-y:0.35rem] max-[640px]:[&_h1+div]:hidden"
          gridClassName="xl:grid-cols-[minmax(23rem,0.58fr)_minmax(0,1.42fr)] xl:items-stretch 2xl:grid-cols-[minmax(24rem,0.57fr)_minmax(0,1.63fr)] 2xl:items-stretch"
          sideClassName="space-y-2 xl:space-y-0"
          actions={
            <HeaderAction className="max-[640px]:gap-1.5">
              <CreateBinderButton />
            </HeaderAction>
          }
          accessory={
            <div className="grid min-w-0 gap-2 sm:gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)] xl:items-stretch 2xl:grid-cols-[minmax(0,1.32fr)_minmax(24rem,0.68fr)]">
              <div className={activeTab === "overview" ? "sm:hidden" : "hidden"}>
                {showCollectionChart ? (
                  <PriceHistoryPanel
                    compact
                    title="Collection Value"
                    currency="EUR"
                    points={data.overview.chart}
                    currentValue={data.overview.currentValue}
                    subtitle={`P&L ${data.overview.pnl >= 0 ? "+" : ""}${formatCollectionCurrency(
                      data.overview.pnl
                    )}`}
                    emptyText="Add cards or sealed to start tracking your value"
                  />
                ) : (
                  <CollectionValueSummaryCard
                    currentValue={data.overview.currentValue}
                    pnl={data.overview.pnl}
                    rangeLabel={collectionValueRange}
                  />
                )}
              </div>
              <div className="hidden min-w-0 sm:block [&>section]:h-full">
                {showCollectionChart ? (
                  <PriceHistoryPanel
                    layout="hero"
                    title="Collection Value"
                    currency="EUR"
                    points={data.overview.chart}
                    currentValue={data.overview.currentValue}
                    subtitle={`P&L ${data.overview.pnl >= 0 ? "+" : ""}${formatCollectionCurrency(
                      data.overview.pnl
                    )}`}
                    emptyText="Add cards or sealed to start tracking your value"
                  />
                ) : (
                  <CollectionValueSummaryCard
                    currentValue={data.overview.currentValue}
                    pnl={data.overview.pnl}
                    rangeLabel={collectionValueRange}
                    className="flex h-full min-h-[9rem] flex-col justify-center px-5 py-4"
                  />
                )}
              </div>
            <div
              className={`min-w-0 grid-cols-2 gap-2 sm:gap-3 xl:auto-rows-fr ${
                activeTab === "overview" ? "grid" : "hidden sm:grid"
              }`}
            >
                {summaryCards.map((stat) => (
                  <CollectionHeaderStatCard key={stat.label} {...stat} />
                ))}
              </div>
            </div>
          }
        />

        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="-mx-1 overflow-x-auto pb-1 sm:mx-0 sm:overflow-visible sm:pb-0">
              <div className="inline-flex min-w-max flex-nowrap rounded-2xl border border-black/8 bg-black/3 p-1 dark:border-white/8 dark:bg-white/5">
                <TabLink
                  href={buildCollectionHref("overview")}
                  active={activeTab === "overview"}
                  label="Overview"
                />
                <TabLink
                  href={buildCollectionHref("cards")}
                  active={activeTab === "cards"}
                  label="Cards"
                />
                <TabLink
                  href={buildCollectionHref("binders")}
                  active={activeTab === "binders"}
                  label="Binders"
                />
                <TabLink
                  href={buildCollectionHref("sealed")}
                  active={activeTab === "sealed"}
                  label="Sealed"
                />
                <TabLink
                  href={buildCollectionHref("graded")}
                  active={activeTab === "graded"}
                  label="Graded"
                />
              </div>
            </div>

            {settings.onePieceLibraryEnabled ? (
              <div className="-mx-1 overflow-x-auto pb-1 sm:mx-0 sm:overflow-visible sm:pb-0">
                <div className="inline-flex min-w-max flex-nowrap rounded-2xl border border-black/8 bg-black/3 p-1 dark:border-white/8 dark:bg-white/5">
                  <TabLink
                    href={buildGameHref(GAME_FILTER_OPTIONS[0])}
                    active={activeGame === GAME_FILTER_OPTIONS[0]}
                    label={getGameFilterLabel(GAME_FILTER_OPTIONS[0])}
                  />
                  <TabLink
                    href={buildGameHref(GAME_FILTER_OPTIONS[1])}
                    active={activeGame === GAME_FILTER_OPTIONS[1]}
                    label={getGameFilterLabel(GAME_FILTER_OPTIONS[1])}
                  />
                  <TabLink
                    href={buildGameHref(GAME_FILTER_OPTIONS[2])}
                    active={activeGame === GAME_FILTER_OPTIONS[2]}
                    label={getGameFilterLabel(GAME_FILTER_OPTIONS[2])}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {!hasCollection && activeTab === "overview" && (
            <div className="glass rounded-2xl px-5 py-7 text-center shadow-md shadow-black/5 sm:rounded-3xl sm:px-8 sm:py-9">
              <p className="mb-1 font-medium text-gray-700 dark:text-gray-300">
                Your collection is still empty
              </p>
              <p className="mx-auto max-w-xl text-sm leading-6 text-gray-400">
                Start with a card, create a binder, or add sealed from search and expansion pages.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Link
                  href={browseHref}
                  prefetch={false}
                  className="inline-flex items-center rounded-full border border-black/8 bg-white/80 px-3 py-2 text-sm font-semibold text-gray-800 transition-colors hover:border-black/15 hover:bg-white dark:border-white/10 dark:bg-white/8 dark:text-white/78 dark:hover:border-white/18 dark:hover:bg-white/12"
                >
                  Browse cards
                </Link>
              </div>
            </div>
          )}

          {activeTab === "overview" && (
            <CollectionOverviewSections
              gradedLooseSingles={gradedLooseSingles}
              rawLooseSingles={rawLooseSingles}
              showRawLooseSinglesSection={showRawLooseSinglesSection}
              binderCards={data.binderCards}
              sealed={data.sealed}
              binders={data.binders}
              initialSectionOrder={initialOverviewSectionOrder}
            />
          )}

          {activeTab === "cards" && (
          <CollectionCardsView
            items={data.cards}
            allowCollectionRemoval
            showGradedSlabPreview
            emptyTitle="No cards in your collection"
            emptyText="Use the + button on any card to add it here."
            splitByGrading={gradedCards.length > 0 && gradedCards.length < data.cards.length}
            showFilters
            forcedSortBy="cm_en"
            forcedSortDir="desc"
            hideSortControls
          />
          )}

          {activeTab === "graded" && (
            <CollectionCardsView
              items={gradedCards}
              allowCollectionRemoval
              showGradedSlabPreview
              emptyTitle="No graded cards in your collection"
              emptyText="Cards with a grading company and grade will appear here."
              showFilters
              forcedSortBy="cm_en"
              forcedSortDir="desc"
              hideSortControls
            />
          )}

          {activeTab === "binders" && (
            <div className="space-y-4">
              {data.binders.length === 0 ? (
                <div className="glass rounded-2xl px-5 py-7 text-center shadow-md shadow-black/5 sm:rounded-3xl sm:px-8 sm:py-9">
                  <p className="mb-1 font-medium text-gray-700 dark:text-gray-300">
                    No binders yet
                  </p>
                  <p className="mx-auto max-w-xl text-sm leading-6 text-gray-400">
                    Type a set name for an automatic set binder, or create a custom binder.
                  </p>
                </div>
              ) : (
                <div
                  className="grid justify-start gap-4"
                  style={{
                    gridTemplateColumns: getFixedTrackGridTemplate(binderTileTrackWidth),
                  }}
                >
                  {data.binders.map((binder) => (
                    <BinderOverviewTile key={binder.id} binder={binder} />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "sealed" && (
            <CollectionSealedView
              items={data.sealed}
              emptyTitle="No sealed in your collection"
              emptyText="Use the + button on any sealed product to add it here."
            />
          )}
        </div>
      </div>
    </div>
  );
}
