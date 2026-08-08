import type { BgsSubgrades } from "@/lib/graded-slabs";

export interface CollectionCardViewItem {
  collection_item_id: string | null;
  collection_item_ids?: string[];
  want_item_id?: string | null;
  want_source?: string | null;
  want_source_episode_id?: string | null;
  binder_id?: string | null;
  binder_name?: string | null;
  binder_type?: string | null;
  for_sale?: boolean;
  sale_price?: number | null;
  sale_fee_eur?: number | null;
  sale_platform?: string | null;
  sold_at?: string | null;
  card_id: string;
  name: string;
  image_url: string | null;
  card_number: string | null;
  version?: string | null;
  rarity: string | null;
  supertype: string | null;
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  episode_series?: string | null;
  episode_release_date?: string | null;
  cm_value?: number | null;
  tcp_value?: number | null;
  tcp_value_eur?: number | null;
  exchange_rate_usd_eur?: number | null;
  exchange_rate_date?: string | null;
  current_value: number | null;
  current_value_label?: string | null;
  signal_score?: number | null;
  signal_tier?: string | null;
  chase_score?: number | null;
  chase_tier?: string | null;
  purchase_price: number | null;
  cost_basis_value: number | null;
  cost_basis_label: "Paid" | "Overall Spend";
  cost_basis_source: "direct" | "linked_binder_allocation";
  condition: string | null;
  language?: string | null;
  notes?: string | null;
  tags?: string[];
  grading_company: string | null;
  grading_grade: string | null;
  grading_subgrades?: BgsSubgrades | null;
  owned: boolean;
  owned_count?: number;
}

export interface CollectionSealedViewItem {
  id: string;
  product_id: string;
  name: string;
  image_url: string | null;
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  cardmarket_url: string | null;
  quantity: number;
  purchase_price_per_item: number | null;
  current_value_per_item: number | null;
}
