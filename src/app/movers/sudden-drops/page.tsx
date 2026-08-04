import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
} from "lucide-react";
import {
  HeaderAction,
  PageHeroHeader,
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
      <div className="flex w-full flex-col gap-5 sm:gap-6">
        <PageHeroHeader
          eyebrow="Market monitor"
          title="Sudden drops"
          description={`Verified ${formatCurrency(activeDropMinimum, activeCurrency)}+ price drops in a rolling 24-hour window. Suspicious listing outliers are excluded.`}
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
          actions={settings.onePieceLibraryEnabled ? (
            <HeaderAction className="items-stretch">
              <GameFilterSwitch
                items={gameSwitchItems}
                ariaLabel="Sudden drops library"
                className="min-w-[16rem] max-w-[21rem]"
              />
            </HeaderAction>
          ) : undefined}
        />

        <section className="binder-panel flex flex-col gap-3 rounded-2xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap sm:items-center sm:gap-x-8">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/34">Matches</p>
              <p className="mt-0.5 text-lg font-black tabular-nums text-white">{data.preview.total.toLocaleString("en-US")}</p>
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/34">Strong drops</p>
              <p className="mt-0.5 text-lg font-black tabular-nums text-white">{strongDropCount.toLocaleString("en-US")}</p>
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/34">Largest</p>
              <p className="mt-0.5 text-lg font-black tabular-nums text-white">{largestDrop == null ? "--" : formatCurrency(largestDrop, activeCurrency)}</p>
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/34">Average</p>
              <p className="mt-0.5 text-lg font-black tabular-nums text-white">{averageDrop == null ? "--" : formatCurrency(averageDrop, activeCurrency)}</p>
            </div>
          </div>
          <p className="shrink-0 text-[10px] font-semibold leading-5 text-white/38 sm:text-right">
            {activePriceSource === "tcp" ? "TCGPlayer market" : "CardMarket English"}<br />
            Updated {updatedLabel} · {scopeLabel}
          </p>
        </section>

        <div
          className={
            sealedDrops.items.length > 0
              ? "sudden-drops-content-grid grid min-w-0 gap-6"
              : "grid min-w-0 gap-6"
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
              title="Cards"
              description={
                data.preview.total > movers.length
                  ? `Largest ${movers.length.toLocaleString("en-US")} of ${data.preview.total.toLocaleString("en-US")} verified card drops.`
                  : `${data.preview.total.toLocaleString("en-US")} verified card drops in the rolling 24-hour window.`
              }
              emptyTitle={`No verified ${formatCurrency(activeDropMinimum, activeCurrency)}+ drops in the last 24 hours`}
              emptyDescription="No raw cards currently meet the rolling 24-hour threshold. Suspicious listing outliers are excluded."
              parallelLayout={sealedDrops.items.length > 0}
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
