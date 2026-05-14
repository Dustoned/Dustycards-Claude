import Link from "next/link";
import Image from "next/image";
import { Layers3, LibraryBig, Shapes } from "lucide-react";
import {
  HeaderStatCard,
  PageHeroHeader,
  SectionHeader,
  type HeaderStat,
} from "@/components/PageHeader";
import { formatCollectionCurrency } from "@/lib/collection";
import { db } from "@/lib/db";
import {
  ALL_GAMES,
  GAME_FILTER_OPTIONS,
  GAME_SEARCH_PARAM,
  getExpansionHref,
  getGameFilterLabel,
  getGameFilterSearchParamValue,
  ONE_PIECE_GAME,
  POKEMON_GAME,
  parseVisibleGameFilter,
  type TradingCardGameFilter,
} from "@/lib/games";
import { getExpansionTileScale, getFixedTrackGridTemplate } from "@/lib/display-scale";
import { getExpansionCurrentValues } from "@/lib/expansions-overview";
import { getCachedImageUrl } from "@/lib/image-cache";
import {
  getEpisodeDisplayCardCount,
  isHiddenExpansion,
  isPromoExpansion,
  isRedundantSubsetExpansion,
} from "@/lib/episodes";
import { formatReleaseLabel, isFutureReleaseDate } from "@/lib/release-dates";
import { getServerUserSettings } from "@/lib/user-settings-server";
import { requirePageUser } from "@/lib/page-auth";
import ExpansionsOverviewChart from "./ExpansionsOverviewChart";

export const dynamic = "force-dynamic";

const ERA_ORDER = [
  "Mega Evolution",
  "Scarlet & Violet",
  "Sword & Shield",
  "Sun & Moon",
  "XY",
  "Black & White",
  "HeartGold & SoulSilver",
  "Platinum",
  "Diamond & Pearl",
  "EX",
  "E-Card",
  "Legendary Collection",
  "Neo",
  "Gym",
  "Base",
  "Other",
];

const UPCOMING_RELEASE_GROUP = "Upcoming";

function getEra(name: string, series: string | null, releaseDate: string | null): string {
  const normalizedName = name.toLowerCase();

  if (series && !["Other", "NP", "POP"].includes(series)) return series;
  if (series === "NP") return "EX";

  if (series === "POP") {
    if (!releaseDate) return "EX";
    const year = Number.parseInt(releaseDate.slice(0, 4), 10);
    const month = Number.parseInt(releaseDate.slice(5, 7), 10);

    if (year < 2007 || (year === 2007 && month <= 3)) return "EX";
    if (year < 2009 || (year === 2008 && month <= 9)) return "Diamond & Pearl";
    return "Platinum";
  }

  if (!series) {
    if (!releaseDate) return "Other";
    const year = Number.parseInt(releaseDate.slice(0, 4), 10);
    if (year >= 2025) return "Mega Evolution";
    if (year <= 2000) return "Base";
    return "Other";
  }

  if (normalizedName.includes("southern islands")) return "Neo";
  if (normalizedName.includes("legendary collection")) return "Legendary Collection";
  if (normalizedName.includes("best of game")) return "E-Card";
  if (normalizedName.includes("rumble")) return "Platinum";

  if (normalizedName.includes("mcdonald") || normalizedName.includes("futsal")) {
    if (!releaseDate) return "Other";
    const year = Number.parseInt(releaseDate.slice(0, 4), 10);
    if (year <= 2012) return "Black & White";
    if (year <= 2016) return "XY";
    if (year <= 2019) return "Sun & Moon";
    if (year <= 2022) return "Sword & Shield";
    return "Scarlet & Violet";
  }

  return "Other";
}

function shouldReplaceEpisode(existingId: string, nextId: string): boolean {
  const existingNumericId = Number(existingId);
  const nextNumericId = Number(nextId);

  if (Number.isFinite(existingNumericId) && Number.isFinite(nextNumericId)) {
    return nextNumericId < existingNumericId;
  }

  return nextId.localeCompare(existingId, undefined, { numeric: true, sensitivity: "base" }) < 0;
}

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

function GameToggleLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={`shrink-0 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors sm:rounded-xl sm:px-4 sm:text-sm ${
        active
          ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
          : "text-gray-500 hover:text-gray-900 dark:text-white/55 dark:hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
}

function buildGameHref(game: TradingCardGameFilter) {
  if (game === ONE_PIECE_GAME) return "/one-piece/expansions";

  const params = new URLSearchParams();
  const gameValue = getGameFilterSearchParamValue(game);
  if (gameValue) {
    params.set(GAME_SEARCH_PARAM, gameValue);
  }
  const query = params.toString();
  return query ? `/expansions?${query}` : "/expansions";
}

export default async function ExpansionsPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const { game: gameParam } = await searchParams;
  const user = await requirePageUser(
    gameParam ? `/expansions?${GAME_SEARCH_PARAM}=${encodeURIComponent(gameParam)}` : "/expansions"
  );
  const settings = await getServerUserSettings(user.id);
  const activeGame = parseVisibleGameFilter(gameParam, {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
  const tileConfig = getExpansionTileScale(settings.uiScale, settings.widescreen);

  const episodes = await db.episode.findMany({
    where:
      activeGame === ALL_GAMES
        ? { game: { in: [POKEMON_GAME, ONE_PIECE_GAME] } }
        : { game: activeGame },
    orderBy: [{ release_date: "desc" }, { name: "asc" }],
    include: { _count: { select: { cards: true } } },
  });

  const needsSync = episodes.length === 0;

  const deduped = [
    ...episodes
      .reduce((map, episode) => {
        const dedupeKey =
          activeGame === ALL_GAMES ? `${episode.game}:${episode.name}` : episode.name;
        const existing = map.get(dedupeKey);
        if (!existing) {
          map.set(dedupeKey, episode);
          return map;
        }

        const keepNew = episode.logo_url && !existing.logo_url;
        const keepExisting = existing.logo_url && !episode.logo_url;

        if (!keepNew && !keepExisting) {
          if (shouldReplaceEpisode(existing.id, episode.id)) {
            map.set(dedupeKey, episode);
          }
        } else if (keepNew) {
          map.set(dedupeKey, episode);
        }

        return map;
      }, new Map<string, (typeof episodes)[number]>())
      .values(),
  ];

  const newestEra = ERA_ORDER[0];
  const visibleSets = deduped.filter(
    (episode) =>
      !isRedundantSubsetExpansion(episode.name) &&
      !isHiddenExpansion({ id: episode.id, code: episode.code, name: episode.name })
  );
  const withCards = visibleSets.filter((episode) => {
    const cardCount = getEpisodeDisplayCardCount(episode);
    const era = getEra(episode.name, episode.series, episode.release_date);
    return cardCount > 0 || era === newestEra;
  });

  const now = new Date();
  const grouped = new Map<string, typeof episodes>();
  for (const episode of withCards) {
    const era =
      episode.game === ONE_PIECE_GAME
        ? "One Piece"
        : getEra(episode.name, episode.series, episode.release_date);
    const group = isFutureReleaseDate(episode.release_date, now)
      ? UPCOMING_RELEASE_GROUP
      : era;
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push(episode);
  }

  const sortedGroups = [...grouped.entries()]
    .sort(([a], [b]) => {
      if (a === UPCOMING_RELEASE_GROUP) return -1;
      if (b === UPCOMING_RELEASE_GROUP) return 1;
      if (a === "One Piece") return 1;
      if (b === "One Piece") return -1;
      const aIndex = ERA_ORDER.indexOf(a);
      const bIndex = ERA_ORDER.indexOf(b);
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    })
    .map(([era, sets]) => {
      const nonPromos = sets.filter((set) => !isPromoExpansion(set));
      const promos = sets.filter((set) => isPromoExpansion(set));
      return [era, [...nonPromos, ...promos]] as [string, typeof sets];
    });

  const eraCount = sortedGroups.filter(([group]) => group !== UPCOMING_RELEASE_GROUP).length;
  const trackedCardCount = withCards.reduce(
    (total, episode) => total + getEpisodeDisplayCardCount(episode),
    0
  );
  const visibleEpisodeIds = withCards.map((episode) => episode.id);
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
  const headerStats = [
    {
      label: "Sets",
      value: withCards.length.toLocaleString(),
      Icon: Layers3,
      tone: "amber",
    },
    {
      label: "Eras",
      value: eraCount.toLocaleString(),
      Icon: Shapes,
      tone: "emerald",
    },
    {
      label: "Tracked cards",
      value: trackedCardCount.toLocaleString(),
      Icon: LibraryBig,
      tone: "rose",
    },
  ] satisfies HeaderStat[];

  return (
    <div className="page-container mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
      <PageHeroHeader
        eyebrow={activeGame === ONE_PIECE_GAME ? "One Piece Library" : activeGame === ALL_GAMES ? "DustyCards Library" : "Dusty Cards Collection"}
        title={activeGame === ONE_PIECE_GAME ? "One Piece Expansions" : activeGame === ALL_GAMES ? "All Expansions" : "Expansions"}
        description={
          activeGame === ONE_PIECE_GAME
            ? "Browse One Piece sets from TCGGO. Upcoming and newest sets stay at the top, with older releases below."
            : activeGame === ALL_GAMES
            ? "Browse Pokemon and One Piece sets together, or split them with the game switch below."
            : "Browse released sets and upcoming sets. Upcoming sets stay empty until release; cards and prices appear after the next sync."
        }
        gridClassName="xl:grid-cols-[minmax(20rem,0.72fr)_minmax(34rem,1.28fr)] xl:items-stretch 2xl:grid-cols-[minmax(24rem,0.66fr)_minmax(48rem,1.34fr)]"
        sideClassName="xl:space-y-0"
        className="mb-6 max-[640px]:[--ui-page-header-description-size:0.8rem] sm:mb-8"
        accessory={
          <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(28rem,1.35fr)_minmax(12rem,0.65fr)] xl:items-stretch 2xl:grid-cols-[minmax(38rem,1.45fr)_minmax(18rem,0.72fr)]">
            <div className="min-w-0 [&>section]:h-full">
              <ExpansionsOverviewChart
                episodeIds={visibleEpisodeIds}
                initialCurrentValue={overviewCurrentValue}
                initialPricedCardCount={overviewPricedCardCount}
                trackedCardCount={trackedCardCount}
              />
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-1 xl:auto-rows-fr">
              {headerStats.map((stat) => (
                <HeaderStatCard key={stat.label} {...stat} />
              ))}
            </div>
          </div>
        }
      />

      {settings.onePieceLibraryEnabled ? (
        <div className="mb-6 -mx-1 overflow-x-auto pb-1 sm:mx-0 sm:overflow-visible sm:pb-0">
          <div className="inline-flex min-w-max flex-nowrap rounded-2xl border border-black/8 bg-black/3 p-1 dark:border-white/8 dark:bg-white/5">
            {GAME_FILTER_OPTIONS.map((game) => (
              <GameToggleLink
                key={game}
                href={buildGameHref(game)}
                active={activeGame === game}
                label={getGameFilterLabel(game)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {needsSync && (
        <div className="glass mb-10 rounded-2xl p-8 text-center shadow-lg shadow-black/5">
          <p className="mb-1 font-semibold text-gray-900 dark:text-white">No expansions loaded yet</p>
          <p className="text-sm text-gray-400">
            Open Settings and run Sync Expansions to load all Pokemon sets.
          </p>
        </div>
      )}

      <div className="space-y-8 sm:space-y-10">
        {sortedGroups.map(([era, sets], groupIndex) => (
          <section key={era}>
            <SectionHeader title={era} count={sets.length} compact />

            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: getFixedTrackGridTemplate(tileConfig.minWidth),
                justifyContent: "start",
              }}
            >
              {sets.map((episode, index) => {
                const isTimelineGroup = era === UPCOMING_RELEASE_GROUP;
                const localCardCount = episode._count.cards;
                const cardCount = getEpisodeDisplayCardCount(episode);
                const knownCardCount = getKnownEpisodeCardCount(episode);
                const currentValue = currentValueByEpisodeId.get(episode.id) ?? {
                  priced: 0,
                  value: null,
                };
                const releaseYear = episode.release_date?.slice(0, 4) ?? null;
                const releaseLabel = formatReleaseLabel(episode.release_date);
                const isUpcomingRelease = isFutureReleaseDate(episode.release_date);
                const isUpcomingWithoutCards =
                  localCardCount === 0 && isUpcomingRelease;
                const hasKnownUpcomingCount = isUpcomingWithoutCards && knownCardCount > 0;
                const setCode = episode.code?.trim().toUpperCase() ?? null;
                const releaseMeta =
                  isUpcomingRelease && releaseLabel
                    ? `Releases ${releaseLabel}`
                    : isTimelineGroup && releaseLabel
                      ? releaseLabel
                      : releaseYear;
                const metaParts = [setCode, releaseMeta].filter(Boolean);
                const countHint = isUpcomingWithoutCards
                  ? hasKnownUpcomingCount
                    ? `${knownCardCount.toLocaleString(
                        "en-US"
                      )} cards expected; card list appears after release and sync.`
                    : "Card list appears after the official release and sync."
                  : undefined;

                return (
                  <Link
                    key={episode.id}
                    href={getExpansionHref(episode.id)}
                    prefetch={false}
                    title={countHint}
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
                          {episode.name.slice(0, 2)}
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
                                <span className="font-bold tabular-nums">
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
                                  {cardCount > 0 ? cardCount.toLocaleString("en-US") : "--"}
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
    </div>
  );
}
