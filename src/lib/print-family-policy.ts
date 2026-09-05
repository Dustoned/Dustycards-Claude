const STRONG_REPRINT_IMAGE_SIMILARITY = 0.92;
function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim() || null;
}
export function haveSameKnownPrintingArtist(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  return normalizedLeft != null && normalizedLeft === normalizedRight;
}

/** Apply the same artwork-family contract to stored and newly computed pairs. */
export function isEligiblePrintFamilyPair(
  sourceEpisodeId: string,
  targetEpisodeId: string,
  sourceArtist: string | null | undefined,
  targetArtist: string | null | undefined,
  matchMethod: string,
  imageSimilarity: number = 0
): boolean {
  if (!sourceEpisodeId || !targetEpisodeId ||
      !haveSameKnownPrintingArtist(sourceArtist, targetArtist)) return false;
  if (matchMethod === "manual-include") return true;
  return ["strong-art", "rules-exact", "rules-and-art", "lineage-and-art"].includes(matchMethod) &&
    Number.isFinite(imageSimilarity) && imageSimilarity >= STRONG_REPRINT_IMAGE_SIMILARITY &&
    imageSimilarity <= 1;
}

