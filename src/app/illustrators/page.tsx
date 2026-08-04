import { cookies } from "next/headers";
import { ArrowUpRight, BrushCleaning, LibraryBig, Palette, Sparkles } from "lucide-react";
import {
  PageHeroHeader,
  type HeaderStat,
} from "@/components/PageHeader";
import GameFilterSwitch from "@/components/GameFilterSwitch";
import { db } from "@/lib/db";
import { getFixedTrackGridTemplate, getIllustratorTileScale } from "@/lib/display-scale";
import { createSwrCache } from "@/lib/server-swr-cache";
import {
  buildVisibleEpisodeWhereSql,
  ILLUSTRATOR_SORT_COOKIE_NAME,
  normalizeIllustratorSort,
} from "@/lib/illustrators";
import {
  GAME_FILTER_OPTIONS,
  GAME_SEARCH_PARAM,
  getGameFilterLabel,
  getGameFilterSearchParamValue,
  ONE_PIECE_GAME,
  parseVisibleGameFilter,
  type TradingCardGameFilter,
} from "@/lib/games";
import { getServerUserSettings } from "@/lib/user-settings-server";
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
  second_card_id: string | null;
  second_card_name: string | null;
  second_card_image_url: string | null;
  second_card_episode_id: string | null;
  second_card_episode_name: string | null;
  second_card_episode_code: string | null;
  top_price: number | null;
};

export type IllustratorFeaturedCard = {
  id: string;
  name: string;
  image_url: string | null;
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
};

export type IllustratorSummary = {
  artist: string;
  cardCount: number;
  pricedCount: number;
  expansionCount: number;
  topCard: IllustratorFeaturedCard | null;
  secondCard: IllustratorFeaturedCard | null;
  topPrice: number | null;
};

const ILLUSTRATOR_CACHE_FRESH_MS = 5 * 60_000;
const ILLUSTRATOR_CACHE_STALE_MS = 30 * 60_000;
const illustratorSummariesCache = createSwrCache<IllustratorSummary[]>(
  ILLUSTRATOR_CACHE_FRESH_MS,
  ILLUSTRATOR_CACHE_STALE_MS
);

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

