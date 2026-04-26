import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, BrushCleaning, LibraryBig, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { getFixedTrackGridTemplate, getIllustratorTileScale } from "@/lib/display-scale";
import IllustratorSortToggle from "@/app/illustrators/IllustratorSortToggle";
import {
  buildVisibleEpisodeWhereSql,
  ILLUSTRATOR_SORT_COOKIE_NAME,
  normalizeIllustratorSort,
} from "@/lib/illustrators";
import {
  DEFAULT_SETTINGS,
  parseCookieSettings,
  SETTINGS_COOKIE_NAME,
} from "@/lib/user-settings";

export const dynamic = "force-dynamic";

type IllustratorSummaryRow = {
  artist: string;
  card_count: number;
  priced_count: number;
  expansion_count: number;
  top_card_id: string | null;
  top_card_name: string | null;
  top_card_image_url: string | null;
  top_card_episode_id: string | null;
  top_card_episode_name: string | null;
  top_card_episode_code: string | null;
  top_price: number | null;
};

type IllustratorSummary = {
  artist: string;
  cardCount: number;
  pricedCount: number;
  expansionCount: number;
  topCard: {
    id: string;
    name: string;
    image_url: string | null;
    episode_id: string;
    episode_name: string;
    episode_code: string | null;
  } | null;
  topPrice: number | null;
};

const EUR_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(value: number | null): string {
  if (value == null) return "--";

  return EUR_FORMATTER.format(value);
}

function getInitialGroup(value: string): string {
  const initial = value.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(initial) ? initial : "#";
}

async function getIllustratorSummaries(): Promise<IllustratorSummary[]> {
  const visibleEpisodeWhereSql = buildVisibleEpisodeWhereSql("e");
  const rows = await db.$queryRawUnsafe<IllustratorSummaryRow[]>(`
    WITH latest_price AS (
      SELECT
        p.card_id,
        p.cm_en_lowest_nm,
        p.cm_de_lowest_nm,
        p.cm_fr_lowest_nm,
        p.cm_es_lowest_nm,
        p.cm_it_lowest_nm,
        ROW_NUMBER() OVER (
          PARTITION BY p.card_id
          ORDER BY p.fetched_at DESC, p.id DESC
        ) AS price_rank
      FROM "Price" p
    ),
    visible_cards AS (
      SELECT
        c.id,
        c.name,
        c.artist,
        c.image_url,
        e.id AS episode_id,
        e.name AS episode_name,
        e.code AS episode_code,
        COALESCE(
          lp.cm_en_lowest_nm,
          lp.cm_de_lowest_nm,
          lp.cm_fr_lowest_nm,
          lp.cm_es_lowest_nm,
          lp.cm_it_lowest_nm
        ) AS market_price
      FROM "Card" c
      INNER JOIN "Episode" e
        ON e.id = c.episode_id
      LEFT JOIN latest_price lp
        ON lp.card_id = c.id
       AND lp.price_rank = 1
      WHERE c.artist IS NOT NULL
        AND TRIM(c.artist) <> ''
${visibleEpisodeWhereSql}
    ),
    ranked_cards AS (
      SELECT
        id,
        name,
        artist,
        image_url,
        episode_id,
        episode_name,
        episode_code,
        market_price,
        CASE WHEN market_price IS NULL THEN 0 ELSE 1 END AS has_price,
        ROW_NUMBER() OVER (
          PARTITION BY artist
          ORDER BY
            CASE WHEN market_price IS NULL THEN 1 ELSE 0 END ASC,
            market_price DESC,
            CASE WHEN image_url IS NULL OR TRIM(image_url) = '' THEN 1 ELSE 0 END ASC,
            name ASC
        ) AS featured_rank
      FROM visible_cards
    )
    SELECT
      artist,
      COUNT(*) AS card_count,
      SUM(has_price) AS priced_count,
      COUNT(DISTINCT episode_id) AS expansion_count,
      MAX(CASE WHEN featured_rank = 1 THEN id END) AS top_card_id,
      MAX(CASE WHEN featured_rank = 1 THEN name END) AS top_card_name,
      MAX(CASE WHEN featured_rank = 1 THEN image_url END) AS top_card_image_url,
      MAX(CASE WHEN featured_rank = 1 THEN episode_id END) AS top_card_episode_id,
      MAX(CASE WHEN featured_rank = 1 THEN episode_name END) AS top_card_episode_name,
      MAX(CASE WHEN featured_rank = 1 THEN episode_code END) AS top_card_episode_code,
      MAX(CASE WHEN featured_rank = 1 THEN market_price END) AS top_price
    FROM ranked_cards
    GROUP BY artist
    ORDER BY artist ASC
  `);

  return rows.map((row) => ({
    artist: row.artist,
    cardCount: Number(row.card_count ?? 0),
    pricedCount: Number(row.priced_count ?? 0),
    expansionCount: Number(row.expansion_count ?? 0),
    topCard:
      row.top_card_id &&
      row.top_card_name &&
      row.top_card_episode_id &&
      row.top_card_episode_name
        ? {
            id: row.top_card_id,
            name: row.top_card_name,
            image_url: row.top_card_image_url,
            episode_id: row.top_card_episode_id,
            episode_name: row.top_card_episode_name,
            episode_code: row.top_card_episode_code,
          }
        : null,
    topPrice: row.top_price,
  }));
}

