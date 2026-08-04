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
  FAST_SUDDEN_DROP_MIN_AMOUNT,
  FAST_SUDDEN_DROP_MIN_PERCENT,
  FAST_SUDDEN_DROP_STRONG_AMOUNT,
  getFastSealedSuddenDropsData,
  getFastSuddenDropsData,
} from "@/lib/home-sudden-drops-server";
import SealedSuddenDropsSection from "@/app/movers/sudden-drops/SealedSuddenDropsSection";
import {
  getMoverRecentDropAmount,
  SUDDEN_DROP_DEAL_MIN_AMOUNT,
  SUDDEN_DROP_DEAL_STRONG_AMOUNT,
} from "@/lib/movers";
import { formatCurrency, type CurrencyCode } from "@/lib/format";
import { requirePageUser } from "@/lib/page-auth";
import { getServerUserSettings } from "@/lib/user-settings-server";
import SuddenDropsAutoRefresh from "@/app/movers/sudden-drops/SuddenDropsAutoRefresh";
import { getCardQuickActionMap } from "@/lib/card-quick-actions-server";

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
    minDrop?: string;
  }>;
}) {
  const { source, scope, view, game, highlight, minDrop } = await searchParams;
  const usesHomePreviewThreshold = minDrop === String(FAST_SUDDEN_DROP_MIN_AMOUNT);
  const activeDropMinimum = usesHomePreviewThreshold
    ? FAST_SUDDEN_DROP_MIN_AMOUNT
    : SUDDEN_DROP_DEAL_MIN_AMOUNT;
  const nextParams = new URLSearchParams();
  if (source) nextParams.set("source", source);
  if (scope) nextParams.set("scope", scope);
  if (view) nextParams.set("view", view);
  if (game) nextParams.set(GAME_SEARCH_PARAM, game);
  if (highlight) nextParams.set("highlight", highlight);
  if (usesHomePreviewThreshold) nextParams.set("minDrop", String(FAST_SUDDEN_DROP_MIN_AMOUNT));
  const nextQuery = nextParams.toString();
  const user = await requirePageUser(`/movers/sudden-drops${nextQuery ? `?${nextQuery}` : ""}`);
  const settings = await getServerUserSettings(user.id);
  const activeGame = parseVisibleGameFilter(game, {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
  const activePriceSource = normalizeMoversPriceSource(source, settings.primaryPriceSource);
  const [data, sealedDrops] = await Promise.all([
    getFastSuddenDropsData(
      activePriceSource,
      activeGame,
      FAST_SUDDEN_DROP_FEED_LIMIT,
      {
        minimumAmount: activeDropMinimum,
        minimumPercent: usesHomePreviewThreshold ? FAST_SUDDEN_DROP_MIN_PERCENT : null,
        percentBypassAmount: FAST_SUDDEN_DROP_STRONG_AMOUNT,
      }
    ),
    getFastSealedSuddenDropsData(activeGame),
  ]);
  const movers = data.items;
  const cardQuickActions = await getCardQuickActionMap(
    user.id,
    movers.map((item) => item.cardId)
  );
  const activeItemScope = "all";
  const cardScope = "all";
  const isAllScope = true;
  const scopeLabel = isAllScope ? "All Cards" : "Collection";
  const activeCurrency: CurrencyCode = activePriceSource === "tcp" ? "USD" : "EUR";
  const dropAmounts = movers.map(getMoverRecentDropAmount);
  const updatedLabel = data.refresh
    ? new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(data.refresh.finishedAt ?? data.refresh.startedAt))
    : "--";
  const strongDropCount = movers.filter(
    (item) => getMoverRecentDropAmount(item) >= SUDDEN_DROP_DEAL_STRONG_AMOUNT
  ).length;
  const averageDrop = average(dropAmounts);
  const largestDrop = dropAmounts.length > 0 ? Math.max(...dropAmounts) : null;
  const headerStats = [
    {
      label: "24H Matches",
      value: data.preview.total.toLocaleString("en-US"),
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
      label: "Largest Drop",
      value: largestDrop == null ? "--" : formatCurrency(largestDrop, activeCurrency),
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
    if (usesHomePreviewThreshold) params.set("minDrop", String(FAST_SUDDEN_DROP_MIN_AMOUNT));

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
      <SuddenDropsAutoRefresh />
      <div className="flex w-full flex-col gap-8">
        <PageHeroHeader
          eyebrow="Sudden Drops"
          title="Verified market drops from the last 24 hours"
          description="A rolling view of cards whose current marketplace price fell by at least the threshold versus their immediately previous price. Internal job and batch boundaries no longer affect this list."
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
                  Drop threshold: {formatCurrency(activeDropMinimum, activeCurrency)}+
                </HeaderPill>
                <HeaderPill tone="amber">
                  Rolling window: 24 hours
                </HeaderPill>
                <HeaderPill tone="violet">Updated: {updatedLabel}</HeaderPill>
                <HeaderPill>
                  Price source: {activePriceSource === "tcp" ? "TCGPlayer market" : "CardMarket English"}
                </HeaderPill>
              </div>
            </HeaderAction>
          }
        />

        <div className="flex flex-wrap gap-3 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full border border-rose-400/20 bg-rose-400/[0.08] px-3 py-1.5 text-rose-700 dark:text-rose-200">
            <ArrowDownRight className="h-4 w-4" />
            Rolling 24-hour {formatCurrency(activeDropMinimum, activeCurrency)}+ drops
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/[0.08] px-3 py-1.5 text-violet-700 dark:text-violet-200">
            <Sparkles className="h-4 w-4" />
            English price vs previous English price
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/[0.08] px-3 py-1.5 text-amber-700 dark:text-amber-200">
            <BadgePercent className="h-4 w-4" />
            Suspicious listings excluded
          </span>
        </div>

        <div
          className={
            sealedDrops.items.length > 0
              ? "sudden-drops-content-grid grid min-w-0 gap-8"
              : "grid min-w-0 gap-8"
          }
        >
          <div className="min-w-0">
            <MoversBrowser
              movers={movers}
              cardQuickActions={cardQuickActions}
              activeScope={cardScope}
              activeItemScope={activeItemScope}
              marketMode="sudden_drops"
              initialDirection="fallers"
              highlightedCardId={highlight ?? null}
              metricWindowLabel="24H"
              eyebrow="Sudden Drops"
              title="Cards that became cheaper in the last 24 hours"
              description={
                data.preview.total > movers.length
                  ? `Showing the ${movers.length.toLocaleString("en-US")} largest of ${data.preview.total.toLocaleString("en-US")} verified raw-card drops. Every match is counted; the rendered list stays bounded for mobile performance.`
                  : `Search, filter, and sort all ${data.preview.total.toLocaleString("en-US")} verified raw cards whose current price is at least ${formatCurrency(activeDropMinimum, activeCurrency)} below their previous price within the rolling 24-hour window.`
              }
              emptyTitle={`No verified ${formatCurrency(activeDropMinimum, activeCurrency)}+ drops in the last 24 hours`}
              emptyDescription="No raw cards currently meet the rolling 24-hour threshold. Suspicious listing outliers are excluded."
            />
          </div>

          {sealedDrops.items.length > 0 ? (
            <div className="min-w-0">
              <SealedSuddenDropsSection items={sealedDrops.items} total={sealedDrops.total} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
