export const NAVIGATION_SHORTCUT_KEYS = [
  "home",
  "complete",
  "singles",
  "binders",
  "sealed",
  "openings",
  "graded",
  "wants",
  "social",
  "search",
  "expansions",
  "one-piece",
  "categories",
  "illustrators",
  "scan",
  "submit-card",
  "market-raw",
  "market-graded",
  "market-targets",
  "market-sealed",
  "market-radar",
  "selling",
] as const;

export type NavigationShortcutKey = (typeof NAVIGATION_SHORTCUT_KEYS)[number];

const NAVIGATION_SHORTCUT_KEY_SET = new Set<string>(NAVIGATION_SHORTCUT_KEYS);

export const MOBILE_BOTTOM_NAV_LIMIT = 4;
export const MOBILE_MORE_PIN_LIMIT = 6;
export const DESKTOP_PIN_LIMIT = 4;

export const DEFAULT_MOBILE_BOTTOM_NAV_KEYS: readonly NavigationShortcutKey[] = [
  "home",
  "complete",
  "wants",
  "market-raw",
];

export const DEFAULT_MOBILE_MORE_PINNED_KEYS: readonly NavigationShortcutKey[] = [
  "market-sealed",
  "market-radar",
  "selling",
  "openings",
  "search",
  "binders",
];

export const DEFAULT_DESKTOP_PINNED_NAV_KEYS: readonly NavigationShortcutKey[] = [
  "market-radar",
];

export function isNavigationShortcutKey(value: unknown): value is NavigationShortcutKey {
  return typeof value === "string" && NAVIGATION_SHORTCUT_KEY_SET.has(value);
}

export function normalizeNavigationShortcutKeys(
  value: unknown,
  fallback: readonly NavigationShortcutKey[],
  limit: number,
  options: { exact?: boolean; allowEmpty?: boolean } = {}
): NavigationShortcutKey[] {
  const source = Array.isArray(value) ? value : fallback;
  const normalized: NavigationShortcutKey[] = [];

  for (const key of source) {
    if (!isNavigationShortcutKey(key) || normalized.includes(key)) continue;
    normalized.push(key);
    if (normalized.length === limit) break;
  }

  if (options.exact) {
    for (const key of fallback) {
      if (!normalized.includes(key)) normalized.push(key);
      if (normalized.length === limit) break;
    }
  }

  if (normalized.length === 0 && options.allowEmpty && Array.isArray(value)) {
    return [];
  }

  if (normalized.length === 0 && !options.exact) {
    return [...fallback].slice(0, limit);
  }

  return normalized.slice(0, limit);
}
