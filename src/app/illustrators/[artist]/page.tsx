import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { buildVisibleEpisodeWhereSql } from "@/lib/illustrators";
import { createSwrCache } from "@/lib/server-swr-cache";
import {
  GAME_SEARCH_PARAM,
  getGameFilterSearchParamValue,
  normalizeTradingCardGame,
  ONE_PIECE_GAME,
  parseVisibleGameFilter,
  type TradingCardGameFilter,
} from "@/lib/games";
import { requirePageUser } from "@/lib/page-auth";
import { getServerUserSettings } from "@/lib/user-settings-server";
import IllustratorCardsClient from "./IllustratorCardsClient";
import type { CardData } from "@/types/card-data";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_CUTOFF_DAYS = 120;
const ILLUSTRATOR_DETAIL_CACHE_FRESH_MS = 5 * 60_000;
const ILLUSTRATOR_DETAIL_CACHE_STALE_MS = 30 * 60_000;

type IllustratorCardRow = {
  id: string;
  game: string;
  name: string;
  card_number: string | null;
  rarity: string | null;
  hp: number | null;
  image_url: string | null;
  supertype: string | null;
  subtypes: string | null;
  artist: string | null;
  cardmarket_id: string | null;
  cardmarket_url: string | null;
  tcggo_url: string | null;
  price_source_status: string | null;
  price_source_checked_at: Date | string | null;
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  episode_release_date: string | null;
  price_fetched_at: Date | string | null;
  cm_en_lowest_nm: number | null;
  cm_de_lowest_nm: number | null;
  cm_fr_lowest_nm: number | null;
  cm_es_lowest_nm: number | null;
  cm_it_lowest_nm: number | null;
  tcp_market: number | null;
  tcp_mid: number | null;
  tcp_low: number | null;
  cm_en_avg_7d: number | null;
  cm_en_avg_30d: number | null;
};

type IllustratorPriceSnapshotRow = {
  card_id: string;
  fetched_at: Date | string;
  cm_en_lowest_nm: number | null;
  cm_de_lowest_nm: number | null;
  cm_fr_lowest_nm: number | null;
  cm_es_lowest_nm: number | null;
  cm_it_lowest_nm: number | null;
};

const illustratorCardsCache = createSwrCache<IllustratorCardRow[]>(
  ILLUSTRATOR_DETAIL_CACHE_FRESH_MS,
  ILLUSTRATOR_DETAIL_CACHE_STALE_MS
);
const illustratorPriceSnapshotsCache = createSwrCache<IllustratorPriceSnapshotRow[]>(
  ILLUSTRATOR_DETAIL_CACHE_FRESH_MS,
  ILLUSTRATOR_DETAIL_CACHE_STALE_MS
);

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function getHistoryCutoffIso(days = HISTORY_CUTOFF_DAYS): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function getIllustratorCacheKey(artist: string, game: TradingCardGameFilter): string {
  return `${game}:${encodeURIComponent(artist)}`;
}

