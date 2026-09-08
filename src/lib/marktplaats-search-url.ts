const MARKTPLAATS_SEARCH_URL = "https://www.marktplaats.nl/q/";

type SearchToken = string | null | undefined;

function normalizeMarktplaatsSearchToken(value: SearchToken): string | null {
  const normalized = value
    ?.replace(/[^\p{L}\p{N}./&' -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized ? normalized : null;
}

export function buildCardMarktplaatsSearchUrl(input: {
  name: string;
  cardNumber?: SearchToken;
  graded?: boolean;
}): string {
  const cardNumber = input.cardNumber?.replace(/^#/, "");
  const query = [
    normalizeMarktplaatsSearchToken(input.name),
    normalizeMarktplaatsSearchToken(cardNumber),
    input.graded ? "graded" : null,
  ]
    .filter((token): token is string => Boolean(token))
    .join(" ");

  return `${MARKTPLAATS_SEARCH_URL}${encodeURIComponent(query).replace(/%20/g, "+")}/`;
}
