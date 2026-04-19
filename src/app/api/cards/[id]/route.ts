import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildCardPriceHistory } from "@/lib/price-history";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const card = await db.card.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      card_number: true,
      rarity: true,
      hp: true,
      image_url: true,
      supertype: true,
      subtypes: true,
      artist: true,
      cardmarket_id: true,
      cardmarket_url: true,
      tcggo_url: true,
      price_source_status: true,
      price_source_checked_at: true,
      episode: {
        select: { id: true, name: true, code: true },
      },
      prices: {
        orderBy: { fetched_at: "asc" },
        select: {
          cm_en_lowest_nm: true,
          cm_de_lowest_nm: true,
          cm_fr_lowest_nm: true,
          cm_es_lowest_nm: true,
          cm_it_lowest_nm: true,
          tcp_market: true,
          tcp_mid: true,
          tcp_low: true,
          cm_en_avg_7d: true,
          cm_en_avg_30d: true,
          fetched_at: true,
        },
      },
    },
  });

  if (!card) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const latestPrice = card.prices[card.prices.length - 1] ?? null;
  const priceHistory = buildCardPriceHistory(card.prices);

  return NextResponse.json({
    id: card.id,
    name: card.name,
    card_number: card.card_number,
    rarity: card.rarity,
    hp: card.hp,
    image_url: card.image_url,
    supertype: card.supertype,
    subtypes: card.subtypes,
    artist: card.artist,
    cardmarket_id: card.cardmarket_id,
    cardmarket_url: card.cardmarket_url,
    tcggo_url: card.tcggo_url,
    price_source_status: card.price_source_status,
    price_source_checked_at: card.price_source_checked_at
      ? card.price_source_checked_at.toISOString()
      : null,
    price_fetched_at: latestPrice ? latestPrice.fetched_at.toISOString() : null,
    price: latestPrice
      ? {
          cm_en_lowest_nm: latestPrice.cm_en_lowest_nm,
          cm_de_lowest_nm: latestPrice.cm_de_lowest_nm,
          cm_fr_lowest_nm: latestPrice.cm_fr_lowest_nm,
          cm_es_lowest_nm: latestPrice.cm_es_lowest_nm,
          cm_it_lowest_nm: latestPrice.cm_it_lowest_nm,
          tcp_market: latestPrice.tcp_market,
          tcp_mid: latestPrice.tcp_mid,
          tcp_low: latestPrice.tcp_low,
          cm_en_avg_7d: latestPrice.cm_en_avg_7d,
          cm_en_avg_30d: latestPrice.cm_en_avg_30d,
        }
      : null,
    price_history: priceHistory,
    episode_id: card.episode.id,
    episode_name: card.episode.name,
    episode_code: card.episode.code,
  });
}
