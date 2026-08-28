export type TradingCardGame = "pokemon" | "pokemon-jp" | "one-piece";
export type TradingCardGameFilter = "all" | TradingCardGame;

export const ALL_GAMES = "all" satisfies TradingCardGameFilter;
export const POKEMON_GAME = "pokemon" satisfies TradingCardGame;
export const POKEMON_JAPANESE_GAME = "pokemon-jp" satisfies TradingCardGame;
export const ONE_PIECE_GAME = "one-piece" satisfies TradingCardGame;
export const GAME_SEARCH_PARAM = "game";
export const GAME_FILTER_OPTIONS = [ALL_GAMES, POKEMON_GAME, ONE_PIECE_GAME] as const;

export function normalizeTradingCardGame(value: string | null | undefined): TradingCardGame {
  if (value === ONE_PIECE_GAME) return ONE_PIECE_GAME;
  if (value === POKEMON_JAPANESE_GAME) return POKEMON_JAPANESE_GAME;
  return POKEMON_GAME;
}

export function parseVisibleTradingCardGame(
  value: string | null | undefined,
  options?: { onePieceEnabled?: boolean }
): TradingCardGame {
  return value === ONE_PIECE_GAME && options?.onePieceEnabled
    ? ONE_PIECE_GAME
    : POKEMON_GAME;
}

export function parseVisibleGameFilter(
  value: string | null | undefined,
  options?: { onePieceEnabled?: boolean }
): TradingCardGameFilter {
  if (!options?.onePieceEnabled) return POKEMON_GAME;
  if (value === POKEMON_GAME || value === ONE_PIECE_GAME || value === ALL_GAMES) {
    return value;
  }
  return ALL_GAMES;
}

export function getGameSearchParamValue(game: TradingCardGame): string | null {
  return game === POKEMON_GAME ? null : game;
}

export function getGameFilterSearchParamValue(game: TradingCardGameFilter): string | null {
  return game === ALL_GAMES ? null : game;
}

export function isSpecificTradingCardGame(
  game: TradingCardGameFilter | null | undefined
): game is TradingCardGame {
  return (
    game === POKEMON_GAME ||
    game === POKEMON_JAPANESE_GAME ||
    game === ONE_PIECE_GAME
  );
}

export function getTcggoGamePath(game: TradingCardGame): string {
  if (game === ONE_PIECE_GAME) return "one-piece";
  if (game === POKEMON_JAPANESE_GAME) return "pokemon-jp";
  return "pokemon";
}

export function getGameLabel(game: TradingCardGame): string {
  if (game === ONE_PIECE_GAME) return "One Piece";
  if (game === POKEMON_JAPANESE_GAME) return "Pokémon Japanese";
  return "Pokemon";
}

export function getGameFilterLabel(game: TradingCardGameFilter): string {
  return game === ALL_GAMES ? "All" : getGameLabel(game);
}

export function scopeGameId(game: TradingCardGame, id: string | number | null | undefined): string {
  const value = String(id ?? "").trim();
  if (!value) return value;
  if (game === POKEMON_GAME) return value;
  return value.startsWith(`${game}:`) ? value : `${game}:${value}`;
}

export function getGameFromScopedId(id: string | null | undefined): TradingCardGame {
  if (id?.startsWith(`${POKEMON_JAPANESE_GAME}:`)) return POKEMON_JAPANESE_GAME;
  if (id?.startsWith(`${ONE_PIECE_GAME}:`)) return ONE_PIECE_GAME;
  return POKEMON_GAME;
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
