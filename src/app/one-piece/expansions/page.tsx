import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Layers3, LibraryBig } from "lucide-react";
import {
  HeaderStatCard,
  SectionHeader,
  type HeaderStat,
} from "@/components/PageHeader";
import GameFilterSwitch from "@/components/GameFilterSwitch";
import { formatCollectionCurrency } from "@/lib/collection";
import { db } from "@/lib/db";
import { getExpansionTileScale, getFixedTrackGridTemplate } from "@/lib/display-scale";
import { getExpansionCurrentValues } from "@/lib/expansions-overview";
import { getExpansionHref, ONE_PIECE_GAME } from "@/lib/games";
import { getCachedImageUrl } from "@/lib/image-cache";
import { getEpisodeDisplayCardCount } from "@/lib/episodes";
import { requirePageUser } from "@/lib/page-auth";
import { formatReleaseLabel, isFutureReleaseDate } from "@/lib/release-dates";
import { getServerUserSettings } from "@/lib/user-settings-server";
import ExpansionsOverviewChart from "@/app/expansions/ExpansionsOverviewChart";
import SyncExpansionButton from "@/app/expansions/SyncExpansionButton";

export const dynamic = "force-dynamic";

function getKnownEpisodeCardCount(input: {
  card_count?: number | null;
  source_actual_card_count?: number | null;
  _count?: { cards: number } | null;
}): number {
  return Math.max(
    input._count?.cards ?? 0,
    input.card_count ?? 0,
    input.source_actual_card_count ?? 0
  );
}

function getTimelineGroup(releaseDate: string | null): string {
  if (!releaseDate || isFutureReleaseDate(releaseDate)) return "Upcoming / New";
  return releaseDate.slice(0, 4);
}

function sortTimelineGroups(groups: Array<[string, OnePieceEpisode[]]>) {
  return groups.sort(([a], [b]) => {
    if (a === "Upcoming / New") return -1;
    if (b === "Upcoming / New") return 1;
    return Number(b) - Number(a);
  });
}

type OnePieceEpisode = Awaited<ReturnType<typeof getOnePieceEpisodes>>[number];

async function getOnePieceEpisodes() {
  return db.episode.findMany({
    where: { game: ONE_PIECE_GAME, is_user_submitted: false },
    orderBy: [{ release_date: "desc" }, { name: "asc" }],
    include: { _count: { select: { cards: true } } },
  });
}

