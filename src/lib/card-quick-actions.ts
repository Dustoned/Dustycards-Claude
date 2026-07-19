export interface CardQuickActionCard {
  id: string;
  name: string;
  image_url: string | null;
  episode: {
    id: string;
    name: string;
    code: string | null;
  };
}

export interface CardQuickActionData {
  card: CardQuickActionCard;
  owned: boolean;
  wantItem: {
    id: string;
    created_at: string;
  } | null;
}

export type CardQuickActionMap = Record<string, CardQuickActionData>;
