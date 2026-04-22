const REDUNDANT_SUBSET_PATTERNS = [
  "trainer gallery",
  "galarian gallery",
  "shiny vault",
];

const HIDDEN_EXPANSION_IDS = new Set(["20"]);
const HIDDEN_EXPANSION_CODES = new Set(["sve"]);
const HIDDEN_EXPANSION_NAMES = new Set([
  "scarlet & violet energies",
  "celebrations: classic collection",
]);

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
