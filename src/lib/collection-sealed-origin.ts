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

export interface OpeningSealedPoolProductRef extends SealedOriginProductRef {
  name: string;
  episode: {
    name: string;
    code: string | null;
  };
}

export interface OpeningSealedPoolPolicy {
  strict: boolean;
  reason: "named-expansion" | "declared-content-sets" | "unknown-pack-contents";
  episodeIds: string[];
  includedCardIds: string[];
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

const GENERIC_EPISODE_NAMES = new Set([
  "one piece",
  "pokemon",
  "pokemon tcg",
  "promos",
]);

function productNameIdentifiesEpisode(
  productName: string,
  episode: { name: string; code: string | null }
): boolean {
  const normalizedProductName = normalizeSealedSearchText(productName);
  const normalizedEpisodeName = normalizeSealedSearchText(episode.name);
  const normalizedEpisodeCode = normalizeSealedSearchText(episode.code ?? "");
  if (!normalizedProductName) return false;

  if (
    normalizedEpisodeName.length >= 3 &&
    !GENERIC_EPISODE_NAMES.has(normalizedEpisodeName) &&
    normalizedProductName.includes(normalizedEpisodeName)
  ) {
    return true;
  }

  const productTokens = new Set(normalizedProductName.split(" ").filter(Boolean));
  return normalizedEpisodeCode.length >= 2 && productTokens.has(normalizedEpisodeCode);
}

/**
 * A set-restricted opening is only safe when the product identifies its set
 * in its own name/code or when pack contents were explicitly mapped. Character
 * boxes with unknown assorted packs stay broad instead of pretending their
 * catalogue episode describes every pack inside the box.
 */
export function getOpeningSealedPoolPolicy(
  product: OpeningSealedPoolProductRef
): OpeningSealedPoolPolicy {
  const namedExpansion = productNameIdentifiesEpisode(product.name, product.episode);
  const declaredContentEpisodeIds = [
    ...new Set(product.contentSets.map((contentSet) => contentSet.episode_id)),
  ];
  const episodeIds = [
    ...new Set([
      ...(namedExpansion ? [product.episode_id] : []),
      ...declaredContentEpisodeIds,
    ]),
  ];

  return {
    strict: episodeIds.length > 0,
    reason: namedExpansion
      ? "named-expansion"
      : declaredContentEpisodeIds.length > 0
        ? "declared-content-sets"
        : "unknown-pack-contents",
    episodeIds,
    includedCardIds: [
      ...new Set(product.includedCards.map((includedCard) => includedCard.card_id)),
    ],
  };
}

export function openingSealedProductMatchesCard(
  product: OpeningSealedPoolProductRef,
  card: SealedOriginCardRef
): boolean {
  if (product.game !== card.game) return false;

  const policy = getOpeningSealedPoolPolicy(product);
  if (!policy.strict) return true;
  return policy.episodeIds.includes(card.episode_id) || policy.includedCardIds.includes(card.id);
}

export function openingSealedProductMatchesAllCards(
  product: OpeningSealedPoolProductRef,
  cards: SealedOriginCardRef[]
): boolean {
  return cards.length > 0 && cards.every((card) => openingSealedProductMatchesCard(product, card));
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
