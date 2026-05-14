"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Package } from "lucide-react";
import { CardLoadingOverlay } from "@/components/CardLoadingOverlay";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";
import CollectionAddSealedButton from "@/components/CollectionAddSealedButton";
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
  rarity: string | null;
  supertype: string | null;
  image_url: string | null;
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  cm_en_lowest_nm: number | null;
  tcp_market: number | null;
}

interface SealedResult {
  id: string;
  name: string;
  image_url: string | null;
  cardmarket_url: string | null;
  cm_lowest: number | null;
  cm_avg_7d: number | null;
  cm_avg_30d: number | null;
  episode: { id: string; name: string; code: string | null };
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

function formatEur(value: number | null | undefined): string {
  return value == null ? "-" : formatCurrency(value, "EUR");
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

function GameToggleLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={`shrink-0 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors sm:rounded-xl sm:px-4 sm:text-sm ${
        active
          ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
          : "text-gray-500 hover:text-gray-900 dark:text-white/55 dark:hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
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
  const router = useRouter();
  const { displaySettings, isMobileViewport, settings } = useSettings();
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedCard, setSelectedCard] = useState<ModalCardData | null>(null);
  const [selectedSealed, setSelectedSealed] = useState<SealedModalProductData | null>(null);
  const [openingCardId, setOpeningCardId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultsCacheRef = useRef(new Map<string, SearchResults>());
  const trimmedQuery = initialQuery.trim();
  const activeGame = parseVisibleGameFilter(initialGameParam, {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
  const allowAutoSwitch = initialAutoSwitchParam !== "0";
  const displayGame =
    settings.onePieceLibraryEnabled && results?.game ? results.game : activeGame;
  const searchCacheKey = `${activeGame}:${allowAutoSwitch ? "auto" : "manual"}:${trimmedQuery}`;

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (trimmedQuery.length < MIN_SEARCH_LENGTH) {
        abortRef.current?.abort();
        abortRef.current = null;
        setResults(null);
        setLoading(false);
        return;
      }

      const cachedResults = resultsCacheRef.current.get(searchCacheKey);
      if (cachedResults) {
        abortRef.current?.abort();
        abortRef.current = null;
        // Refresh LRU recency
        resultsCacheRef.current.delete(searchCacheKey);
        resultsCacheRef.current.set(searchCacheKey, cachedResults);
        setResults(cachedResults);
        setLoading(false);
        return;
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
            setResults(data);

            if (data.autoSwitchedFrom === activeGame && resultGame !== activeGame) {
              const nextParams = new URLSearchParams({ q: trimmedQuery });
              const gameValue = getGameFilterSearchParamValue(resultGame);
              if (gameValue) {
                nextParams.set(GAME_SEARCH_PARAM, gameValue);
              }
              router.replace(`/search?${nextParams.toString()}`, { scroll: false });
            }
          }
        } catch (e) {
          if (e instanceof Error && e.name === "AbortError") return;
          if (abortRef.current === controller) {
            setResults(null);
          }
        } finally {
          if (abortRef.current === controller) {
            setLoading(false);
          }
        }
      })();
    }, 280);

    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [activeGame, allowAutoSwitch, router, searchCacheKey, trimmedQuery]);

  async function openCard(card: SingleResult) {
    if (openingCardId === card.id) return;
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
    setSelectedSealed({
      id: product.id,
      name: product.name,
      image_url: product.image_url,
      cardmarket_url: product.cardmarket_url,
      price: {
        cm_lowest: product.cm_lowest,
        cm_lowest_eu: null,
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
  const resultSummary =
    results && trimmedQuery.length >= MIN_SEARCH_LENGTH
      ? [
          `${results.singles.length.toLocaleString("en-US")} singles`,
          `${results.sealed.length.toLocaleString("en-US")} sealed`,
          `${allExpansions.length.toLocaleString("en-US")} expansions`,
        ].join(" / ")
      : null;

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
      ? "gap-x-0 gap-y-5"
      : displaySettings.cardSize === "medium"
        ? "gap-x-3 gap-y-4"
        : "gap-x-2 gap-y-3"
    : "gap-2";
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
    <div className="page-container mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-4 flex flex-col gap-2 sm:mb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400 dark:text-white/35">
            Search
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-950 dark:text-white sm:text-3xl">
            {trimmedQuery ? `Results for "${trimmedQuery}"` : "Search"}
          </h1>
        </div>
        {resultSummary && (
          <p className="text-sm font-medium text-gray-500 dark:text-white/45">{resultSummary}</p>
        )}
      </div>

      {settings.onePieceLibraryEnabled ? (
        <div className="mb-4 -mx-1 overflow-x-auto pb-1 sm:mx-0 sm:overflow-visible sm:pb-0">
          <div className="inline-flex min-w-max flex-nowrap rounded-2xl border border-black/8 bg-black/3 p-1 dark:border-white/8 dark:bg-white/5">
            {GAME_FILTER_OPTIONS.map((game) => (
              <GameToggleLink
                key={game}
                href={buildGameHref(game)}
                active={displayGame === game}
                label={getGameFilterLabel(game)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Loading */}
      {loading && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-black/8 bg-white/60 px-4 py-3 text-sm text-gray-500 dark:border-white/8 dark:bg-white/[0.035] dark:text-white/45">
          <span className="inline-block w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-300 rounded-full animate-spin" />
          Searching...
        </div>
      )}

      {!loading && trimmedQuery.length < MIN_SEARCH_LENGTH && (
        <div className="rounded-3xl border border-dashed border-black/12 bg-white/60 p-5 text-sm text-gray-500 dark:border-white/12 dark:bg-white/[0.035] dark:text-white/45">
          Use the header search to find cards, sealed products, or expansions.
        </div>
      )}

      {/* No results */}
      {showEmpty && (
        <div className="rounded-3xl border border-dashed border-black/12 bg-white/60 p-5 text-sm text-gray-500 dark:border-white/12 dark:bg-white/[0.035] dark:text-white/45">
          <p>
            No results for{" "}
            <span className="font-semibold text-gray-700 dark:text-white/75">
              &ldquo;{trimmedQuery}&rdquo;
            </span>
            .
          </p>
          <p className="mt-1">Try a shorter name, a set code, or a card number.</p>
        </div>
      )}

      {/* Results */}
      {results && (results.total > 0 || allExpansions.length > 0) && (
        <div className="space-y-8">
          {/* Expansions grid */}
          {allExpansions.length > 0 && (
            <section>
              <SectionHeader title="Expansions" count={allExpansions.length} compact className="mb-4" />

              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: getFixedTrackGridTemplate(expansionScale.minWidth),
                  justifyContent: "start",
                }}
              >
                {allExpansions.map((ep) => (
                  <Link
                    key={ep.id}
                    href={getExpansionHref(ep.id)}
                    prefetch={false}
                    className={`group glass flex flex-col items-center transition-all duration-200 hover:scale-[1.03] hover:bg-white/8 active:scale-[0.98] dark:hover:bg-white/6 ${expansionScale.tileClass}`}
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
                        className={`w-full rounded-xl bg-black/5 dark:bg-white/4 ${logoHeight} flex items-center justify-center`}
                      >
                        <span className="text-xs font-medium text-gray-400 dark:text-white/40">
                          {ep.name.slice(0, 2)}
                        </span>
                      </div>
                    )}
                    <div className="text-center">
                      <p className={`font-semibold leading-snug line-clamp-2 text-gray-800 dark:text-white group-hover:text-black dark:group-hover:text-white transition-colors ${expansionScale.titleClass}`}>
                        {ep.name}
                      </p>
                      {ep.code && (
                        <p className={`mt-0.5 text-gray-400 dark:text-white/40 ${expansionScale.metaClass}`}>{ep.code}</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Singles grid */}
          {results.singles.length > 0 && (
            <section>
              <SectionHeader title="Singles" count={results.singles.length} compact className="mb-4" />

              <div
                className={`grid ${singlesGridGapClass}`}
                style={{
                  gridTemplateColumns: singlesGridTemplateColumns,
                  justifyContent: isMobileViewport ? "stretch" : "start",
                }}
              >
                {results.singles.map((card, index) => (
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
                    className="group flex cursor-pointer flex-col gap-1.5 text-left outline-none"
                    aria-busy={openingCardId === card.id}
                  >
                    <div className="relative aspect-[63/88] w-full bg-transparent drop-shadow-[0_10px_18px_rgba(0,0,0,0.22)] transition-all duration-200 group-hover:scale-[1.03] group-hover:drop-shadow-[0_14px_26px_rgba(0,0,0,0.32)]">
                      {card.image_url ? (
                        <Image
                          src={getCachedImageUrl(card.image_url) ?? card.image_url}
                          alt={card.name}
                          fill
                          className="object-contain"
                          sizes={minWidth}
                          loading={index < 18 ? "eager" : undefined}
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full bg-black/6 dark:bg-white/6 flex items-center justify-center text-gray-300 text-xs rounded-xl">
                          {card.name.slice(0, 2)}
                        </div>
                      )}
                      {openingCardId === card.id && <CardLoadingOverlay />}
                    </div>

                    <div className="mt-1.5 px-0.5 sm:mt-2">
                      <div className="grid gap-1 sm:flex sm:items-end sm:justify-between sm:gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-semibold leading-snug text-gray-900 dark:text-white sm:text-[13px]">
                            {card.name}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1 text-[10px] font-medium sm:gap-1.5 sm:text-xs">
                            <span className="shrink-0 text-gray-500 dark:text-gray-400">
                              {card.card_number ? `#${card.card_number}` : "--"}
                            </span>
                            {!isMobileViewport && (
                              <>
                                <span className="text-gray-300 dark:text-white/20">/</span>
                                <Link
                                  href={getExpansionHref(card.episode_id)}
                                  prefetch={false}
                                  onClick={(e) => e.stopPropagation()}
                                  className="min-w-0 truncate text-gray-400 transition-colors hover:text-gray-600 hover:underline underline-offset-2 dark:text-gray-500 dark:hover:text-gray-300"
                                >
                                  {card.episode_name}
                                  {card.episode_code && (
                                    <span className="ml-1 opacity-60">({card.episode_code})</span>
                                  )}
                                </Link>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex min-w-0 items-center justify-between gap-1.5 sm:shrink sm:justify-end">
                          {card.cm_en_lowest_nm != null ? (
                            <span className="min-w-0 truncate text-[12px] font-semibold tabular-nums text-gray-900 dark:text-white sm:text-[15px]">
                              {formatEur(card.cm_en_lowest_nm)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 sm:text-xs">No price</span>
                          )}

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
                            className="h-[20px] w-[20px] shrink-0 rounded-md border-black/8 bg-black/5 text-gray-900 hover:border-black/15 hover:bg-black/8 dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:bg-white/12 sm:h-[22px] sm:w-[22px]"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Sealed grid */}
          {results.sealed.length > 0 && (
            <section>
              <SectionHeader title="Sealed" count={results.sealed.length} compact className="mb-4" />

              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: sealedGridTemplateColumns,
                  justifyContent: isMobileViewport ? "stretch" : "start",
                }}
              >
                {results.sealed.map((product, index) => (
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
                    className="group flex cursor-pointer flex-col gap-1.5 text-left outline-none max-[640px]:gap-1"
                  >
                    <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-transparent bg-black/4 shadow-md shadow-black/20 transition-all duration-200 group-hover:scale-[1.03] group-hover:shadow-xl group-hover:shadow-black/30 dark:bg-white/4">
                      {product.image_url ? (
                        <Image
                          src={getCachedImageUrl(product.image_url) ?? product.image_url}
                          alt={product.name}
                          fill
                          className="object-contain p-3"
                          sizes={sealedImageSizes}
                          loading={index < 18 ? "eager" : undefined}
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                        </div>
                      )}
                    </div>
                    <div className="mt-2 px-0.5 max-[640px]:mt-1.5 max-[640px]:px-0">
                      <div className="grid gap-1.5 sm:flex sm:items-end sm:justify-between sm:gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-gray-900 max-[640px]:text-[12px] dark:text-white">
                            {product.name}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium max-[640px]:hidden">
                            <Link
                              href={`${getExpansionHref(product.episode.id)}?tab=sealed`}
                              prefetch={false}
                              onClick={(e) => e.stopPropagation()}
                              className="min-w-0 truncate text-gray-400 transition-colors hover:text-gray-600 hover:underline underline-offset-2 dark:text-gray-500 dark:hover:text-gray-300"
                            >
                              {product.episode.name}
                              {product.episode.code && (
                                <span className="ml-1 opacity-60">({product.episode.code})</span>
                              )}
                            </Link>
                          </div>
                        </div>

                        <div className="flex min-w-0 items-center justify-between gap-1.5 sm:shrink sm:justify-end">
                          {product.cm_lowest != null ? (
                            <span className="min-w-0 truncate text-[15px] font-semibold tabular-nums text-gray-900 max-[640px]:text-[12px] dark:text-white">
                              {formatEur(product.cm_lowest)}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-gray-500">No price</span>
                          )}

                          <CollectionAddSealedButton
                            product={{
                              id: product.id,
                              name: product.name,
                              image_url: product.image_url,
                              episode: product.episode,
                            }}
                            className="h-[22px] w-[22px] shrink-0 rounded-md border-black/8 bg-black/5 text-gray-900 hover:border-black/15 hover:bg-black/8 max-[640px]:h-6 max-[640px]:w-6 dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:bg-white/12"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {selectedCard && (
        <CardModal key={selectedCard.id} card={selectedCard} onClose={() => setSelectedCard(null)} />
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

export default function SearchPage() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const initialGameParam = searchParams.get(GAME_SEARCH_PARAM);
  const initialAutoSwitchParam = searchParams.get(AUTO_SWITCH_SEARCH_PARAM);

  return (
    <SearchPageContent
      initialQuery={initialQuery}
      initialGameParam={initialGameParam}
      initialAutoSwitchParam={initialAutoSwitchParam}
    />
  );
}
