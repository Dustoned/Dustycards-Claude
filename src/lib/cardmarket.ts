import { POKEMON_GAME, type TradingCardGame } from "@/lib/games";

const CARDMARKET_PRODUCTS_BASE_URL_BY_GAME: Record<TradingCardGame, string> = {
  pokemon: "https://www.cardmarket.com/Pokemon/Products",
  "one-piece": "https://www.cardmarket.com/OnePiece/Products",
};
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

export function buildCardMarketProductUrl(
  cardmarketId: string,
  game: TradingCardGame = POKEMON_GAME
): string {
  const baseUrl = CARDMARKET_PRODUCTS_BASE_URL_BY_GAME[game];
  return withCardMarketFilters(
    `${baseUrl}?idProduct=${encodeURIComponent(cardmarketId)}`
  );
}

export function getCardMarketUrlGame(url: string | null | undefined): TradingCardGame | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const start = /^[a-z]{2}$/i.test(segments[0] ?? "") ? 1 : 0;
    const gameSegment = (segments[start] ?? "").toLowerCase();

    if (gameSegment === "pokemon") return "pokemon";
    if (gameSegment === "onepiece") return "one-piece";
    return null;
  } catch {
    return null;
  }
}

export function isCardMarketProductIdUrl(url: string | null | undefined): boolean {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const start = /^[a-z]{2}$/i.test(segments[0] ?? "") ? 1 : 0;
    const productSegment = (segments[start + 1] ?? "").toLowerCase();

    return (
      parsed.hostname === "www.cardmarket.com" &&
      productSegment === "products" &&
      parsed.searchParams.has("idProduct")
    );
  } catch {
    return false;
  }
}

export function getSafeDirectCardMarketCardUrl(
  url: string | null | undefined,
  game: TradingCardGame
): string | null {
  if (!isDirectCardMarketUrl(url)) return null;
  if (getCardMarketUrlGame(url) !== game) return null;
  // TCGGo currently provides almost every One Piece card as a CardMarket
  // idProduct URL. Sending those through the TCGGo fallback breaks because
  // DustyCards uses scoped IDs (for example `one-piece:28806`) while that
  // redirect endpoint expects its own unscoped identifier. CardMarket can
  // resolve the product ID directly, so keep the validated same-game URL.
  if (isCardMarketProductIdUrl(url) && game !== "one-piece") return null;
  return withCardMarketFilters(url);
}

export function resolveCardMarketCardUrl(card: {
  id: string;
  game: TradingCardGame;
  cardmarket_url?: string | null;
}): string {
  return getSafeDirectCardMarketCardUrl(card.cardmarket_url, card.game) ?? buildCardMarketProxyUrl(card.id);
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
  // DustyCards scopes One Piece IDs to avoid collisions with Pokemon IDs,
  // while TCGGO's external CardMarket redirect expects its original ID.
  const tcggoCardId = cardId.startsWith("one-piece:")
    ? cardId.slice("one-piece:".length)
    : cardId;
  return `https://www.tcggo.com/external/cm/${encodeURIComponent(tcggoCardId)}`;
}

export function isDirectCardMarketUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && url.startsWith("https://www.cardmarket.com/");
}
