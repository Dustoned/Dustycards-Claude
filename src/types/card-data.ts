export interface GradedPriceData {
  label: string;
  price: number;
}

export interface EbaySoldGradedPriceData {
  source: "ebay_sold";
  label: string;
  company: string;
  grade: string;
  median_price: number;
  currency: string;
  sample_size: number | null;
  median_price_eur?: number | null;
  exchange_rate_usd_eur?: number | null;
  exchange_rate_date?: string | null;
}

export interface CardData {
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
  episode_id?: string;
  episode_name?: string | null;
  episode_code?: string | null;
  price_source_status: string | null;
  price_source_checked_at: string | null;
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
  graded_prices?: GradedPriceData[];
  ebay_sold_graded_prices?: EbaySoldGradedPriceData[];
  pull_rate_info?: {
    source: string;
    rarity_name: string;
    pull_rate_odds: string | null;
    specific_pull_odds: string | null;
    pull_rate_weight: number | null;
    psa_avg_gem_pct: number | null;
  } | null;
}
