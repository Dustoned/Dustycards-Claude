export type TradingCardGame = "pokemon" | "one-piece";

export const POKEMON_GAME = "pokemon" satisfies TradingCardGame;
export const ONE_PIECE_GAME = "one-piece" satisfies TradingCardGame;
export const GAME_SEARCH_PARAM = "game";

export function normalizeTradingCardGame(value: string | null | undefined): TradingCardGame {
  return value === ONE_PIECE_GAME ? ONE_PIECE_GAME : POKEMON_GAME;
}

export function parseVisibleTradingCardGame(
  value: string | null | undefined,
  options?: { onePieceEnabled?: boolean }
): TradingCardGame {
  return value === ONE_PIECE_GAME && options?.onePieceEnabled
    ? ONE_PIECE_GAME
    : POKEMON_GAME;
}

export function getGameSearchParamValue(game: TradingCardGame): string | null {
  return game === ONE_PIECE_GAME ? ONE_PIECE_GAME : null;
}

export function getTcggoGamePath(game: TradingCardGame): string {
  return game === ONE_PIECE_GAME ? "one-piece" : "pokemon";
}

export function getGameLabel(game: TradingCardGame): string {
  return game === ONE_PIECE_GAME ? "One Piece" : "Pokemon";
}

export function scopeGameId(game: TradingCardGame, id: string | number | null | undefined): string {
  const value = String(id ?? "").trim();
  if (!value) return value;
  if (game === POKEMON_GAME) return value;
  return value.startsWith(`${game}:`) ? value : `${game}:${value}`;
}

export function getGameFromScopedId(id: string | null | undefined): TradingCardGame {
  return id?.startsWith(`${ONE_PIECE_GAME}:`) ? ONE_PIECE_GAME : POKEMON_GAME;
}

export function getRemoteTcggoId(game: TradingCardGame, id: string | number): string {
  const value = String(id).trim();
  if (game === POKEMON_GAME) return value;
  return value.startsWith(`${game}:`) ? value.slice(game.length + 1) : value;
}

export function getExpansionHref(episodeId: string): string {
  return getGameFromScopedId(episodeId) === ONE_PIECE_GAME
    ? `/one-piece/expansions/${encodeURIComponent(episodeId)}`
    : `/expansions/${encodeURIComponent(episodeId)}`;
}
