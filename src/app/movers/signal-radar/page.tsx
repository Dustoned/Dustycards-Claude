import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Clock3,
  Database,
  Radar,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import BackNavigationLink from "@/components/BackNavigationLink";
import GameFilterSwitch from "@/components/GameFilterSwitch";
import {
  HeaderAction,
  HeaderPill,
  PageHeroHeader,
  type HeaderStat,
} from "@/components/PageHeader";
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
import {
  getPersistedExternalSignalRadarData,
  mergeExternalSignalRadarWithFallback,
} from "@/lib/external-signal-persisted";
import { requirePageUser } from "@/lib/page-auth";
import { getServerUserSettings } from "@/lib/user-settings-server";

export const dynamic = "force-dynamic";

const POKEMON_REPRINT_SOURCE =
  "https://support.pokemon.com/hc/en-us/articles/360056644571-Update-on-Pok%C3%A9mon-Trading-Card-Game-Product-Availability";
const ONE_PIECE_NEWS_SOURCE = "https://en.onepiece-cardgame.com/topics/";

export default async function SignalRadarPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const { game } = await searchParams;
  const requestedPath = game
    ? `/movers/signal-radar?${GAME_SEARCH_PARAM}=${encodeURIComponent(game)}`
    : "/movers/signal-radar";
  const user = await requirePageUser(requestedPath);
  const settings = await getServerUserSettings(user.id);
  const activeGame = parseVisibleGameFilter(game, {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
  const [liveData, persistedData] = await Promise.all([
    getExternalSignalRadarData(activeGame),
    getPersistedExternalSignalRadarData(activeGame),
  ]);
  const data = await enrichExternalSignalRadarData(
    mergeExternalSignalRadarWithFallback(liveData, persistedData, activeGame)
  );
  const highConfidenceCount = data.signals.filter(
    (signal) => signal.confidence === "High"
  ).length;
  const eventDrivenCount = data.signals.filter(
    (signal) => signal.sourceMode === "event" || signal.sourceMode === "hybrid"
  ).length;
  const structuralCount = data.signals.filter(
    (signal) => signal.sourceMode === "structural"
  ).length;
  const healthySourceCount = data.sources.filter((source) => source.ok).length;
  const updatedLabel = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(data.generatedAt));

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

  const stats = [
    {
      label: "Candidates",
      value: data.signals.length.toLocaleString("en-US"),
      hint: "Locally matched cards",
      Icon: Radar,
      tone: "violet",
    },
    {
      label: "Scarcity Setups",
      value: structuralCount.toLocaleString("en-US"),
      hint: `${highConfidenceCount} high-confidence signals`,
      Icon: ShieldCheck,
      tone: "emerald",
    },
    {
      label: "Event-linked",
      value: eventDrivenCount.toLocaleString("en-US"),
      hint: "Set, reveal or product evidence",
      Icon: Sparkles,
      tone: "amber",
    },
    {
      label: "Sources Live",
      value: `${healthySourceCount}/${data.sources.length}`,
      hint: `Shared cache updated ${updatedLabel}`,
      Icon: Database,
      tone: healthySourceCount === data.sources.length ? "sky" : "rose",
    },
  ] satisfies HeaderStat[];

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex w-full flex-col gap-6 sm:gap-8">
        <PageHeroHeader
          eyebrow="External market intelligence"
          title="Signal Radar"
          description="Cards that may attract more demand through tournament adoption, fresh set and product events, or structural scarcity. Sealed prices, pull difficulty, market depth, artist demand and graded value now shape separate raw and graded opportunity views."
          stats={stats}
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
          actions={
            <HeaderAction className="items-stretch justify-between">
              {settings.onePieceLibraryEnabled ? (
                <GameFilterSwitch
                  items={gameSwitchItems}
                  ariaLabel="Signal Radar game"
                  className="min-w-[16rem] max-w-[21rem]"
                />
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <HeaderPill tone="violet">
                  <Sparkles className="h-3.5 w-3.5" />
                  External ranking
                </HeaderPill>
                <HeaderPill tone="slate">
                  <Clock3 className="h-3.5 w-3.5" />
                  6h competitive scan
                </HeaderPill>
                <HeaderPill tone="slate">
                  <Clock3 className="h-3.5 w-3.5" />
                  Daily set & event scan
                </HeaderPill>
              </div>
            </HeaderAction>
          }
        />

        <section className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
          <div className="relative overflow-hidden rounded-[1.5rem] border border-violet-300/14 bg-[radial-gradient(circle_at_top_left,rgba(124,92,255,0.13),transparent_48%),rgba(255,255,255,0.028)] p-4 sm:p-5">
            <div className="flex gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-violet-300/18 bg-violet-400/[0.09] text-violet-200">
                <Radar className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-bold text-white">How a card enters the radar</h2>
                <p className="mt-1 text-xs leading-5 text-white/48">
                  A card can enter through tournament demand, a trusted set event, or a structural scarcity setup. Older sets, expensive packs, difficult pulls, thin raw supply and strong graded premiums can now surface cards even without current news.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.11em] text-white/50">
                  <span className="rounded-full border border-white/8 bg-black/18 px-2.5 py-1.5">Meta share</span>
                  <span className="rounded-full border border-white/8 bg-black/18 px-2.5 py-1.5">Core inclusion</span>
                  <span className="rounded-full border border-white/8 bg-black/18 px-2.5 py-1.5">Set & booklet leaks</span>
                  <span className="rounded-full border border-white/8 bg-black/18 px-2.5 py-1.5">Japan → English</span>
                  <span className="rounded-full border border-white/8 bg-black/18 px-2.5 py-1.5">Sealed pressure</span>
                  <span className="rounded-full border border-white/8 bg-black/18 px-2.5 py-1.5">Raw / graded</span>
                  <span className="rounded-full border border-white/8 bg-black/18 px-2.5 py-1.5">Bulk noise suppressed</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-amber-300/12 bg-amber-400/[0.035] p-4 sm:p-5">
            <div className="flex gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-300/16 bg-amber-400/[0.08] text-amber-200">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-bold text-white">Catalyst risk still matters</h2>
                <p className="mt-1 text-xs leading-5 text-white/48">
                  Reprints, bans, rotation and fresh product supply can invalidate a strong tournament signal. Check official updates before treating any scenario as actionable.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={POKEMON_REPRINT_SOURCE}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/9 bg-black/18 px-2.5 py-1.5 text-[10px] font-semibold text-white/56 transition hover:text-white"
                  >
                    Pokemon supply updates <ArrowUpRight className="h-3 w-3" />
                  </Link>
                  <Link
                    href={ONE_PIECE_NEWS_SOURCE}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/9 bg-black/18 px-2.5 py-1.5 text-[10px] font-semibold text-white/56 transition hover:text-white"
                  >
                    One Piece official topics <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <ExternalSignalBrowser
          signals={data.signals}
          sources={data.sources}
          generatedAt={data.generatedAt}
        />
      </div>
    </div>
  );
}
