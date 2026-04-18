const CARDMARKET_PRODUCTS_BASE_URL = "https://www.cardmarket.com/Pokemon/Products";
const CARDMARKET_FILTERS = {
  language: "1",
  minCondition: "2",
} as const;

export function withCardMarketFilters(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("language", CARDMARKET_FILTERS.language);
    parsed.searchParams.set("minCondition", CARDMARKET_FILTERS.minCondition);
    return parsed.toString();
  } catch {
    return url;
  }
}

export function buildCardMarketProductUrl(cardmarketId: string): string {
  return withCardMarketFilters(
    `${CARDMARKET_PRODUCTS_BASE_URL}?idProduct=${encodeURIComponent(cardmarketId)}`
  );
}

export function buildCardMarketProxyUrl(cardId: string): string {
  return `https://www.tcggo.com/external/cm/${encodeURIComponent(cardId)}`;
}

export function isDirectCardMarketUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && url.startsWith("https://www.cardmarket.com/");
}