export default async function OnePieceExpansionsPage() {
  const user = await requirePageUser("/one-piece/expansions");
  const isAdmin = user.role === "admin";
  const settings = await getServerUserSettings(user.id);
  if (!settings.onePieceLibraryEnabled) {
    notFound();
  }

  const tileConfig = getExpansionTileScale(settings.uiScale, settings.widescreen);
  const episodes = await getOnePieceEpisodes();
  const visibleSets = episodes.filter(
    (episode) =>
      getKnownEpisodeCardCount(episode) > 0 || isFutureReleaseDate(episode.release_date)
  );
  const visibleEpisodeIds = visibleSets.map((episode) => episode.id);
  const currentValueRows = await getExpansionCurrentValues(visibleEpisodeIds);
  const currentValueByEpisodeId = new Map(
    currentValueRows.map((row) => [
      row.episode_id,
      {
        priced: Number(row.priced_cards ?? 0),
        value: row.total_market == null ? null : Number(row.total_market),
      },
    ])
  );
  const grouped = new Map<string, OnePieceEpisode[]>();

  for (const episode of visibleSets) {
    const group = getTimelineGroup(episode.release_date);
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push(episode);
  }

  const sortedGroups = sortTimelineGroups([...grouped.entries()]);
  const trackedCardCount = visibleSets.reduce(
    (total, episode) => total + getEpisodeDisplayCardCount(episode),
    0
  );
  const overviewCurrentValueTotal = currentValueRows.reduce(
    (total, row) => total + Number(row.total_market ?? 0),
    0
  );
  const overviewPricedCardCount = currentValueRows.reduce(
    (total, row) => total + Number(row.priced_cards ?? 0),
    0
  );
  const overviewCurrentValue =
    overviewPricedCardCount > 0 ? Number(overviewCurrentValueTotal.toFixed(2)) : null;
  const latestRelease = visibleSets[0]?.release_date
    ? formatReleaseLabel(visibleSets[0].release_date)
    : "--";
  const headerStats = [
    {
      label: "Sets",
      value: visibleSets.length.toLocaleString("en-US"),
      Icon: Layers3,
      tone: "amber",
    },
    {
      label: "Cards",
      value: trackedCardCount.toLocaleString("en-US"),
      Icon: LibraryBig,
      tone: "emerald",
    },
    {
      label: "Latest",
      value: latestRelease ?? "--",
      Icon: CalendarDays,
      tone: "sky",
    },
  ] satisfies HeaderStat[];

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-4 flex min-w-0 flex-col gap-3 sm:mb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="min-w-0 text-[length:var(--ui-page-header-title-size)] font-bold leading-tight tracking-tight text-white">
            One Piece Expansions
          </h1>
          <p className="mt-1 max-w-md text-[length:var(--ui-page-header-description-size)] leading-[var(--ui-page-header-description-leading)] text-white/52">
            Browse One Piece sets from TCGGO. Newest releases at the top, older below.
          </p>
        </div>

        <div className="shrink-0 sm:ml-auto">
          <GameFilterSwitch
            items={[
              { href: "/expansions", active: false, label: "Pokemon" },
              { href: "/one-piece/expansions", active: true, label: "One Piece" },
              { href: "/expansions?view=user", active: false, label: "User" },
            ]}
            ariaLabel="Expansion library"
            className="max-w-[28rem]"
          />
        </div>
      </div>

      <section className="mb-4 grid min-w-0 gap-3 sm:mb-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-stretch">
        <div className="binder-panel relative flex w-full min-w-0 flex-col overflow-hidden rounded-[var(--ui-page-header-radius)] p-3 sm:p-4 lg:p-5">
          <div className="min-w-0 flex-1 [&>section]:h-full [&>section]:w-full">
            <ExpansionsOverviewChart
              episodeIds={visibleEpisodeIds}
              initialCurrentValue={overviewCurrentValue}
              initialPricedCardCount={overviewPricedCardCount}
              trackedCardCount={trackedCardCount}
            />
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 xl:grid-rows-2 xl:gap-3">
          {headerStats.map((stat) => (
            <HeaderStatCard key={stat.label} {...stat} />
          ))}
        </div>
      </section>

      {visibleSets.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center shadow-lg shadow-black/5">
          <p className="mb-1 font-semibold text-gray-900 dark:text-white">No One Piece sets loaded yet</p>
          <p className="text-sm text-gray-400">
            Run the local One Piece import script to load expansions and cards from TCGGO.
          </p>
        </div>
      ) : (
        <div className="space-y-8 sm:space-y-10">
          {sortedGroups.map(([group, sets], groupIndex) => (
            <section key={group}>
              <SectionHeader title={group} count={sets.length} compact />

              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: getFixedTrackGridTemplate(tileConfig.minWidth),
                  justifyContent: "stretch",
                }}
              >
                {sets.map((episode, index) => {
                  const localCardCount = episode._count.cards;
                  const cardCount = getEpisodeDisplayCardCount(episode);
                  const knownCardCount = getKnownEpisodeCardCount(episode);
                  const currentValue = currentValueByEpisodeId.get(episode.id) ?? {
                    priced: 0,
                    value: null,
                  };
                  const releaseLabel = formatReleaseLabel(episode.release_date);
                  const isUpcomingWithoutCards =
                    localCardCount === 0 && isFutureReleaseDate(episode.release_date);
                  const hasKnownUpcomingCount = isUpcomingWithoutCards && knownCardCount > 0;
                  const setCode = episode.code?.trim().toUpperCase() ?? null;
                  const metaParts = [setCode, releaseLabel].filter(Boolean);

                  return (
                    <Link
                      key={episode.id}
                      href={getExpansionHref(episode.id)}
                      prefetch={false}
                      className={`group glass relative flex flex-col overflow-hidden text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/8 hover:shadow-xl hover:shadow-black/8 active:scale-[0.98] dark:hover:bg-white/6 dark:hover:shadow-black/35 max-[640px]:gap-2.5 max-[640px]:rounded-2xl max-[640px]:p-3 ${tileConfig.tileClass}`}
                    >
                      {isAdmin ? (
                        <SyncExpansionButton episodeId={episode.id} expansionName={episode.name} />
                      ) : null}
                      {episode.logo_url ? (
                        <div
                          className={`relative flex w-full items-center justify-center rounded-xl border border-black/6 bg-black/[0.025] p-2 dark:border-white/7 dark:bg-white/[0.035] max-[640px]:h-16 ${tileConfig.logoHeightClass}`}
                        >
                          <Image
                            src={getCachedImageUrl(episode.logo_url) ?? episode.logo_url}
                            alt={episode.name}
                            fill
                            className="object-contain p-2 drop-shadow-[0_8px_14px_rgba(0,0,0,0.24)] transition-transform duration-200 group-hover:scale-[1.04]"
                            sizes={tileConfig.minWidth}
                            priority={groupIndex === 0 && index < 6}
                            unoptimized
                          />
                        </div>
                      ) : (
                        <div
                          className={`w-full rounded-xl bg-black/5 dark:bg-white/4 max-[640px]:h-16 ${tileConfig.fallbackHeightClass} flex items-center justify-center`}
                        >
                          <span className="text-xs font-medium text-gray-400 dark:text-white/40">
                            {episode.code ?? episode.name.slice(0, 2)}
                          </span>
                        </div>
                      )}

                      <div className="min-w-0">
                        <p
                          className={`line-clamp-2 font-bold leading-snug text-gray-900 transition-colors group-hover:text-black dark:text-white dark:group-hover:text-white max-[640px]:text-[15px] ${tileConfig.titleClass}`}
                        >
                          {episode.name}
                        </p>
                        <div className="mt-2 grid min-w-0 gap-2 sm:flex sm:items-end sm:justify-between sm:gap-3">
                          <div className="min-w-0">
                            <p
                              className={`truncate font-semibold text-gray-500 dark:text-white/48 max-[640px]:text-[11px] ${tileConfig.metaClass}`}
                            >
                              {metaParts.length > 0 ? metaParts.join(" / ") : "Expansion"}
                            </p>
                            <p
                              className={`mt-2 inline-flex max-w-full items-baseline gap-1.5 rounded-full border px-2 py-1 font-semibold max-[640px]:mt-1.5 max-[640px]:text-[11px] ${
                                isUpcomingWithoutCards
                                  ? "border-sky-300/22 bg-sky-300/10 text-sky-700 dark:text-sky-200"
                                  : "border-black/7 bg-black/[0.035] text-gray-600 dark:border-white/8 dark:bg-white/[0.055] dark:text-white/68"
                              } ${tileConfig.metaClass}`}
                            >
                              {isUpcomingWithoutCards ? (
                                <>
                                  <span className="font-bold text-gray-900 tabular-nums dark:text-white">
                                    {hasKnownUpcomingCount
                                      ? knownCardCount.toLocaleString("en-US")
                                      : "Upcoming"}
                                  </span>
                                  <span>
                                    {hasKnownUpcomingCount ? "expected cards" : "cards after release"}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="font-bold text-gray-900 tabular-nums dark:text-white">
                                    {cardCount.toLocaleString("en-US")}
                                  </span>
                                  <span>cards</span>
                                </>
                              )}
                            </p>
                          </div>
                          <div className="min-w-0 text-left sm:shrink-0 sm:text-right">
                            <p
                              className={`font-semibold uppercase tracking-[0.14em] text-emerald-600/70 dark:text-emerald-200/52 max-[640px]:text-[10px] ${tileConfig.metaClass}`}
                            >
                              Value
                            </p>
                            <p
                              className={`mt-0.5 min-w-0 truncate font-bold leading-tight text-emerald-700 tabular-nums dark:text-emerald-100 max-[640px]:text-[16px] ${tileConfig.valueClass}`}
                            >
                              {formatCollectionCurrency(currentValue.value)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
