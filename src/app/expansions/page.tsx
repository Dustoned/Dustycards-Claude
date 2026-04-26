import { cookies } from "next/headers";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Layers3, LibraryBig, Shapes } from "lucide-react";
import { db } from "@/lib/db";
import { getExpansionTileScale, getFixedTrackGridTemplate } from "@/lib/display-scale";
import {
  getEpisodeDisplayCardCount,
  isHiddenExpansion,
  isPromoExpansion,
  isRedundantSubsetExpansion,
} from "@/lib/episodes";
import {
  DEFAULT_SETTINGS,
  parseCookieSettings,
  SETTINGS_COOKIE_NAME,
} from "@/lib/user-settings";

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
  const cookieStore = await cookies();
  const settings =
    parseCookieSettings(cookieStore.get(SETTINGS_COOKIE_NAME)?.value) ?? DEFAULT_SETTINGS;
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

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="relative mb-10 overflow-hidden rounded-[28px] border border-black/8 bg-black/[0.03] px-5 py-6 shadow-lg shadow-black/5 dark:border-white/8 dark:bg-white/[0.04] sm:px-6 sm:py-7">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.03),transparent_38%,rgba(255,255,255,0.02))]" />

        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-400 dark:text-white/35">
              Dusty Cards Collection
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
              Expansions
            </h1>
            <p className="mt-2 max-w-xl text-sm text-gray-500 dark:text-white/50">
              {withCards.length} sets across {eraCount} eras, with {trackedCardCount.toLocaleString()} tracked cards.
            </p>
            <Link
              href="/settings"
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-white/55 dark:hover:text-white"
            >
              Refresh tools in Settings
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[32rem]">
            {[
              {
                label: "Sets",
                value: withCards.length.toLocaleString(),
                Icon: Layers3,
                iconClass: "text-amber-500 dark:text-amber-300",
              },
              {
                label: "Eras",
                value: eraCount.toLocaleString(),
                Icon: Shapes,
                iconClass: "text-emerald-500 dark:text-emerald-300",
              },
              {
                label: "Tracked cards",
                value: trackedCardCount.toLocaleString(),
                Icon: LibraryBig,
                iconClass: "text-rose-500 dark:text-rose-300",
              },
            ].map(({ label, value, Icon, iconClass }) => (
              <div
                key={label}
                className="rounded-2xl border border-black/8 bg-black/[0.03] px-4 py-4 dark:border-white/8 dark:bg-white/[0.03]"
              >
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${iconClass}`} />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400 dark:text-white/35">
                    {label}
                  </span>
                </div>
                <p className="mt-3 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {needsSync && (
        <div className="glass mb-10 rounded-2xl p-8 text-center shadow-lg shadow-black/5">
          <p className="mb-1 font-semibold text-gray-900 dark:text-white">No expansions loaded yet</p>
          <p className="text-sm text-gray-400">
            Open Settings and run Sync Expansions to load all Pokemon sets.
          </p>
        </div>
      )}

      <div className="space-y-12">
        {sortedGroups.map(([era, sets], groupIndex) => (
          <section key={era}>
            <div className="mb-5 flex items-center gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-white/40">
                {era}
              </h2>
              <span className="rounded-full bg-black/6 px-2 py-0.5 text-xs text-gray-400 dark:bg-white/6 dark:text-white/40">
                {sets.length}
              </span>
              <div className="h-px flex-1 bg-black/8 dark:bg-white/10" />
            </div>

            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: getFixedTrackGridTemplate(tileConfig.minWidth),
                justifyContent: "start",
              }}
            >
              {sets.map((episode, index) => {
                const cardCount = getEpisodeDisplayCardCount(episode);

                return (
                  <Link
                    key={episode.id}
                    href={`/expansions/${episode.id}`}
                    className={`group glass flex flex-col items-center transition-all duration-200 hover:scale-[1.03] hover:bg-white/8 active:scale-[0.98] dark:hover:bg-white/6 ${tileConfig.tileClass}`}
                  >
                    {episode.logo_url ? (
                      <div className={`relative w-full ${tileConfig.logoHeightClass}`}>
                        <Image
                          src={episode.logo_url}
                          alt={episode.name}
                          fill
                          className="object-contain drop-shadow-sm"
                          sizes={tileConfig.minWidth}
                          priority={groupIndex === 0 && index < 6}
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div
                        className={`w-full rounded-xl bg-black/5 dark:bg-white/4 ${tileConfig.fallbackHeightClass} flex items-center justify-center`}
                      >
                        <span className="text-xs font-medium text-gray-400 dark:text-white/40">
                          {episode.name.slice(0, 2)}
                        </span>
                      </div>
                    )}

                    <div className="text-center">
                      <p
                        className={`line-clamp-2 font-semibold leading-snug text-gray-800 transition-colors group-hover:text-black dark:text-white dark:group-hover:text-white ${tileConfig.titleClass}`}
                      >
                        {episode.name}
                      </p>
                      {episode.release_date && (
                        <p className={`mt-0.5 text-gray-400 dark:text-white/40 ${tileConfig.metaClass}`}>
                          {episode.release_date.slice(0, 4)}
                        </p>
                      )}
                      <p className={`mt-0.5 text-gray-300 dark:text-white/20 ${tileConfig.metaClass}`}>
                        {cardCount > 0 ? `${cardCount} cards` : "--"}
                      </p>
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
