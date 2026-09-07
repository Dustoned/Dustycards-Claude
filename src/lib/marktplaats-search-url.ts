import type { TradingCardGame } from "@/lib/games";

const MARKTPLAATS_SEARCH_URL = "https://www.marktplaats.nl/q/";

type SearchToken = string | null | undefined;

function normalizeMarktplaatsSearchToken(value: SearchToken): string | null {
  const normalized = value
    ?.replace(/[^\p{L}\p{N}./&' -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized ? normalized : null;
}

function getGameSearchToken(game: TradingCardGame): string {
  if (game === "one-piece") return "One Piece kaart";
  if (game === "pokemon-jp") return "Pokemon Japanse kaart";
  return "Pokemon kaart";
}

export function buildCardMarktplaatsSearchUrl(input: {
  name: string;
  cardNumber?: SearchToken;
  game?: TradingCardGame;
}): string {
  const cardNumber = input.cardNumber?.replace(/^#/, "");
  const query = [
    getGameSearchToken(input.game ?? "pokemon"),
    normalizeMarktplaatsSearchToken(input.name),
    normalizeMarktplaatsSearchToken(cardNumber),
  ]
    .filter((token): token is string => Boolean(token))
    .join(" ");

  return `${MARKTPLAATS_SEARCH_URL}${encodeURIComponent(query).replace(/%20/g, "+")}/`;
}
