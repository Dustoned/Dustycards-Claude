import { GAME_SEARCH_PARAM, POKEMON_GAME } from "@/lib/games";

/**
 * The account setting is saved asynchronously. Force Home's client-side API
 * requests to Pokemon immediately when the One Piece library is switched off,
 * even if the surrounding server component was rendered with older settings.
 */
export function scopeHomeApiEndpointToVisibleLibraries(
  endpoint: string,
  onePieceEnabled: boolean
): string {
  if (onePieceEnabled) return endpoint;

  const hashIndex = endpoint.indexOf("#");
  const hash = hashIndex >= 0 ? endpoint.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? endpoint.slice(0, hashIndex) : endpoint;
  const queryIndex = withoutHash.indexOf("?");
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const search = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "";
  const params = new URLSearchParams(search);
  params.set(GAME_SEARCH_PARAM, POKEMON_GAME);

  return `${pathname}?${params.toString()}${hash}`;
}
