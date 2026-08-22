import { getSealedSearchScore, normalizeSealedSearchText } from "@/lib/sealed-search";

export const SEALED_ORIGIN_PRICE_SOURCE = "sealed_origin";

export interface SealedOriginCardRef {
  id: string;
  game: string;
  episode_id: string;
}

export interface SealedOriginProductRef {
  id: string;
  game: string;
  episode_id: string;
  contentSets: Array<{ episode_id: string }>;
  includedCards: Array<{ card_id: string }>;
}

export interface SealedOriginPriceRef {
  cm_lowest: number | null;
  cm_lowest_eu: number | null;
  cm_lowest_de: number | null;
  cm_lowest_fr: number | null;
  cm_lowest_es: number | null;
  cm_lowest_it: number | null;
  cm_avg_7d: number | null;
  cm_avg_30d: number | null;
}

export interface SealedOriginAutocompleteRef {
  id: string;
  name: string;
  owned: boolean;
  matches_cards: boolean;
  episode: {
    name: string;
    code: string | null;
  };
}

/**
 * Ranks every matching autocomplete option. Products that are known to
 * contain the selected card(s) win close ties, while direct name matches still
 * stay ahead so a collector can manually choose an origin missing from our
 * contents data.
 */
export function rankSealedOriginAutocompleteOptions<
  T extends SealedOriginAutocompleteRef,
>(options: T[], query: string): T[] {
  const normalizedQuery = normalizeSealedSearchText(query);

  return options
    .map((option, index) => {
      const name = normalizeSealedSearchText(option.name);
      const nameWords = name.split(" ").filter(Boolean);
      const searchScore = getSealedSearchScore(option, query);
      if (searchScore == null) {
        return null;
      }

      let score = searchScore + (option.matches_cards ? 100 : 0) + (option.owned ? 40 : 0);
      if (!normalizedQuery) {
        return { option, index, score };
      }
      if (nameWords.some((word) => word.startsWith(normalizedQuery))) score += 80;

      return { option, index, score };
    })
    .filter((entry): entry is { option: T; index: number; score: number } => entry != null)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.option);
}

export function sealedOriginMatchesCard(
  product: SealedOriginProductRef,
  card: SealedOriginCardRef
): boolean {
  if (product.game !== card.game) return false;
  if (product.episode_id === card.episode_id) return true;
  if (product.contentSets.some((contentSet) => contentSet.episode_id === card.episode_id)) {
    return true;
  }
  return product.includedCards.some((includedCard) => includedCard.card_id === card.id);
}

export function sealedOriginMatchesAllCards(
  product: SealedOriginProductRef,
  cards: SealedOriginCardRef[]
): boolean {
  return cards.length > 0 && cards.every((card) => sealedOriginMatchesCard(product, card));
}

export function getSealedOriginMarketPrice(product: SealedOriginPriceRef): number | null {
  const candidates = [
    product.cm_lowest_eu,
    product.cm_lowest,
    product.cm_lowest_de,
    product.cm_lowest_fr,
    product.cm_lowest_es,
    product.cm_lowest_it,
    product.cm_avg_7d,
    product.cm_avg_30d,
  ];

  return candidates.find((value): value is number => value != null && value > 0 && value !== 9001) ?? null;
}
