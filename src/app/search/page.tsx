"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, X, Layers, Package, Layers3 } from "lucide-react";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";
import CollectionAddSealedButton from "@/components/CollectionAddSealedButton";
import { PageHeroHeader, SectionHeader, type HeaderStat } from "@/components/PageHeader";
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
  const headerStats = results
    ? ([
        { label: "Results", value: results.total.toLocaleString(), Icon: Search, tone: "sky" },
        { label: "Cards", value: results.singles.length.toLocaleString(), Icon: Layers, tone: "emerald" },
        { label: "Sealed", value: results.sealed.length.toLocaleString(), Icon: Package, tone: "amber" },
        { label: "Expansions", value: allExpansions.length.toLocaleString(), Icon: Layers3, tone: "violet" },
      ] satisfies HeaderStat[])
    : undefined;

  const minWidth = getCardGridTrackWidth(settings.cardSize, settings.widescreen);
  const sealedMinWidth = getSealedProductTrackWidth(settings.cardSize, settings.widescreen);
  const expansionScale = getExpansionTileScale(settings.uiScale, settings.widescreen);
  const logoHeight = getSearchLogoHeightClass(settings.uiScale);

  return (
    <div className="page-container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <PageHeroHeader
        eyebrow="DustyCards"
        title="Search"
        className="mb-6"
        stats={headerStats}
        description={
          <>
          {trimmedQuery
            ? results?.fuzzy
              ? `Beste matches voor "${trimmedQuery}" met typo-tolerantie.`
              : `Live resultaten voor "${trimmedQuery}".`
            : "Typ bovenin om direct kaarten, sealed en expansions te zoeken."}
          </>
        }
      />

      <div className="relative mb-8 max-w-2xl md:hidden">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={initialQuery}
          onChange={(e) => updateQuery(e.target.value)}
          placeholder="Zoek op naam, set-code, kaartnummer..."
          className="w-full pl-12 pr-10 py-3.5 rounded-2xl text-base bg-white dark:bg-white/5 border border-black/8 dark:border-white/8 text-gray-900 dark:text-white placeholder-gray-400 shadow-sm focus:outline-none focus:border-black/20 dark:focus:border-white/20 transition-colors"
          autoComplete="off"
          spellCheck={false}
        />
        {initialQuery.length > 0 && (
          <button
            onClick={() => {
              updateQuery("");
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span className="inline-block w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-300 rounded-full animate-spin" />
          Zoeken...
        </div>
      )}

      {/* No results */}
      {showEmpty && (
        <p className="text-sm text-gray-400">
          Geen resultaten voor{" "}
          <span className="font-medium text-gray-600 dark:text-gray-300">
            &ldquo;{trimmedQuery}&rdquo;
          </span>
          .
        </p>
      )}

      {/* Results */}
      {results && (results.total > 0 || allExpansions.length > 0) && (
        <div className="space-y-10">
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
                            <span className="text-gray-300 dark:text-white/20">•</span>
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
