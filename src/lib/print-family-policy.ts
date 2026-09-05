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

/** Manual visual review may resolve missing metadata, never conflicting known artists. */
export function canManuallyConfirmPrintingArtists(left: string | null | undefined, right: string | null | undefined): boolean {
  return !normalizeText(left) || !normalizeText(right) || haveSameKnownPrintingArtist(left, right);
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
  if (!sourceEpisodeId || !targetEpisodeId) return false;
  if (matchMethod === "manual-include") return canManuallyConfirmPrintingArtists(sourceArtist, targetArtist);
  if (!haveSameKnownPrintingArtist(sourceArtist, targetArtist)) return false;
  return ["strong-art", "rules-exact", "rules-and-art", "lineage-and-art"].includes(matchMethod) &&
    Number.isFinite(imageSimilarity) && imageSimilarity >= STRONG_REPRINT_IMAGE_SIMILARITY &&
    imageSimilarity <= 1;
}

