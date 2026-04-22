import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { buildVisibleEpisodeWhereSql } from "@/lib/illustrators";
import IllustratorCardsClient from "./IllustratorCardsClient";
import type { CardData } from "@/types/card-data";

export const dynamic = "force-dynamic";

type IllustratorCardRow = {
  id: string;
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

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function getIllustratorCards(artist: string): Promise<IllustratorCardRow[]> {
  const visibleEpisodeWhereSql = buildVisibleEpisodeWhereSql("e");

  return db.$queryRawUnsafe<IllustratorCardRow[]>(
    `
      WITH latest_price AS (
        SELECT
          p.card_id,
          p.fetched_at,
          p.cm_en_lowest_nm,
          p.cm_de_lowest_nm,
          p.cm_fr_lowest_nm,
          p.cm_es_lowest_nm,
          p.cm_it_lowest_nm,
          p.tcp_market,
          p.tcp_mid,
          p.tcp_low,
          p.cm_en_avg_7d,
          p.cm_en_avg_30d,
          ROW_NUMBER() OVER (
            PARTITION BY p.card_id
            ORDER BY p.fetched_at DESC, p.id DESC
          ) AS price_rank
        FROM "Price" p
      )
      SELECT
        c.id,
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
        lp.fetched_at AS price_fetched_at,
        lp.cm_en_lowest_nm,
        lp.cm_de_lowest_nm,
        lp.cm_fr_lowest_nm,
        lp.cm_es_lowest_nm,
        lp.cm_it_lowest_nm,
        lp.tcp_market,
        lp.tcp_mid,
        lp.tcp_low,
        lp.cm_en_avg_7d,
        lp.cm_en_avg_30d
      FROM "Card" c
      INNER JOIN "Episode" e
        ON e.id = c.episode_id
      LEFT JOIN latest_price lp
        ON lp.card_id = c.id
       AND lp.price_rank = 1
      WHERE c.artist = ?
${visibleEpisodeWhereSql}
      ORDER BY
        e.release_date DESC,
        CASE
          WHEN c.card_number GLOB '[0-9]*' THEN CAST(c.card_number AS INTEGER)
          ELSE 999999
        END ASC,
        c.card_number ASC,
        c.name ASC
    `,
    artist
  );
}

async function getIllustratorPriceSnapshots(
  artist: string
): Promise<IllustratorPriceSnapshotRow[]> {
  const visibleEpisodeWhereSql = buildVisibleEpisodeWhereSql("e");

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
    artist
  );
}

export default async function IllustratorPage({
  params,
}: {
  params: Promise<{ artist: string }>;
}) {
  const { artist } = await params;
  const resolvedArtist = (() => {
    try {
      return decodeURIComponent(artist);
    } catch {
      return artist;
    }
  })();

  const [cards, rawPriceSnapshots] = await Promise.all([
    getIllustratorCards(resolvedArtist),
    getIllustratorPriceSnapshots(resolvedArtist),
  ]);

  const visibleCards: CardData[] = cards.map((card) => ({
      id: card.id,
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
        cards={visibleCards}
        priceSnapshots={visiblePriceSnapshots}
      />
    </div>
  );
}
