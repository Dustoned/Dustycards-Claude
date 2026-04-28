import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, BrushCleaning, Images, LibraryBig, Sparkles } from "lucide-react";
import {
  HeaderAction,
  PageHeroHeader,
  SectionHeader,
  type HeaderStat,
} from "@/components/PageHeader";
import { db } from "@/lib/db";
import { getFixedTrackGridTemplate, getIllustratorTileScale } from "@/lib/display-scale";
import IllustratorSortToggle from "@/app/illustrators/IllustratorSortToggle";
import {
  buildVisibleEpisodeWhereSql,
  ILLUSTRATOR_SORT_COOKIE_NAME,
  normalizeIllustratorSort,
} from "@/lib/illustrators";
import { getCachedImageUrl } from "@/lib/image-cache";
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

const EUR_FORMATTER = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(value: number | null): string {
  if (value == null) return "--";

  return EUR_FORMATTER.format(value);
}

function formatCount(value: number): string {
  return value.toLocaleString("nl-NL");
}

function getInitialGroup(value: string): string {
  const initial = value.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(initial) ? initial : "#";
}

function compareByArtistValue(a: IllustratorSummary, b: IllustratorSummary): number {
  const aTopPrice = a.topPrice ?? Number.NEGATIVE_INFINITY;
  const bTopPrice = b.topPrice ?? Number.NEGATIVE_INFINITY;
  const topPriceDiff = bTopPrice - aTopPrice;
  if (topPriceDiff !== 0) return topPriceDiff;

  const cardCountDiff = b.cardCount - a.cardCount;
  if (cardCountDiff !== 0) return cardCountDiff;

  const setCountDiff = b.expansionCount - a.expansionCount;
  if (setCountDiff !== 0) return setCountDiff;

  return a.artist.localeCompare(b.artist, undefined, { sensitivity: "base" });
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
  const pageMaxWidth = settings.widescreen ? "max-w-[2000px]" : "max-w-7xl";
  const illustrators = await getIllustratorSummaries();

  const sortedIllustrators =
    sort === "value"
      ? [...illustrators].sort(compareByArtistValue)
      : sort === "cards"
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
    sort === "cards" || sort === "value"
      ? [[sort === "value" ? "Most value" : "Most cards", sortedIllustrators] as const]
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
  const headerStats = [
    {
      label: "Illustrators",
      value: formatCount(totalIllustrators),
      Icon: BrushCleaning,
      tone: "amber",
    },
    {
      label: "Tracked cards",
      value: formatCount(trackedCards),
      Icon: LibraryBig,
      tone: "emerald",
    },
    {
      label: "Priced cards",
      value: formatCount(pricedCards),
      Icon: Sparkles,
      tone: "rose",
    },
  ] satisfies HeaderStat[];

  return (
    <div className={`page-container mx-auto ${pageMaxWidth} px-4 py-10 sm:px-6 lg:px-8`}>
      <PageHeroHeader
        eyebrow="Dusty Cards Collection"
        title="Illustrators"
        description={`${formatCount(totalIllustrators)} illustrators across ${formatCount(trackedCards)} tracked cards.`}
        className="mb-10"
        stats={headerStats}
        actions={
          <HeaderAction>
            <Link
              href="/settings"
              prefetch={false}
              className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/75 px-3 py-1.5 font-semibold text-gray-600 transition-colors hover:border-black/15 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/58 dark:hover:border-white/18 dark:hover:text-white"
            >
              Display tools in Settings
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </HeaderAction>
        }
      />

      <div className="glass mb-8 flex flex-col gap-4 rounded-3xl border border-black/8 px-4 py-4 shadow-sm shadow-black/5 dark:border-white/8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-9 items-center rounded-2xl border border-black/8 bg-white/70 px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/42">
            Sort
          </span>
          <IllustratorSortToggle activeSort={sort} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-2xl border border-black/8 bg-white/70 px-3 py-2 text-xs font-semibold text-gray-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/58">
            <LibraryBig className="h-3.5 w-3.5" />
            {formatCount(trackedCards)} cards
          </span>
          <span className="inline-flex items-center gap-2 rounded-2xl border border-black/8 bg-white/70 px-3 py-2 text-xs font-semibold text-gray-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/58">
            <Sparkles className="h-3.5 w-3.5" />
            {formatCount(pricedCards)} priced
          </span>
        </div>
      </div>

      <div className="space-y-12">
        {sortedGroups.map(([group, entries]) => (
          <section key={group}>
            <SectionHeader title={group} count={entries.length} compact />

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
                  prefetch={false}
                  className={`group glass relative flex flex-col overflow-hidden text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/8 hover:shadow-xl hover:shadow-black/8 active:scale-[0.98] dark:hover:bg-white/6 dark:hover:shadow-black/35 ${tileConfig.tileClass}`}
                >
                  <div
                    className={`relative overflow-hidden rounded-2xl border border-black/6 bg-black/[0.03] shadow-md shadow-black/10 dark:border-white/8 dark:bg-white/[0.03] ${tileConfig.imageWrapClass}`}
                  >
                    {illustrator.topCard?.image_url ? (
                      <Image
                        src={getCachedImageUrl(illustrator.topCard.image_url) ?? illustrator.topCard.image_url}
                        alt={illustrator.topCard.name}
                        fill
                        className="object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                        sizes={tileConfig.minWidth}
                        priority={
                          index < 4 &&
                          (group === "A" || group === "Most cards" || group === "Most value")
                        }
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
                      className={`line-clamp-2 font-bold leading-snug text-gray-900 transition-colors group-hover:text-black dark:text-white dark:group-hover:text-white ${tileConfig.titleClass}`}
                    >
                      {illustrator.artist}
                    </p>
                    <div className={`space-y-0.5 text-gray-400 dark:text-white/40 ${tileConfig.metaClass}`}>
                      <p className="truncate">{illustrator.topCard?.name ?? "No featured card yet"}</p>
                      {illustrator.topCard ? (
                        <p className="truncate">
                          {illustrator.topCard.episode_name}
                          {illustrator.topCard.episode_code
                            ? ` (${illustrator.topCard.episode_code})`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-auto border-t border-black/6 pt-3 dark:border-white/8">
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-black/8 bg-white/60 px-2.5 py-1 text-[11px] font-semibold text-gray-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/55">
                        <Images className="h-3 w-3" />
                        {formatCount(illustrator.cardCount)}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-black/8 bg-white/60 px-2.5 py-1 text-[11px] font-semibold text-gray-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/55">
                        {formatCount(illustrator.expansionCount)} sets
                      </span>
                      <span className="inline-flex items-center rounded-full border border-black/8 bg-white/60 px-2.5 py-1 text-[11px] font-semibold text-gray-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/55">
                        {formatCount(illustrator.pricedCount)} priced
                      </span>
                    </div>

                    <div className="mt-3 flex items-end justify-between gap-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/35">
                        Top card value
                      </p>
                      <p className="shrink-0 whitespace-nowrap text-base font-bold tabular-nums text-gray-900 dark:text-white">
                        {formatCurrency(illustrator.topPrice)}
                      </p>
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
