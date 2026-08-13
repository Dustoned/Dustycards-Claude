import type { SealedModalProductData } from "@/components/sealed-modal/types";
import type { UpcomingSealedRelease } from "@/lib/sealed-movers";

export function buildUpcomingSealedDetailProduct(
  release: UpcomingSealedRelease
): SealedModalProductData | null {
  if (!release.productId) return null;

  return {
    id: release.productId,
    name: release.name,
    image_url: release.imageUrl,
    cardmarket_url: null,
    release_date: release.releaseDate,
    release_date_source: release.sourceName,
    release_date_source_url: release.sourceUrl,
    release_date_confidence: release.confidence,
    price: {
      cm_lowest: null,
      cm_lowest_eu: null,
      cm_lowest_de: null,
      cm_lowest_fr: null,
      cm_lowest_es: null,
      cm_lowest_it: null,
      cm_avg_7d: null,
      cm_avg_30d: null,
    },
    episode: release.episodeId
      ? {
          id: release.episodeId,
          name: release.episodeName ?? "Sealed release",
          code: release.episodeCode,
        }
      : null,
  };
}
