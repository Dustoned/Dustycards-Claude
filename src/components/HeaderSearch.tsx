"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ScanLine, Search, X } from "lucide-react";
import { CARD_SCANNER_ENABLED } from "@/lib/feature-flags";
import {
  buildSearchHref,
  buildPathWithQuery,
  clearSearchReturnPath,
  readSearchReturnPath,
  rememberSearchReturnPath,
  replaceSearchHistory,
  shouldSyncSearchInputValue,
} from "@/lib/search-navigation";
import { GAME_SEARCH_PARAM, ONE_PIECE_GAME, POKEMON_GAME } from "@/lib/games";
import { useSettings } from "@/components/SettingsProvider";

const AUTO_SWITCH_SEARCH_PARAM = "autoswitch";
const SEARCH_ROUTE_DEBOUNCE_MS = 300;

function getPreservedSearchGame(game: string | null, onePieceEnabled: boolean) {
  if (game === POKEMON_GAME) return POKEMON_GAME;
  if (onePieceEnabled && game === ONE_PIECE_GAME) return ONE_PIECE_GAME;
  return null;
}

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
  const searchDebounceRef = useRef<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopQuery, setDesktopQuery] = useState(activeQuery);
  const [mobileQuery, setMobileQuery] = useState(activeQuery);
  const currentHref = buildPathWithQuery(pathname, searchParams);
  const gameParam = searchParams.get(GAME_SEARCH_PARAM);
  const activeGameParam =
    getPreservedSearchGame(gameParam, settings.onePieceLibraryEnabled) ??
    (settings.onePieceLibraryEnabled && pathname.startsWith("/one-piece")
      ? ONE_PIECE_GAME
      : null);
  const scannerHref =
    activeGameParam === ONE_PIECE_GAME ? "/scan?game=one-piece" : "/scan";

  useEffect(() => {
    const input = inputRef.current;
    const nextValue = pathname === "/search" ? activeQuery : "";

    setDesktopQuery((currentValue) =>
      shouldSyncSearchInputValue(
        currentValue,
        nextValue,
        Boolean(input && document.activeElement === input)
      )
        ? nextValue
        : currentValue
    );

    const mobileInput = mobileInputRef.current;
    setMobileQuery((currentValue) =>
      shouldSyncSearchInputValue(
        currentValue,
        nextValue,
        Boolean(mobileInput && document.activeElement === mobileInput)
      )
        ? nextValue
        : currentValue
    );

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
    return () => {
      if (searchDebounceRef.current != null) {
        window.clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

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
    clearPendingSearchRoute();
    setDesktopQuery("");
    setMobileQuery("");
    setMobileOpen(false);
  }

  function returnToPreviousPageOrSearch() {
    const returnHref = readSearchReturnPath();
    startedSearchRef.current = false;
    clearSearchReturnPath();
    resetSearchInputs();

    if (returnHref) {
      router.replace(returnHref, { scroll: false });
      return;
    }

    if (pathname === "/search") {
      router.replace("/", { scroll: false });
    }
  }

  function clearPendingSearchRoute() {
    if (searchDebounceRef.current == null) return;

    window.clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = null;
  }

  function buildEmptySearchHref() {
    const liveParams = new URL(window.location.href).searchParams;
    const currentGameParam =
      liveParams.get(GAME_SEARCH_PARAM) ?? searchParams.get(GAME_SEARCH_PARAM);
    const currentAutoSwitchParam =
      liveParams.get(AUTO_SWITCH_SEARCH_PARAM) ??
      searchParams.get(AUTO_SWITCH_SEARCH_PARAM);
    const preservedGame = getPreservedSearchGame(
      currentGameParam,
      settings.onePieceLibraryEnabled
    );

    return buildSearchHref({
      game: preservedGame,
      autoSwitch: currentAutoSwitchParam,
    });
  }

  function clearSearchQuery() {
    startedSearchRef.current = false;
    shouldRestoreFocusRef.current = true;

    setDesktopQuery("");
    setMobileQuery("");
    const href = buildEmptySearchHref();
    if (pathname === "/search") {
      replaceSearchHistory(href);
      return;
    }
    router.replace(href, { scroll: false });
  }

  function routeToSearch(rawQuery: string, preferPush = false) {
    const trimmed = rawQuery.trim();
    if (!trimmed) {
      if (pathname === "/search") {
        clearSearchQuery();
      }
      return;
    }

    const liveUrl = new URL(window.location.href);
    const livePathname = liveUrl.pathname;

    if (livePathname === "/search") {
      startedSearchRef.current = false;
    }

    const liveGameParam = liveUrl.searchParams.get(GAME_SEARCH_PARAM);
    const preservedGame =
      getPreservedSearchGame(liveGameParam, settings.onePieceLibraryEnabled) ??
      activeGameParam;
    const href = buildSearchHref({
      query: trimmed,
      game: preservedGame,
      autoSwitch:
        liveUrl.searchParams.get(AUTO_SWITCH_SEARCH_PARAM) ??
        searchParams.get(AUTO_SWITCH_SEARCH_PARAM),
    });

    if (livePathname === "/search") {
      // Keep the persistent header mounted while typing. SearchPage listens to
      // this scoped event because the app's global history wrapper intentionally
      // owns native replaceState for scroll restoration.
      replaceSearchHistory(href);
      return;
    }

    if (preferPush && livePathname !== "/search" && !startedSearchRef.current) {
      rememberSearchReturnPath(currentHref);
      startedSearchRef.current = true;
      shouldRestoreFocusRef.current = true;
      router.push(href, { scroll: false });
      return;
    }

    router.replace(href, { scroll: false });
  }

  function handleChangeNow(nextQuery: string) {
    if (nextQuery.trim()) {
      routeToSearch(nextQuery, true);
      return;
    }

    if (pathname === "/search") {
      clearSearchQuery();
      return;
    }

    if (startedSearchRef.current) {
      returnToPreviousPageOrSearch();
    }
  }

  function handleChange(nextQuery: string, immediate = false) {
    clearPendingSearchRoute();

    if (immediate || !nextQuery.trim()) {
      handleChangeNow(nextQuery);
      return;
    }

    searchDebounceRef.current = window.setTimeout(() => {
      searchDebounceRef.current = null;
      handleChangeNow(nextQuery);
    }, SEARCH_ROUTE_DEBOUNCE_MS);
  }

  function openMobileSearch() {
    if (pathname !== "/search") {
      rememberSearchReturnPath(currentHref);
    }
    startedSearchRef.current = false;
    const liveQuery = new URL(window.location.href).searchParams.get("q") ?? "";
    setMobileQuery(pathname === "/search" ? liveQuery : "");
    setMobileOpen(true);
  }

  function closeMobileSearch() {
    clearPendingSearchRoute();
    startedSearchRef.current = false;
    shouldRestoreFocusRef.current = false;
    setMobileOpen(false);
  }

  function clearMobileSearch() {
    if (mobileQuery.trim()) {
      setMobileQuery("");
      handleChange("");
      return;
    }

    closeMobileSearch();
  }

  function submitSearch(formData: FormData) {
    clearPendingSearchRoute();
    routeToSearch(String(formData.get("q") ?? ""), pathname !== "/search");
  }

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitSearch(new FormData(event.currentTarget));
        }}
        className="dc-search-shell hidden min-w-0 flex-1 items-center justify-center lg:flex"
      >
        <div className="flex h-[var(--ui-header-search-height)] w-full max-w-[var(--ui-header-search-max)] items-center rounded-full border border-white/10 bg-white/[0.04] px-3 shadow-none transition-colors focus-within:border-white/22">
          <button
            type="submit"
            aria-label="Search"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/42 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <Search className="h-4 w-4" />
          </button>
          <input
            ref={inputRef}
            name="q"
            type="text"
            value={desktopQuery}
            onChange={(event) => {
              const nextQuery = event.target.value;
              setDesktopQuery(nextQuery);
              handleChange(nextQuery);
            }}
            placeholder="Search cards, sealed, expansions..."
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-white outline-none placeholder:text-white/40 [font-size:var(--ui-nav-link-size)]"
            autoComplete="off"
            spellCheck={false}
          />
          {CARD_SCANNER_ENABLED ? (
            <>
              <span
                aria-hidden="true"
                className="mx-1 h-5 w-px bg-white/10"
              />
              <Link
                href={scannerHref}
                prefetch={false}
                aria-label="Scan a card"
                title="Scan a card"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/42 transition-colors hover:bg-white/[0.07] hover:text-white"
              >
                <ScanLine className="h-4 w-4" />
              </Link>
            </>
          ) : null}
        </div>
      </form>

      <button
        type="button"
        aria-label="Open search"
        onClick={openMobileSearch}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.055] text-white/72 shadow-sm shadow-black/20 transition-colors hover:border-white/18 hover:bg-white/[0.085] hover:text-white lg:hidden"
      >
        <Search className="h-4 w-4" />
      </button>

      {CARD_SCANNER_ENABLED ? (
        <Link
          href={scannerHref}
          prefetch={false}
          aria-label="Scan a card"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.055] text-white/72 shadow-sm shadow-black/20 transition-colors hover:border-white/18 hover:bg-white/[0.085] hover:text-white lg:hidden"
        >
          <ScanLine className="h-[1.05rem] w-[1.05rem]" />
        </Link>
      ) : null}

      {mobileOpen && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch(new FormData(event.currentTarget));
          }}
          className="dc-search-shell absolute inset-x-3 top-1/2 z-[90] flex h-[calc(var(--ui-header-height)-0.65rem)] -translate-y-1/2 items-center gap-2 rounded-full border border-white/10 bg-[#0f0f15] px-2 shadow-xl shadow-black/50 lg:hidden"
        >
          <button
            type="button"
            aria-label="Close search"
            onClick={closeMobileSearch}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Search className="h-4 w-4 shrink-0 text-white/40" />
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
            className="h-full min-w-0 flex-1 border-0 bg-transparent text-base font-medium text-white outline-none placeholder:text-white/35"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          <button
            type="button"
            aria-label={mobileQuery.trim() ? "Clear search" : "Close search"}
            onClick={clearMobileSearch}
            className="inline-flex h-[calc(var(--ui-header-search-height)-0.25rem)] w-[calc(var(--ui-header-search-height)-0.25rem)] shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </form>
      )}
    </>
  );
}
