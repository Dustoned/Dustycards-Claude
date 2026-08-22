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

function normalizeSealedOriginSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
  const normalizedQuery = normalizeSealedOriginSearch(query);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);

  return options
    .map((option, index) => {
      const name = normalizeSealedOriginSearch(option.name);
      const episodeName = normalizeSealedOriginSearch(option.episode.name);
      const episodeCode = normalizeSealedOriginSearch(option.episode.code ?? "");
      const nameWords = name.split(" ").filter(Boolean);
      const acronym = nameWords.map((word) => word[0]).join("");
      const searchable = `${name} ${episodeName} ${episodeCode}`.trim();

      if (queryTokens.some((token) => !searchable.includes(token) && !acronym.includes(token))) {
        return null;
      }

      let score = (option.matches_cards ? 100 : 0) + (option.owned ? 40 : 0);
      if (!normalizedQuery) {
        return { option, index, score };
      }
      if (name === normalizedQuery) score += 1_000;
      else if (name.startsWith(normalizedQuery)) score += 800;
      else if (nameWords.some((word) => word.startsWith(normalizedQuery))) score += 650;
      else if (name.includes(normalizedQuery)) score += 560;
      else if (acronym.includes(normalizedQuery)) score += 520;

      for (const token of queryTokens) {
        if (nameWords.some((word) => word === token)) score += 120;
        else if (nameWords.some((word) => word.startsWith(token))) score += 90;
        else if (name.includes(token)) score += 65;
        else if (episodeCode === token) score += 55;
        else score += 30;
      }

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
