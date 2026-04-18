const REDUNDANT_SUBSET_PATTERNS = [
  "trainer gallery",
  "galarian gallery",
  "shiny vault",
];

export function isRedundantSubsetExpansion(name: string): boolean {
  const normalized = name.toLowerCase();
  return REDUNDANT_SUBSET_PATTERNS.some((pattern) => normalized.includes(pattern));
}
