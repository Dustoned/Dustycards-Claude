"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Search, X } from "lucide-react";
import {
  buildPathWithQuery,
  clearSearchReturnPath,
  readSearchReturnPath,
  rememberSearchReturnPath,
} from "@/lib/search-navigation";
import { GAME_SEARCH_PARAM, ONE_PIECE_GAME, POKEMON_GAME } from "@/lib/games";
import { useSettings } from "@/components/SettingsProvider";

export default function HeaderSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { settings } = useSettings();
  const activeQuery = pathname === "/search" ? searchParams.get("q") ?? "" : "";
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const startedSearchRef = useRef(false);
  const shouldRestoreFocusRef = useRef(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileQuery, setMobileQuery] = useState(activeQuery);
  const currentHref = buildPathWithQuery(pathname, searchParams);
  const gameParam = searchParams.get(GAME_SEARCH_PARAM);
  const activeGameParam = settings.onePieceLibraryEnabled
    ? gameParam === ONE_PIECE_GAME
      ? ONE_PIECE_GAME
      : gameParam === POKEMON_GAME
        ? POKEMON_GAME
        : pathname.startsWith("/one-piece")
          ? ONE_PIECE_GAME
          : null
    : null;

  useEffect(() => {
    const input = inputRef.current;
    const nextValue = pathname === "/search" ? activeQuery : "";

    if (input && input.value !== nextValue) {
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

  useEffect(() => {
    if (!mobileOpen) return;

    window.requestAnimationFrame(() => {
      const input = mobileInputRef.current;
      if (!input) return;

      input.focus();
      const cursor = input.value.length;
      input.setSelectionRange(cursor, cursor);
    });
  }, [mobileOpen]);

  function resetSearchInputs() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    setMobileQuery("");
    setMobileOpen(false);
  }

  function returnToPreviousPageOrSearch() {
    const returnHref = readSearchReturnPath();
    startedSearchRef.current = false;
    clearSearchReturnPath();
    resetSearchInputs();

    if (returnHref) {
      router.replace(returnHref);
      return;
    }

    if (pathname === "/search") {
      router.replace("/");
    }
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

    const params = new URLSearchParams({ q: trimmed });
    if (activeGameParam) {
      params.set(GAME_SEARCH_PARAM, activeGameParam);
    }
    const href = `/search?${params.toString()}`;

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

  function openMobileSearch() {
    if (pathname !== "/search") {
      rememberSearchReturnPath(currentHref);
    }
    startedSearchRef.current = false;
    setMobileQuery(pathname === "/search" ? activeQuery : "");
    setMobileOpen(true);
  }

  function closeMobileSearch() {
    startedSearchRef.current = false;
    shouldRestoreFocusRef.current = false;
    setMobileOpen(false);
  }

  function clearMobileSearch() {
    if (mobileQuery.trim()) {
      handleChange("");
      return;
    }

    closeMobileSearch();
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

      <button
        type="button"
        aria-label="Open search"
        onClick={openMobileSearch}
        className="inline-flex h-[calc(var(--ui-header-search-height)-0.35rem)] w-[calc(var(--ui-header-search-height)-0.35rem)] items-center justify-center rounded-full border border-black/8 bg-black/[0.03] text-gray-500 transition-colors hover:border-black/15 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/55 dark:hover:border-white/20 dark:hover:text-white lg:hidden"
      >
        <Search className="h-4 w-4" />
      </button>

      {mobileOpen && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch(new FormData(event.currentTarget));
          }}
          className="absolute inset-x-3 top-1/2 z-[90] flex h-[calc(var(--ui-header-height)-0.65rem)] -translate-y-1/2 items-center gap-2 rounded-full border border-black/10 bg-white/95 px-2 shadow-xl shadow-black/15 backdrop-blur-xl dark:border-white/12 dark:bg-zinc-950/95 dark:shadow-black/50 lg:hidden"
        >
          <button
            type="button"
            aria-label="Close search"
            onClick={closeMobileSearch}
            className="inline-flex h-[calc(var(--ui-header-search-height)-0.25rem)] w-[calc(var(--ui-header-search-height)-0.25rem)] shrink-0 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-black/[0.05] hover:text-gray-950 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Search className="h-4 w-4 shrink-0 text-gray-400 dark:text-white/40" />
          <input
            ref={mobileInputRef}
            name="q"
            type="search"
            value={mobileQuery}
            onChange={(event) => {
              const nextQuery = event.target.value;
              setMobileQuery(nextQuery);
              handleChange(nextQuery);
            }}
            placeholder="Search cards..."
            className="h-full min-w-0 flex-1 bg-transparent text-base font-medium text-gray-950 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-white/35"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          <button
            type="button"
            aria-label={mobileQuery.trim() ? "Clear search" : "Close search"}
            onClick={clearMobileSearch}
            className="inline-flex h-[calc(var(--ui-header-search-height)-0.25rem)] w-[calc(var(--ui-header-search-height)-0.25rem)] shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-black/[0.05] hover:text-gray-950 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </form>
      )}
    </>
  );
}
