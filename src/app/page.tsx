import nextDynamic from "next/dynamic";
import { cookies } from "next/headers";
import Link from "next/link";
import { BookOpen, Boxes, Coins, Sparkles } from "lucide-react";
import { HeaderStatCard, type HeaderStat } from "@/components/PageHeader";
import GameFilterSwitch, { SegmentedNavLinks } from "@/components/GameFilterSwitch";
import { formatCollectionCurrency } from "@/lib/collection";
import {
  getCollectionOverviewData,
  type CollectionOverviewData,
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
import PriceHistoryPanel from "@/components/PriceHistoryPanel";

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

function sumCardViewValue(items: CollectionOverviewData["cards"]): number {
  return Number(
    items.reduce((total, item) => total + (item.current_value ?? 0), 0).toFixed(2)
  );
}

function sumSealedViewValue(items: CollectionOverviewData["sealed"]): number {
  return Number(
    items
      .reduce((total, item) => total + (item.current_value_per_item ?? 0) * item.quantity, 0)
      .toFixed(2)
  );
}

function PortfolioBreakdownItem({
  label,
  count,
  value,
  share,
  dotClassName,
  surfaceClassName,
}: {
  label: string;
  count: string;
  value: string;
  share: number;
  dotClassName: string;
  surfaceClassName: string;
}) {
  return (
    <div
      className={`min-w-0 rounded-xl border px-2.5 py-2 shadow-sm shadow-black/5 dark:shadow-none sm:px-2.5 sm:py-2 ${surfaceClassName}`}
    >
      <div className="flex min-w-0 flex-row items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full sm:h-2 sm:w-2 ${dotClassName}`} />
          <div className="min-w-0">
            <p className="break-words text-xs font-bold leading-tight text-gray-950 dark:text-white sm:text-xs">
              {label}
            </p>
            <p className="mt-0.5 break-words text-[10px] font-semibold leading-tight text-gray-500 dark:text-white/42">
              {count}
            </p>
          </div>
        </div>
        <div className="min-w-0 shrink-0 text-right">
          <p className="whitespace-nowrap text-sm font-black leading-tight tabular-nums text-gray-950 dark:text-white sm:max-w-[7rem] sm:truncate sm:text-xs">
            {value}
          </p>
          <p className="mt-0.5 text-[10px] font-bold tabular-nums text-gray-500 dark:text-white/42">
            {share.toFixed(0)}%
          </p>
        </div>
      </div>
    </div>
  );
}

function PortfolioBreakdownPanel({
  rawLooseSingles,
  gradedLooseSingles,
  binderCards,
  sealed,
}: {
  rawLooseSingles: CollectionOverviewData["looseSingles"];
  gradedLooseSingles: CollectionOverviewData["looseSingles"];
  binderCards: CollectionOverviewData["binderCards"];
  sealed: CollectionOverviewData["sealed"];
}) {
  const sealedUnits = sealed.reduce((total, item) => total + item.quantity, 0);
  const rawBinderCards = binderCards.filter((item) => !isGradedCollectionCard(item));
  const gradedBinderCards = binderCards.filter(isGradedCollectionCard);
  const rawCards = [...rawLooseSingles, ...rawBinderCards];
  const gradedCards = [...gradedLooseSingles, ...gradedBinderCards];
  const segments = [
    {
      label: "Raw",
      count: `${rawCards.length.toLocaleString("en-US")} cards`,
      itemCount: rawCards.length,
      value: sumCardViewValue(rawCards),
      dotClassName: "bg-sky-400",
      fillClassName: "bg-sky-400",
      surfaceClassName:
        "border-sky-400/14 bg-sky-400/[0.065] dark:border-sky-300/14 dark:bg-sky-300/[0.055]",
    },
    {
      label: "Graded",
      count: `${gradedCards.length.toLocaleString("en-US")} cards`,
      itemCount: gradedCards.length,
      value: sumCardViewValue(gradedCards),
      dotClassName: "bg-violet-400",
      fillClassName: "bg-violet-400",
      surfaceClassName:
        "border-violet-400/14 bg-violet-400/[0.065] dark:border-violet-300/14 dark:bg-violet-300/[0.055]",
    },
    {
      label: "Sealed",
      count: `${sealedUnits.toLocaleString("en-US")} units`,
      itemCount: sealedUnits,
      value: sumSealedViewValue(sealed),
      dotClassName: "bg-rose-400",
      fillClassName: "bg-rose-400",
      surfaceClassName:
        "border-rose-400/14 bg-rose-400/[0.065] dark:border-rose-300/14 dark:bg-rose-300/[0.055]",
    },
  ].filter((segment) => segment.value > 0 || segment.itemCount > 0);
  const totalValue = segments.reduce((total, segment) => total + segment.value, 0);
  const fullSummary = segments
    .map((segment) => `${segment.label}: ${formatCollectionCurrency(segment.value)}`)
    .join(" / ");

  return (
    <section
      className="relative overflow-hidden rounded-[var(--ui-page-header-radius)] border border-black/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.76),rgba(255,255,255,0.52))] p-2.5 shadow-lg shadow-black/5 dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.032))] dark:shadow-black/20 sm:p-3"
      title={fullSummary}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/18" />
      <div className="grid min-w-0 gap-1.5 sm:gap-2 lg:grid-cols-[minmax(10rem,0.22fr)_minmax(0,1fr)_minmax(26rem,0.72fr)] lg:items-center">
        <div className="flex min-w-0 items-end justify-between gap-3 lg:block">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold leading-tight text-gray-950 dark:text-white sm:text-base">
              Breakdown
            </h2>
          </div>
          <p className="truncate text-sm font-semibold leading-tight tabular-nums text-gray-950 dark:text-white lg:mt-1.5">
            {formatCollectionCurrency(totalValue)}
          </p>
        </div>

        <div className="min-w-0 rounded-xl border border-black/8 bg-black/[0.025] p-1.5 dark:border-white/8 dark:bg-black/10 sm:p-2">
          <div className="flex h-2 overflow-hidden rounded-full bg-black/7 dark:bg-white/8 sm:h-2.5">
            {segments.map((segment) => {
              const share = totalValue > 0 ? (segment.value / totalValue) * 100 : 0;
              return (
                <div
                  key={segment.label}
                  className={segment.fillClassName}
                  style={{
                    width: `${share}%`,
                    minWidth: share > 0 ? "0.65rem" : undefined,
                  }}
                  title={`${segment.label}: ${share.toFixed(1)}%`}
                />
              );
            })}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 sm:mt-1.5 sm:gap-x-3 sm:gap-y-1">
            {segments.map((segment) => {
              const share = totalValue > 0 ? (segment.value / totalValue) * 100 : 0;
              return (
                <div key={segment.label} className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${segment.dotClassName}`} />
                  <span className="text-[10px] font-semibold text-gray-500 dark:text-white/45">
                    {segment.label} {share.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-1.5 sm:grid-cols-3">
          {segments.map((segment) => (
            <PortfolioBreakdownItem
              key={segment.label}
              label={segment.label}
              count={segment.count}
              value={formatCollectionCurrency(segment.value)}
              share={totalValue > 0 ? (segment.value / totalValue) * 100 : 0}
              dotClassName={segment.dotClassName}
              surfaceClassName={segment.surfaceClassName}
            />
          ))}
        </div>
      </div>
    </section>
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
  const showRawLooseSinglesSection = activeTab === "overview" && rawLooseSingles.length > 0;

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
  const gameSwitchItems = GAME_FILTER_OPTIONS.map((game) => ({
    href: buildGameHref(game),
    active: activeGame === game,
    label: getGameFilterLabel(game),
  }));
  const viewSwitchItems = [
    { href: buildCollectionHref("overview"), active: activeTab === "overview", label: "Overview" },
    { href: buildCollectionHref("cards"), active: activeTab === "cards", label: "Cards" },
    { href: buildCollectionHref("binders"), active: activeTab === "binders", label: "Binders" },
    { href: buildCollectionHref("sealed"), active: activeTab === "sealed", label: "Sealed" },
    { href: buildCollectionHref("graded"), active: activeTab === "graded", label: "Graded" },
  ];
  const valueRangePoints = data.overview.chart.filter((point) => point.value != null);
  const collectionValueRange =
    valueRangePoints.length > 1
      ? `${valueRangePoints[0].label} - ${valueRangePoints[valueRangePoints.length - 1].label}`
      : valueRangePoints[0]?.label ?? "No history yet";
  const showCollectionChart = valueRangePoints.length > 1;
  const collectionTitle =
    activeGame === ONE_PIECE_GAME ? "One Piece Collection" : "DustyCards Collection";
  const collectionDescription =
    activeGame === ONE_PIECE_GAME
      ? "Track your One Piece singles separately from Pokemon while using the same collection tools."
      : "Keep track of your singles, binders and sealed.";

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="flex w-full flex-col gap-5 sm:gap-7">
        <div className="space-y-3">
          <section className="relative w-full overflow-hidden rounded-[var(--ui-page-header-radius)] border border-black/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.76),rgba(255,255,255,0.52))] p-3 shadow-lg shadow-black/5 dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.032))] dark:shadow-black/20 sm:p-4 lg:p-5">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/18" />
            <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(19rem,0.82fr)_minmax(0,1.18fr)] xl:grid-cols-[minmax(20rem,0.78fr)_minmax(0,1.08fr)_minmax(20rem,0.72fr)] xl:items-stretch">
              <div className="flex min-h-[var(--ui-dashboard-header-panel-min-height)] min-w-0 flex-col justify-between rounded-[var(--ui-page-header-radius)] border border-black/8 bg-black/[0.018] p-[var(--ui-page-header-padding)] dark:border-white/8 dark:bg-black/10">
                <div className="min-w-0">
                  <p className="text-[length:var(--ui-page-header-eyebrow-size)] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-white/42">
                    DustyCards
                  </p>
                  <h1 className="mt-2 min-w-0 text-[length:var(--ui-page-header-title-size)] font-bold leading-tight tracking-tight text-gray-950 dark:text-white">
                    {collectionTitle}
                  </h1>
                  <p className="mt-3 max-w-md text-[length:var(--ui-page-header-description-size)] leading-[var(--ui-page-header-description-leading)] text-gray-500 dark:text-white/56">
                    {collectionDescription}
                  </p>
                </div>

                {settings.onePieceLibraryEnabled ? (
                  <div className="mt-[var(--ui-page-header-action-margin)]">
                    <GameFilterSwitch
                      items={gameSwitchItems}
                      ariaLabel="Collection library"
                      className="max-w-[21rem]"
                    />
                  </div>
                ) : null}
              </div>

              <div className="min-w-0 lg:min-h-[var(--ui-dashboard-header-panel-min-height)] [&>section]:h-full">
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
                    rangeStorageKey="collection-dashboard"
                  />
                ) : (
                  <CollectionValueSummaryCard
                    currentValue={data.overview.currentValue}
                    pnl={data.overview.pnl}
                    rangeLabel={collectionValueRange}
                    className="flex h-full min-h-[var(--ui-dashboard-header-panel-min-height)] flex-col justify-center px-5 py-4"
                  />
                )}
              </div>

              <div className="grid min-w-0 grid-cols-2 gap-2 lg:col-span-2 xl:col-span-1 xl:auto-rows-fr">
                {summaryCards.map((stat) => (
                  <HeaderStatCard key={stat.label} {...stat} />
                ))}
              </div>
            </div>
          </section>

          {hasCollection && activeTab === "overview" && (
            <PortfolioBreakdownPanel
              rawLooseSingles={rawLooseSingles}
              gradedLooseSingles={gradedLooseSingles}
              binderCards={data.binderCards}
              sealed={data.sealed}
            />
          )}

          <div className="flex min-w-0 justify-start sm:justify-end">
            <SegmentedNavLinks
              items={viewSwitchItems}
              ariaLabel="Collection view"
              even
              buttonNavigation
              preserveScroll
              className="w-full max-w-full sm:w-fit"
            />
          </div>
        </div>

        <div className="space-y-3">
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
                  className="grid gap-4"
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
