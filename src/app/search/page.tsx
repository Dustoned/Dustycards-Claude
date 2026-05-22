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
import { getCardImageClassName } from "@/lib/card-image-display";
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
  const gameSwitchItems = GAME_FILTER_OPTIONS.map((game) => ({
    href: buildGameHref(game),
    active: displayGame === game,
    label: getGameFilterLabel(game),
  }));

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
      ? "gap-x-0 gap-y-3"
      : displaySettings.cardSize === "medium"
        ? "gap-x-2 gap-y-2.5"
        : "gap-x-1.5 gap-y-2"
    : "gap-2.5";
  const compactFourColumnSingles = isMobileViewport && displaySettings.cardSize === "xsmall";
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
        {resultSummary ? (
          <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 sm:justify-end">
            <p className="text-sm font-medium text-white/45">
              {resultSummary}
            </p>
          </div>
        ) : null}
      </div>

      {/* Loading */}
      {loading && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3 text-sm text-white/45">
          <span className="inline-block w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-300 rounded-full animate-spin" />
          Searching...
        </div>
      )}

      {!loading && trimmedQuery.length < MIN_SEARCH_LENGTH && (
        <div className="rounded-3xl border border-dashed border-white/12 bg-white/[0.035] p-5 text-sm text-white/45">
          Use the header search to find cards, sealed products, or expansions.
        </div>
      )}

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
          {allExpansions.length > 0 && (
            <section>
              <SectionHeader title="Expansions" count={allExpansions.length} compact className="mb-4" />

              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: getFixedTrackGridTemplate(expansionScale.minWidth),
                  justifyContent: "stretch",
                }}
              >
                {allExpansions.map((ep) => (
                  <Link
                    key={ep.id}
                    href={getExpansionHref(ep.id)}
                    prefetch={false}
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
                      className="relative flex cursor-pointer flex-col rounded-[14px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] p-1.5 text-left shadow-[0_12px_28px_rgba(0,0,0,0.24)] outline-none transition-colors hover:border-white/14 max-[640px]:rounded-[13px] max-[640px]:p-1"
                      aria-busy={openingCardId === card.id}
                    >
                      <div className="relative aspect-[63/88] w-full overflow-hidden rounded-[4.75%] bg-[#d8d5cc] drop-shadow-[0_10px_18px_rgba(0,0,0,0.22)] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-2 after:ring-inset after:ring-white/12">
                        {card.image_url ? (
                          <Image
                            src={getCachedImageUrl(card.image_url) ?? card.image_url}
                            alt={card.name}
                            fill
                            className={getCardImageClassName(card.image_url, "object-contain")}
                            sizes={minWidth}
                            loading={index < 18 ? "eager" : undefined}
                            unoptimized
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
                                compactFourColumnSingles
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
                              compactFourColumnSingles
                                ? "grid min-w-0 gap-1"
                                : "flex min-w-0 flex-wrap items-center justify-between gap-x-1.5 gap-y-1"
                            }
                          >
                            {card.cm_en_lowest_nm != null ? (
                              <span
                                className={
                                  compactFourColumnSingles
                                    ? "block min-w-0 max-w-full whitespace-nowrap text-[clamp(9px,2.85vw,11px)] font-bold tabular-nums leading-tight text-white"
                                    : "whitespace-nowrap text-[12px] font-bold tabular-nums leading-tight text-white sm:text-[14px]"
                                }
                              >
                                {formatEur(card.cm_en_lowest_nm)}
                              </span>
                            ) : (
                              <span className="text-[10px] text-white/35 sm:text-xs">No price</span>
                            )}

                            <div className={compactFourColumnSingles ? "flex justify-start" : ""}>
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
                                className="h-[24px] w-[24px] shrink-0 rounded-lg border-white/10 bg-black/38 text-white hover:bg-white/12 sm:h-7 sm:w-7"
                              />
                            </div>
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
                    className="relative flex cursor-pointer flex-col rounded-[14px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] p-1.5 text-left shadow-[0_12px_28px_rgba(0,0,0,0.24)] outline-none transition-colors hover:border-white/14 max-[640px]:rounded-[13px] max-[640px]:p-1"
                  >
                    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/8 bg-black/24 shadow-md shadow-black/20">
                      {product.image_url ? (
                        <Image
                          src={getCachedImageUrl(product.image_url) ?? product.image_url}
                          alt={product.name}
                          fill
                          className="scale-[1.25] object-contain p-2"
                          sizes={sealedImageSizes}
                          loading={index < 18 ? "eager" : undefined}
                          unoptimized
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
                          {product.cm_lowest != null ? (
                            <span className="whitespace-nowrap text-[12px] font-bold tabular-nums leading-tight text-white sm:text-[14px]">
                              {formatEur(product.cm_lowest)}
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
                            className="h-[24px] w-[24px] shrink-0 rounded-lg border-white/10 bg-black/38 text-white hover:bg-white/12 sm:h-7 sm:w-7"
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
