import type { CardPriceHistoryPoint } from "@/lib/price-history";

export interface ModalCardData {
  id: string;
  name: string;
  card_number: string | null;
  rarity: string | null;
  hp: number | string | null;
  image_url: string | null;
  supertype: string | null;
  subtypes: string | null;
  artist: string | null;
  cardmarket_id: string | null;
  cardmarket_url: string | null;
  tcggo_url: string | null;
  price_source_status: string | null;
  price_source_checked_at: string | null;
  price_fetched_at: string | null;
  price: {
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
  } | null;
  graded_prices?: Array<{
    label: string;
    price: number;
  }>;
  price_history: CardPriceHistoryPoint[];
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  collection_item?: {
    id: string;
    binder_id: string | null;
    purchase_price: number | null;
    condition: string | null;
    language: string | null;
    notes: string | null;
    tags: string[];
    grading_company: string | null;
    grading_grade: string | null;
  } | null;
}

export type ModalCardCollectionItem = NonNullable<ModalCardData["collection_item"]>;
export type CurrencyCode = "EUR" | "USD";
