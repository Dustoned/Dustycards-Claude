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
    where: { game: ONE_PIECE_GAME },
    orderBy: [{ release_date: "desc" }, { name: "asc" }],
    include: { _count: { select: { cards: true } } },
  });
}

export default async function OnePieceExpansionsPage() {
  const user = await requirePageUser("/one-piece/expansions");
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
      <section className="relative mb-6 w-full overflow-hidden rounded-[var(--ui-page-header-radius)] border border-black/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.76),rgba(255,255,255,0.52))] p-3 shadow-lg shadow-black/5 dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.032))] dark:shadow-black/20 sm:mb-8 sm:p-4 lg:p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/18" />
        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(19rem,0.82fr)_minmax(0,1.18fr)] xl:grid-cols-[minmax(20rem,0.78fr)_minmax(0,1.08fr)_minmax(20rem,0.72fr)] xl:items-stretch">
          <div className="flex min-h-[var(--ui-dashboard-header-panel-min-height)] min-w-0 flex-col justify-between rounded-[var(--ui-page-header-radius)] border border-black/8 bg-black/[0.018] p-[var(--ui-page-header-padding)] dark:border-white/8 dark:bg-black/10">
            <div className="min-w-0">
              <p className="text-[length:var(--ui-page-header-eyebrow-size)] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-white/42">
                One Piece Library
              </p>
              <h1 className="mt-2 min-w-0 text-[length:var(--ui-page-header-title-size)] font-bold leading-tight tracking-tight text-gray-950 dark:text-white">
                One Piece Expansions
              </h1>
              <p className="mt-3 max-w-md text-[length:var(--ui-page-header-description-size)] leading-[var(--ui-page-header-description-leading)] text-gray-500 dark:text-white/56">
                Browse One Piece sets from TCGGO. Upcoming and newest sets stay at the top, with older releases below.
              </p>
            </div>

            <div className="mt-[var(--ui-page-header-action-margin)]">
              <GameFilterSwitch
                items={[
                  { href: "/expansions", active: false, label: "Pokemon" },
                  { href: "/one-piece/expansions", active: true, label: "One Piece" },
                ]}
                ariaLabel="Expansion library"
                className="max-w-[21rem]"
              />
            </div>
          </div>

          <div className="min-w-0 lg:min-h-[var(--ui-dashboard-header-panel-min-height)] [&>section]:h-full">
            <ExpansionsOverviewChart
              episodeIds={visibleEpisodeIds}
              initialCurrentValue={overviewCurrentValue}
              initialPricedCardCount={overviewPricedCardCount}
              trackedCardCount={trackedCardCount}
            />
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-2 lg:col-span-2 xl:col-span-1 xl:auto-rows-fr">
            {headerStats.map((stat) => (
              <HeaderStatCard key={stat.label} {...stat} />
            ))}
          </div>
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
