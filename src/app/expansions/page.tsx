import { cookies } from "next/headers";
import Link from "next/link";
import Image from "next/image";
import nextDynamic from "next/dynamic";
import { ArrowUpRight, Layers3, LibraryBig, Shapes } from "lucide-react";
import {
  HeaderAction,
  HeaderStatCard,
  PageHeroHeader,
  SectionHeader,
  type HeaderStat,
} from "@/components/PageHeader";
import { formatCollectionCurrency } from "@/lib/collection";
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

const PriceHistoryPanel = nextDynamic(() => import("@/components/PriceHistoryPanel"), {
  loading: () => (
    <section className="h-full rounded-[28px] border border-black/8 bg-black/[0.03] dark:border-white/8 dark:bg-white/[0.04]" />
  ),
});

const DAY_MS = 24 * 60 * 60 * 1000;
const OVERVIEW_HISTORY_DAYS = 365;

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

interface ExpansionsOverviewHistoryRow {
  date: string;
  total_market: number | null;
  priced_cards: number | null;
}

interface ExpansionCurrentValueRow {
  episode_id: string;
  total_market: number | null;
  priced_cards: number | bigint | null;
}

function toDateLabel(dateKey: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${dateKey}T00:00:00.000Z`));
}

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

function placeholdersFor(values: unknown[]): string {
  return values.map(() => "?").join(", ");
}

async function getExpansionsOverviewHistory(episodeIds: string[]) {
  if (episodeIds.length === 0) {
    return [];
  }

  const cutoff = new Date(Date.now() - OVERVIEW_HISTORY_DAYS * DAY_MS).toISOString();
  const episodePlaceholders = placeholdersFor(episodeIds);

  return db.$queryRawUnsafe<ExpansionsOverviewHistoryRow[]>(
    `
    WITH visible_cards AS (
      SELECT c.id AS card_id
      FROM "Card" c
      WHERE c.episode_id IN (${episodePlaceholders})
    ),
    latest_before AS (
      SELECT
        card_id,
        DATE(?) AS day,
        0 AS sort_order,
        cm_market
      FROM (
        SELECT
          p.card_id,
          COALESCE(
            p.cm_en_lowest_nm,
            p.cm_de_lowest_nm,
            p.cm_fr_lowest_nm,
            p.cm_es_lowest_nm,
            p.cm_it_lowest_nm
          ) AS cm_market,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS row_num
        FROM "Price" p
        INNER JOIN visible_cards vc ON vc.card_id = p.card_id
        WHERE p.fetched_at < ?
      )
      WHERE row_num = 1
    ),
    recent_daily AS (
      SELECT
        card_id,
        DATE(fetched_at) AS day,
        1 AS sort_order,
        cm_market
      FROM (
        SELECT
          p.card_id,
          p.fetched_at,
          COALESCE(
            p.cm_en_lowest_nm,
            p.cm_de_lowest_nm,
            p.cm_fr_lowest_nm,
            p.cm_es_lowest_nm,
            p.cm_it_lowest_nm
          ) AS cm_market,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id, DATE(p.fetched_at)
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS row_num
        FROM "Price" p
        INNER JOIN visible_cards vc ON vc.card_id = p.card_id
        WHERE p.fetched_at >= ?
      )
      WHERE row_num = 1
    ),
    points AS (
      SELECT * FROM latest_before
      UNION ALL
      SELECT * FROM recent_daily
    ),
    deduped AS (
      SELECT card_id, day, cm_market
      FROM (
        SELECT
          card_id,
          day,
          cm_market,
          ROW_NUMBER() OVER (
            PARTITION BY card_id, day
            ORDER BY sort_order DESC
          ) AS row_num
        FROM points
      )
      WHERE row_num = 1
    ),
    changes AS (
      SELECT
        day,
        COALESCE(cm_market, 0) - COALESCE(
          LAG(cm_market) OVER (PARTITION BY card_id ORDER BY day),
          0
        ) AS value_delta,
        CASE WHEN cm_market IS NOT NULL THEN 1 ELSE 0 END - COALESCE(
          LAG(CASE WHEN cm_market IS NOT NULL THEN 1 ELSE 0 END) OVER (
            PARTITION BY card_id ORDER BY day
          ),
          0
        ) AS priced_delta
      FROM deduped
    ),
    daily_changes AS (
      SELECT
        day,
        SUM(value_delta) AS value_delta,
        SUM(priced_delta) AS priced_delta
      FROM changes
      GROUP BY day
    )
    SELECT
      day AS date,
      ROUND(
        SUM(value_delta) OVER (
          ORDER BY day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ),
        2
      ) AS total_market,
      SUM(priced_delta) OVER (
        ORDER BY day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS priced_cards
    FROM daily_changes
    ORDER BY day ASC
  `,
    ...episodeIds,
    cutoff,
    cutoff,
    cutoff
  );
}

async function getExpansionCurrentValues(episodeIds: string[]) {
  if (episodeIds.length === 0) {
    return [];
  }

  return db.$queryRawUnsafe<ExpansionCurrentValueRow[]>(
    `
    WITH latest_card_prices AS (
      SELECT
        episode_id,
        card_id,
        cm_market
      FROM (
        SELECT
          c.episode_id,
          p.card_id,
          COALESCE(
            p.cm_en_lowest_nm,
            p.cm_de_lowest_nm,
            p.cm_fr_lowest_nm,
            p.cm_es_lowest_nm,
            p.cm_it_lowest_nm
          ) AS cm_market,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS row_num
        FROM "Price" p
        INNER JOIN "Card" c ON c.id = p.card_id
        WHERE c.episode_id IN (${placeholdersFor(episodeIds)})
      )
      WHERE row_num = 1 AND cm_market IS NOT NULL
    )
    SELECT
      episode_id,
      ROUND(SUM(cm_market), 2) AS total_market,
      COUNT(*) AS priced_cards
    FROM latest_card_prices
    GROUP BY episode_id
  `,
    ...episodeIds
  );
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
  const visibleEpisodeIds = withCards.map((episode) => episode.id);
  const [overviewHistoryRows, currentValueRows] = await Promise.all([
    getExpansionsOverviewHistory(visibleEpisodeIds),
    getExpansionCurrentValues(visibleEpisodeIds),
  ]);
  const currentValueByEpisodeId = new Map(
    currentValueRows.map((row) => [
      row.episode_id,
      {
        priced: Number(row.priced_cards ?? 0),
        value: row.total_market == null ? null : Number(row.total_market),
      },
    ])
  );
  const latestOverviewHistoryRow = overviewHistoryRows[overviewHistoryRows.length - 1] ?? null;
  const overviewHistoryPoints = overviewHistoryRows.map((point) => ({
    date: point.date,
    label: toDateLabel(point.date),
    value: point.total_market == null ? null : Number(point.total_market),
  }));
  const overviewCurrentValue =
    latestOverviewHistoryRow?.total_market == null
      ? null
      : Number(latestOverviewHistoryRow.total_market);
  const overviewPricedCardCount = Number(latestOverviewHistoryRow?.priced_cards ?? 0);
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
    <div className="page-container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeroHeader
        eyebrow="Dusty Cards Collection"
        title="Expansions"
        description={`${withCards.length} sets across ${eraCount} eras, with ${trackedCardCount.toLocaleString()} tracked cards.`}
        gridClassName="xl:grid-cols-[minmax(20rem,0.72fr)_minmax(34rem,1.28fr)] xl:items-stretch 2xl:grid-cols-[minmax(24rem,0.66fr)_minmax(48rem,1.34fr)]"
        sideClassName="xl:space-y-0"
        className="mb-10"
        actions={
          <HeaderAction>
            <Link
              href="/settings"
              prefetch={false}
              className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/75 px-3 py-1.5 font-semibold text-gray-600 transition-colors hover:border-black/15 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/58 dark:hover:border-white/18 dark:hover:text-white"
            >
              Refresh tools in Settings
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </HeaderAction>
        }
        accessory={
          <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(28rem,1.35fr)_minmax(12rem,0.65fr)] xl:items-stretch 2xl:grid-cols-[minmax(38rem,1.45fr)_minmax(18rem,0.72fr)]">
            <div className="min-w-0 [&>section]:h-full">
              <PriceHistoryPanel
                title="All Sets Value"
                currency="EUR"
                points={overviewHistoryPoints}
                currentValue={overviewCurrentValue}
                subtitle={`${overviewPricedCardCount.toLocaleString()} / ${trackedCardCount.toLocaleString()} cards priced`}
                emptyText="Nog geen setprijzen beschikbaar"
              />
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-3 xl:grid-cols-1 xl:auto-rows-fr">
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

      <div className="space-y-12">
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
                const pricedCount = Math.min(currentValue.priced, cardCount);
                const pricedPercent =
                  cardCount > 0 ? Math.min(100, (pricedCount / cardCount) * 100) : 0;
                const releaseYear = episode.release_date?.slice(0, 4) ?? null;
                const setCode = episode.code?.trim().toUpperCase() ?? null;
                const metaParts = [setCode, releaseYear].filter(Boolean);

                return (
                  <Link
                    key={episode.id}
                    href={`/expansions/${episode.id}`}
                    prefetch={false}
                    className={`group glass relative flex flex-col overflow-hidden text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/8 hover:shadow-xl hover:shadow-black/8 active:scale-[0.98] dark:hover:bg-white/6 dark:hover:shadow-black/35 ${tileConfig.tileClass}`}
                  >
                    {episode.logo_url ? (
                      <div
                        className={`relative flex w-full items-center justify-center rounded-xl border border-black/6 bg-black/[0.025] p-2 dark:border-white/7 dark:bg-white/[0.035] ${tileConfig.logoHeightClass}`}
                      >
                        <Image
                          src={episode.logo_url}
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
                        className={`w-full rounded-xl bg-black/5 dark:bg-white/4 ${tileConfig.fallbackHeightClass} flex items-center justify-center`}
                      >
                        <span className="text-xs font-medium text-gray-400 dark:text-white/40">
                          {episode.name.slice(0, 2)}
                        </span>
                      </div>
                    )}

                    <div className="min-w-0">
                      <p
                        className={`line-clamp-2 font-bold leading-snug text-gray-900 transition-colors group-hover:text-black dark:text-white dark:group-hover:text-white ${tileConfig.titleClass}`}
                      >
                        {episode.name}
                      </p>
                      <div className="mt-2 flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className={`truncate font-semibold text-gray-500 dark:text-white/48 ${tileConfig.metaClass}`}
                          >
                            {metaParts.length > 0 ? metaParts.join(" / ") : "Expansion"}
                          </p>
                          <p className={`mt-0.5 text-gray-400 dark:text-white/32 ${tileConfig.metaClass}`}>
                            {cardCount > 0 ? `${cardCount.toLocaleString("nl-NL")} cards` : "--"}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p
                            className={`font-semibold uppercase tracking-[0.14em] text-emerald-600/70 dark:text-emerald-200/52 ${tileConfig.metaClass}`}
                          >
                            Value
                          </p>
                          <p
                            className={`mt-0.5 font-bold leading-none text-emerald-700 tabular-nums dark:text-emerald-100 ${tileConfig.valueClass}`}
                          >
                            {formatCollectionCurrency(currentValue.value)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 border-t border-black/6 pt-2 dark:border-white/8">
                        <div
                          className={`mb-1.5 flex items-center justify-between gap-2 font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-white/35 ${tileConfig.metaClass}`}
                        >
                          <span>Priced</span>
                          <span className="tabular-nums">
                            {cardCount > 0 ? `${pricedCount}/${cardCount}` : "--"}
                          </span>
                        </div>
                        <div
                          className={`overflow-hidden rounded-full bg-black/7 dark:bg-white/8 ${tileConfig.progressHeightClass}`}
                        >
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-300 to-sky-300 shadow-[0_0_14px_rgba(16,185,129,0.28)]"
                            style={{ width: `${pricedPercent}%` }}
                          />
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
