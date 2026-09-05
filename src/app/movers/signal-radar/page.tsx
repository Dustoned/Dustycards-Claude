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
import {
  getExternalSignalRadarPageData,
} from "@/lib/external-signal-persisted";
import type { ExternalSignalRadarData } from "@/lib/external-signal-radar";
import { requirePageUser } from "@/lib/page-auth";
import { getServerUserSettings } from "@/lib/user-settings-server";
import { selectInitialSignalRadarCards } from "@/lib/signal-radar-progressive";
import { readSignalRadarSnapshot } from "@/lib/signal-radar-snapshot-store";
import { startPerformanceTimer, timeAsync } from "@/lib/performance-timing";

export const dynamic = "force-dynamic";

export default async function SignalRadarPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string; set?: string; view?: string }>;
}) {
  const pageTimer = startPerformanceTimer("signal-radar.page");
  const { game, set, view } = await searchParams;
  const requestedQuery = new URLSearchParams();
  if (game) requestedQuery.set(GAME_SEARCH_PARAM, game);
  if (set) requestedQuery.set("set", set);
  if (view) requestedQuery.set("view", view);
  const requestedPath = requestedQuery.size
    ? `/movers/signal-radar?${requestedQuery.toString()}`
    : "/movers/signal-radar";
  const user = await timeAsync("signal-radar.page.auth", () => requirePageUser(requestedPath));
  const settings = await timeAsync(
    "signal-radar.page.settings",
    () => getServerUserSettings(user.id)
  );
  const activeGame = parseVisibleGameFilter(game, {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
  const storedRadar = await timeAsync(
    "signal-radar.page.snapshot",
    () => readSignalRadarSnapshot(activeGame),
    { game: activeGame }
  ).catch((error) => {
    console.error("[signal-radar page snapshot]", error);
    return null;
  });
  const radarData: ExternalSignalRadarData = storedRadar?.data ?? await timeAsync(
    "signal-radar.page.persisted-fallback",
    () => getExternalSignalRadarPageData(activeGame),
    { game: activeGame }
  ).catch((error) => {
    console.error("[signal-radar page persisted fallback]", error);
    return {
      generatedAt: new Date().toISOString(),
      signals: [],
      sources: [],
      unmatchedCount: 0,
      scannedDeckCount: 0,
    };
  });
  // Keep the first render on persisted data only. Full structural/market
  // enrichment is the expensive cold path and already belongs to the
  // progressive feed below; doing it here delayed the shell by ~1.7s just to
  // serialize the opening cards, then repeated the same work in the feed.
  const initialSignals = selectInitialSignalRadarCards(radarData.signals, new Set());

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
  const progressiveQuery = new URLSearchParams();
  if (activeGameValue) progressiveQuery.set(GAME_SEARCH_PARAM, activeGameValue);
  const progressiveHref = `/api/movers/signal-radar/feed${
    progressiveQuery.size ? `?${progressiveQuery.toString()}` : ""
  }`;
  const olderHighRarityHref = "/api/movers/signal-radar/older-high-rarity";
  const chaseQuery = new URLSearchParams(progressiveQuery);
  if (set) chaseQuery.set("set", set);
  const chaseWatchHref = `/api/movers/signal-radar/chase-watch${
    chaseQuery.size ? `?${chaseQuery.toString()}` : ""
  }`;
  pageTimer.finish({
    game: activeGame,
    initialSignals: initialSignals.length,
    totalSignals: radarData.signals.length,
  });

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
              <Link href="/movers/signal-radar/learning" prefetch={false} className="inline-flex items-center gap-2 font-medium transition hover:text-white">Prediction journal <ArrowUpRight className="h-4 w-4" /></Link>
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
          key={`${activeGame}:${set ?? "all"}`}
          signals={initialSignals}
          sources={radarData.sources}
          generatedAt={radarData.generatedAt}
          newReleaseChases={null}
          cardQuickActions={{}}
          progressiveHref={progressiveHref}
          olderHighRarityHref={olderHighRarityHref}
          chaseWatchHref={chaseWatchHref}
          manualChaseRefreshHref={user.role === "admin" ? chaseWatchHref : null}
          totalSignalCount={radarData.signals.length}
          initialOrigin={view === "old-high-rarity" ? "older-high-rarity" : "all"}
        />
      </div>
    </div>
  );
}
