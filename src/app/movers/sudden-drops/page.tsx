import Link from "next/link";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  BadgePercent,
  Gauge,
  Sparkles,
} from "lucide-react";
import {
  HeaderAction,
  HeaderPill,
  PageHeroHeader,
  type HeaderStat,
} from "@/components/PageHeader";
import BackNavigationLink from "@/components/BackNavigationLink";
import GameFilterSwitch from "@/components/GameFilterSwitch";
import MoversBrowser from "@/app/movers/MoversBrowser";
import {
  buildMoversSourceHref,
  normalizeMoversPriceSource,
} from "@/app/movers/page-data";
import {
  GAME_FILTER_OPTIONS,
  GAME_SEARCH_PARAM,
  getGameFilterLabel,
  getGameFilterSearchParamValue,
  parseVisibleGameFilter,
  type TradingCardGameFilter,
} from "@/lib/games";
import {
  FAST_SUDDEN_DROP_FEED_LIMIT,
  getFastSuddenDropsData,
} from "@/lib/home-sudden-drops-server";
import {
  getMoverRecentDropAmount,
  SUDDEN_DROP_DEAL_MIN_AMOUNT,
  SUDDEN_DROP_DEAL_STRONG_AMOUNT,
} from "@/lib/movers";
import { formatCurrency, type CurrencyCode } from "@/lib/format";
import { requirePageUser } from "@/lib/page-auth";
import { getServerUserSettings } from "@/lib/user-settings-server";

