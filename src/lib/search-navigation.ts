"use client";

const SEARCH_RETURN_PATH_KEY = "dustycards-search-return-path";
export const SEARCH_NAVIGATION_EVENT = "dustycards:search-navigation";

interface SearchParamsLike {
  toString(): string;
}

interface BuildSearchHrefOptions {
  query?: string;
  game?: string | null;
  autoSwitch?: string | null;
}

export function buildPathWithQuery(pathname: string, searchParams: SearchParamsLike): string {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function buildSearchHref({
  query = "",
  game,
  autoSwitch,
}: BuildSearchHrefOptions): string {
  const params = new URLSearchParams();
  const trimmedQuery = query.trim();

  if (trimmedQuery) {
    params.set("q", trimmedQuery);
  }
  if (game) {
    params.set("game", game);
  }
  if (autoSwitch === "0") {
    params.set("autoswitch", "0");
  }

  const search = params.toString();
  return search ? `/search?${search}` : "/search";
}

export function shouldSyncSearchInputValue(
  currentValue: string,
  routeValue: string,
  isFocused: boolean
): boolean {
  if (currentValue === routeValue) return false;

  // A route commit can lag behind fast typing. While the field is focused,
  // the user's local draft is always newer than the URL value.
  return !isFocused;
}

export function replaceSearchHistory(href: string): void {
  if (typeof window === "undefined") return;

  window.history.replaceState(window.history.state, "", href);
  window.dispatchEvent(
    new CustomEvent<{ href: string }>(SEARCH_NAVIGATION_EVENT, {
      detail: { href },
    })
  );
}

export function rememberSearchReturnPath(href: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SEARCH_RETURN_PATH_KEY, href);
}

export function readSearchReturnPath(): string | null {
  if (typeof window === "undefined") return null;

  const stored = window.sessionStorage.getItem(SEARCH_RETURN_PATH_KEY);
  if (!stored || stored === "/search") return null;
  return stored;
}

export function clearSearchReturnPath() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(SEARCH_RETURN_PATH_KEY);
}
