const CARDMARKET_PRODUCTS_BASE_URL = "https://www.cardmarket.com/Pokemon/Products";
const CARDMARKET_LOCALIZED_PRODUCTS_BASE_URL =
  "https://www.cardmarket.com/en/Pokemon/Products";
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

function slugifyCardMarketProductName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " ")
    .replace(/['’]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeProductName(name: string): string {
  return ` ${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function getCardMarketSealedCategoryPath(name: string): string {
  const normalized = normalizeProductName(name);

  if (normalized.includes(" elite trainer box ")) return "Elite-Trainer-Boxes";
  if (normalized.includes(" tin ")) return "Tins";
  if (
    normalized.includes(" booster box ") ||
    normalized.includes(" booster bundle ") ||
    normalized.includes(" booster display ")
  ) {
    return "Booster-Boxes";
  }
  if (
    normalized.includes(" blister ") ||
    normalized.includes(" checklane ") ||
    normalized.includes(" klappblister ")
  ) {
    return "Blisters";
  }
  if (normalized.includes(" booster ") || normalized.includes(" pack ")) return "Boosters";
  if (normalized.includes(" sleeve ")) return "Sleeves";
  if (normalized.includes(" playmat ")) return "Playmats";
  if (
    normalized.includes(" binder ") ||
    normalized.includes(" chest ") ||
    normalized.includes(" storage ")
  ) {
    return "Storage";
  }
  if (normalized.includes(" deck ")) return "Theme-Decks";

  return "Box-Sets";
}

function isCardMarketProductIdUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const normalizedPath = parsed.pathname.replace(/^\/[a-z]{2}(?=\/Pokemon\/Products)/, "");

    return (
      parsed.hostname === "www.cardmarket.com" &&
      normalizedPath === "/Pokemon/Products" &&
      parsed.searchParams.has("idProduct")
    );
  } catch {
    return false;
  }
}

export function buildCardMarketSealedProductUrl(name: string): string | null {
  const slug = slugifyCardMarketProductName(name);
  if (!slug) return null;

  return `${CARDMARKET_LOCALIZED_PRODUCTS_BASE_URL}/${getCardMarketSealedCategoryPath(
    name
  )}/${slug}`;
}

export function resolveCardMarketSealedProductUrl(product: {
  name: string;
  cardmarket_url?: string | null;
}): string | null {
  if (isDirectCardMarketUrl(product.cardmarket_url) && !isCardMarketProductIdUrl(product.cardmarket_url)) {
    return product.cardmarket_url;
  }

  return buildCardMarketSealedProductUrl(product.name) ?? product.cardmarket_url ?? null;
}

export function buildCardMarketProxyUrl(cardId: string): string {
  return `https://www.tcggo.com/external/cm/${encodeURIComponent(cardId)}`;
}

export function isDirectCardMarketUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && url.startsWith("https://www.cardmarket.com/");
}
