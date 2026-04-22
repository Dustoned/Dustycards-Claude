const REDUNDANT_SUBSET_PATTERNS = [
  "trainer gallery",
  "galarian gallery",
  "shiny vault",
];

export const HIDDEN_EXPANSION_IDS = ["20"] as const;
export const HIDDEN_EXPANSION_CODES = ["sve"] as const;
export const HIDDEN_EXPANSION_NAMES = [
  "scarlet & violet energies",
  "celebrations: classic collection",
 ] as const;

const HIDDEN_EXPANSION_ID_SET = new Set<string>(HIDDEN_EXPANSION_IDS);
const HIDDEN_EXPANSION_CODE_SET = new Set<string>(HIDDEN_EXPANSION_CODES);
const HIDDEN_EXPANSION_NAME_SET = new Set<string>(HIDDEN_EXPANSION_NAMES);

export function getEpisodeDisplayCardCount(input: {
  card_count?: number | null;
  _count?: { cards: number } | null;
}): number {
  const remoteCardCount = input.card_count ?? 0;
  const localCardCount = input._count?.cards ?? 0;

  if (input.card_count == null) {
    return localCardCount;
  }

  return Math.max(remoteCardCount, localCardCount);
}

export function isRedundantSubsetExpansion(name: string): boolean {
  const normalized = name.toLowerCase();
  return REDUNDANT_SUBSET_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function isPromoExpansion(input: {
  name: string;
  series?: string | null;
  code?: string | null;
}): boolean {
  const normalizedName = input.name.toLowerCase();
  const normalizedCode = input.code?.trim().toUpperCase() ?? null;

  return (
    input.series === "NP" ||
    input.series === "POP" ||
    normalizedCode === "PR" ||
    normalizedCode?.startsWith("PR-") === true ||
    normalizedName.includes("promo") ||
    normalizedName.includes("black star") ||
    normalizedName.includes("mcdonald") ||
    normalizedName.includes("futsal") ||
    normalizedName.includes("best of game") ||
    normalizedName.includes("trick or trade") ||
    normalizedName.includes("pop series")
  );
}

export function isHiddenExpansion(input: {
  id?: string | null;
  code?: string | null;
  name?: string | null;
}): boolean {
  const id = input.id?.trim();
  const code = input.code?.trim().toLowerCase();
  const name = input.name?.trim().toLowerCase();

  return (
    (id != null && HIDDEN_EXPANSION_ID_SET.has(id)) ||
    (code != null && HIDDEN_EXPANSION_CODE_SET.has(code)) ||
    (name != null && HIDDEN_EXPANSION_NAME_SET.has(name))
  );
}
