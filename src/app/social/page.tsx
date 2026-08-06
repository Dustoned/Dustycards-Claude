import nextDynamic from "next/dynamic";
import Link from "next/link";
import {
  Activity,
  BadgeEuro,
  Box,
  Boxes,
  CheckCircle2,
  Gauge,
  LibraryBig,
  PackageCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import BinderOverviewGrid from "@/components/BinderOverviewGrid";
import CollectionSealedView from "@/components/CollectionSealedView";
import GameFilterSwitch from "@/components/GameFilterSwitch";
import HomeFeaturedCardsPanel from "@/components/HomeFeaturedCardsPanel";
import HomeValueDriversPanel from "@/components/HomeValueDriversPanel";
import PriceHistoryPanel from "@/components/PriceHistoryPanel";
import { HeaderStatCard, type HeaderStat } from "@/components/PageHeader";
import { formatCollectionCurrency } from "@/lib/collection";
import {
  type CollectionOverviewData,
} from "@/lib/collection-data";
import { getCachedSocialCollectionOverviewData } from "@/lib/collection-overview-cache";
import { getFeaturedCollectionCards } from "@/lib/featured-cards";
import {
  GAME_FILTER_OPTIONS,
  GAME_SEARCH_PARAM,
  getGameFilterLabel,
  getGameFilterSearchParamValue,
  parseVisibleGameFilter,
  type TradingCardGameFilter,
} from "@/lib/games";
import { requirePageUser } from "@/lib/page-auth";
import { getSocialPageData } from "@/lib/social";
import { getServerUserSettings } from "@/lib/user-settings-server";
import type { CollectionCardViewItem } from "@/types/collection-view";
import SocialPageClient from "./SocialPageClient";

const CollectionCardsView = nextDynamic(() => import("@/components/CollectionCardsView"));
const CollectionOverviewSections = nextDynamic(() => import("@/components/CollectionOverviewSections"));

export const dynamic = "force-dynamic";

type SocialCollectionTab = "overview" | "complete" | "singles" | "binders" | "sealed" | "graded";

function isGradedCollectionCard(item: {
  grading_company: string | null;
  grading_grade: string | null;
}) {
  return Boolean(item.grading_company && item.grading_grade);
}

function normalizeSocialTab(value: string | null | undefined): SocialCollectionTab {
  if (
    value === "complete" ||
    value === "singles" ||
    value === "binders" ||
    value === "sealed" ||
    value === "graded"
  ) {
    return value;
  }

  return "overview";
}

function ratioPercent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function formatPercent(value: number | null): string {
  if (value == null) return "--";
  return `${value.toFixed(value >= 10 || value === 0 ? 0 : 1)}%`;
}

function sumCardViewValue(items: CollectionCardViewItem[]): number {
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

function safeShare(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}

function SocialAllocationPanel({
  rawLooseSingles,
  gradedCards,
  binderCards,
  sealed,
}: {
  rawLooseSingles: CollectionCardViewItem[];
  gradedCards: CollectionCardViewItem[];
  binderCards: CollectionCardViewItem[];
  sealed: CollectionOverviewData["sealed"];
}) {
  const sealedUnits = sealed.reduce((total, item) => total + item.quantity, 0);
  const rawBinderCards = binderCards.filter((item) => !isGradedCollectionCard(item));
  const segments = [
    {
      label: "Loose Raw",
      itemCount: rawLooseSingles.length,
      value: sumCardViewValue(rawLooseSingles),
      dotClassName: "bg-sky-400",
      fillClassName: "bg-sky-400",
    },
    {
      label: "Binder Raw",
      itemCount: rawBinderCards.length,
      value: sumCardViewValue(rawBinderCards),
      dotClassName: "bg-emerald-400",
      fillClassName: "bg-emerald-400",
    },
    {
      label: "Graded",
      itemCount: gradedCards.length,
      value: sumCardViewValue(gradedCards),
      dotClassName: "bg-amber-300",
      fillClassName: "bg-amber-300",
    },
    {
      label: "Sealed",
      itemCount: sealedUnits,
      value: sumSealedViewValue(sealed),
      dotClassName: "bg-rose-400",
      fillClassName: "bg-rose-400",
    },
  ].filter((segment) => segment.value > 0 || segment.itemCount > 0);
  const totalValue = segments.reduce((total, segment) => total + segment.value, 0);

  if (segments.length === 0) return null;

  return (
    <section className="binder-panel overflow-hidden rounded-[var(--ui-page-header-radius)] p-2.5 sm:p-3">
      <h2 className="text-base font-black tracking-tight text-white">Collection Allocation</h2>
      <div className="mt-2.5 flex h-2.5 gap-1 overflow-visible">
        {segments.map((segment) => (
          <div
            key={segment.label}
            className={`${segment.fillClassName} h-full min-w-2 rounded-full shadow-[0_1px_5px_rgb(0_0_0/0.12)]`}
            style={{
              flexBasis: 0,
              flexGrow: totalValue > 0 ? Math.max(segment.value, totalValue * 0.012) : 1,
            }}
            title={`${segment.label}: ${safeShare(segment.value, totalValue).toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="mt-2.5 grid gap-1.5">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-2.5 text-[12px]">
            <span className={`h-2 w-2 shrink-0 rounded-full ${segment.dotClassName}`} />
            <span className="min-w-0 flex-1 truncate font-semibold text-white/78">
              {segment.label}
            </span>
            <span className="shrink-0 text-[11px] font-bold tabular-nums text-white/48">
              {safeShare(segment.value, totalValue).toFixed(0)}%
            </span>
            <span className="w-[4.75rem] shrink-0 text-right font-black tabular-nums text-white">
              {formatCollectionCurrency(segment.value)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SocialTopSetsPanel({
  binders,
  viewAllHref,
}: {
  binders: CollectionOverviewData["binders"];
  viewAllHref: string;
}) {
  const rankedBinders = binders
    .filter((binder) => binder.totalCards != null && binder.totalCards > 0)
    .sort((a, b) => (b.completionPct ?? 0) - (a.completionPct ?? 0))
    .slice(0, 5);

  if (rankedBinders.length === 0) return null;

  return (
    <section className="binder-panel overflow-hidden rounded-[var(--ui-page-header-radius)] p-2.5 sm:p-3">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 className="text-base font-black tracking-tight text-white">Top Sets Progress</h2>
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
          const completion =
            binder.completionPct == null ? 0 : Math.min(100, Math.max(0, binder.completionPct));
          const total = binder.totalCards ?? 0;

          return (
            <div key={binder.id} className="flex min-w-0 items-center gap-2.5">
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white/82">
                {binder.name}
              </span>
              <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-white/8 sm:block">
                <div className="h-full rounded-full bg-violet-500" style={{ width: `${completion}%` }} />
              </div>
              <span className="shrink-0 text-[11px] font-black tabular-nums text-white">
                {completion.toFixed(0)}%
              </span>
              <span className="hidden shrink-0 text-[11px] font-semibold tabular-nums text-white/42 min-[480px]:inline">
                {binder.ownedCards.toLocaleString("en-US")} / {total.toLocaleString("en-US")}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SocialCollectionLinks({
  completeHref,
  bindersHref,
  sealedHref,
  gradedHref,
}: {
  completeHref: string;
  bindersHref: string;
  sealedHref: string;
  gradedHref: string;
}) {
  const links = [
    { href: completeHref, label: "Complete Collection", hint: "All sections in one view", Icon: LibraryBig },
    { href: bindersHref, label: "Binders", hint: "Set progress and binder value", Icon: Boxes },
    { href: sealedHref, label: "Sealed", hint: "Sealed products and quantities", Icon: PackageCheck },
    { href: gradedHref, label: "Graded", hint: "Slabs and graded pricing", Icon: Sparkles },
  ];

  return (
    <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
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

export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{ friend?: string; game?: string; tab?: string }>;
}) {
  const user = await requirePageUser("/social");
  const [settings, params] = await Promise.all([
    getServerUserSettings(user.id),
    searchParams,
  ]);
  const activeGame = parseVisibleGameFilter(params.game, {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
  const activeTab = normalizeSocialTab(params.tab);
  const socialData = await getSocialPageData(user.id, params.friend ?? null);
  const activeFriend = socialData.activeFriend;
  const fullAccess = activeFriend?.hasFullAccess ?? false;
  const collection = activeFriend
    ? await getCachedSocialCollectionOverviewData({
        userId: activeFriend.id,
        game: activeGame,
        access: { fullAccess },
      })
    : null;

  function buildSocialHref(tab: SocialCollectionTab, game: TradingCardGameFilter = activeGame) {
    const nextParams = new URLSearchParams();
    const gameValue = getGameFilterSearchParamValue(game);
    if (activeFriend) nextParams.set("friend", activeFriend.id);
    if (gameValue) nextParams.set(GAME_SEARCH_PARAM, gameValue);
    if (tab !== "overview") nextParams.set("tab", tab);
    const query = nextParams.toString();
    return query ? `/social?${query}` : "/social";
  }

  const gameSwitchItems = GAME_FILTER_OPTIONS.map((game) => ({
    href: buildSocialHref(activeTab, game),
    active: activeGame === game,
    label: getGameFilterLabel(game),
  }));
  const gameLabel = getGameFilterLabel(activeGame);
  const featuredCards = collection ? getFeaturedCollectionCards(collection.cards) : [];
  const gradedCards = collection?.cards.filter(isGradedCollectionCard) ?? [];
  const gradedLooseSingles = collection?.looseSingles.filter(isGradedCollectionCard) ?? [];
  const rawLooseSingles =
    collection?.looseSingles.filter((item) => !isGradedCollectionCard(item)) ?? [];
  const totalTrackedItems =
    (collection?.overview.totalCards ?? 0) + (collection?.overview.totalSealedUnits ?? 0);
  const pricedCardCount = collection?.cards.filter((item) => item.current_value != null).length ?? 0;
  const pricedSealedUnits =
    collection?.sealed.reduce(
      (total, item) => total + (item.current_value_per_item != null ? item.quantity : 0),
      0
    ) ?? 0;
  const pricedCoverage = ratioPercent(pricedCardCount + pricedSealedUnits, totalTrackedItems);
  const averageTrackedValue =
    collection && totalTrackedItems > 0 ? collection.overview.currentValue / totalTrackedItems : null;
  const linkedBindersForCompletion =
    collection?.binders.filter((binder) => binder.totalCards != null && binder.totalCards > 0) ?? [];
  const linkedOwnedTotal = linkedBindersForCompletion.reduce(
    (total, binder) => total + binder.ownedCards,
    0
  );
  const linkedSetTotal = linkedBindersForCompletion.reduce(
    (total, binder) => total + (binder.totalCards ?? 0),
    0
  );
  const setCompletion = ratioPercent(linkedOwnedTotal, linkedSetTotal);
  const hasCollection =
    Boolean(collection) &&
    ((collection?.overview.totalCards ?? 0) > 0 ||
      (collection?.overview.totalSealedUnits ?? 0) > 0 ||
      (collection?.overview.totalBinders ?? 0) > 0);
  const valueRangePoints = collection?.overview.chart.filter((point) => point.value != null) ?? [];
  const showCollectionChart = valueRangePoints.length > 1;
  const latestCollectionChartValue = valueRangePoints[valueRangePoints.length - 1]?.value ?? null;
  const stats = collection
    ? ([
        {
          label: "Value",
          value: formatCollectionCurrency(collection.overview.currentValue),
          hint: `${gameLabel} cards & sealed`,
          Icon: BadgeEuro,
          tone: "emerald",
        },
        ...(fullAccess
          ? ([
              {
                label: "Spend",
                value: formatCollectionCurrency(collection.overview.investment),
                hint: "Purchase prices",
                Icon: BadgeEuro,
                tone: "sky",
              },
              {
                label: "P&L",
                value: `${collection.overview.pnl >= 0 ? "+" : ""}${formatCollectionCurrency(collection.overview.pnl)}`,
                hint: "Current minus spend",
                Icon: Activity,
                tone: collection.overview.pnl >= 0 ? "emerald" : "rose",
              },
            ] satisfies HeaderStat[])
          : []),
        {
          label: "Cards",
          value: collection.overview.totalCards.toLocaleString("en-US"),
          hint: `${rawLooseSingles.length.toLocaleString("en-US")} loose / ${gradedCards.length.toLocaleString("en-US")} graded`,
          Icon: LibraryBig,
          tone: "violet",
        },
        {
          label: "Priced Items",
          value: formatPercent(pricedCoverage),
          hint: `${(pricedCardCount + pricedSealedUnits).toLocaleString("en-US")} / ${totalTrackedItems.toLocaleString("en-US")}`,
          Icon: Gauge,
          tone: "sky",
        },
        {
          label: "Set Completion",
          value: formatPercent(setCompletion),
          hint:
            linkedSetTotal > 0
              ? `${linkedOwnedTotal.toLocaleString("en-US")} / ${linkedSetTotal.toLocaleString("en-US")}`
              : "No linked sets",
          Icon: CheckCircle2,
          tone: "violet",
        },
        {
          label: "Avg Item",
          value: averageTrackedValue == null ? "--" : formatCollectionCurrency(averageTrackedValue),
          hint: "Cards & sealed",
          Icon: Activity,
          tone: "slate",
        },
        {
          label: "Total Items",
          value: totalTrackedItems.toLocaleString("en-US"),
          hint: `${collection.overview.totalBinders.toLocaleString("en-US")} binders / ${collection.overview.totalSealedUnits.toLocaleString("en-US")} sealed`,
          Icon: Box,
          tone: "amber",
        },
      ] satisfies HeaderStat[])
    : [];
  const tabs: Array<{ key: SocialCollectionTab; label: string; href: string }> = [
    { key: "overview", label: "Overview", href: buildSocialHref("overview") },
    { key: "complete", label: "Complete", href: buildSocialHref("complete") },
    { key: "singles", label: "Loose", href: buildSocialHref("singles") },
    { key: "binders", label: "Binders", href: buildSocialHref("binders") },
    { key: "sealed", label: "Sealed", href: buildSocialHref("sealed") },
    { key: "graded", label: "Graded", href: buildSocialHref("graded") },
  ];

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="grid min-w-0 gap-5 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-6">
        <aside className="min-w-0">
          <div className="sticky top-[calc(var(--ui-app-header-height)+1rem)] grid gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-violet-300/18 bg-violet-500/[0.12] text-violet-100">
                  <UsersRound className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h1 className="text-[length:var(--ui-page-header-title-size)] font-bold leading-tight tracking-tight text-white">
                    Social
                  </h1>
                  <p className="mt-0.5 truncate text-[length:var(--ui-page-header-description-size)] text-white/48">
                    Friends & collections
                  </p>
                </div>
              </div>
            </div>

            <SocialPageClient
              collectors={socialData.collectors}
              friends={socialData.friends}
              incomingRequests={socialData.incomingRequests}
              outgoingRequests={socialData.outgoingRequests}
              activeFriendId={activeFriend?.id ?? null}
              gameParam={getGameFilterSearchParamValue(activeGame)}
            />
          </div>
        </aside>

        <main className="min-w-0">
          {activeFriend && collection ? (
            <div className="grid min-w-0 gap-4 sm:gap-5">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <h2 className="min-w-0 truncate text-[length:var(--ui-page-header-title-size)] font-bold leading-tight tracking-tight text-white">
                    {activeFriend.displayName}
                  </h2>
                  <p className="mt-1 max-w-md text-[length:var(--ui-page-header-description-size)] leading-[var(--ui-page-header-description-leading)] text-white/52">
                    {activeFriend.email} / {gameLabel} collection
                  </p>
                  {fullAccess ? (
                    <span className="mt-2 inline-flex rounded-full border border-emerald-300/18 bg-emerald-500/[0.10] px-2.5 py-1 text-[11px] font-black text-emerald-100">
                      Full Access
                    </span>
                  ) : null}
                </div>

                {settings.onePieceLibraryEnabled ? (
                  <div className="shrink-0 sm:ml-auto">
                    <GameFilterSwitch
                      items={gameSwitchItems}
                      ariaLabel="Social collection library"
                      className="max-w-[21rem]"
                    />
                  </div>
                ) : null}
              </div>

              <nav className="binder-subpanel grid min-w-0 grid-cols-3 gap-1 rounded-[var(--ui-page-header-radius)] p-1 sm:grid-cols-6">
                {tabs.map((tab) => {
                  const active = activeTab === tab.key;
                  return (
                    <Link
                      key={tab.key}
                      href={tab.href}
                      prefetch={false}
                      aria-current={active ? "page" : undefined}
                      className={`inline-flex h-9 min-w-0 items-center justify-center rounded-xl px-2 text-[11px] font-black transition-colors sm:text-[12px] ${
                        active
                          ? "border border-violet-300/28 bg-violet-500/[0.18] text-violet-50"
                          : "text-white/54 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      <span className="truncate">{tab.label}</span>
                    </Link>
                  );
                })}
              </nav>

              {activeTab === "overview" ? (
                <div className="grid min-w-0 gap-3">
                  <section className="grid min-w-0 gap-2.5 sm:gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] xl:items-stretch">
                    <div className="binder-panel relative flex w-full min-w-0 flex-col overflow-hidden rounded-[var(--ui-page-header-radius)] p-2.5 sm:p-3 lg:p-4">
                      <div className="min-w-0 flex-1 [&>section]:h-full [&>section]:w-full">
                        {showCollectionChart ? (
                          <PriceHistoryPanel
                            layout="dashboard"
                            title="Collection Value"
                            currency="EUR"
                            points={collection.overview.chart}
                            currentValue={collection.overview.currentValue}
                            deltaValue={latestCollectionChartValue}
                            tone="dark"
                            subtitle={
                              fullAccess
                                ? `Spend ${formatCollectionCurrency(collection.overview.investment)} / P&L ${collection.overview.pnl >= 0 ? "+" : ""}${formatCollectionCurrency(collection.overview.pnl)}`
                                : `${collection.overview.totalCards.toLocaleString("en-US")} cards / ${collection.overview.totalSealedUnits.toLocaleString("en-US")} sealed`
                            }
                            emptyText="No value history yet"
                            rangeStorageKey={`social-${activeFriend.id}-collection-dashboard`}
                          />
                        ) : (
                          <div className="flex h-full min-h-[13rem] flex-col justify-center">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/38">
                              Collection Value
                            </p>
                            <p className="mt-2 text-3xl font-black tabular-nums text-white">
                              {formatCollectionCurrency(collection.overview.currentValue)}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-white/42">
                              No value history yet
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid min-w-0 grid-cols-2 gap-1.5 sm:gap-2">
                      {stats.map((stat) => (
                        <HeaderStatCard key={stat.label} {...stat} />
                      ))}
                    </div>
                  </section>

                  {hasCollection ? (
                    <HomeValueDriversPanel
                      data={collection.valueDrivers}
                      viewAllHref={buildSocialHref("complete")}
                    />
                  ) : null}

                  {hasCollection ? (
                    <HomeFeaturedCardsPanel
                      cards={featuredCards}
                      viewAllHref={buildSocialHref("complete")}
                      desktopRows={3}
                      mobileRows={4}
                      readOnlyCollectionItems={fullAccess}
                    />
                  ) : null}

                  {hasCollection ? (
                    <div className="grid gap-2.5 sm:gap-3 xl:grid-cols-2 [&>section]:h-full">
                      <SocialAllocationPanel
                        rawLooseSingles={rawLooseSingles}
                        gradedCards={gradedCards}
                        binderCards={collection.binderCards}
                        sealed={collection.sealed}
                      />
                      <SocialTopSetsPanel
                        binders={collection.binders}
                        viewAllHref={buildSocialHref("binders")}
                      />
                    </div>
                  ) : null}

                  <SocialCollectionLinks
                    completeHref={buildSocialHref("complete")}
                    bindersHref={buildSocialHref("binders")}
                    sealedHref={buildSocialHref("sealed")}
                    gradedHref={buildSocialHref("graded")}
                  />
                </div>
              ) : null}

              {activeTab === "complete" ? (
                <CollectionOverviewSections
                  gradedLooseSingles={gradedLooseSingles}
                  rawLooseSingles={rawLooseSingles}
                  showRawLooseSinglesSection={rawLooseSingles.length > 0}
                  binderCards={collection.binderCards}
                  sealed={collection.sealed}
                  binders={collection.binders}
                  readOnly
                />
              ) : null}

              {activeTab === "singles" ? (
                <CollectionCardsView
                  items={rawLooseSingles}
                  emptyTitle="No loose singles in this collection"
                  emptyText="Cards saved without a binder appear here."
                  showFilters
                  readOnlyCollectionItems={fullAccess}
                />
              ) : null}

              {activeTab === "graded" ? (
                <CollectionCardsView
                  items={gradedCards}
                  showGradedSlabPreview
                  emptyTitle="No graded cards in this collection"
                  emptyText="Cards with a grading company and grade appear here."
                  showFilters
                  readOnlyCollectionItems={fullAccess}
                />
              ) : null}

              {activeTab === "binders" ? (
                collection.binders.length > 0 ? (
                  <BinderOverviewGrid binders={collection.binders} readOnly />
                ) : (
                  <div className="binder-panel rounded-2xl px-5 py-7 text-center sm:rounded-3xl sm:px-8 sm:py-9">
                    <p className="mb-1 font-medium text-white/76">No binders yet</p>
                    <p className="mx-auto max-w-xl text-sm leading-6 text-white/42">
                      This friend has no binders for this game yet.
                    </p>
                  </div>
                )
              ) : null}

              {activeTab === "sealed" ? (
                <CollectionSealedView
                  items={collection.sealed}
                  emptyTitle="No sealed in this collection"
                  emptyText="This friend has no sealed products for this game yet."
                  readOnly
                />
              ) : null}
            </div>
          ) : (
            <div className="binder-panel hidden rounded-[var(--ui-page-header-radius)] px-5 py-12 text-center lg:block">
              <UsersRound className="mx-auto h-8 w-8 text-white/24" />
              <h2 className="mt-3 text-lg font-black text-white">No friend selected</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/45">
                Choose a friend from the list to explore the collection they share with you.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
