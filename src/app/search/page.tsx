"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, X, Package } from "lucide-react";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";
import CollectionAddSealedButton from "@/components/CollectionAddSealedButton";
import { SectionHeader } from "@/components/PageHeader";
import { useSettings } from "@/components/SettingsProvider";
import {
  getCardGridTrackWidth,
  getExpansionTileScale,
  getFixedTrackGridTemplate,
  getSearchLogoHeightClass,
  getSealedProductTrackWidth,
} from "@/lib/display-scale";
import {
  clearSearchReturnPath,
  readSearchReturnPath,
} from "@/lib/search-navigation";
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
}

const MIN_SEARCH_LENGTH = 1;

function formatEur(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function SearchPageContent({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const { settings } = useSettings();
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedCard, setSelectedCard] = useState<ModalCardData | null>(null);
  const [selectedSealed, setSelectedSealed] = useState<SealedModalProductData | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultsCacheRef = useRef(new Map<string, SearchResults>());
  const trimmedQuery = initialQuery.trim();

  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      inputRef.current?.focus();
    }
  }, []);

  function updateQuery(nextQuery: string) {
    const trimmed = nextQuery.trim();
    if (trimmed) {
      router.replace(`/search?q=${encodeURIComponent(trimmed)}`);
      return;
    }

    const returnHref = readSearchReturnPath();
    clearSearchReturnPath();

    if (returnHref) {
      router.replace(returnHref);
      return;
    }

    router.replace("/search");
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

      const cachedResults = resultsCacheRef.current.get(trimmedQuery);
      if (cachedResults) {
        abortRef.current?.abort();
        abortRef.current = null;
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
          const res = await fetch(`/api/search?q=${encodeURIComponent(trimmedQuery)}`, {
            signal: controller.signal,
          });
          if (!res.ok) throw new Error("search failed");

          const data: SearchResults = await res.json();
          if (abortRef.current === controller) {
            resultsCacheRef.current.set(trimmedQuery, data);
            setResults(data);
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
  }, [trimmedQuery]);

  async function openCard(card: SingleResult) {
    try {
      const res = await fetch(`/api/cards/${encodeURIComponent(card.id)}`);
      if (!res.ok) return;
      const data: ModalCardData = await res.json();
      setSelectedCard(data);
    } catch {
      // silently ignore
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

  const minWidth = getCardGridTrackWidth(settings.cardSize, settings.widescreen);
  const sealedMinWidth = getSealedProductTrackWidth(settings.cardSize, settings.widescreen);
  const expansionScale = getExpansionTileScale(settings.uiScale, settings.widescreen);
  const logoHeight = getSearchLogoHeightClass(settings.uiScale);

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

      <div className="glass mb-4 rounded-3xl border border-black/8 bg-white/72 p-3 shadow-sm shadow-black/5 dark:border-white/8 dark:bg-white/[0.045] sm:p-4 lg:hidden">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={initialQuery}
            onChange={(e) => updateQuery(e.target.value)}
            placeholder="Search name, set code, card number..."
            className="w-full rounded-2xl border border-black/8 bg-white py-3.5 pl-12 pr-10 text-base text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:border-black/20 focus:outline-none dark:border-white/8 dark:bg-white/5 dark:text-white dark:focus:border-white/20"
            autoComplete="off"
            spellCheck={false}
          />
          {initialQuery.length > 0 && (
            <button
              type="button"
              onClick={() => {
                updateQuery("");
                inputRef.current?.focus();
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

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
                    href={`/expansions/${ep.id}`}
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
                className="grid gap-2"
                style={{
                  gridTemplateColumns: getFixedTrackGridTemplate(minWidth),
                  justifyContent: "start",
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
                  >
                    <div className="relative w-full aspect-[63/88] rounded-xl overflow-hidden shadow-md shadow-black/20 group-hover:shadow-xl group-hover:shadow-black/30 group-hover:scale-[1.03] transition-all duration-200">
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
                    </div>

                    <div className="mt-2 px-0.5">
                      <div className="flex items-end justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold leading-snug text-gray-900 dark:text-white">
                            {card.name}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium">
                            <span className="shrink-0 text-gray-500 dark:text-gray-400">
                              {card.card_number ? `#${card.card_number}` : "--"}
                            </span>
                            <span className="text-gray-300 dark:text-white/20">/</span>
                            <Link
                              href={`/expansions/${card.episode_id}`}
                              prefetch={false}
                              onClick={(e) => e.stopPropagation()}
                              className="min-w-0 truncate text-gray-400 transition-colors hover:text-gray-600 hover:underline underline-offset-2 dark:text-gray-500 dark:hover:text-gray-300"
                            >
                              {card.episode_name}
                              {card.episode_code && (
                                <span className="ml-1 opacity-60">({card.episode_code})</span>
                              )}
                            </Link>
                          </div>
                        </div>

                        <div className="flex min-w-0 shrink items-center justify-end gap-1.5">
                          {card.cm_en_lowest_nm != null ? (
                            <span className="min-w-0 truncate text-[15px] font-semibold tabular-nums text-gray-900 dark:text-white">
                              {formatEur(card.cm_en_lowest_nm)}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-gray-500">No price</span>
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
                            className="h-[22px] w-[22px] shrink-0 rounded-md border-black/8 bg-black/5 text-gray-900 hover:border-black/15 hover:bg-black/8 dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:bg-white/12"
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
                  gridTemplateColumns: getFixedTrackGridTemplate(sealedMinWidth),
                  justifyContent: "start",
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
                    className="group flex cursor-pointer flex-col gap-1.5 text-left outline-none"
                  >
                    <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-transparent bg-black/4 shadow-md shadow-black/20 transition-all duration-200 group-hover:scale-[1.03] group-hover:shadow-xl group-hover:shadow-black/30 dark:bg-white/4">
                      {product.image_url ? (
                        <Image
                          src={getCachedImageUrl(product.image_url) ?? product.image_url}
                          alt={product.name}
                          fill
                          className="object-contain p-3"
                          sizes={sealedMinWidth}
                          loading={index < 18 ? "eager" : undefined}
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                        </div>
                      )}
                    </div>
                    <div className="mt-2 px-0.5">
                      <div className="flex items-end justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-gray-900 dark:text-white">
                            {product.name}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium">
                            <Link
                              href={`/expansions/${product.episode.id}?tab=sealed`}
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

                        <div className="flex min-w-0 shrink items-center justify-end gap-1.5">
                          {product.cm_lowest != null ? (
                            <span className="min-w-0 truncate text-[15px] font-semibold tabular-nums text-gray-900 dark:text-white">
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
                            className="h-[22px] w-[22px] shrink-0 rounded-md border-black/8 bg-black/5 text-gray-900 hover:border-black/15 hover:bg-black/8 dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:bg-white/12"
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

  return <SearchPageContent initialQuery={initialQuery} />;
}
