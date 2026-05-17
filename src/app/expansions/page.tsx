import Link from "next/link";
import Image from "next/image";
import { Layers3, LibraryBig, Shapes } from "lucide-react";
import {
  HeaderStatCard,
  SectionHeader,
  type HeaderStat,
} from "@/components/PageHeader";
import GameFilterSwitch from "@/components/GameFilterSwitch";
import { formatCollectionCurrency } from "@/lib/collection";
import { db } from "@/lib/db";
import { getExpansionHref, POKEMON_GAME } from "@/lib/games";
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

export default async function ExpansionsPage() {
  const user = await requirePageUser("/expansions");
  const settings = await getServerUserSettings(user.id);
  const tileConfig = getExpansionTileScale(settings.uiScale, settings.widescreen);

  const episodes = await db.episode.findMany({
    where: { game: POKEMON_GAME },
    orderBy: [{ release_date: "desc" }, { name: "asc" }],
    include: { _count: { select: { cards: true } } },
  });

  const needsSync = episodes.length === 0;

  const deduped = [
    ...episodes
      .reduce((map, episode) => {
        const dedupeKey = episode.name;
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
    const era = getEra(episode.name, episode.series, episode.release_date);
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
    <div className="page-container mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <section className="relative mb-6 w-full overflow-hidden rounded-[var(--ui-page-header-radius)] border border-black/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.76),rgba(255,255,255,0.52))] p-3 shadow-lg shadow-black/5 dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.032))] dark:shadow-black/20 sm:mb-8 sm:p-4 lg:p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/18" />
        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(19rem,0.82fr)_minmax(0,1.18fr)] xl:grid-cols-[minmax(20rem,0.78fr)_minmax(0,1.08fr)_minmax(20rem,0.72fr)] xl:items-stretch">
          <div className="flex min-h-[var(--ui-dashboard-header-panel-min-height)] min-w-0 flex-col justify-between rounded-[var(--ui-page-header-radius)] border border-black/8 bg-black/[0.018] p-[var(--ui-page-header-padding)] dark:border-white/8 dark:bg-black/10">
            <div className="min-w-0">
              <p className="text-[length:var(--ui-page-header-eyebrow-size)] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-white/42">
                Dusty Cards Collection
              </p>
              <h1 className="mt-2 min-w-0 text-[length:var(--ui-page-header-title-size)] font-bold leading-tight tracking-tight text-gray-950 dark:text-white">
                Expansions
              </h1>
              <p className="mt-3 max-w-md text-[length:var(--ui-page-header-description-size)] leading-[var(--ui-page-header-description-leading)] text-gray-500 dark:text-white/56">
                Browse released sets and upcoming sets. Upcoming sets stay empty until release; cards and prices appear after the next sync.
              </p>
            </div>

            {settings.onePieceLibraryEnabled ? (
              <div className="mt-[var(--ui-page-header-action-margin)]">
                <GameFilterSwitch
                  items={[
                    { href: "/expansions", active: true, label: "Pokemon" },
                    { href: "/one-piece/expansions", active: false, label: "One Piece" },
                  ]}
                  ariaLabel="Expansion library"
                  className="max-w-[21rem]"
                />
              </div>
            ) : null}
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
                justifyContent: "stretch",
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