export const dynamic = "force-dynamic";

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export default async function SuddenDropsPage({
  searchParams,
}: {
  searchParams: Promise<{
    source?: string;
    scope?: string;
    view?: string;
    game?: string;
    highlight?: string;
  }>;
}) {
  const { source, scope, view, game, highlight } = await searchParams;
  const nextParams = new URLSearchParams();
  if (source) nextParams.set("source", source);
  if (scope) nextParams.set("scope", scope);
  if (view) nextParams.set("view", view);
  if (game) nextParams.set(GAME_SEARCH_PARAM, game);
  if (highlight) nextParams.set("highlight", highlight);
  const nextQuery = nextParams.toString();
  const user = await requirePageUser(`/movers/sudden-drops${nextQuery ? `?${nextQuery}` : ""}`);
  const settings = await getServerUserSettings(user.id);
  const activeGame = parseVisibleGameFilter(game, {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
  const activePriceSource = normalizeMoversPriceSource(source, settings.primaryPriceSource);
  const data = await getFastSuddenDropsData(activePriceSource, activeGame);
  const movers = data.items;
  const activeItemScope = "all";
  const cardScope = "all";
  const isAllScope = true;
  const scopeLabel = isAllScope ? "All Cards" : "Collection";
  const activeCurrency: CurrencyCode = activePriceSource === "tcp" ? "USD" : "EUR";
  const dropAmounts = movers.map(getMoverRecentDropAmount);
  const refreshLabel = data.refresh
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(data.refresh.finishedAt ?? data.refresh.startedAt))
    : "No recent refresh";
  const strongDropCount = movers.filter(
    (item) => getMoverRecentDropAmount(item) >= SUDDEN_DROP_DEAL_STRONG_AMOUNT
  ).length;
  const highWeightCount = movers.filter(
    (item) => item.rankingScore >= 8 || item.opportunityScore >= 8
  ).length;
  const averageDrop = average(dropAmounts);
  const headerStats = [
    {
      label: "Cards",
      value: movers.length.toLocaleString("en-US"),
      Icon: ArrowDownRight,
      tone: "rose",
    },
    {
      label: `${formatCurrency(SUDDEN_DROP_DEAL_STRONG_AMOUNT, activeCurrency)}+ Drops`,
      value: strongDropCount.toLocaleString("en-US"),
      Icon: BadgePercent,
      tone: "amber",
    },
    {
      label: "Weighted Picks",
      value: highWeightCount.toLocaleString("en-US"),
      Icon: Sparkles,
      tone: "violet",
    },
    {
      label: "Avg Drop",
      value: averageDrop == null ? "--" : formatCurrency(averageDrop, activeCurrency),
      Icon: Gauge,
      tone: "sky",
    },
  ] satisfies HeaderStat[];
  const gameValue = getGameFilterSearchParamValue(activeGame);
  const buildSuddenDropsHref = (nextGame: TradingCardGameFilter = activeGame) => {
    const params = new URLSearchParams();
    const nextGameValue = getGameFilterSearchParamValue(nextGame);

    if (source) params.set("source", source);
    if (scope) params.set("scope", scope);
    if (view) params.set("view", view);
    if (nextGameValue) params.set(GAME_SEARCH_PARAM, nextGameValue);
    if (highlight) params.set("highlight", highlight);

    const query = params.toString();
    return query ? `/movers/sudden-drops?${query}` : "/movers/sudden-drops";
  };
  const gameSwitchItems = GAME_FILTER_OPTIONS.map((game) => ({
    href: buildSuddenDropsHref(game),
    active: activeGame === game,
    label: getGameFilterLabel(game),
  }));
  const withGame = (href: string) =>
    gameValue ? `${href}${href.includes("?") ? "&" : "?"}${GAME_SEARCH_PARAM}=${gameValue}` : href;

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex w-full flex-col gap-8">
        <PageHeroHeader
          eyebrow="Sudden Drops"
          title="New drops from the latest price refresh"
          description={
            isAllScope
              ? "Only raw cards that lost at least the threshold since their previous price check. Unchanged old drops disappear on the next refresh."
              : "Only raw collection cards that lost at least the threshold since their previous price check. Unchanged old drops disappear on the next refresh."
          }
          stats={headerStats}
          backLinks={
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-white/50">
              <BackNavigationLink
                href={withGame(buildMoversSourceHref(
                  "/movers",
                  activePriceSource,
                  cardScope,
                  activeItemScope
                ))}
                className="inline-flex items-center gap-2 font-medium transition-colors hover:text-gray-900 dark:hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to market
              </BackNavigationLink>
              <Link
                href={withGame(buildMoversSourceHref(
                  "/movers/cheap-high-rarity",
                  activePriceSource,
                  cardScope,
                  activeItemScope
                ))}
                prefetch={false}
                className="inline-flex items-center gap-2 font-medium transition-colors hover:text-gray-900 dark:hover:text-white"
              >
                Cheap rarity
                <ArrowUpRight className="h-4 w-4" />
              </Link>
              <Link
                href={withGame(buildMoversSourceHref(
                  "/movers/discount-watch",
                  activePriceSource,
                  cardScope,
                  activeItemScope
                ))}
                prefetch={false}
                className="inline-flex items-center gap-2 font-medium transition-colors hover:text-gray-900 dark:hover:text-white"
              >
                Discount watch
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          }
          actions={
            <HeaderAction className="items-stretch">
              {settings.onePieceLibraryEnabled ? (
                <GameFilterSwitch
                  items={gameSwitchItems}
                  ariaLabel="Sudden drops library"
                  className="min-w-[16rem] max-w-[21rem]"
                />
              ) : null}
              <div className="flex flex-wrap items-center gap-[var(--ui-header-action-gap)]">
                <HeaderPill tone={isAllScope ? "sky" : "emerald"}>Scope: {scopeLabel}</HeaderPill>
                <HeaderPill tone="rose">
                  Latest refresh drop: {formatCurrency(SUDDEN_DROP_DEAL_MIN_AMOUNT, activeCurrency)}+
                </HeaderPill>
                <HeaderPill tone="amber">Refresh: {refreshLabel}</HeaderPill>
                <HeaderPill tone="violet">Top {FAST_SUDDEN_DROP_FEED_LIMIT}</HeaderPill>
                <HeaderPill>
                  Ranking source: {activePriceSource === "tcp" ? "TCGPlayer first" : "CardMarket first"}
                </HeaderPill>
              </div>
            </HeaderAction>
          }
        />

        <div className="flex flex-wrap gap-3 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full border border-rose-400/20 bg-rose-400/[0.08] px-3 py-1.5 text-rose-700 dark:text-rose-200">
            <ArrowDownRight className="h-4 w-4" />
            Latest price refresh {formatCurrency(SUDDEN_DROP_DEAL_MIN_AMOUNT, activeCurrency)}+ drop
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/[0.08] px-3 py-1.5 text-violet-700 dark:text-violet-200">
            <Sparkles className="h-4 w-4" />
            Movers weighting
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/[0.08] px-3 py-1.5 text-amber-700 dark:text-amber-200">
            <BadgePercent className="h-4 w-4" />
            Cheap after the fall
          </span>
        </div>

        <MoversBrowser
          movers={movers}
          activeScope={cardScope}
          activeItemScope={activeItemScope}
          marketMode="sudden_drops"
          initialDirection="fallers"
          highlightedCardId={highlight ?? null}
          metricWindowLabel="REFRESH"
          eyebrow="Sudden Drops"
          title="Newly cheaper cards"
          description={`Search, filter, and sort the latest top ${FAST_SUDDEN_DROP_FEED_LIMIT} raw cards that became at least ${formatCurrency(SUDDEN_DROP_DEAL_MIN_AMOUNT, activeCurrency)} cheaper in the newest price refresh.`}
          emptyTitle={`No new ${formatCurrency(SUDDEN_DROP_DEAL_MIN_AMOUNT, activeCurrency)}+ drops in this refresh`}
          emptyDescription={`No raw cards became ${formatCurrency(SUDDEN_DROP_DEAL_MIN_AMOUNT, activeCurrency)} or more cheaper since their previous price check.`}
        />
      </div>
    </div>
  );
}
