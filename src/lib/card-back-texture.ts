export const POKEMON_CARD_BACK_URL = "/assets/pokemon-card-back.jpg";
// Modern Japanese reverse, sourced from an official Pokémon Company press asset.
export const POKEMON_JAPANESE_CARD_BACK_URL =
  "/assets/pokemon-card-back-japanese.webp";
// Official reverse designs shown in Bandai's ONE PIECE Card Game Rule Manual.
export const ONE_PIECE_STANDARD_CARD_BACK_URL =
  "/assets/one-piece-card-back-standard.webp";
export const ONE_PIECE_LEADER_CARD_BACK_URL =
  "/assets/one-piece-card-back-leader.webp";
export const ONE_PIECE_DON_CARD_BACK_URL =
  "/assets/one-piece-card-back-don.webp";

interface CardBackIdentity {
  game?: string | null;
  name?: string | null;
  rarity?: string | null;
  supertype?: string | null;
  subtypes?: string | null;
}

function normalize(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function getCardBackTextureUrl(card: CardBackIdentity): string {
  const game = normalize(card.game);
  if (game === "pokemon-jp") return POKEMON_JAPANESE_CARD_BACK_URL;
  if (game !== "one-piece") return POKEMON_CARD_BACK_URL;

  const name = normalize(card.name);
  const rarity = normalize(card.rarity);
  const type = `${normalize(card.supertype)} ${normalize(card.subtypes)}`;

  if (name === "don!!" || rarity === "don!!" || /\bdon(?:!!)?\b/.test(type)) {
    return ONE_PIECE_DON_CARD_BACK_URL;
  }
  if (rarity === "leader" || /\bleader\b/.test(type)) {
    return ONE_PIECE_LEADER_CARD_BACK_URL;
  }
  return ONE_PIECE_STANDARD_CARD_BACK_URL;
}
