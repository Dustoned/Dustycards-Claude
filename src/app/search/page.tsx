"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Package, ScanLine } from "lucide-react";
import { CardLoadingOverlay } from "@/components/CardLoadingOverlay";
import { CARD_SCANNER_ENABLED } from "@/lib/feature-flags";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";
import CollectionAddSealedButton from "@/components/CollectionAddSealedButton";
import CollectionWantButton from "@/components/CollectionWantButton";
import GameFilterSwitch from "@/components/GameFilterSwitch";
import { SectionHeader } from "@/components/PageHeader";
import { useSettings } from "@/components/SettingsProvider";
import {
  getCardGridImageSizes,
  getCardGridTemplateColumns,
  getExpansionTileScale,
  getFixedTrackGridTemplate,
  getSearchLogoHeightClass,
  getSealedProductGridTemplateColumns,
  getSealedProductImageSizes,
} from "@/lib/display-scale";
import { formatCurrency } from "@/lib/format";
import {
  GAME_FILTER_OPTIONS,
  GAME_SEARCH_PARAM,
  getExpansionHref,
  getGameFilterLabel,
  getGameFilterSearchParamValue,
  parseVisibleGameFilter,
  type TradingCardGame,
  type TradingCardGameFilter,
} from "@/lib/games";
import { getCachedImageUrl } from "@/lib/image-cache";
import CachedImage from "@/components/CachedImage";
import {
  clearRecentSearches,
  readRecentSearches,
  rememberRecentSearch,
} from "@/lib/recent-searches";
import { SEARCH_NAVIGATION_EVENT } from "@/lib/search-navigation";
import { getCardImageClassName, getCardImageFrameClassName } from "@/lib/card-image-display";
import type { ModalCardData } from "@/components/card-modal/types";
import type { SealedModalProductData } from "@/components/sealed-modal/types";

const CardModal = dynamic(() => import("@/components/CardModal"), {
  ssr: false,
  loading: () => null,
});

const SealedProductModal = dynamic(() => import("@/components/SealedProductModal"), {
  ssr: false,
  loading: () => null,
});

interface SingleResult {
  id: string;
  name: string;
  card_number: string | null;
  version?: string | null;
  rarity: string | null;
  supertype: string | null;
  image_url: string | null;
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  episode_release_date?: string | null;
  cm_en_lowest_nm: number | null;
  tcp_market: number | null;
  want_item?: {
    id: string;
    created_at: string;
  } | null;
}

interface SealedResult {
  id: string;
  name: string;
  image_url: string | null;
  cardmarket_url: string | null;
  cm_lowest: number | null;
  cm_lowest_eu: number | null;
  cm_avg_7d: number | null;
  cm_avg_30d: number | null;
  episode: { id: string; name: string; code: string | null; release_date?: string | null };
}

interface ExpansionResult {
  id: string;
  name: string;
  code: string | null;
  logo_url: string | null;
}

interface SearchResults {
  singles: SingleResult[];
  sealed: SealedResult[];
  expansions: ExpansionResult[];
  total: number;
  fuzzy?: boolean;
  game?: TradingCardGameFilter;
  autoSwitchedFrom?: TradingCardGame;
}

const MIN_SEARCH_LENGTH = 1;
const SEARCH_CACHE_MAX_ENTRIES = 50;
const AUTO_SWITCH_SEARCH_PARAM = "autoswitch";
const REMEMBER_SEARCH_AFTER_MS = 2500;
const MIN_REMEMBER_QUERY_LENGTH = 2;
const INITIAL_EXPANSION_RESULTS = 12;
const INITIAL_SINGLE_RESULTS = 36;
const INITIAL_SEALED_RESULTS = 18;

type SearchSection = "all" | "singles" | "sealed" | "expansions";
type SearchSortMode = "relevance" | "price_desc" | "price_asc" | "newest";

function ShowMoreResults({
  visible,
  total,
  label,
  onClick,
}: {
  visible: number;
  total: number;
  label: string;
  onClick: () => void;
}) {
  if (visible >= total) return null;

  return (
    <div className="mt-4 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/12 bg-white/[0.055] px-5 text-sm font-bold text-white/72 transition-colors hover:border-white/22 hover:bg-white/[0.09] hover:text-white"
      >
        Show more {label}
        <span className="ml-2 text-xs font-semibold tabular-nums text-white/42">
          {Math.min(total - visible, visible)} of {total - visible} remaining
        </span>
      </button>
    </div>
  );
}

