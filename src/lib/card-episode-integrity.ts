const PROMO_PREFIX_EPISODE_CODES: Record<string, string> = {
  svp: "prsv",
};

function compact(value: string | null | undefined): string {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
}

export function isCardCompatibleWithEpisodeCode(
  tcgid: string | null | undefined,
  episodeCode: string | null | undefined
): boolean {
  const normalizedEpisodeCode = compact(episodeCode);
  if (!normalizedEpisodeCode) return true;

  const prefix = tcgid?.trim().split("-")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  const requiredEpisodeCode = PROMO_PREFIX_EPISODE_CODES[prefix];
  return requiredEpisodeCode == null || requiredEpisodeCode === normalizedEpisodeCode;
}
