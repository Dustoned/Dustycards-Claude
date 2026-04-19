const REDUNDANT_SUBSET_PATTERNS = [
  "trainer gallery",
  "galarian gallery",
  "shiny vault",
];

const HIDDEN_EXPANSION_IDS = new Set(["20"]);
const HIDDEN_EXPANSION_CODES = new Set(["sve"]);
const HIDDEN_EXPANSION_NAMES = new Set(["scarlet & violet energies"]);

export function isRedundantSubsetExpansion(name: string): boolean {
  const normalized = name.toLowerCase();
  return REDUNDANT_SUBSET_PATTERNS.some((pattern) => normalized.includes(pattern));
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
    (id != null && HIDDEN_EXPANSION_IDS.has(id)) ||
    (code != null && HIDDEN_EXPANSION_CODES.has(code)) ||
    (name != null && HIDDEN_EXPANSION_NAMES.has(name))
  );
}