function SearchResultsSkeleton() {
  return (
    <section
      role="status"
      aria-label="Searching cards"
      className="space-y-4"
      data-search-results-skeleton
    >
      <div className="flex items-center justify-between gap-4">
        <div className="h-5 w-28 rounded-full bg-white/[0.08] motion-safe:animate-pulse" />
        <div className="h-4 w-16 rounded-full bg-white/[0.055] motion-safe:animate-pulse" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.035] p-2.5"
          >
            <div className="aspect-[63/88] rounded-xl bg-white/[0.07] motion-safe:animate-pulse" />
            <div className="mt-3 h-3.5 w-4/5 rounded-full bg-white/[0.08] motion-safe:animate-pulse" />
            <div className="mt-2 h-3 w-1/2 rounded-full bg-white/[0.05] motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
      <span className="sr-only">Searching...</span>
    </section>
  );
}

function compareNullablePrice(a: number | null, b: number | null, direction: 1 | -1): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * direction;
}

function compareNewestRelease(a: string | null | undefined, b: string | null | undefined): number {
  return (b ?? "").localeCompare(a ?? "");
}

function formatEur(value: number | null | undefined): string {
  return value == null ? "-" : formatCurrency(value, "EUR");
}

function getSealedResultMainPrice(product: SealedResult): number | null {
  return product.cm_lowest_eu ?? product.cm_lowest;
}

