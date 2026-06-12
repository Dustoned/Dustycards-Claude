export const STALE_PRICE_AGE_MS = 1000 * 60 * 60 * 24 * 14;

// Cards the price source (TCGgo) explicitly has no price for. These are an
// upstream limitation, not fixable data debt, so quality signals exclude them.
export const KNOWN_UNAVAILABLE_PRICE_STATUS = "unavailable";

export interface DataQualityItem {
  id: string;
  name: string;
  detail: string | null;
  game: string;
  episodeId: string;
  episodeName: string;
  kind: "card" | "sealed";
}
