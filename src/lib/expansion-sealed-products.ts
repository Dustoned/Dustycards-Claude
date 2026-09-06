import { db } from "@/lib/db";
import type { TradingCardGame } from "@/lib/games";
import type { NormalizedSealedProduct } from "@/lib/tcggo";

export interface StoredSealedProductRow {
  id: string;
  name: string;
  image_url: string | null;
  tcggo_url: string | null;
  cardmarket_url: string | null;
  cardmarket_id: string | null;
  tcgplayer_id: string | null;
  cm_lowest: number | null;
  cm_lowest_eu: number | null;
  cm_lowest_de: number | null;
  cm_lowest_fr: number | null;
  cm_lowest_es: number | null;
  cm_lowest_it: number | null;
  cm_avg_7d: number | null;
  cm_avg_30d: number | null;
}

export function toNormalizedSealedProduct(
  product: StoredSealedProductRow,
  game: TradingCardGame
): NormalizedSealedProduct {
  return {
    id: product.id,
    game,
    name: product.name,
    image_url: product.image_url,
    tcggo_url: product.tcggo_url,
    cardmarket_url: product.cardmarket_url,
    cardmarket_id: product.cardmarket_id,
    tcgplayer_id: product.tcgplayer_id,
    price: {
      cm_lowest: product.cm_lowest,
      cm_lowest_eu: product.cm_lowest_eu,
      cm_lowest_de: product.cm_lowest_de,
      cm_lowest_fr: product.cm_lowest_fr,
      cm_lowest_es: product.cm_lowest_es,
      cm_lowest_it: product.cm_lowest_it,
      cm_avg_7d: product.cm_avg_7d,
      cm_avg_30d: product.cm_avg_30d,
    },
  };
}

/**
 * The stored sealed products of one expansion, in the shape the sealed tab
 * renders. Shared by the Pokémon and One Piece expansion pages so both show
 * whatever the sealed sync has collected.
 */
export async function loadExpansionSealedProducts(
  episodeId: string,
  game: TradingCardGame
): Promise<NormalizedSealedProduct[]> {
  const rows = await db.sealedProduct.findMany({
    where: { episode_id: episodeId },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      image_url: true,
      tcggo_url: true,
      cardmarket_url: true,
      cardmarket_id: true,
      tcgplayer_id: true,
      cm_lowest: true,
      cm_lowest_eu: true,
      cm_lowest_de: true,
      cm_lowest_fr: true,
      cm_lowest_es: true,
      cm_lowest_it: true,
      cm_avg_7d: true,
      cm_avg_30d: true,
    },
  });
  return rows.map((row) => toNormalizedSealedProduct(row, game));
}
