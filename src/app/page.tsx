import nextDynamic from "next/dynamic";
import { cookies } from "next/headers";
import Link from "next/link";
import { BookOpen, Boxes, Coins, Sparkles } from "lucide-react";
import {
  HeaderAction,
  HeaderStatCard,
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

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; graded?: string }>;
}) {
  const cookieStore = await cookies();
  const user = await requirePageUser("/");
  const settings = await getServerUserSettings(user.id);
  const binderTileTrackWidth = getSupportTileTrackWidth(settings.uiScale, settings.widescreen);
  const { tab, graded } = await searchParams;
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
      value: data.overview.totalCards.toLocaleString(),
      Icon: Sparkles,
      tone: "sky",
    },
    {
      label: "Sealed",
      value: data.overview.totalSealedUnits.toLocaleString(),
      Icon: Boxes,
      tone: "rose",
    },
    {
      label: "Binders",
      value: data.overview.totalBinders.toLocaleString(),
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

  function buildCollectionHref(tabValue: "overview" | "cards" | "binders" | "sealed" | "graded") {
    const params = new URLSearchParams();
    if (tabValue !== "overview") {
      params.set("tab", tabValue);
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
          title="DustyCards Collection"
          description="Keep track of your singles, binders and sealed with the same live market data you already use everywhere else."
          className="max-[640px]:[--ui-page-header-action-margin:0.45rem] max-[640px]:[--ui-page-header-grid-gap:0.55rem] max-[640px]:[--ui-page-header-padding:0.7rem] max-[640px]:[--ui-page-header-title-size:1.35rem] max-[640px]:[--ui-header-action-gap:0.4rem] max-[640px]:[--ui-header-action-x:0.65rem] max-[640px]:[--ui-header-action-y:0.35rem] max-[640px]:[&_h1+div]:hidden"
          gridClassName="xl:grid-cols-[minmax(19rem,0.6fr)_minmax(0,1.7fr)] xl:items-stretch 2xl:grid-cols-[minmax(24rem,0.58fr)_minmax(0,2.15fr)] 2xl:items-stretch"
          sideClassName="space-y-2 xl:space-y-0"
          actions={
            <HeaderAction className="max-[640px]:gap-1.5">
                <CreateBinderButton />
                <Link
                  href="/expansions"
                  prefetch={false}
                  className="inline-flex items-center gap-2 rounded-2xl border border-black/8 bg-white/80 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-black/15 hover:bg-white dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/12"
                >
                  <span className="sm:hidden">Browse</span>
                  <span className="hidden sm:inline">Browse Expansions</span>
                </Link>
            </HeaderAction>
          }
          accessory={
            <div className="grid min-w-0 gap-2 sm:gap-3 xl:grid-cols-[minmax(30rem,1.45fr)_minmax(20rem,0.8fr)] xl:items-stretch 2xl:grid-cols-[minmax(42rem,1.55fr)_minmax(28rem,0.9fr)]">
              <CollectionValueSummaryCard
                currentValue={data.overview.currentValue}
                pnl={data.overview.pnl}
                rangeLabel={collectionValueRange}
                className="sm:hidden"
              />
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
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 xl:auto-rows-fr">
                {summaryCards.map((stat) => (
                  <HeaderStatCard key={stat.label} {...stat} />
                ))}
              </div>
            </div>
          }
        />

        <div className="space-y-3">
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

          {!hasCollection && (
            <div className="glass rounded-3xl p-12 text-center shadow-md shadow-black/5">
              <p className="mb-1 font-medium text-gray-700 dark:text-gray-300">
                Your collection is still empty
              </p>
              <p className="text-sm text-gray-400">
                Start with a card, create a binder, or add sealed from search and expansion pages.
              </p>
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
                <div className="glass rounded-3xl p-12 text-center shadow-md shadow-black/5">
                  <p className="mb-1 font-medium text-gray-700 dark:text-gray-300">
                    No binders yet
                  </p>
                  <p className="text-sm text-gray-400">
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