export default async function IllustratorsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const cookieStore = await cookies();
  const { sort: rawSort } = await searchParams;
  const settings =
    parseCookieSettings(cookieStore.get(SETTINGS_COOKIE_NAME)?.value) ?? DEFAULT_SETTINGS;
  const sort = rawSort
    ? normalizeIllustratorSort(rawSort)
    : normalizeIllustratorSort(cookieStore.get(ILLUSTRATOR_SORT_COOKIE_NAME)?.value);
  const tileConfig = getIllustratorTileScale(settings.uiScale, settings.widescreen);
  const illustrators = await getIllustratorSummaries();

  const sortedIllustrators =
    sort === "cards"
      ? [...illustrators].sort((a, b) => {
          const cardCountDiff = b.cardCount - a.cardCount;
          if (cardCountDiff !== 0) return cardCountDiff;

          const setCountDiff = b.expansionCount - a.expansionCount;
          if (setCountDiff !== 0) return setCountDiff;

          return a.artist.localeCompare(b.artist, undefined, { sensitivity: "base" });
        })
      : [...illustrators].sort((a, b) =>
          a.artist.localeCompare(b.artist, undefined, { sensitivity: "base" })
        );

  const sortedGroups =
    sort === "cards"
      ? [["Most cards", sortedIllustrators] as const]
      : (() => {
          const grouped = new Map<string, typeof sortedIllustrators>();
          for (const illustrator of sortedIllustrators) {
            const group = getInitialGroup(illustrator.artist);
            if (!grouped.has(group)) {
              grouped.set(group, []);
            }
            grouped.get(group)!.push(illustrator);
          }

          return [...grouped.entries()].sort(([a], [b]) => {
            if (a === "#") return 1;
            if (b === "#") return -1;
            return a.localeCompare(b);
          });
        })();

  const totalIllustrators = sortedIllustrators.length;
  const trackedCards = sortedIllustrators.reduce(
    (total, illustrator) => total + illustrator.cardCount,
    0
  );
  const pricedCards = sortedIllustrators.reduce(
    (total, illustrator) => total + illustrator.pricedCount,
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
              Illustrators
            </h1>
            <p className="mt-2 max-w-xl text-sm text-gray-500 dark:text-white/50">
              {totalIllustrators.toLocaleString()} illustrators across {trackedCards.toLocaleString()} tracked
              cards.
            </p>
            <Link
              href="/settings"
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-white/55 dark:hover:text-white"
            >
              Display tools in Settings
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[32rem]">
            {[
              {
                label: "Illustrators",
                value: totalIllustrators.toLocaleString(),
                Icon: BrushCleaning,
                iconClass: "text-amber-500 dark:text-amber-300",
              },
              {
                label: "Tracked cards",
                value: trackedCards.toLocaleString(),
                Icon: LibraryBig,
                iconClass: "text-emerald-500 dark:text-emerald-300",
              },
              {
                label: "Priced cards",
                value: pricedCards.toLocaleString(),
                Icon: Sparkles,
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

      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400 dark:text-white/35">
            Sort
          </span>
          <IllustratorSortToggle activeSort={sort} />
        </div>

        <p className="text-sm text-gray-500 dark:text-white/45">
          {sort === "cards"
            ? "Showing illustrators by total tracked cards."
            : "Showing illustrators in alphabetical order."}
        </p>
      </div>

      <div className="space-y-12">
        {sortedGroups.map(([group, entries]) => (
          <section key={group}>
            <div className="mb-5 flex items-center gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-white/40">
                {group}
              </h2>
              <span className="rounded-full bg-black/6 px-2 py-0.5 text-xs text-gray-400 dark:bg-white/6 dark:text-white/40">
                {entries.length}
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
              {entries.map((illustrator, index) => (
                <Link
                  key={illustrator.artist}
                  href={`/illustrators/${encodeURIComponent(illustrator.artist)}`}
                  className={`group glass flex flex-col transition-all duration-200 hover:scale-[1.02] hover:bg-white/8 active:scale-[0.98] dark:hover:bg-white/6 ${tileConfig.tileClass}`}
                >
                  <div
                    className={`relative overflow-hidden rounded-xl border border-black/6 bg-black/[0.03] shadow-md shadow-black/10 dark:border-white/8 dark:bg-white/[0.03] ${tileConfig.imageWrapClass}`}
                  >
                    {illustrator.topCard?.image_url ? (
                      <Image
                        src={illustrator.topCard.image_url}
                        alt={illustrator.topCard.name}
                        fill
                        className="object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                        sizes={tileConfig.minWidth}
                        priority={index < 4 && (group === "A" || group === "Most cards")}
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <span className="text-sm font-medium text-gray-400 dark:text-white/35">
                          {illustrator.artist.slice(0, 2)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <p
                      className={`line-clamp-2 font-semibold leading-snug text-gray-800 transition-colors group-hover:text-black dark:text-white dark:group-hover:text-white ${tileConfig.titleClass}`}
                    >
                      {illustrator.artist}
                    </p>
                    <p className={`truncate text-gray-400 dark:text-white/40 ${tileConfig.metaClass}`}>
                      {illustrator.topCard?.name ?? "No featured card yet"}
                    </p>
                  </div>

                  <div className="mt-auto grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-black/8 bg-black/[0.03] px-3 py-2 dark:border-white/8 dark:bg-white/[0.03]">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/35">
                        Cards
                      </p>
                      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                        {illustrator.cardCount}
                      </p>
                    </div>
                    <div className="rounded-xl border border-black/8 bg-black/[0.03] px-3 py-2 dark:border-white/8 dark:bg-white/[0.03]">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/35">
                        Sets
                      </p>
                      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                        {illustrator.expansionCount}
                      </p>
                    </div>
                    <div className="col-span-2 rounded-xl border border-black/8 bg-black/[0.03] px-3 py-2.5 dark:border-white/8 dark:bg-white/[0.03]">
                      <div className="flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/35">
                            Top
                          </p>
                          <p className="mt-1 truncate text-xs text-gray-400 dark:text-white/40">
                            {illustrator.topCard?.name ?? "No featured card yet"}
                          </p>
                        </div>
                        <p className="shrink-0 whitespace-nowrap text-base font-semibold tabular-nums text-gray-900 dark:text-white">
                          {formatCurrency(illustrator.topPrice)}
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
