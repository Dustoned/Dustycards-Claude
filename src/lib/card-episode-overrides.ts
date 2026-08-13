import type { Prisma } from "@/generated/prisma";

const CARD_EPISODE_OVERRIDES = new Map<string, string>([
  // The 151 UPC metal Mew is a separate physical promo product that reuses
  // 205/165. It must not consume a duplicate slot in the 151 checklist.
  ["47943", "23"],
]);

export function getCardEpisodeOverride(cardId: string): string | null {
  return CARD_EPISODE_OVERRIDES.get(cardId) ?? null;
}

export function buildCardEpisodeAssignment(
  cardId: string,
  sourceEpisodeId: string
): Pick<Prisma.CardUncheckedCreateInput, "episode_id"> {
  return { episode_id: getCardEpisodeOverride(cardId) ?? sourceEpisodeId };
}
