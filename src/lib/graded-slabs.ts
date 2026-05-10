export const RAW_TCG_CARD_DIMENSIONS = {
  width: 63,
  height: 88,
} as const;

export const PSA_SLAB_MODEL_DIMENSIONS = {
  width: 80.3,
  height: 135.2,
  depth: 6.3,
} as const;

export const RAW_CARD_ASPECT_CLASS = "aspect-[63/88]";
export const GRADED_SLAB_ASPECT_CLASS = "aspect-[80.3/135.2]";
export const GRADED_SLAB_COMPANIES = ["PSA", "BGS", "CGC", "SGC", "ACE", "TAG"] as const;

export type SupportedGradedSlabCompany = (typeof GRADED_SLAB_COMPANIES)[number];

const SUPPORTED_GRADED_SLAB_SET = new Set<string>(GRADED_SLAB_COMPANIES);

export function normalizeGradingCompanyLabel(
  company: string | null | undefined
): SupportedGradedSlabCompany | null {
  const normalized = company?.trim().toUpperCase() ?? "";
  if (!normalized || !SUPPORTED_GRADED_SLAB_SET.has(normalized)) {
    return null;
  }

  return normalized as SupportedGradedSlabCompany;
}

export function normalizeGradingGradeLabel(grade: string | null | undefined): string | null {
  const normalized = grade?.trim().toUpperCase().replace(/\s+/g, " ") ?? "";
  if (!normalized) return null;

  if (/^\d+(?:\.0+)?$/.test(normalized)) {
    return String(Number(normalized));
  }

  return normalized;
}

export function getPsaGradeDescriptor(grade: string | null): string | null {
  if (!grade) return null;

  const numericGrade = Number(grade);
  if (!Number.isFinite(numericGrade)) return null;

  if (numericGrade >= 10) return "GEM MT";
  if (numericGrade >= 9) return "MINT";
  if (numericGrade >= 8) return "NM-MT";
  if (numericGrade >= 7) return "NM";
  if (numericGrade >= 6) return "EX-MT";
  if (numericGrade >= 5) return "EX";
  if (numericGrade >= 4) return "VG-EX";
  if (numericGrade >= 3) return "VG";
  if (numericGrade >= 2) return "GOOD";

  return "PR";
}

export function formatPsaNameLine(name: string): string {
  return name
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function formatPsaToken(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[()]/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function getPsaReleaseYear(releaseDate: string | null | undefined): string | null {
  const year = releaseDate?.match(/^(\d{4})/)?.[1] ?? null;
  return year && Number.isInteger(Number(year)) ? year : null;
}

export function formatPsaHeaderLine(input: {
  episodeSeries?: string | null;
  episodeReleaseDate?: string | null;
}): string {
  const year = getPsaReleaseYear(input.episodeReleaseDate);
  const series = formatPsaToken(input.episodeSeries);
  return [year, "POKEMON", series].filter(Boolean).join(" ");
}

export function formatPsaSetLine(name: string, cardNumber: string | null): string {
  const setLabel = formatPsaToken(name);

  return cardNumber ? `${setLabel} #${cardNumber}` : setLabel;
}
