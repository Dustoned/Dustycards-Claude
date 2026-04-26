import nextDynamic from "next/dynamic";
import { cookies } from "next/headers";
import Link from "next/link";
import { BookOpen, Boxes, Coins, Sparkles, TrendingUp } from "lucide-react";
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
import {
  DEFAULT_SETTINGS,
  parseCookieSettings,
  SETTINGS_COOKIE_NAME,
} from "@/lib/user-settings";

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
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
          : "text-gray-500 hover:text-gray-900 dark:text-white/55 dark:hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; graded?: string }>;
}) {
  const cookieStore = await cookies();
  const settings =
    parseCookieSettings(cookieStore.get(SETTINGS_COOKIE_NAME)?.value) ?? DEFAULT_SETTINGS;
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
    activeTab: activeTab as CollectionPageTab,
  });

  const summaryCards = [
    {
      label: "Collection Value",
      value: formatCollectionCurrency(data.overview.currentValue),
      Icon: TrendingUp,
      iconClass: "text-emerald-500 dark:text-emerald-300",
    },
    {
      label: "Spent",
      value: formatCollectionCurrency(data.overview.investment),
      Icon: Coins,
      iconClass: "text-amber-500 dark:text-amber-300",
    },
    {
      label: "Cards",
      value: data.overview.totalCards.toLocaleString(),
      Icon: Sparkles,
      iconClass: "text-sky-500 dark:text-sky-300",
    },
    {
      label: "Sealed",
      value: data.overview.totalSealedUnits.toLocaleString(),
      Icon: Boxes,
      iconClass: "text-rose-500 dark:text-rose-300",
    },
    {
      label: "Binders",
      value: data.overview.totalBinders.toLocaleString(),
      Icon: BookOpen,
      iconClass: "text-violet-500 dark:text-violet-300",
    },
  ];

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

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex w-full flex-col gap-8">
        <section className="grid gap-4 xl:grid-cols-12 xl:items-stretch">
          <div className="relative overflow-hidden rounded-[28px] border border-black/8 bg-black/[0.03] px-5 py-6 shadow-lg shadow-black/5 dark:border-white/8 dark:bg-white/[0.04] sm:px-6 sm:py-7 xl:col-span-4 xl:min-h-[272px] xl:px-7 xl:py-7">
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.03),transparent_38%,rgba(255,255,255,0.02))]" />

            <div className="relative flex flex-col gap-6 xl:min-h-[212px] xl:justify-between">
              <div className="max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-400 dark:text-white/35">
                  DustyCards
                </p>
                <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
                  DustyCards Collection
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-white/50">
                  Keep track of your singles, binders and sealed with the same live market data you already use everywhere else.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <CreateBinderButton />
                <Link
                  href="/expansions"
                  className="inline-flex items-center gap-2 rounded-2xl border border-black/8 bg-white/80 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-black/15 hover:bg-white dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/12"
                >
                  Browse Expansions
                </Link>
              </div>
            </div>
          </div>

          <div className="xl:col-span-5 xl:min-h-[272px] [&>section]:h-full">
            <PriceHistoryPanel
              title="Collection Value"
              currency="EUR"
              points={data.overview.chart}
              currentValue={data.overview.currentValue}
              layout="hero"
              subtitle={`P&L ${data.overview.pnl >= 0 ? "+" : ""}${formatCollectionCurrency(
                data.overview.pnl
              )}`}
              emptyText="Add cards or sealed to start tracking your value"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:col-span-3 xl:auto-rows-fr">
            {summaryCards.map(({ label, value, Icon, iconClass }, index) => (
              <div
                key={label}
                className={`flex h-full flex-col justify-between rounded-2xl border border-black/8 bg-black/[0.03] px-4 py-4 shadow-sm shadow-black/5 dark:border-white/8 dark:bg-white/[0.03] dark:shadow-none ${
                  index === summaryCards.length - 1 ? "sm:col-span-2" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${iconClass}`} />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400 dark:text-white/35">
                    {label}
                  </span>
                </div>
                <p className="mt-3 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex max-w-full flex-wrap rounded-2xl border border-black/8 bg-black/3 p-1 dark:border-white/8 dark:bg-white/5">
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
