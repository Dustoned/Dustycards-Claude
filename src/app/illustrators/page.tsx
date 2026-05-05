import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowUpRight, BrushCleaning, LibraryBig, Sparkles } from "lucide-react";
import {
  HeaderAction,
  PageHeroHeader,
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
import {
  DEFAULT_SETTINGS,
  parseCookieSettings,
  SETTINGS_COOKIE_NAME,
} from "@/lib/user-settings";
import { requirePageUser } from "@/lib/page-auth";
import IllustratorGridClient from "./IllustratorGridClient";

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

export type IllustratorSummary = {
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

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
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
  await requirePageUser(rawSort ? `/illustrators?sort=${encodeURIComponent(rawSort)}` : "/illustrators");
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
  const illustratorGroups = sortedGroups.map(([group, entries]) => ({ group, entries }));
  const gridTemplateColumns = getFixedTrackGridTemplate(tileConfig.minWidth);

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
    <div className={`page-container mx-auto ${pageMaxWidth} px-4 py-5 sm:px-6 sm:py-8 lg:px-8`}>
      <PageHeroHeader
        eyebrow="Dusty Cards Collection"
        title="Illustrators"
        description={`${formatCount(totalIllustrators)} illustrators across ${formatCount(trackedCards)} tracked cards.`}
        className="mb-6 sm:mb-8"
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

      <IllustratorGridClient
        groups={illustratorGroups}
        gridTemplateColumns={gridTemplateColumns}
        priorityGroups={["A", "Most cards", "Most value"]}
        tileConfig={tileConfig}
      />
    </div>
  );
}
