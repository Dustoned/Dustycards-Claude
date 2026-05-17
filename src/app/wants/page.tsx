import nextDynamic from "next/dynamic";
import { BadgeEuro, CheckCircle2, Heart, Layers3 } from "lucide-react";
import GameFilterSwitch from "@/components/GameFilterSwitch";
import { HeaderStatCard, type HeaderStat } from "@/components/PageHeader";
import { formatCollectionCurrency } from "@/lib/collection";
import { getWantsPageData } from "@/lib/collection-data";
import { getSupportTileTrackWidth } from "@/lib/display-scale";
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
import { getServerUserSettings } from "@/lib/user-settings-server";
import { syncMissingBinderWantsForUser } from "@/lib/wantlist-planner";
import WantsPageContent from "./WantsPageContent";

const PriceHistoryPanel = nextDynamic(() => import("@/components/PriceHistoryPanel"), {
  loading: () => (
    <section className="h-full min-h-[var(--ui-dashboard-header-panel-min-height)] rounded-[var(--ui-page-header-radius)] border border-black/8 bg-black/[0.03] dark:border-white/8 dark:bg-white/[0.04]" />
  ),
});

export const dynamic = "force-dynamic";

export default async function WantsPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const user = await requirePageUser("/wants");
  const settings = await getServerUserSettings(user.id);
  const binderTileTrackWidth = getSupportTileTrackWidth(settings.uiScale, settings.widescreen);
  const { game: gameParam } = await searchParams;
  const activeGame = parseVisibleGameFilter(gameParam, {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
  try {
    await syncMissingBinderWantsForUser(user.id, {
      game: activeGame,
      includeOnePiece: settings.onePieceLibraryEnabled,
    });
  } catch (error) {
    console.error("Failed to prepare wantlist planner", error);
  }
  const data = await getWantsPageData(user.id, activeGame);

  function buildGameHref(game: TradingCardGameFilter) {
    const params = new URLSearchParams();
    const gameValue = getGameFilterSearchParamValue(game);
    if (gameValue) {
      params.set(GAME_SEARCH_PARAM, gameValue);
    }
    const query = params.toString();
    return query ? `/wants?${query}` : "/wants";
  }
  const gameSwitchItems = GAME_FILTER_OPTIONS.map((game) => ({
    href: buildGameHref(game),
    active: activeGame === game,
    label: getGameFilterLabel(game),
  }));

  const unpricedCards = Math.max(data.totalCards - data.pricedCards, 0);
  const stats = [
    {
      label: "Wanted",
      value: data.totalCards.toLocaleString("en-US"),
      hint: "Cards outside your collection totals.",
      Icon: Heart,
      tone: "rose",
    },
    {
      label: "Est. Cost",
      value: formatCollectionCurrency(data.estimatedValue),
      hint: "CardMarket target total.",
      Icon: BadgeEuro,
      tone: "emerald",
    },
    {
      label: "Priced",
      value: `${data.pricedCards.toLocaleString("en-US")} / ${data.totalCards.toLocaleString("en-US")}`,
      hint: unpricedCards > 0 ? `${unpricedCards.toLocaleString("en-US")} missing price.` : "All priced.",
      Icon: CheckCircle2,
      tone: "sky",
    },
    {
      label: "Sets",
      value: data.totalSets.toLocaleString("en-US"),
      hint:
        data.averageValue == null
          ? "Add wants to build a target list."
          : `${formatCollectionCurrency(data.averageValue)} average.`,
      Icon: Layers3,
      tone: "violet",
    },
  ] satisfies HeaderStat[];

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="flex w-full flex-col gap-5 sm:gap-6">
        <section className="relative w-full overflow-hidden rounded-[var(--ui-page-header-radius)] border border-black/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.76),rgba(255,255,255,0.52))] p-3 shadow-lg shadow-black/5 dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.032))] dark:shadow-black/20 sm:p-4 lg:p-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/18" />
          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(19rem,0.82fr)_minmax(0,1.18fr)] xl:grid-cols-[minmax(20rem,0.78fr)_minmax(0,1.08fr)_minmax(20rem,0.72fr)] xl:items-stretch">
            <div className="flex min-h-[var(--ui-dashboard-header-panel-min-height)] min-w-0 flex-col justify-between rounded-[var(--ui-page-header-radius)] border border-black/8 bg-black/[0.018] p-[var(--ui-page-header-padding)] dark:border-white/8 dark:bg-black/10">
              <div className="min-w-0">
                <p className="text-[length:var(--ui-page-header-eyebrow-size)] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-white/42">
                  DustyCards
                </p>
                <h1 className="mt-2 min-w-0 text-[length:var(--ui-page-header-title-size)] font-bold leading-tight tracking-tight text-gray-950 dark:text-white">
                  {activeGame === ONE_PIECE_GAME ? "One Piece Wants" : "Wants"}
                </h1>
                <p className="mt-3 max-w-md text-[length:var(--ui-page-header-description-size)] leading-[var(--ui-page-header-description-leading)] text-gray-500 dark:text-white/56">
                  {activeGame === ONE_PIECE_GAME
                    ? "One Piece cards you want to pick up later, kept separate from Pokemon wants."
                    : "Cards you want to pick up later. Prices are tracked here, but they do not count toward collection value, spent or card totals."}
                </p>
              </div>

              {settings.onePieceLibraryEnabled ? (
                <div className="mt-[var(--ui-page-header-action-margin)]">
                  <GameFilterSwitch items={gameSwitchItems} ariaLabel="Wants library" className="max-w-[21rem]" />
                </div>
              ) : null}
            </div>

            <div className="min-w-0 lg:min-h-[var(--ui-dashboard-header-panel-min-height)] [&>section]:h-full">
              <PriceHistoryPanel
                compact
                title="Wants Value"
                currency="EUR"
                points={data.chart}
                currentValue={data.estimatedValue}
                subtitle={`${data.pricedCards.toLocaleString("en-US")} / ${data.totalCards.toLocaleString("en-US")} priced`}
                emptyText="Add wanted cards with price history to start tracking target value"
              />
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-2 lg:col-span-2 xl:col-span-1 xl:auto-rows-fr">
              {stats.map((stat) => (
                <HeaderStatCard key={stat.label} {...stat} />
              ))}
            </div>
          </div>
        </section>

        <WantsPageContent
          plannerGroups={data.plannerGroups}
          personalItems={data.personalItems}
          needsPlannerSync={data.needsPlannerSync}
          game={activeGame}
          tileTrackWidth={binderTileTrackWidth}
          widescreen={settings.widescreen}
        />
      </div>
    </div>
  );
}
