const EBAY_NL_SEARCH_URL = "https://www.ebay.nl/sch/i.html";
const EBAY_CARD_CATEGORY_ID = "183454";
const EBAY_MAX_SEARCH_QUERY_LENGTH = 100;

type SearchToken = string | null | undefined;

function normalizeEbaySearchToken(value: SearchToken): string | null {
  const normalized = value
    ?.replace(/[^\p{L}\p{N}./&' -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized ? normalized : null;
}

function uniqueEbaySearchTokens(values: SearchToken[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = normalizeEbaySearchToken(value);
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function buildLimitedEbaySearchQuery(tokens: string[]): string {
  const query = tokens.join(" ");
  return query.length <= EBAY_MAX_SEARCH_QUERY_LENGTH
    ? query
    : query.slice(0, EBAY_MAX_SEARCH_QUERY_LENGTH).trim();
}

export function buildEbaySearchUrl(
  query: string,
  options: { categoryId?: string | null } = {}
): string {
  const url = new URL(EBAY_NL_SEARCH_URL);
  const normalizedQuery = normalizeEbaySearchToken(query);
  const categoryId = options.categoryId ?? null;

  if (normalizedQuery) {
    url.searchParams.set("_nkw", normalizedQuery);
  }
  if (categoryId) {
    url.searchParams.set("_sacat", categoryId);
  }

  return url.toString();
}

export function buildCardEbaySearchUrl(input: {
  name: string;
  cardNumber?: SearchToken;
  gradingCompany?: SearchToken;
  gradingGrade?: SearchToken;
}): string {
  const cardNumber = input.cardNumber?.replace(/^#/, "");
  const gradingToken =
    input.gradingCompany && input.gradingGrade
      ? `${input.gradingCompany} ${input.gradingGrade}`
      : input.gradingCompany ?? input.gradingGrade;
  const query = buildLimitedEbaySearchQuery(
    uniqueEbaySearchTokens([input.name, cardNumber, gradingToken])
  );

  return buildEbaySearchUrl(query, { categoryId: EBAY_CARD_CATEGORY_ID });
}

export function buildSealedEbaySearchUrl(input: {
  name: string;
  episodeName?: SearchToken;
  episodeCode?: SearchToken;
}): string {
  const query = buildLimitedEbaySearchQuery(
    uniqueEbaySearchTokens([input.name, input.episodeName, input.episodeCode])
  );

  return buildEbaySearchUrl(query);
}