async function getIllustratorCardsUncached(
  artist: string,
  game: TradingCardGameFilter
): Promise<IllustratorCardRow[]> {
  const visibleEpisodeWhereSql = buildVisibleEpisodeWhereSql("e", game);

  return db.$queryRawUnsafe<IllustratorCardRow[]>(
    `
      WITH artist_cards AS (
        SELECT
          c.id,
          c.game,
          c.name,
          c.card_number,
          c.rarity,
          c.hp,
          c.image_url,
          c.supertype,
          c.subtypes,
          c.artist,
          c.cardmarket_id,
          c.cardmarket_url,
          c.tcggo_url,
          c.price_source_status,
          c.price_source_checked_at,
          e.id AS episode_id,
          e.name AS episode_name,
          e.code AS episode_code,
          e.release_date
        FROM "Card" c
        INNER JOIN "Episode" e
          ON e.id = c.episode_id
        WHERE c.artist = ?
${visibleEpisodeWhereSql}
      ),
      latest_cm AS (
        SELECT
          p.*,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS row_num
        FROM "Price" p
        JOIN artist_cards ac ON ac.id = p.card_id
        WHERE p.cm_en_lowest_nm > 0
          AND p.cm_en_lowest_nm <> 9001
      ),
      latest_aux AS (
        SELECT
          p.*,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS row_num
        FROM "Price" p
        JOIN artist_cards ac ON ac.id = p.card_id
        WHERE (p.cm_de_lowest_nm > 0 AND p.cm_de_lowest_nm <> 9001)
           OR (p.cm_fr_lowest_nm > 0 AND p.cm_fr_lowest_nm <> 9001)
           OR (p.cm_es_lowest_nm > 0 AND p.cm_es_lowest_nm <> 9001)
           OR (p.cm_it_lowest_nm > 0 AND p.cm_it_lowest_nm <> 9001)
           OR (p.cm_en_avg_7d > 0 AND p.cm_en_avg_7d <> 9001)
           OR (p.cm_en_avg_30d > 0 AND p.cm_en_avg_30d <> 9001)
      ),
      latest_tcp AS (
        SELECT
          p.*,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS row_num
        FROM "Price" p
        JOIN artist_cards ac ON ac.id = p.card_id
        WHERE p.tcp_market > 0
          AND p.tcp_market <> 9001
      )
      SELECT
        ac.id,
        ac.game,
        ac.name,
        ac.card_number,
        ac.rarity,
        ac.hp,
        ac.image_url,
        ac.supertype,
        ac.subtypes,
        ac.artist,
        ac.cardmarket_id,
        ac.cardmarket_url,
        ac.tcggo_url,
        ac.price_source_status,
        ac.price_source_checked_at,
        ac.episode_id,
        ac.episode_name,
        ac.episode_code,
        ac.release_date AS episode_release_date,
        CASE
          WHEN cm.fetched_at IS NOT NULL THEN cm.fetched_at
          WHEN aux.fetched_at IS NOT NULL THEN aux.fetched_at
          ELSE tcp.fetched_at
        END AS price_fetched_at,
        cm.cm_en_lowest_nm,
        CASE WHEN aux.cm_de_lowest_nm > 0 AND aux.cm_de_lowest_nm <> 9001
          THEN aux.cm_de_lowest_nm ELSE NULL END AS cm_de_lowest_nm,
        CASE WHEN aux.cm_fr_lowest_nm > 0 AND aux.cm_fr_lowest_nm <> 9001
          THEN aux.cm_fr_lowest_nm ELSE NULL END AS cm_fr_lowest_nm,
        CASE WHEN aux.cm_es_lowest_nm > 0 AND aux.cm_es_lowest_nm <> 9001
          THEN aux.cm_es_lowest_nm ELSE NULL END AS cm_es_lowest_nm,
        CASE WHEN aux.cm_it_lowest_nm > 0 AND aux.cm_it_lowest_nm <> 9001
          THEN aux.cm_it_lowest_nm ELSE NULL END AS cm_it_lowest_nm,
        tcp.tcp_market,
        CASE WHEN tcp.tcp_mid > 0 AND tcp.tcp_mid <> 9001
          THEN tcp.tcp_mid ELSE NULL END AS tcp_mid,
        CASE WHEN tcp.tcp_low > 0 AND tcp.tcp_low <> 9001
          THEN tcp.tcp_low ELSE NULL END AS tcp_low,
        CASE WHEN aux.cm_en_avg_7d > 0 AND aux.cm_en_avg_7d <> 9001
          THEN aux.cm_en_avg_7d ELSE NULL END AS cm_en_avg_7d,
        CASE WHEN aux.cm_en_avg_30d > 0 AND aux.cm_en_avg_30d <> 9001
          THEN aux.cm_en_avg_30d ELSE NULL END AS cm_en_avg_30d
      FROM artist_cards ac
      LEFT JOIN latest_cm cm ON cm.card_id = ac.id AND cm.row_num = 1
      LEFT JOIN latest_aux aux ON aux.card_id = ac.id AND aux.row_num = 1
      LEFT JOIN latest_tcp tcp ON tcp.card_id = ac.id AND tcp.row_num = 1
      ORDER BY
        ac.release_date DESC,
        CASE
          WHEN ac.card_number GLOB '[0-9]*' THEN CAST(ac.card_number AS INTEGER)
          ELSE 999999
        END ASC,
        ac.card_number ASC,
        ac.name ASC
    `,
    artist
  );
}

function getIllustratorCards(
  artist: string,
  game: TradingCardGameFilter
): Promise<IllustratorCardRow[]> {
  return illustratorCardsCache.get(`cards:${getIllustratorCacheKey(artist, game)}`, () =>
    getIllustratorCardsUncached(artist, game)
  );
}

async function getIllustratorPriceSnapshotsUncached(
  artist: string,
  game: TradingCardGameFilter,
  since: string
): Promise<IllustratorPriceSnapshotRow[]> {
  const visibleEpisodeWhereSql = buildVisibleEpisodeWhereSql("e", game);

  return db.$queryRawUnsafe<IllustratorPriceSnapshotRow[]>(
    `
      WITH ranked_daily_prices AS (
        SELECT
          p.card_id,
          p.fetched_at,
          p.cm_en_lowest_nm,
          p.cm_de_lowest_nm,
          p.cm_fr_lowest_nm,
          p.cm_es_lowest_nm,
          p.cm_it_lowest_nm,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id, DATE(p.fetched_at)
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS daily_rank
        FROM "Price" p
        INNER JOIN "Card" c
          ON c.id = p.card_id
        INNER JOIN "Episode" e
          ON e.id = c.episode_id
        WHERE c.artist = ?
${visibleEpisodeWhereSql}
          AND p.fetched_at >= ?
          AND p.cm_en_lowest_nm > 0
          AND p.cm_en_lowest_nm <> 9001
      )
      SELECT
        card_id,
        fetched_at,
        cm_en_lowest_nm,
        cm_de_lowest_nm,
        cm_fr_lowest_nm,
        cm_es_lowest_nm,
        cm_it_lowest_nm
      FROM ranked_daily_prices
      WHERE daily_rank = 1
      ORDER BY fetched_at ASC, card_id ASC
    `,
    artist,
    since
  );
}