async function getIllustratorSummariesUncached(
  game: TradingCardGameFilter
): Promise<IllustratorSummary[]> {
  const visibleEpisodeWhereSql = buildVisibleEpisodeWhereSql("e", game);
  const rows = await db.$queryRawUnsafe<IllustratorSummaryRow[]>(`
    WITH visible_card_base AS (
      SELECT
        c.id,
        c.name,
        c.artist,
        c.image_url,
        e.id AS episode_id,
        e.name AS episode_name,
        e.code AS episode_code
      FROM "Card" c
      INNER JOIN "Episode" e
        ON e.id = c.episode_id
      WHERE c.artist IS NOT NULL
        AND TRIM(c.artist) <> ''
${visibleEpisodeWhereSql}
    ),
    visible_cards AS (
      SELECT
        vc.id,
        vc.name,
        vc.artist,
        vc.image_url,
        vc.episode_id,
        vc.episode_name,
        vc.episode_code,
        lp.cm_en_lowest_nm AS market_price
      FROM visible_card_base vc
      LEFT JOIN "Price" lp
        ON lp.id = (
          SELECT p2.id
          FROM "Price" p2
          WHERE p2.card_id = vc.id
            AND p2.cm_en_lowest_nm > 0
            AND p2.cm_en_lowest_nm <> 9001
          ORDER BY p2.fetched_at DESC, p2.id DESC
          LIMIT 1
        )
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
      MAX(CASE WHEN featured_rank = 2 THEN id END) AS second_card_id,
      MAX(CASE WHEN featured_rank = 2 THEN name END) AS second_card_name,
      MAX(CASE WHEN featured_rank = 2 THEN image_url END) AS second_card_image_url,
      MAX(CASE WHEN featured_rank = 2 THEN episode_id END) AS second_card_episode_id,
      MAX(CASE WHEN featured_rank = 2 THEN episode_name END) AS second_card_episode_name,
      MAX(CASE WHEN featured_rank = 2 THEN episode_code END) AS second_card_episode_code,
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
    secondCard:
      row.second_card_id &&
      row.second_card_name &&
      row.second_card_episode_id &&
      row.second_card_episode_name
        ? {
            id: row.second_card_id,
            name: row.second_card_name,
            image_url: row.second_card_image_url,
            episode_id: row.second_card_episode_id,
            episode_name: row.second_card_episode_name,
            episode_code: row.second_card_episode_code,
          }
        : null,
    topPrice: row.top_price,
  }));
}

function getIllustratorSummaries(game: TradingCardGameFilter): Promise<IllustratorSummary[]> {
  return illustratorSummariesCache.get(`summaries:${game}`, () =>
    getIllustratorSummariesUncached(game)
  );
}

export default async function IllustratorsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; game?: string }>;
}) {
  const cookieStore = await cookies();
  const { sort: rawSort, game: gameParam } = await searchParams;
  const requestParams = new URLSearchParams();
  if (rawSort) requestParams.set("sort", rawSort);
  if (gameParam) requestParams.set(GAME_SEARCH_PARAM, gameParam);
  const requestQuery = requestParams.toString();
  const user = await requirePageUser(`/illustrators${requestQuery ? `?${requestQuery}` : ""}`);
  const settings = await getServerUserSettings(user.id);
  const activeGame = parseVisibleGameFilter(gameParam, {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
  const sort = rawSort
    ? normalizeIllustratorSort(rawSort)
    : normalizeIllustratorSort(cookieStore.get(ILLUSTRATOR_SORT_COOKIE_NAME)?.value);
  const tileConfig = getIllustratorTileScale(settings.uiScale, settings.widescreen);
  const pageMaxWidth = settings.widescreen ? "max-w-[2000px]" : "max-w-7xl";
  const illustrators = await getIllustratorSummaries(activeGame);

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
  const pricedArtists = sortedIllustrators.filter((illustrator) => illustrator.pricedCount > 0).length;
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
    {
      label: "Priced artists",
      value: formatCount(pricedArtists),
      Icon: ArrowUpRight,
      tone: "sky",
    },
  ] satisfies HeaderStat[];

  function buildGameHref(game: TradingCardGameFilter) {
    const params = new URLSearchParams();
    if (sort !== "alpha") params.set("sort", sort);
    const gameValue = getGameFilterSearchParamValue(game);
    if (gameValue) params.set(GAME_SEARCH_PARAM, gameValue);
    const query = params.toString();
    return query ? `/illustrators?${query}` : "/illustrators";
  }
  const gameSwitchItems = GAME_FILTER_OPTIONS.map((game) => ({
    href: buildGameHref(game),
    active: activeGame === game,
    label: getGameFilterLabel(game),
  }));

  const activeGameQuery = getGameFilterSearchParamValue(activeGame);
  const libraryLabel =
    activeGame === ONE_PIECE_GAME ? "One Piece" : activeGame === "pokemon" ? "Pokemon" : "Pokemon and One Piece";

  return (
    <div className={`page-container mx-auto ${pageMaxWidth} px-4 py-5 sm:px-6 sm:py-8 lg:px-8`}>
      <PageHeroHeader
        className="mb-5"
        eyebrow="Artist archive"
        title={activeGame === ONE_PIECE_GAME ? "One Piece Illustrators" : "Illustrators"}
        description={`${formatCount(totalIllustrators)} artists behind ${formatCount(trackedCards)} tracked ${libraryLabel} cards. Discover their standout artwork, sets and market reach.`}
        leadingVisual={
          <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-violet-300/18 bg-[linear-gradient(145deg,rgba(139,92,246,0.2),rgba(244,114,182,0.08))] text-violet-200 shadow-[0_14px_34px_rgba(76,29,149,0.24)] sm:h-14 sm:w-14">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18),transparent_45%)]" />
            <Palette className="relative h-5 w-5 sm:h-6 sm:w-6" />
          </div>
        }
        titleActions={
          settings.onePieceLibraryEnabled ? (
            <GameFilterSwitch items={gameSwitchItems} ariaLabel="Illustrator library" />
          ) : null
        }
        stats={headerStats}
      />

      <IllustratorGridClient
        groups={illustratorGroups}
        gridTemplateColumns={gridTemplateColumns}
        priorityGroups={["A", "Most cards", "Most value"]}
        tileConfig={tileConfig}
        gameQueryParam={activeGameQuery}
        activeSort={sort}
      />
    </div>
  );
}
