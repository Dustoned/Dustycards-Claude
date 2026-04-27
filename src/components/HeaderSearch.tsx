"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { Search } from "lucide-react";
import {
  buildPathWithQuery,
  clearSearchReturnPath,
  readSearchReturnPath,
  rememberSearchReturnPath,
} from "@/lib/search-navigation";

export default function HeaderSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeQuery = pathname === "/search" ? searchParams.get("q") ?? "" : "";
  const inputRef = useRef<HTMLInputElement>(null);
  const startedSearchRef = useRef(false);
  const shouldRestoreFocusRef = useRef(false);
  const currentHref = buildPathWithQuery(pathname, searchParams);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const nextValue = pathname === "/search" ? activeQuery : "";
    if (input.value !== nextValue) {
      input.value = nextValue;
    }

    if (pathname === "/search") {
      startedSearchRef.current = false;

      if (shouldRestoreFocusRef.current) {
        shouldRestoreFocusRef.current = false;
        window.requestAnimationFrame(() => {
          const currentInput = inputRef.current;
          if (!currentInput) return;

          currentInput.focus();
          const cursor = currentInput.value.length;
          currentInput.setSelectionRange(cursor, cursor);
        });
      }
      return;
    }

    shouldRestoreFocusRef.current = false;
  }, [activeQuery, pathname]);

  function returnToPreviousPageOrSearch() {
    const returnHref = readSearchReturnPath();
    startedSearchRef.current = false;
    clearSearchReturnPath();

    if (pathname === "/search" && returnHref) {
      router.replace(returnHref);
      return;
    }

    router.replace("/search");
  }

  function routeToSearch(rawQuery: string, preferPush = false) {
    const trimmed = rawQuery.trim();
    if (!trimmed) {
      returnToPreviousPageOrSearch();
      return;
    }

    if (pathname === "/search") {
      startedSearchRef.current = false;
    }

    const href = `/search?q=${encodeURIComponent(trimmed)}`;

    if (preferPush && pathname !== "/search" && !startedSearchRef.current) {
      rememberSearchReturnPath(currentHref);
      startedSearchRef.current = true;
      shouldRestoreFocusRef.current = true;
      router.push(href);
      return;
    }

    router.replace(href);
  }

  function handleChange(nextQuery: string) {
    if (nextQuery.trim()) {
      routeToSearch(nextQuery, true);
      return;
    }

    if (pathname === "/search" || startedSearchRef.current) {
      returnToPreviousPageOrSearch();
    }
  }

  function submitSearch(formData: FormData) {
    routeToSearch(String(formData.get("q") ?? ""), pathname !== "/search");
  }

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitSearch(new FormData(event.currentTarget));
        }}
        className="hidden min-w-0 flex-1 items-center justify-center lg:flex"
      >
        <div className="flex h-[var(--ui-header-search-height)] w-full max-w-[var(--ui-header-search-max)] items-center rounded-full border border-black/8 bg-black/[0.03] px-2 pl-4 shadow-sm shadow-black/5 transition-colors focus-within:border-black/15 focus-within:bg-black/[0.04] dark:border-white/10 dark:bg-white/[0.05] dark:shadow-black/20 dark:focus-within:border-white/20 dark:focus-within:bg-white/[0.07]">
          <Search className="h-4 w-4 shrink-0 text-gray-400 dark:text-white/40" />
          <input
            ref={inputRef}
            name="q"
            type="text"
            defaultValue={activeQuery}
            onChange={(event) => handleChange(event.target.value)}
            placeholder="Search cards, sealed, expansions..."
            className="h-full min-w-0 flex-1 bg-transparent px-3 text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-white/35 [font-size:var(--ui-nav-link-size)]"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            className="inline-flex h-[calc(var(--ui-header-search-height)-0.5rem)] shrink-0 items-center rounded-full border border-black/8 bg-white/80 px-3 font-semibold text-gray-900 transition-colors hover:border-black/15 hover:bg-white dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/14 [font-size:var(--ui-header-button-size)]"
          >
            Search
          </button>
        </div>
      </form>

      <Link
        href="/search"
        prefetch={false}
        aria-label="Open search"
        onClick={() => {
          rememberSearchReturnPath(currentHref);
          startedSearchRef.current = false;
        }}
        className="inline-flex h-[calc(var(--ui-header-search-height)-0.35rem)] w-[calc(var(--ui-header-search-height)-0.35rem)] items-center justify-center rounded-full border border-black/8 bg-black/[0.03] text-gray-500 transition-colors hover:border-black/15 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/55 dark:hover:border-white/20 dark:hover:text-white lg:hidden"
      >
        <Search className="h-4 w-4" />
      </Link>
    </>
  );
}