function getIllustratorPriceSnapshots(
  artist: string,
  game: TradingCardGameFilter
): Promise<IllustratorPriceSnapshotRow[]> {
  return illustratorPriceSnapshotsCache.get(
    `history:${getIllustratorCacheKey(artist, game)}`,
    () => getIllustratorPriceSnapshotsUncached(artist, game, getHistoryCutoffIso())
  );
}

export default async function IllustratorPage({
  params,
  searchParams,
}: {
  params: Promise<{ artist: string }>;
  searchParams: Promise<{ game?: string }>;
}) {
  const { artist } = await params;
  const { game: gameParam } = await searchParams;
  const user = await requirePageUser(
    gameParam
      ? `/illustrators/${artist}?${GAME_SEARCH_PARAM}=${encodeURIComponent(gameParam)}`
      : `/illustrators/${artist}`
  );
  const settings = await getServerUserSettings(user.id);
  const activeGame = parseVisibleGameFilter(gameParam, {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
  const gameQuery = getGameFilterSearchParamValue(activeGame);
  const resolvedArtist = (() => {
    try {
      return decodeURIComponent(artist);
    } catch {
      return artist;
    }
  })();

  const [cards, rawPriceSnapshots] = await Promise.all([
    getIllustratorCards(resolvedArtist, activeGame),
    getIllustratorPriceSnapshots(resolvedArtist, activeGame),
  ]);

  const visibleCards: CardData[] = cards.map((card) => ({
      id: card.id,
      game: normalizeTradingCardGame(card.game),
      name: card.name,
      card_number: card.card_number,
      rarity: card.rarity,
      hp: card.hp,
      supertype: card.supertype,
      image_url: card.image_url,
      subtypes: card.subtypes,
      artist: card.artist,
      cardmarket_id: card.cardmarket_id,
      cardmarket_url: card.cardmarket_url,
      tcggo_url: card.tcggo_url,
      episode_id: card.episode_id,
      episode_name: card.episode_name,
      episode_code: card.episode_code,
      episode_release_date: card.episode_release_date,
      price_source_status: card.price_source_status,
      price_source_checked_at: toIsoString(card.price_source_checked_at),
      price_fetched_at: toIsoString(card.price_fetched_at),
      price:
        card.cm_en_lowest_nm != null ||
        card.cm_de_lowest_nm != null ||
        card.cm_fr_lowest_nm != null ||
        card.cm_es_lowest_nm != null ||
        card.cm_it_lowest_nm != null ||
        card.tcp_market != null ||
        card.tcp_mid != null ||
        card.tcp_low != null ||
        card.cm_en_avg_7d != null ||
        card.cm_en_avg_30d != null
          ? {
              cm_en_lowest_nm: card.cm_en_lowest_nm,
              cm_de_lowest_nm: card.cm_de_lowest_nm,
              cm_fr_lowest_nm: card.cm_fr_lowest_nm,
              cm_es_lowest_nm: card.cm_es_lowest_nm,
              cm_it_lowest_nm: card.cm_it_lowest_nm,
              tcp_market: card.tcp_market,
              tcp_mid: card.tcp_mid,
              tcp_low: card.tcp_low,
              cm_en_avg_7d: card.cm_en_avg_7d,
              cm_en_avg_30d: card.cm_en_avg_30d,
            }
          : null,
    }));

  const visiblePriceSnapshots = rawPriceSnapshots.map((snapshot) => ({
      ...snapshot,
      fetched_at: toIsoString(snapshot.fetched_at) ?? new Date(0).toISOString(),
    }));

  if (visibleCards.length === 0) {
    notFound();
  }

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <IllustratorCardsClient
        artist={resolvedArtist}
        backHref={gameQuery ? `/illustrators?${GAME_SEARCH_PARAM}=${gameQuery}` : "/illustrators"}
        eyebrow={activeGame === ONE_PIECE_GAME ? "One Piece Illustrator" : "Illustrator"}
        cards={visibleCards}
        priceSnapshots={visiblePriceSnapshots}
      />
    </div>
  );
}
