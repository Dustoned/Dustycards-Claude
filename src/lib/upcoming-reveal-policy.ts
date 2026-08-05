const RELEASED_REPRINT_CONTEXT = /\b(?:promos?|reprints?|locali[sz](?:ation|ed))\b/i;

/**
 * Upcoming is for cards that are not already represented by a released
 * printing. Exact stored matches are always hidden. Name-only matches are
 * intentionally weaker, but are sufficient for explicitly reprint/localised
 * promo galleries where the source is previewing an existing card again.
 */
export function shouldShowUpcomingSourceReveal(input: {
  hasExactLibraryMatch: boolean;
  releasedNameMatchCount: number;
  episodeName: string | null;
}): boolean {
  if (input.hasExactLibraryMatch) return false;
  if (
    input.releasedNameMatchCount > 0
    && RELEASED_REPRINT_CONTEXT.test(input.episodeName ?? "")
  ) {
    return false;
  }
  return true;
}
