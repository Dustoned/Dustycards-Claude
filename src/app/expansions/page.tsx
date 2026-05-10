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

export default async function ExpansionsPage() {
  const user = await requirePageUser("/expansions");
  const settings = await getServerUserSettings(user.id);
  const tileConfig = getExpansionTileScale(settings.uiScale, settings.widescreen);

  const episodes = await db.episode.findMany({
    orderBy: [{ release_date: "desc" }, { name: "asc" }],
    include: { _count: { select: { cards: true } } },
  });

  const needsSync = episodes.length === 0;

  const deduped = [
    ...episodes
      .reduce((map, episode) => {
        const existing = map.get(episode.name);
        if (!existing) {
          map.set(episode.name, episode);
          return map;
        }

        const keepNew = episode.logo_url && !existing.logo_url;
        const keepExisting = existing.logo_url && !episode.logo_url;

        if (!keepNew && !keepExisting) {
          if (shouldReplaceEpisode(existing.id, episode.id)) {
            map.set(episode.name, episode);
          }
        } else if (keepNew) {
          map.set(episode.name, episode);
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

  const grouped = new Map<string, typeof episodes>();
  for (const episode of withCards) {
    const era = getEra(episode.name, episode.series, episode.release_date);
    if (!grouped.has(era)) grouped.set(era, []);
    grouped.get(era)!.push(episode);
  }

  const sortedGroups = [...grouped.entries()]
    .sort(([a], [b]) => {
      const aIndex = ERA_ORDER.indexOf(a);
      const bIndex = ERA_ORDER.indexOf(b);
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    })
    .map(([era, sets]) => {
      const nonPromos = sets.filter((set) => !isPromoExpansion(set));
      const promos = sets.filter((set) => isPromoExpansion(set));
      return [era, [...nonPromos, ...promos]] as [string, typeof sets];
    });

  const eraCount = sortedGroups.length;
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
        eyebrow="Dusty Cards Collection"
        title="Expansions"
        description="Browse released sets and upcoming sets. Upcoming sets stay empty until release; cards and prices appear after the next sync."
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
                const cardCount = getEpisodeDisplayCardCount(episode);
                const currentValue = currentValueByEpisodeId.get(episode.id) ?? {
                  priced: 0,
                  value: null,
                };
                const releaseYear = episode.release_date?.slice(0, 4) ?? null;
                const releaseLabel = formatReleaseLabel(episode.release_date);
                const isUpcomingEmptySet =
                  cardCount === 0 && isFutureReleaseDate(episode.release_date);
                const setCode = episode.code?.trim().toUpperCase() ?? null;
                const releaseMeta =
                  isUpcomingEmptySet && releaseLabel ? `Releases ${releaseLabel}` : releaseYear;
                const metaParts = [setCode, releaseMeta].filter(Boolean);

                return (
                  <Link
                    key={episode.id}
                    href={`/expansions/${episode.id}`}
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
                              isUpcomingEmptySet
                                ? "border-sky-300/22 bg-sky-300/10 text-sky-700 dark:text-sky-200"
                                : "border-black/7 bg-black/[0.035] text-gray-600 dark:border-white/8 dark:bg-white/[0.055] dark:text-white/68"
                            } ${tileConfig.metaClass}`}
                          >
                            {isUpcomingEmptySet ? (
                              <>
                                <span className="font-bold tabular-nums">Upcoming</span>
                                <span>cards after release</span>
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
