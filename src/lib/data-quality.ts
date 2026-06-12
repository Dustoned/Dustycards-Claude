export const STALE_PRICE_AGE_MS = 1000 * 60 * 60 * 24 * 14;

export interface DataQualityItem {
  id: string;
  name: string;
  detail: string | null;
  game: string;
  episodeId: string;
  episodeName: string;
  kind: "card" | "sealed";
}
