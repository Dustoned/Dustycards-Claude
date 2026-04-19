"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search, X, Layers, Package, Layers3 } from "lucide-react";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";
import CollectionAddSealedButton from "@/components/CollectionAddSealedButton";
import { useSettings } from "@/components/SettingsProvider";
import CardModal, { type ModalCardData } from "@/components/CardModal";
import SealedProductModal, {
  type SealedModalProductData,
} from "@/components/SealedProductModal";

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
}

function formatEur(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

const cardMinWidth: Record<"small" | "medium" | "large", Record<"normal" | "wide", string>> = {
  small: { normal: "120px", wide: "160px" },
  medium: { normal: "160px", wide: "220px" },
  large: { normal: "220px", wide: "300px" },
};

const expansionMinWidth: Record<"small" | "medium" | "large", Record<"normal" | "wide", string>> = {
  small: { normal: "150px", wide: "165px" },
  medium: { normal: "175px", wide: "215px" },
  large: { normal: "250px", wide: "320px" },
};

export default function SearchPage() {
  const { settings } = useSettings();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedCard, setSelectedCard] = useState<ModalCardData | null>(null);
  const [selectedSealed, setSelectedSealed] = useState<SealedModalProductData | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const trimmedQuery = query.trim();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (trimmedQuery.length < 3) {
        abortRef.current?.abort();
        abortRef.current = null;
        setResults(null);
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
    !loading && results !== null && results.total === 0 && trimmedQuery.length >= 3;

  const allExpansions: ExpansionResult[] = results?.expansions ?? [];

  const minWidth = cardMinWidth[settings.cardSize][settings.widescreen ? "wide" : "normal"];
  const expMinWidth = expansionMinWidth[settings.cardSize][settings.widescreen ? "wide" : "normal"];


  const logoHeight =
    settings.cardSize === "small" ? "h-12" : settings.cardSize === "large" ? "h-20" : "h-14";

  return (
    <div className="page-container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Search input */}
      <div className="relative mb-8 max-w-2xl mx-auto">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoek op naam, set-code, kaartnummer..."
          className="w-full pl-12 pr-10 py-3.5 rounded-2xl text-base bg-white dark:bg-white/5 border border-black/8 dark:border-white/8 text-gray-900 dark:text-white placeholder-gray-400 shadow-sm focus:outline-none focus:border-black/20 dark:focus:border-white/20 transition-colors"
          autoComplete="off"
          spellCheck={false}
        />
        {query.length > 0 && (
          <button
            onClick={() => {
              setQuery("");
              setResults(null);
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
              <div className="flex items-center gap-2 mb-4">
                <Layers3 className="w-4 h-4 text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Expansions
                </h2>
                <span className="text-xs text-gray-400 tabular-nums">
                  {allExpansions.length}
                </span>
              </div>

              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: `repeat(auto-fill, minmax(${expMinWidth}, 1fr))`,
                }}
              >
                {allExpansions.map((ep) => (
                  <Link
                    key={ep.id}
                    href={`/expansions/${ep.id}`}
                    className="group glass flex flex-col items-center rounded-2xl p-3.5 gap-3 transition-all duration-200 hover:scale-[1.03] hover:bg-white/8 active:scale-[0.98] dark:hover:bg-white/6"
                  >
                    {ep.logo_url ? (
                      <div className={`relative w-full ${logoHeight}`}>
                        <Image
                          src={ep.logo_url}
                          alt={ep.name}
                          fill
                          className="object-contain drop-shadow-sm"
                          sizes={expMinWidth}
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
                      <p className="text-xs font-semibold leading-snug line-clamp-2 text-gray-800 dark:text-white group-hover:text-black dark:group-hover:text-white transition-colors">
                        {ep.name}
                      </p>
                      {ep.code && (
                        <p className="mt-0.5 text-xs text-gray-400 dark:text-white/40">{ep.code}</p>
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
              <div className="flex items-center gap-2 mb-4">
                <Layers className="w-4 h-4 text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Singles
                </h2>
                <span className="text-xs text-gray-400 tabular-nums">
                  {results.singles.length}
                </span>
              </div>

              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}, 1fr))`,
                }}
              >
                {results.singles.map((card, index) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => openCard(card)}
                    className="flex flex-col gap-1.5 group text-left"
                  >
                    <div className="relative w-full aspect-[63/88] rounded-xl overflow-hidden shadow-md shadow-black/20 group-hover:shadow-xl group-hover:shadow-black/30 group-hover:scale-[1.03] transition-all duration-200">
                      {card.image_url ? (
                        <Image
                          src={card.image_url}
                          alt={card.name}
                          fill
                          className="object-contain"
                          sizes="160px"
                          loading={index < 18 ? "eager" : undefined}
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full bg-black/6 dark:bg-white/6 flex items-center justify-center text-gray-300 text-xs rounded-xl">
                          {card.name.slice(0, 2)}
                        </div>
                      )}

                      <div className="absolute right-2 top-2">
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
                          theme="dark"
                          className="h-8 w-8 bg-black/65 text-white hover:bg-black/78"
                        />
                      </div>
                    </div>

                    <div className="px-0.5">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white truncate leading-snug">
                        {card.name}
                      </p>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] tabular-nums">
                        <span className="text-gray-400 dark:text-gray-500">
                          {card.card_number ? `#${card.card_number}` : "-"}
                        </span>
                        {card.cm_en_lowest_nm != null && (
                          <span className="text-gray-500 dark:text-gray-400">
                            {formatEur(card.cm_en_lowest_nm)}
                          </span>
                        )}
                      </div>
                      <Link
                        href={`/expansions/${card.episode_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5 hover:text-gray-600 dark:hover:text-gray-300 hover:underline underline-offset-2 transition-colors block"
                      >
                        {card.episode_name}
                        {card.episode_code && (
                          <span className="ml-1 opacity-60">({card.episode_code})</span>
                        )}
                      </Link>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Sealed grid */}
          {results.sealed.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Package className="w-4 h-4 text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Sealed
                </h2>
                <span className="text-xs text-gray-400 tabular-nums">
                  {results.sealed.length}
                </span>
              </div>

              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}, 1fr))`,
                }}
              >
                {results.sealed.map((product, index) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => openSealed(product)}
                    className="flex flex-col gap-1.5 group text-left"
                  >
                    <div className="relative w-full aspect-[63/88] rounded-xl overflow-hidden shadow-md shadow-black/20 group-hover:shadow-xl group-hover:shadow-black/30 group-hover:scale-[1.03] transition-all duration-200 bg-black/4 dark:bg-white/4">
                      {product.image_url ? (
                        <Image
                          src={product.image_url}
                          alt={product.name}
                          fill
                          className="object-contain p-1"
                          sizes="160px"
                          loading={index < 18 ? "eager" : undefined}
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                        </div>
                      )}

                      <div className="absolute right-2 top-2">
                        <CollectionAddSealedButton
                          product={{
                            id: product.id,
                            name: product.name,
                            image_url: product.image_url,
                            episode: product.episode,
                          }}
                          theme="dark"
                          className="h-8 w-8 bg-black/65 text-white hover:bg-black/78"
                        />
                      </div>
                    </div>
                    <div className="px-0.5">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white truncate leading-snug line-clamp-2">
                        {product.name}
                      </p>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] tabular-nums">
                        <Link
                          href={`/expansions/${product.episode.id}?tab=sealed`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-gray-400 dark:text-gray-500 truncate hover:text-gray-600 dark:hover:text-gray-300 hover:underline underline-offset-2 transition-colors"
                        >
                          {product.episode.name}
                          {product.episode.code && (
                            <span className="ml-1 opacity-60">({product.episode.code})</span>
                          )}
                        </Link>
                        {product.cm_lowest != null && (
                          <span className="text-gray-500 dark:text-gray-400 shrink-0">
                            {formatEur(product.cm_lowest)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {selectedCard && (
        <CardModal card={selectedCard} onClose={() => setSelectedCard(null)} />
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
