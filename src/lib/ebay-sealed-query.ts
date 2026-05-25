const EBAY_MAX_SEARCH_QUERY_LENGTH = 100;
const POKEMON_CONTEXT = "Pokemon";

type SearchToken = string | null | undefined;

export interface EbaySealedProductSearchInput {
  name: string;
  episodeName?: SearchToken;
  episodeCode?: SearchToken;
}

function normalizeEbaySearchToken(value: SearchToken): string | null {
  const normalized = value
    ?.replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}./&' -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized ? normalized : null;
}

function limitSearchQuery(query: string): string {
  return query.length <= EBAY_MAX_SEARCH_QUERY_LENGTH
    ? query
    : query.slice(0, EBAY_MAX_SEARCH_QUERY_LENGTH).trim();
}

export function buildEbaySealedProductSearchQuery(
  input: EbaySealedProductSearchInput
): string {
  const productName = normalizeEbaySearchToken(input.name);
  if (!productName) return "";

  const hasPokemonContext = /\bpok[eé]mon\b/i.test(
    productName.normalize("NFKD").replace(/\p{M}/gu, "")
  );
  const query = hasPokemonContext ? productName : `${POKEMON_CONTEXT} ${productName}`;

  return limitSearchQuery(query);
}
