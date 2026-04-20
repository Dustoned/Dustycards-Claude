"use client";

const SEARCH_RETURN_PATH_KEY = "dustycards-search-return-path";

interface SearchParamsLike {
  toString(): string;
}

export function buildPathWithQuery(pathname: string, searchParams: SearchParamsLike): string {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
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
