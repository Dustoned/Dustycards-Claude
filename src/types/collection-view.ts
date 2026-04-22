export interface CollectionCardViewItem {
  collection_item_id: string | null;
  collection_item_ids?: string[];
  binder_id?: string | null;
  card_id: string;
  name: string;
  image_url: string | null;
  card_number: string | null;
  rarity: string | null;
  supertype: string | null;
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  cm_value?: number | null;
  tcp_value?: number | null;
  current_value: number | null;
  current_value_label?: string | null;
  purchase_price: number | null;
  condition: string | null;
  language?: string | null;
  notes?: string | null;
  tags?: string[];
  grading_company: string | null;
  grading_grade: string | null;
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
