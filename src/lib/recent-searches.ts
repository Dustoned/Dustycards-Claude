const STORAGE_KEY = "dustycards-recent-searches";
const MAX_RECENT_SEARCHES = 8;

export function readRecentSearches(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

export function rememberRecentSearch(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed || typeof window === "undefined") return readRecentSearches();

  const next = [
    trimmed,
    ...readRecentSearches().filter(
      (entry) => entry.toLowerCase() !== trimmed.toLowerCase()
    ),
  ].slice(0, MAX_RECENT_SEARCHES);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked; recents just will not persist.
  }

  return next;
}

export function clearRecentSearches(): string[] {
  if (typeof window === "undefined") return [];

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }

  return [];
}
