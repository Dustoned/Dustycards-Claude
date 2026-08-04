import nextDynamic from "next/dynamic";
import { BadgeEuro, CheckCircle2, Heart, Layers3 } from "lucide-react";
import GameFilterSwitch from "@/components/GameFilterSwitch";
import { HeaderStatCard, type HeaderStat } from "@/components/PageHeader";
import { formatCollectionCurrency } from "@/lib/collection";
import { getWantsPageData } from "@/lib/collection-data";
import { getBinderTileTrackWidth } from "@/lib/display-scale";
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
  const binderTileTrackWidth = getBinderTileTrackWidth(settings.cardSize, settings.widescreen);
  const { game: gameParam } = await searchParams;
  const activeGame = parseVisibleGameFilter(gameParam, {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
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
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="min-w-0 text-[length:var(--ui-page-header-title-size)] font-bold leading-tight tracking-tight text-white">
              {activeGame === ONE_PIECE_GAME ? "One Piece Wants" : "Wants"}
            </h1>
            <p className="mt-1 max-w-md text-[length:var(--ui-page-header-description-size)] leading-[var(--ui-page-header-description-leading)] text-white/52">
              {activeGame === ONE_PIECE_GAME
                ? "One Piece cards you want to pick up later, kept separate from Pokemon wants."
                : "Cards you want to pick up later. Prices are tracked here but do not count toward collection totals."}
            </p>
          </div>

          {settings.onePieceLibraryEnabled ? (
            <div className="shrink-0 sm:ml-auto">
              <GameFilterSwitch items={gameSwitchItems} ariaLabel="Wants library" className="max-w-[21rem]" />
            </div>
          ) : null}
        </div>

        <section className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-stretch">
          <div className="binder-panel relative flex w-full min-w-0 flex-col overflow-hidden rounded-[var(--ui-page-header-radius)] p-3 sm:p-4 lg:p-5">
            <div className="min-w-0 flex-1 [&>section]:h-full [&>section]:w-full">
              <PriceHistoryPanel
                layout="dashboard"
                title="Wants Value"
                currency="EUR"
                points={data.chart}
                currentValue={data.estimatedValue}
                subtitle={`${data.pricedCards.toLocaleString("en-US")} / ${data.totalCards.toLocaleString("en-US")} priced`}
                emptyText="Add wanted cards with price history to start tracking target value"
              />
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 xl:grid-rows-2 xl:gap-3">
            {stats.map((stat) => (
              <HeaderStatCard key={stat.label} {...stat} />
            ))}
          </div>
        </section>

        <WantsPageContent
          plannerGroups={data.plannerGroups}
          personalItems={data.personalItems}
          needsPlannerSync={data.needsPlannerSync}
          game={activeGame}
          tileTrackWidth={binderTileTrackWidth}
          widescreen={settings.widescreen}
          buyNow={data.buyNow}
        />
      </div>
    </div>
  );
}
