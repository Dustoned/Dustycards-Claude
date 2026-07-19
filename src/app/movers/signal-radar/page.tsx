import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import BackNavigationLink from "@/components/BackNavigationLink";
import GameFilterSwitch from "@/components/GameFilterSwitch";
import { PageHeroHeader } from "@/components/PageHeader";
import ExternalSignalBrowser from "@/app/movers/signal-radar/ExternalSignalBrowser";
import {
  GAME_FILTER_OPTIONS,
  GAME_SEARCH_PARAM,
  getGameFilterLabel,
  getGameFilterSearchParamValue,
  parseVisibleGameFilter,
  type TradingCardGameFilter,
} from "@/lib/games";
import { getExternalSignalRadarData } from "@/lib/external-signal-radar";
import { enrichExternalSignalRadarData } from "@/lib/external-signal-intelligence";
import { getExpansionChaseRadarData } from "@/lib/expansion-chase-radar";
import { getCardQuickActionMap } from "@/lib/card-quick-actions-server";
import {
  getPersistedExternalSignalRadarData,
  mergeExternalSignalRadarWithFallback,
} from "@/lib/external-signal-persisted";
import { requirePageUser } from "@/lib/page-auth";
import { getServerUserSettings } from "@/lib/user-settings-server";

export const dynamic = "force-dynamic";

export default async function SignalRadarPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string; set?: string }>;
}) {
  const { game, set } = await searchParams;
  const requestedQuery = new URLSearchParams();
  if (game) requestedQuery.set(GAME_SEARCH_PARAM, game);
  if (set) requestedQuery.set("set", set);
  const requestedPath = requestedQuery.size
    ? `/movers/signal-radar?${requestedQuery.toString()}`
    : "/movers/signal-radar";
  const user = await requirePageUser(requestedPath);
  const settings = await getServerUserSettings(user.id);
  const activeGame = parseVisibleGameFilter(game, {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
  const [liveData, persistedData, newReleaseChases] = await Promise.all([
    getExternalSignalRadarData(activeGame),
    getPersistedExternalSignalRadarData(activeGame),
    getExpansionChaseRadarData({
      gameFilter: activeGame,
      episodeId: set?.trim() || null,
    }),
  ]);
  const data = await enrichExternalSignalRadarData(
    mergeExternalSignalRadarWithFallback(liveData, persistedData, activeGame)
  );
  const cardQuickActions = await getCardQuickActionMap(user.id, [
    ...data.signals.map((signal) => signal.cardId),
    ...(newReleaseChases?.cards.map((card) => card.cardId) ?? []),
  ]);

  const buildHref = (nextGame: TradingCardGameFilter) => {
    const gameValue = getGameFilterSearchParamValue(nextGame);
    return gameValue
      ? `/movers/signal-radar?${GAME_SEARCH_PARAM}=${gameValue}`
      : "/movers/signal-radar";
  };
  const gameSwitchItems = GAME_FILTER_OPTIONS.map((option) => ({
    href: buildHref(option),
    active: activeGame === option,
    label: getGameFilterLabel(option),
  }));
  const activeGameValue = getGameFilterSearchParamValue(activeGame);
  const marketHref = activeGameValue
    ? `/movers?${GAME_SEARCH_PARAM}=${activeGameValue}`
    : "/movers";

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex w-full flex-col gap-4">
        <PageHeroHeader
          title="Signal Radar"
          description="Demand, scarcity and set-event signals worth watching."
          backLinks={
            <div className="flex flex-wrap items-center gap-3 text-sm text-white/46">
              <BackNavigationLink
                href={marketHref}
                className="inline-flex items-center gap-2 font-medium transition hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to market
              </BackNavigationLink>
              <Link
                href="/movers/sudden-drops"
                prefetch={false}
                className="inline-flex items-center gap-2 font-medium transition hover:text-white"
              >
                Sudden drops
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          }
          titleActions={
            settings.onePieceLibraryEnabled ? (
              <GameFilterSwitch
                items={gameSwitchItems}
                ariaLabel="Signal Radar game"
                className="w-full sm:w-[21.5rem]"
              />
            ) : null
          }
        />

        <ExternalSignalBrowser
          signals={data.signals}
          sources={data.sources}
          generatedAt={data.generatedAt}
          newReleaseChases={newReleaseChases}
          cardQuickActions={cardQuickActions}
        />
      </div>
    </div>
  );
}
