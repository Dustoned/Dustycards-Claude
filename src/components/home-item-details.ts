import type { SealedModalProductData } from "@/components/sealed-modal/types";
import type {
  HomeSuddenDropSealedPreviewItem,
} from "@/lib/home-sudden-drops";
import type { HomeUpcomingPreviewItem } from "@/lib/home-overview-insights";

const EMPTY_SEALED_PRICE: SealedModalProductData["price"] = {
  cm_lowest: null,
  cm_lowest_eu: null,
  cm_lowest_de: null,
  cm_lowest_fr: null,
  cm_lowest_es: null,
  cm_lowest_it: null,
  cm_avg_7d: null,
  cm_avg_30d: null,
};

export function buildHomeSuddenDropSealedProduct(
  item: HomeSuddenDropSealedPreviewItem
): SealedModalProductData {
  return {
    id: item.productId,
    name: item.name,
    image_url: item.imageUrl,
    cardmarket_url: null,
    price: {
      ...EMPTY_SEALED_PRICE,
      cm_lowest_eu: item.currentPrice,
    },
    episode: {
      id: item.episodeId,
      name: item.episodeName,
      code: item.episodeCode,
    },
  };
}

export function buildHomeUpcomingSealedProduct(
  item: HomeUpcomingPreviewItem
): SealedModalProductData | null {
  if (!item.productId) return null;

  return {
    id: item.productId,
    name: item.name,
    image_url: item.imageUrl,
    cardmarket_url: null,
    release_date: item.releaseDate,
    release_date_source: item.sourceName,
    release_date_source_url: item.sourceUrl,
    price: { ...EMPTY_SEALED_PRICE },
    episode: item.episodeId
      ? {
          id: item.episodeId,
          name: item.episodeName ?? "Sealed release",
          code: item.episodeCode,
        }
      : null,
  };
}
