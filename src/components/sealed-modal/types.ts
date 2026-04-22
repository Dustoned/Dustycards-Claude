import type { SealedPriceHistoryPoint } from "@/lib/price-history";

export interface SealedEpisodeRef {
  id: string;
  name: string;
  code: string | null;
}

export interface SealedPriceData {
  cm_lowest: number | null;
  cm_lowest_eu: number | null;
  cm_lowest_de: number | null;
  cm_lowest_fr: number | null;
  cm_lowest_es: number | null;
  cm_lowest_it: number | null;
  cm_avg_7d: number | null;
  cm_avg_30d: number | null;
}

export interface SealedModalProductData {
  id: string;
  name: string;
  image_url: string | null;
  tcggo_url?: string | null;
  cardmarket_url: string | null;
  price: SealedPriceData;
  episode?: SealedEpisodeRef | null;
}

export interface SealedDetailResponse extends SealedModalProductData {
  cardmarket_id: string | null;
  price_fetched_at: string | null;
  history_synced_at: string | null;
  price_history: SealedPriceHistoryPoint[];
}

export interface SealedActionResponse extends Partial<SealedDetailResponse> {
  error?: string;
  activeType?: string;
  resetAt?: string | null;
  cancelled?: boolean;
}
