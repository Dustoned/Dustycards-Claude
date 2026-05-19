import { cookies } from "next/headers";
import { ArrowUpRight, BrushCleaning, LibraryBig, Sparkles } from "lucide-react";
import {
  HeaderStatCard,
  type HeaderStat,
} from "@/components/PageHeader";
import GameFilterSwitch from "@/components/GameFilterSwitch";
import { db } from "@/lib/db";
import { getFixedTrackGridTemplate, getIllustratorTileScale } from "@/lib/display-scale";
import IllustratorSortToggle from "@/app/illustrators/IllustratorSortToggle";
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

async function getIllustratorSummaries(game: TradingCardGameFilter): Promise<IllustratorSummary[]> {
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
        COALESCE(
          lp.cm_en_lowest_nm,
          lp.cm_de_lowest_nm,
          lp.cm_fr_lowest_nm,
          lp.cm_es_lowest_nm,
          lp.cm_it_lowest_nm
        ) AS market_price
      FROM visible_card_base vc
      LEFT JOIN "Price" lp
        ON lp.id = (
          SELECT p2.id
          FROM "Price" p2
          WHERE p2.card_id = vc.id
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
      <section className="binder-panel relative mb-4 w-full overflow-hidden rounded-[var(--ui-page-header-radius)] p-3 sm:mb-5 sm:p-4 lg:p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(19rem,0.82fr)_minmax(0,1.18fr)] xl:grid-cols-[minmax(20rem,0.78fr)_minmax(0,1.08fr)_minmax(20rem,0.72fr)] xl:items-stretch">
          <div className="flex min-h-[var(--ui-dashboard-header-panel-min-height)] min-w-0 flex-col justify-between rounded-[var(--ui-page-header-radius)] border border-white/8 bg-black/10 p-[var(--ui-page-header-padding)] xl:col-span-2">
            <div className="min-w-0">
              <p className="text-[length:var(--ui-page-header-eyebrow-size)] font-semibold uppercase tracking-[0.14em] text-white/42">
                {activeGame === ONE_PIECE_GAME ? "One Piece Library" : "Dusty Cards Collection"}
              </p>
              <h1 className="mt-2 min-w-0 text-[length:var(--ui-page-header-title-size)] font-bold leading-tight tracking-tight text-white">
                {activeGame === ONE_PIECE_GAME ? "One Piece Illustrators" : "Illustrators"}
              </h1>
              <p className="mt-3 max-w-2xl text-[length:var(--ui-page-header-description-size)] leading-[var(--ui-page-header-description-leading)] text-white/56">
                {`${formatCount(totalIllustrators)} illustrators across ${formatCount(trackedCards)} tracked ${libraryLabel} cards.`}
              </p>
            </div>

            {settings.onePieceLibraryEnabled ? (
              <div className="mt-[var(--ui-page-header-action-margin)]">
                <GameFilterSwitch items={gameSwitchItems} ariaLabel="Illustrator library" />
              </div>
            ) : null}
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-2 lg:col-span-2 xl:col-span-1 xl:auto-rows-fr">
            {headerStats.map((stat) => (
              <HeaderStatCard key={stat.label} {...stat} />
            ))}
          </div>
        </div>
      </section>

      <div className="binder-subpanel mb-5 flex flex-col gap-3 rounded-2xl px-3 py-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-8 items-center rounded-full border border-white/8 bg-white/[0.04] px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/42">
            Sort
          </span>
          <IllustratorSortToggle activeSort={sort} />
        </div>
      </div>

      <IllustratorGridClient
        groups={illustratorGroups}
        gridTemplateColumns={gridTemplateColumns}
        priorityGroups={["A", "Most cards", "Most value"]}
        tileConfig={tileConfig}
        gameQueryParam={activeGameQuery}
      />
    </div>
  );
}
