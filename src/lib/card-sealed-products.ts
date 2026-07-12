export type CardSealedMatchType = "set_product" | "mixed_pack" | "included_promo";

export interface CardSealedProductItem {
  id: string;
  name: string;
  imageUrl: string | null;
  tcggoUrl: string | null;
  cardmarketUrl: string | null;
  cardmarketId: string | null;
  releaseDate: string | null;
  matchType: CardSealedMatchType;
  relationSourceName: string | null;
  relationSourceUrl: string | null;
  relationConfidence: number | null;
  price: {
    cm_lowest: number | null;
    cm_lowest_eu: number | null;
    cm_lowest_de: number | null;
    cm_lowest_fr: number | null;
    cm_lowest_es: number | null;
    cm_lowest_it: number | null;
    cm_avg_7d: number | null;
    cm_avg_30d: number | null;
  };
  episode: {
    id: string;
    name: string;
    code: string | null;
  };
}

export function getCardSealedProductPrice(item: CardSealedProductItem): number | null {
  return (
    item.price.cm_lowest ??
    item.price.cm_lowest_eu ??
    item.price.cm_lowest_de ??
    item.price.cm_lowest_fr ??
    item.price.cm_lowest_es ??
    item.price.cm_lowest_it
  );
}
