import type { SealedPriceHistoryPoint } from "@/lib/price-history";

export interface SealedEpisodeRef {
  id: string;
  name: string;
  code: string | null;
  release_date?: string | null;
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

export interface SealedFeaturedCard {
  id: string;
  name: string;
  card_number: string | null;
  rarity: string | null;
  image_url: string | null;
  market_price: number | null;
  market_currency: "EUR" | "USD";
  pull_rate_info: {
    rarity_name: string;
    pull_rate_odds: string | null;
    specific_pull_odds: string | null;
    source: string;
  } | null;
}

export interface SealedModalProductData {
  id: string;
  collection_item_id?: string | null;
  name: string;
  image_url: string | null;
  tcggo_url?: string | null;
  cardmarket_url: string | null;
  cardmarket_id?: string | null;
  release_date?: string | null;
  release_date_source?: string | null;
  release_date_source_url?: string | null;
  release_date_confidence?: number | null;
  price: SealedPriceData;
  episode?: SealedEpisodeRef | null;
}

export interface SealedDetailResponse extends SealedModalProductData {
  collection_item_id?: string | null;
  cardmarket_id: string | null;
  price_fetched_at: string | null;
  history_synced_at: string | null;
  release_date: string | null;
  release_date_source: string | null;
  release_date_source_url: string | null;
  release_date_confidence: number | null;
  price_history: SealedPriceHistoryPoint[];
  featured_cards: SealedFeaturedCard[];
  collection_item?: {
    id: string;
    quantity: number;
    purchase_price_per_item: number | null;
    notes: string | null;
    added_at: string;
    updated_at: string;
    tags: string[];
  } | null;
  collection_summary?: {
    item_count: number;
    quantity: number;
    paid_total: number | null;
  } | null;
}

export interface SealedActionResponse extends Partial<SealedDetailResponse> {
  error?: string;
  activeType?: string;
  resetAt?: string | null;
  cancelled?: boolean;
}
