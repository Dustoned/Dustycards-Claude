import type {
  BgsSubgrades,
} from "@/lib/graded-slabs";
import type {
  CardEbaySoldGradedPriceHistorySeries,
  CardGradedPriceHistorySeries,
  CardPriceHistoryPoint,
} from "@/lib/price-history";
import type { BuySignalResult } from "@/lib/buy-signal";
import type { TradingCardGame } from "@/lib/games";

export interface ModalCardData {
  id: string;
  game: TradingCardGame;
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
  ebay_sold_graded_status?: string | null;
  ebay_sold_graded_checked_at?: string | null;
  ebay_sold_graded_synced_at?: string | null;
  price_fetched_at: string | null;
  price: {
    cm_en_lowest_nm: number | null;
    cm_de_lowest_nm: number | null;
    cm_fr_lowest_nm: number | null;
    cm_es_lowest_nm: number | null;
    cm_it_lowest_nm: number | null;
    cm_jp_lowest_nm?: number | null;
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
  ebay_sold_graded_prices?: Array<{
    source: "ebay_sold";
    label: string;
    company: string;
    grade: string;
    median_price: number;
    currency: string;
    sample_size: number | null;
    fetched_at?: string | null;
    median_price_eur?: number | null;
    exchange_rate_usd_eur?: number | null;
    exchange_rate_date?: string | null;
  }>;
  graded_price_history?: CardGradedPriceHistorySeries[];
  ebay_sold_graded_price_history?: CardEbaySoldGradedPriceHistorySeries[];
  price_history: CardPriceHistoryPoint[];
  buy_signal?: BuySignalResult;
  pull_rate_info?: {
    source: string;
    rarity_name: string;
    pull_rate_odds: string | null;
    specific_pull_odds: string | null;
    pull_rate_weight: number | null;
    psa_avg_gem_pct: number | null;
  } | null;
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  episode_series?: string | null;
  episode_release_date?: string | null;
  collection_item?: {
    id: string;
    binder_id: string | null;
    for_sale?: boolean;
    binder_name?: string | null;
    binder_type?: string | null;
    purchase_price: number | null;
    cost_basis_value: number | null;
    cost_basis_label: "Paid" | "Overall Spend";
    cost_basis_source: "direct" | "linked_binder_allocation";
    condition: string | null;
    language: string | null;
    notes: string | null;
    tags: string[];
    grading_company: string | null;
    grading_grade: string | null;
    grading_subgrades?: BgsSubgrades | null;
    read_only?: boolean;
  } | null;
  want_item?: {
    id: string;
    created_at: string;
  } | null;
}

export type ModalCardCollectionItem = NonNullable<ModalCardData["collection_item"]>;
export type { CurrencyCode } from "@/lib/format";