function setWithLruEviction<K, V>(map: Map<K, V>, key: K, value: V, max: number): void {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > max) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function SearchPageContent({
  initialQuery,
  initialGameParam,
  initialAutoSwitchParam,
}: {
  initialQuery: string;
  initialGameParam: string | null;
  initialAutoSwitchParam: string | null;
}) {
  const { displaySettings, isMobileViewport, settings } = useSettings();
  const [resultState, setResultState] = useState<{
    key: string;
    data: SearchResults;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedCard, setSelectedCard] = useState<ModalCardData | null>(null);
  const [selectedSealed, setSelectedSealed] = useState<SealedModalProductData | null>(null);
  const [openingCardId, setOpeningCardId] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [activeSection, setActiveSection] = useState<SearchSection>("all");
  const [sortMode, setSortMode] = useState<SearchSortMode>("relevance");
  const [visibleExpansions, setVisibleExpansions] = useState(INITIAL_EXPANSION_RESULTS);
  const [visibleSingles, setVisibleSingles] = useState(INITIAL_SINGLE_RESULTS);
  const [visibleSealed, setVisibleSealed] = useState(INITIAL_SEALED_RESULTS);
  const abortRef = useRef<AbortController | null>(null);
  const resultsCacheRef = useRef(new Map<string, SearchResults>());
  const trimmedQuery = initialQuery.trim();
  const activeGame = parseVisibleGameFilter(initialGameParam, {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
  const allowAutoSwitch = initialAutoSwitchParam !== "0";
  const searchCacheKey = `${activeGame}:${allowAutoSwitch ? "auto" : "manual"}:${trimmedQuery}`;
  const results = resultState?.key === searchCacheKey ? resultState.data : null;
  const displayGame =
    settings.onePieceLibraryEnabled && results?.game ? results.game : activeGame;

  function buildGameHref(game: TradingCardGameFilter) {
    const params = new URLSearchParams();
    if (trimmedQuery) {
      params.set("q", trimmedQuery);
    }
    const gameValue = getGameFilterSearchParamValue(game);
    if (gameValue) {
      params.set(GAME_SEARCH_PARAM, gameValue);
    }
    params.set(AUTO_SWITCH_SEARCH_PARAM, "0");
    const query = params.toString();
    return query ? `/search?${query}` : "/search";
  }
  const gameSwitchItems = GAME_FILTER_OPTIONS.map((game) => ({
    href: buildGameHref(game),
    active: displayGame === game,
    label: getGameFilterLabel(game),
  }));

  useEffect(() => {
    const timer = window.setTimeout(() => setRecentSearches(readRecentSearches()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setActiveSection("all");
      setVisibleExpansions(INITIAL_EXPANSION_RESULTS);
      setVisibleSingles(INITIAL_SINGLE_RESULTS);
      setVisibleSealed(INITIAL_SEALED_RESULTS);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [trimmedQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisibleSingles(INITIAL_SINGLE_RESULTS);
      setVisibleSealed(INITIAL_SEALED_RESULTS);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [sortMode]);

  // Remember a query once it has been stable for a moment and produced
  // results, so search-as-you-type prefixes do not pollute the recents.
  useEffect(() => {
    if (trimmedQuery.length < MIN_REMEMBER_QUERY_LENGTH) return;
    if (!results || results.total === 0) return;

    const timer = window.setTimeout(() => {
      setRecentSearches(rememberRecentSearch(trimmedQuery));
    }, REMEMBER_SEARCH_AFTER_MS);

    return () => window.clearTimeout(timer);
  }, [results, trimmedQuery]);

  useEffect(() => {
    if (trimmedQuery.length < MIN_SEARCH_LENGTH) {
      abortRef.current?.abort();
      abortRef.current = null;
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled) return;
        setResultState(null);
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    const cachedResults = resultsCacheRef.current.get(searchCacheKey);
    if (cachedResults) {
      abortRef.current?.abort();
      abortRef.current = null;
      // Refresh LRU recency
      resultsCacheRef.current.delete(searchCacheKey);
      resultsCacheRef.current.set(searchCacheKey, cachedResults);
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled) return;
        setResultState({ key: searchCacheKey, data: cachedResults });
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    setLoading(true);

    void (async () => {
      try {
        const params = new URLSearchParams({ q: trimmedQuery });
        const gameValue = getGameFilterSearchParamValue(activeGame);
        if (gameValue) {
          params.set(GAME_SEARCH_PARAM, gameValue);
        }
        if (!allowAutoSwitch) {
          params.set(AUTO_SWITCH_SEARCH_PARAM, "0");
        }
        const res = await fetch(`/api/search?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("search failed");

        const data: SearchResults = await res.json();
        if (abortRef.current === controller) {
          const resultGame = data.game ?? activeGame;
          setWithLruEviction(
            resultsCacheRef.current,
            searchCacheKey,
            data,
            SEARCH_CACHE_MAX_ENTRIES
          );
          if (resultGame !== activeGame) {
            setWithLruEviction(
              resultsCacheRef.current,
              `${resultGame}:${allowAutoSwitch ? "auto" : "manual"}:${trimmedQuery}`,
              data,
              SEARCH_CACHE_MAX_ENTRIES
            );
          }
          setResultState({ key: searchCacheKey, data });
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        if (abortRef.current === controller) {
          setResultState(null);
        }
      } finally {
        if (abortRef.current === controller) {
          setLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
      if (abortRef.current === controller) abortRef.current = null;
    };
  }, [activeGame, allowAutoSwitch, searchCacheKey, trimmedQuery]);

  async function openCard(card: SingleResult) {
    if (openingCardId === card.id) return;
    if (trimmedQuery.length >= MIN_REMEMBER_QUERY_LENGTH) {
      setRecentSearches(rememberRecentSearch(trimmedQuery));
    }
    setOpeningCardId(card.id);
    try {
      const res = await fetch(`/api/cards/${encodeURIComponent(card.id)}`);
      if (!res.ok) return;
      const data: ModalCardData = await res.json();
      setSelectedCard(data);
    } catch {
      // silently ignore
    } finally {
      setOpeningCardId(null);
    }
  }

  function openSealed(product: SealedResult) {
    if (trimmedQuery.length >= MIN_REMEMBER_QUERY_LENGTH) {
      setRecentSearches(rememberRecentSearch(trimmedQuery));
    }
    setSelectedSealed({
      id: product.id,
      name: product.name,
      image_url: product.image_url,
      cardmarket_url: product.cardmarket_url,
      price: {
        cm_lowest: product.cm_lowest,
        cm_lowest_eu: product.cm_lowest_eu,
        cm_lowest_de: null,
        cm_lowest_fr: null,
        cm_lowest_es: null,
        cm_lowest_it: null,
        cm_avg_7d: product.cm_avg_7d,
        cm_avg_30d: product.cm_avg_30d,
      },
      episode: product.episode,
    });
  }

  const showEmpty =
    !loading && results !== null && results.total === 0 && trimmedQuery.length >= MIN_SEARCH_LENGTH;

  const allExpansions: ExpansionResult[] = results?.expansions ?? [];

  const sortedSingles = useMemo(() => {
    const singles = results?.singles ?? [];
    if (sortMode === "relevance") return singles;

    const copy = [...singles];
    if (sortMode === "newest") {
      copy.sort((a, b) => compareNewestRelease(a.episode_release_date, b.episode_release_date));
    } else {
      const direction = sortMode === "price_asc" ? 1 : -1;
      copy.sort((a, b) =>
        compareNullablePrice(
          a.cm_en_lowest_nm,
          b.cm_en_lowest_nm,
          direction
        )
      );
    }
    return copy;
  }, [results, sortMode]);

  const sortedSealed = useMemo(() => {
    const sealed = results?.sealed ?? [];
    if (sortMode === "relevance") return sealed;

    const copy = [...sealed];
    if (sortMode === "newest") {
      copy.sort((a, b) =>
        compareNewestRelease(a.episode.release_date, b.episode.release_date)
      );
    } else {
      const direction = sortMode === "price_asc" ? 1 : -1;
      copy.sort((a, b) =>
        compareNullablePrice(
          getSealedResultMainPrice(a),
          getSealedResultMainPrice(b),
          direction
        )
      );
    }
    return copy;
  }, [results, sortMode]);

  const hasResults = Boolean(results && trimmedQuery.length >= MIN_SEARCH_LENGTH);
  const sectionChips = hasResults
    ? ([
        {
          key: "all",
          label: "All",
          count:
            (results?.singles.length ?? 0) + (results?.sealed.length ?? 0) + allExpansions.length,
        },
        { key: "singles", label: "Singles", count: results?.singles.length ?? 0 },
        { key: "sealed", label: "Sealed", count: results?.sealed.length ?? 0 },
        { key: "expansions", label: "Sets", count: allExpansions.length },
      ] satisfies Array<{ key: SearchSection; label: string; count: number }>)
    : null;
  const showSection = (section: Exclude<SearchSection, "all">) =>
    activeSection === "all" || activeSection === section;

  function buildRecentSearchHref(query: string): string {
    const params = new URLSearchParams({ q: query });
    const gameValue = getGameFilterSearchParamValue(activeGame);
    if (gameValue) {
      params.set(GAME_SEARCH_PARAM, gameValue);
    }
    if (!allowAutoSwitch) {
      params.set(AUTO_SWITCH_SEARCH_PARAM, "0");
    }
    return `/search?${params.toString()}`;
  }

  const minWidth = getCardGridImageSizes(
    displaySettings.cardSize,
    displaySettings.widescreen,
    isMobileViewport
  );
  const singlesGridTemplateColumns = getCardGridTemplateColumns(
    displaySettings.cardSize,
    displaySettings.widescreen,
    isMobileViewport
  );
  const singlesGridGapClass = isMobileViewport
    ? displaySettings.cardSize === "large"
      ? "gap-x-0 gap-y-3"
      : displaySettings.cardSize === "medium"
        ? "gap-x-2 gap-y-2.5"
        : "gap-x-1.5 gap-y-2"
    : "gap-2.5";
  const compactSinglesGrid = displaySettings.cardSize === "xsmall";
  const sealedImageSizes = getSealedProductImageSizes(
    displaySettings.cardSize,
    displaySettings.widescreen,
    isMobileViewport
  );
  const sealedGridTemplateColumns = getSealedProductGridTemplateColumns(
    displaySettings.cardSize,
    displaySettings.widescreen,
    isMobileViewport
  );
  const expansionScale = getExpansionTileScale(
    displaySettings.uiScale,
    displaySettings.widescreen
  );
  const logoHeight = getSearchLogoHeightClass(displaySettings.uiScale);

  return (
    <div className="page-container binder-bottom-safe mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-5 lg:px-8">
      <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/35">
            Search
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {trimmedQuery ? `Results for "${trimmedQuery}"` : "Search"}
          </h1>
          {settings.onePieceLibraryEnabled ? (
            <div className="mt-3 max-w-[21.5rem]">
              <GameFilterSwitch items={gameSwitchItems} className="w-full" />
            </div>
          ) : null}
        </div>
        {CARD_SCANNER_ENABLED ? (
          <Link
            href={
              activeGame === "one-piece"
                ? "/scan?game=one-piece"
                : "/scan"
            }
            prefetch={false}
            className="inline-flex min-h-11 w-fit shrink-0 items-center justify-center gap-2 rounded-full border border-[rgb(var(--dc-primary-soft-rgb)/0.28)] bg-[rgb(var(--dc-primary-rgb)/0.11)] px-4 text-xs font-black text-[var(--dc-primary-soft)] transition-colors hover:border-[rgb(var(--dc-primary-soft-rgb)/0.48)] hover:bg-[rgb(var(--dc-primary-rgb)/0.17)]"
          >
            <ScanLine className="h-4 w-4" />
            Scan card
          </Link>
        ) : null}
        {sectionChips ? (
          <div className="flex shrink-0 flex-wrap items-center justify-start gap-1.5 sm:ml-auto sm:justify-end">
            {sectionChips.map((chip) => {
              const active = activeSection === chip.key;
              const disabled = chip.key !== "all" && chip.count === 0;

              return (
                <button
                  key={chip.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => setActiveSection(active ? "all" : chip.key)}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                    active
                      ? "border-violet-300/40 bg-violet-500/25 text-white"
                      : "border-white/10 bg-white/[0.04] text-white/60 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {chip.label}
                  <span className="tabular-nums text-[11px] opacity-70">
                    {chip.count.toLocaleString("en-US")}
                  </span>
                </button>
              );
            })}
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SearchSortMode)}
              aria-label="Sort results"
              className="min-h-11 rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white/60 outline-none transition-colors hover:border-white/20 hover:text-white [&>option]:bg-zinc-900"
            >
              <option value="relevance">Best match</option>
              <option value="price_desc">Price: high to low</option>
              <option value="price_asc">Price: low to high</option>
              <option value="newest">Newest set</option>
            </select>
          </div>
        ) : null}
      </div>

      {/* Loading */}
      {loading && results && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3 text-sm text-white/45">
          <span className="inline-block w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-300 rounded-full animate-spin" />
          Searching...
        </div>
      )}
      {loading && !results ? <SearchResultsSkeleton /> : null}

      {!loading &&
        trimmedQuery.length < MIN_SEARCH_LENGTH &&
        (recentSearches.length > 0 ? (
          <div className="rounded-3xl border border-white/8 bg-white/[0.035] p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
                Recent searches
              </p>
              <button
                type="button"
                onClick={() => setRecentSearches(clearRecentSearches())}
                className="text-[11px] font-semibold uppercase tracking-wide text-white/35 transition-colors hover:text-white/70"
              >
                Clear
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {recentSearches.map((recentQuery) => (
                <Link
                  key={recentQuery}
                  href={buildRecentSearchHref(recentQuery)}
                  prefetch={false}
                  className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-semibold text-white/70 transition-colors hover:border-white/22 hover:text-white"
                >
                  {recentQuery}
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-white/12 bg-white/[0.035] p-5 text-sm text-white/45">
            Use the header search to find cards, sealed products, or expansions.
          </div>
        ))}

      {/* No results */}
      {showEmpty && (
        <div className="rounded-3xl border border-dashed border-white/12 bg-white/[0.035] p-5 text-sm text-white/45">
          <p>
            No results for{" "}
            <span className="font-semibold text-white/75">
              &ldquo;{trimmedQuery}&rdquo;
            </span>
            .
          </p>
          <p className="mt-1">Try a shorter name, a set code, or a card number.</p>
        </div>
      )}

      {/* Results */}
      {results && (results.total > 0 || allExpansions.length > 0) && (
        <div className="space-y-5">
          {/* Expansions grid */}
          {showSection("expansions") && allExpansions.length > 0 && (
            <section>
              <SectionHeader title="Expansions" count={allExpansions.length} compact className="mb-4" />

              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: getFixedTrackGridTemplate(expansionScale.minWidth),
                  justifyContent: "stretch",
                }}
              >
                {allExpansions.slice(0, visibleExpansions).map((ep) => (
                  <Link
                    key={ep.id}
                    href={getExpansionHref(ep.id)}
                    prefetch={false}
                    onClick={() => {
                      if (trimmedQuery.length >= MIN_REMEMBER_QUERY_LENGTH) {
                        rememberRecentSearch(trimmedQuery);
                      }
                    }}
                    className={`group binder-panel flex flex-col items-center transition-all duration-200 hover:scale-[1.03] hover:bg-white/[0.07] active:scale-[0.98] ${expansionScale.tileClass}`}
                  >
                    {ep.logo_url ? (
                      <div className={`relative w-full ${logoHeight}`}>
                        <Image
                          src={getCachedImageUrl(ep.logo_url) ?? ep.logo_url}
                          alt={ep.name}
                          fill
                          className="object-contain drop-shadow-sm"
                          sizes={expansionScale.minWidth}
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div
                        className={`w-full rounded-xl bg-white/[0.04] ${logoHeight} flex items-center justify-center`}
                      >
                        <span className="text-xs font-medium text-white/40">
                          {ep.name.slice(0, 2)}
                        </span>
                      </div>
                    )}
                    <div className="text-center">
                      <p className={`font-semibold leading-snug line-clamp-2 text-white transition-colors ${expansionScale.titleClass}`}>
                        {ep.name}
                      </p>
                      {ep.code && (
                        <p className={`mt-0.5 text-white/40 ${expansionScale.metaClass}`}>{ep.code}</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
              <ShowMoreResults
                visible={visibleExpansions}
                total={allExpansions.length}
                label="expansions"
                onClick={() =>
                  setVisibleExpansions((current) => current + INITIAL_EXPANSION_RESULTS)
                }
              />
            </section>
          )}

          {/* Singles grid */}
          {showSection("singles") && sortedSingles.length > 0 && (
            <section>
              <SectionHeader title="Singles" count={sortedSingles.length} compact className="mb-4" />

              <div
                className={`dc-wide-grid-zone grid ${singlesGridGapClass}`}
                style={{
                  gridTemplateColumns: singlesGridTemplateColumns,
                  justifyContent: "stretch",
                }}
              >
                {sortedSingles.slice(0, visibleSingles).map((card, index) => (
                    <div
                      key={card.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openCard(card)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openCard(card);
                        }
                      }}
                      className="relative flex cursor-pointer flex-col rounded-[14px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] p-1.5 text-left shadow-[0_12px_28px_rgba(0,0,0,0.24)] outline-none transition-colors hover:border-white/14 max-[640px]:rounded-[13px] max-[640px]:p-1"
                      aria-busy={openingCardId === card.id}
                    >
                      <div
                        className={getCardImageFrameClassName(
                          card.image_url,
                          "relative aspect-[63/88] w-full overflow-hidden rounded-[4.75%] bg-transparent drop-shadow-[0_10px_18px_rgba(0,0,0,0.22)]"
                        )}
                      >
                        {card.image_url ? (
                          <CachedImage
                            sourceUrl={card.image_url}
                            alt={card.name}
                            fill
                            className={getCardImageClassName(
                              card.image_url,
                              "rounded-[4.75%] object-fill"
                            )}
                            sizes={minWidth}
                            loading={index < 4 ? "eager" : undefined}
                            fetchPriority={index < 4 ? "high" : "auto"}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center rounded-xl bg-white/6 text-xs text-white/35">
                            {card.name.slice(0, 2)}
                          </div>
                        )}
                        {openingCardId === card.id && <CardLoadingOverlay />}
                      </div>

                      <div className="mt-1.5 px-0.5">
                        <div className="grid gap-1">
                          <div className="min-w-0">
                            <p
                              className={
                                compactSinglesGrid
                                  ? "line-clamp-3 text-[10px] font-bold leading-tight text-white"
                                  : "line-clamp-2 text-[11px] font-bold leading-tight text-white sm:text-[13px]"
                              }
                            >
                              {card.name}
                            </p>
                            <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[9px] font-semibold sm:gap-1.5 sm:text-[11px]">
                              <span className="shrink-0 text-white/42">
                                {card.card_number ? `#${card.card_number}` : "--"}
                              </span>
                              {card.version ? (
                                <span className="min-w-0 truncate rounded-md border border-amber-300/30 bg-amber-400/12 px-1 py-px text-[8px] font-bold uppercase tracking-wide text-amber-200 sm:text-[9px]">
                                  {card.version}
                                </span>
                              ) : null}
                            </div>
                            {!isMobileViewport ? (
                              <Link
                                href={getExpansionHref(card.episode_id)}
                                prefetch={false}
                                onClick={(e) => e.stopPropagation()}
                                className="mt-0.5 block truncate text-[10px] font-medium text-white/32 transition-colors hover:text-white/60 hover:underline underline-offset-2"
                              >
                                {card.episode_name}
                                {card.episode_code ? (
                                  <span className="ml-1 opacity-60">({card.episode_code})</span>
                                ) : null}
                              </Link>
                            ) : null}
                          </div>

                          <div
                            className={
                              compactSinglesGrid
                                ? "grid min-w-0 gap-1"
                                : "flex min-w-0 flex-wrap items-center justify-between gap-x-1.5 gap-y-1"
                            }
                          >
                            {card.cm_en_lowest_nm != null ? (
                              <span
                                className={
                                  compactSinglesGrid
                                    ? "block min-w-0 max-w-full whitespace-nowrap text-[clamp(9px,2.85vw,11px)] font-bold tabular-nums leading-tight text-white"
                                    : "whitespace-nowrap text-[12px] font-bold tabular-nums leading-tight text-white sm:text-[14px]"
                                }
                              >
                                {formatEur(card.cm_en_lowest_nm)}
                              </span>
                            ) : (
                              <span className="text-[10px] text-white/35 sm:text-xs">No price</span>
                            )}

                            <div className={compactSinglesGrid ? "flex justify-start gap-1" : "flex items-center gap-1"}>
                              <CollectionAddCardButton
                                card={{
                                  id: card.id,
                                  name: card.name,
                                  image_url: card.image_url,
                                  episode: {
                                    id: card.episode_id,
                                    name: card.episode_name,
                                    code: card.episode_code,
                                  },
                                }}
                                className="h-11 w-11 shrink-0 rounded-xl border-violet-300/24 bg-violet-600/24 text-violet-50 hover:border-violet-200/42 hover:bg-violet-500/34"
                              />
                              <CollectionWantButton
                                card={{
                                  id: card.id,
                                  name: card.name,
                                  image_url: card.image_url,
                                  episode: {
                                    id: card.episode_id,
                                    name: card.episode_name,
                                    code: card.episode_code,
                                  },
                                }}
                                initialWanted={Boolean(card.want_item)}
                                wantItemId={card.want_item?.id ?? null}
                                className="h-11 w-11 shrink-0 rounded-xl border-violet-300/24 bg-violet-600/24 text-violet-50 hover:border-violet-200/42 hover:bg-violet-500/34"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                ))}
              </div>
              <ShowMoreResults
                visible={visibleSingles}
                total={sortedSingles.length}
                label="singles"
                onClick={() => setVisibleSingles((current) => current + INITIAL_SINGLE_RESULTS)}
              />
            </section>
          )}

          {/* Sealed grid */}
          {showSection("sealed") && sortedSealed.length > 0 && (
            <section>
              <SectionHeader title="Sealed" count={sortedSealed.length} compact className="mb-4" />

              <div
                className="dc-wide-grid-zone grid gap-2"
                style={{
                  gridTemplateColumns: sealedGridTemplateColumns,
                  justifyContent: "stretch",
                }}
              >
                {sortedSealed.slice(0, visibleSealed).map((product, index) => (
                  <div
                    key={product.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openSealed(product)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openSealed(product);
                      }
                    }}
                    className="relative flex cursor-pointer flex-col rounded-[14px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] p-1.5 text-left shadow-[0_12px_28px_rgba(0,0,0,0.24)] outline-none transition-colors hover:border-white/14 max-[640px]:rounded-[13px] max-[640px]:p-1"
                  >
                    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/8 bg-black/24 shadow-md shadow-black/20">
                      {product.image_url ? (
                        <CachedImage
                          sourceUrl={product.image_url}
                          alt={product.name}
                          fill
                          className="scale-[1.25] object-contain p-2"
                          sizes={sealedImageSizes}
                          loading={index < 4 ? "eager" : undefined}
                          fetchPriority={index < 4 ? "high" : "auto"}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-8 h-8 text-white/30" />
                        </div>
                      )}
                    </div>
                    <div className="mt-1.5 px-0.5 max-[640px]:px-0">
                      <div className="grid gap-1">
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-[12px] font-bold leading-tight text-white sm:text-[13px]">
                            {product.name}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium max-[640px]:hidden">
                            <Link
                              href={`${getExpansionHref(product.episode.id)}?tab=sealed`}
                              prefetch={false}
                              onClick={(e) => e.stopPropagation()}
                              className="min-w-0 truncate text-white/40 transition-colors hover:text-white/70 hover:underline underline-offset-2"
                            >
                              {product.episode.name}
                              {product.episode.code && (
                                <span className="ml-1 opacity-60">({product.episode.code})</span>
                              )}
                            </Link>
                          </div>
                        </div>

                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-1.5 gap-y-1">
                          {getSealedResultMainPrice(product) != null ? (
                            <span className="whitespace-nowrap text-[12px] font-bold tabular-nums leading-tight text-white sm:text-[14px]">
                              {formatEur(getSealedResultMainPrice(product))}
                            </span>
                          ) : (
                            <span className="text-xs text-white/35">No price</span>
                          )}

                          <CollectionAddSealedButton
                            product={{
                              id: product.id,
                              name: product.name,
                              image_url: product.image_url,
                              episode: product.episode,
                            }}
                            className="h-11 w-11 shrink-0 rounded-xl border-violet-300/24 bg-violet-600/24 text-violet-50 hover:border-violet-200/42 hover:bg-violet-500/34"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <ShowMoreResults
                visible={visibleSealed}
                total={sortedSealed.length}
                label="sealed products"
                onClick={() => setVisibleSealed((current) => current + INITIAL_SEALED_RESULTS)}
              />
            </section>
          )}
        </div>
      )}

      {selectedCard && (
        <CardModal key={selectedCard.id} card={selectedCard} backLabel="Back to Search" onClose={() => setSelectedCard(null)} />
      )}
      {selectedSealed && (
        <SealedProductModal
          product={selectedSealed}
          onClose={() => setSelectedSealed(null)}
        />
      )}
    </div>
  );
}

function LiveSearchPageContent({
  routeQuery,
  routeGame,
  routeAutoSwitch,
}: {
  routeQuery: string;
  routeGame: string | null;
  routeAutoSwitch: string | null;
}) {
  const [liveLocation, setLiveLocation] = useState({
    query: routeQuery,
    game: routeGame,
    autoSwitch: routeAutoSwitch,
  });

  useEffect(() => {
    const handleSearchNavigation = (event: Event) => {
      const href = (event as CustomEvent<{ href?: string }>).detail?.href;
      const url = new URL(href ?? window.location.href, window.location.href);

      setLiveLocation({
        query: url.searchParams.get("q") ?? "",
        game: url.searchParams.get(GAME_SEARCH_PARAM),
        autoSwitch: url.searchParams.get(AUTO_SWITCH_SEARCH_PARAM),
      });
    };

    window.addEventListener(SEARCH_NAVIGATION_EVENT, handleSearchNavigation);
    return () => window.removeEventListener(SEARCH_NAVIGATION_EVENT, handleSearchNavigation);
  }, []);

  return (
    <SearchPageContent
      initialQuery={liveLocation.query}
      initialGameParam={liveLocation.game}
      initialAutoSwitchParam={liveLocation.autoSwitch}
    />
  );
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const routeQuery = searchParams.get("q") ?? "";
  const routeGame = searchParams.get(GAME_SEARCH_PARAM);
  const routeAutoSwitch = searchParams.get(AUTO_SWITCH_SEARCH_PARAM);

  return (
    <LiveSearchPageContent
      key={searchParams.toString()}
      routeQuery={routeQuery}
      routeGame={routeGame}
      routeAutoSwitch={routeAutoSwitch}
    />
  );
}
