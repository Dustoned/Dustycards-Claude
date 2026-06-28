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
export const BGS_SUBGRADE_KEYS = ["centering", "corners", "edges", "surface"] as const;

export type SupportedGradedSlabCompany = (typeof GRADED_SLAB_COMPANIES)[number];
export type BgsSubgradeKey = (typeof BGS_SUBGRADE_KEYS)[number];
export type BgsSubgrades = Partial<Record<BgsSubgradeKey, string>>;

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

export function normalizeBgsSubgradeValue(value: unknown): string | null {
  const normalized =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : typeof value === "string"
        ? value.trim().toUpperCase().replace(/\s+/g, " ")
        : "";

  if (!normalized) return null;

  const numeric = Number(normalized.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric)) return null;
  if (numeric < 1 || numeric > 10) return null;

  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1).replace(/\.0$/, "");
}

export function normalizeBgsSubgrades(value: unknown): BgsSubgrades | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;
  const subgrades: BgsSubgrades = {};

  for (const key of BGS_SUBGRADE_KEYS) {
    const normalized = normalizeBgsSubgradeValue(input[key]);
    if (normalized) {
      subgrades[key] = normalized;
    }
  }

  return Object.keys(subgrades).length > 0 ? subgrades : null;
}

export function serializeBgsSubgrades(value: unknown): string | null {
  const normalized = normalizeBgsSubgrades(value);
  return normalized ? JSON.stringify(normalized) : null;
}

export function parseBgsSubgrades(value: string | null | undefined): BgsSubgrades | null {
  if (!value) return null;

  try {
    return normalizeBgsSubgrades(JSON.parse(value));
  } catch {
    return null;
  }
}

// Deterministic faux cert number shared by every label renderer (2D preview and
// the 3D canvas texture), so the same card shows the same number in all views.
export function createSlabCertNumber(
  company: string,
  name: string,
  cardNumber: string | null,
  grade: string
): string {
  const input = `${company}|${name}|${cardNumber ?? ""}|${grade}`;
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return String(10000000 + (hash % 90000000));
}

export function formatBgsSubgradeName(key: BgsSubgradeKey): string {
  if (key === "centering") return "Centering";
  if (key === "corners") return "Corners";
  if (key === "edges") return "Edges";
  return "Surface";
}

export function getBgsGradeDescriptor(grade: string): string {
  const normalized = grade.trim().toUpperCase();
  if (normalized.includes("BLACK")) return "PRISTINE";

  const numericGrade = Number(normalized.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numericGrade)) return "GRADE";
  if (numericGrade >= 10) return "PRISTINE";
  if (numericGrade >= 9.5) return "GEM MINT";
  if (numericGrade >= 9) return "MINT";
  if (numericGrade >= 8.5) return "NM-MT+";
  if (numericGrade >= 8) return "NM-MT";
  if (numericGrade >= 7.5) return "NEAR MINT+";
  if (numericGrade >= 7) return "NEAR MINT";
  if (numericGrade >= 6.5) return "EX-MT+";
  if (numericGrade >= 6) return "EX-MT";
  if (numericGrade >= 5) return "EX";
  if (numericGrade >= 4) return "VG-EX";
  if (numericGrade >= 3) return "VG";
  if (numericGrade >= 2) return "GOOD";

  return "POOR";
}

// Whether a BGS grade is a Pristine 10 Black Label. By Beckett's rule that
// requires an overall 10 with all four subgrades at 10; an explicit override
// (chosen at add-time) wins when provided.
export function isBgsBlackLabel(
  grade: string | null | undefined,
  subgrades: BgsSubgrades | null | undefined,
  override?: boolean | null
): boolean {
  if (typeof override === "boolean") return override;
  const numericGrade = Number((grade ?? "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numericGrade) || numericGrade < 10) return false;
  return !!subgrades && BGS_SUBGRADE_KEYS.every((key) => subgrades[key] === "10");
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
