"use client";

import { Check, Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CachedImage from "@/components/CachedImage";
import {
  modalBottomSheetOverlayClass,
  modalBottomSheetPanelClass,
  modalCloseButtonClass,
} from "@/components/modal-glass-styles";
import { formatCollectionCurrency } from "@/lib/collection";
import type { TradingCardGameFilter } from "@/lib/games";

export type CardSearchPickerResult = {
  id: string;
  name: string;
  card_number: string | null;
  version?: string | null;
  rarity?: string | null;
  supertype?: string | null;
  image_url: string | null;
  episode_name: string;
  episode_code: string | null;
  episode_release_date?: string | null;
  cm_en_lowest_nm: number | null;
};

type SortMode = "relevance" | "price_asc" | "price_desc" | "newest" | "oldest";

export type TradeSuggestionDirection = "multiply" | "divide";

export function getTradeSuggestionTarget(
  oppositeSideValue: number | null | undefined,
  percentage: number,
  direction: TradeSuggestionDirection
): number | null {
  if (
    oppositeSideValue == null ||
    !Number.isFinite(oppositeSideValue) ||
    oppositeSideValue <= 0 ||
    !Number.isFinite(percentage) ||
    percentage <= 0
  ) {
    return null;
  }

  const target = direction === "multiply"
    ? (oppositeSideValue * percentage) / 100
    : (oppositeSideValue * 100) / percentage;

  return Number(target.toFixed(2));
}

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "relevance", label: "Best match" },
  { value: "price_asc", label: "Lowest price" },
  { value: "price_desc", label: "Highest price" },
  { value: "newest", label: "Newest set" },
  { value: "oldest", label: "Oldest set" },
];

function getReleaseYear(value: string | null | undefined): string | null {
  return value?.match(/^(\d{4})/)?.[1] ?? null;
}

function comparePrice(
  left: CardSearchPickerResult,
  right: CardSearchPickerResult,
  direction: 1 | -1
) {
  if (left.cm_en_lowest_nm == null && right.cm_en_lowest_nm == null) return 0;
  if (left.cm_en_lowest_nm == null) return 1;
  if (right.cm_en_lowest_nm == null) return -1;
  return (left.cm_en_lowest_nm - right.cm_en_lowest_nm) * direction;
}

function getGameLabel(game: TradingCardGameFilter) {
  if (game === "pokemon") return "Pokémon";
  if (game === "one-piece") return "One Piece";
  return "All games";
}

export default function CardSearchPickerDialog({
  label,
  game,
  selectedCardId,
  excludedCardId,
  suggestedValue,
  suggestedPercentage = 100,
  suggestionDirection = "multiply",
  percentageOptions = [],
  onSuggestedPercentageChange,
  onClose,
  onSelect,
}: {
  label: string;
  game: TradingCardGameFilter;
  selectedCardId?: string | null;
  excludedCardId?: string | null;
  suggestedValue?: number | null;
  suggestedPercentage?: number;
  suggestionDirection?: TradeSuggestionDirection;
  percentageOptions?: readonly number[];
  onSuggestedPercentageChange?: (percentage: number) => void;
  onClose: () => void;
  onSelect: (card: CardSearchPickerResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsViewportRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardSearchPickerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("relevance");
  const [releaseYear, setReleaseYear] = useState("all");
  const trimmedQuery = query.trim();
  const suggestionTarget = getTradeSuggestionTarget(
    suggestedValue,
    suggestedPercentage,
    suggestionDirection
  );
  const isValueSuggestionMode = !trimmedQuery && suggestionTarget != null;

  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("dc-scroll-locked");
    const focusTimer = window.requestAnimationFrame(() => inputRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      html.classList.remove("dc-scroll-locked");
      window.cancelAnimationFrame(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (!trimmedQuery && suggestionTarget == null) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = trimmedQuery
          ? new URLSearchParams({ q: trimmedQuery, game })
          : new URLSearchParams({ target: String(suggestionTarget), game });
        const endpoint = trimmedQuery
          ? `/api/search?${params.toString()}`
          : `/api/search/trade-suggestions?${params.toString()}`;
        const response = await fetch(endpoint, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as
          | { singles?: CardSearchPickerResult[]; error?: string }
          | null;
        if (!response.ok) {
          throw new Error(payload?.error || "Cards could not be searched.");
        }
        setResults((payload?.singles ?? []).filter((card) => card.id !== excludedCardId));
        setSearched(true);
        resultsViewportRef.current?.scrollTo({ top: 0 });
      } catch (searchError) {
        if (searchError instanceof DOMException && searchError.name === "AbortError") return;
        setResults([]);
        setSearched(true);
        setError(
          searchError instanceof Error
            ? searchError.message
            : "Cards could not be searched."
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, trimmedQuery ? 240 : 0);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [excludedCardId, game, suggestionTarget, trimmedQuery]);

  const releaseYears = useMemo(
    () =>
      Array.from(
        new Set(
          results
            .map((card) => getReleaseYear(card.episode_release_date))
            .filter((year): year is string => Boolean(year))
        )
      ).sort((left, right) => right.localeCompare(left)),
    [results]
  );
  const activeReleaseYear = releaseYears.includes(releaseYear) ? releaseYear : "all";
  const sortedResults = useMemo(() => {
    const filtered = activeReleaseYear === "all"
      ? results
      : results.filter(
          (card) => getReleaseYear(card.episode_release_date) === activeReleaseYear
        );
    if (sortMode === "relevance") return filtered;
    const copy = [...filtered];
    if (sortMode === "newest" || sortMode === "oldest") {
      copy.sort((left, right) =>
        sortMode === "newest"
          ? (right.episode_release_date ?? "").localeCompare(left.episode_release_date ?? "")
          : (left.episode_release_date ?? "").localeCompare(right.episode_release_date ?? "")
      );
    } else {
      copy.sort((left, right) =>
        comparePrice(left, right, sortMode === "price_asc" ? 1 : -1)
      );
    }
    return copy;
  }, [activeReleaseYear, results, sortMode]);

  return createPortal(
    <div
      className={`${modalBottomSheetOverlayClass} z-[260] sm:p-5`}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-search-picker-title"
        data-testid="card-search-picker"
        className={`${modalBottomSheetPanelClass} max-w-5xl`}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/9 px-4 py-3.5 sm:px-6 sm:py-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-violet-200/55">
                Trade card search
              </p>
              <span className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[8px] font-bold text-white/38">
                {getGameLabel(game)}
              </span>
            </div>
            <h2 id="card-search-picker-title" className="mt-1 text-lg font-black text-white sm:text-2xl">
              Choose a card for {label.replace("Trade side ", "side ")}
            </h2>
            <p className="mt-1 text-[10px] text-white/38 sm:text-xs">
              {suggestionTarget == null
                ? "Same matching as normal Search, including set codes, card numbers and typo correction."
                : `Cards closest to ${formatCollectionCurrency(suggestionTarget)} are ready below. You can still search manually.`}
            </p>
            {percentageOptions.length > 0 && onSuggestedPercentageChange ? (
              <div className="mt-3 rounded-2xl border border-violet-300/14 bg-violet-500/[0.055] p-2.5 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:p-3">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-violet-100/58">
                    Trade percentage
                  </p>
                  <p className="mt-0.5 text-[9px] text-white/34 sm:text-[10px]">
                    {suggestionTarget == null
                      ? `${suggestedPercentage}% will be used as soon as the other side has a priced card.`
                      : suggestionDirection === "multiply"
                        ? `Side B target: ${formatCollectionCurrency(suggestionTarget)} (${suggestedPercentage}% of Side A).`
                        : `Side A target: ${formatCollectionCurrency(suggestionTarget)} (so Side B is ${suggestedPercentage}% of Side A).`}
                  </p>
                </div>
                <div
                  className="mt-2 grid grid-cols-5 gap-1 sm:mt-0 sm:flex sm:shrink-0"
                  aria-label={`Trade value percentage for ${label}`}
                >
                  {percentageOptions.map((percentage) => {
                    const active = percentage === suggestedPercentage;
                    return (
                      <button
                        key={percentage}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onSuggestedPercentageChange(percentage)}
                        className={`min-h-9 rounded-xl border px-2 text-[10px] font-black tabular-nums transition-colors ${
                          active
                            ? "border-violet-300/38 bg-violet-500/[0.2] text-violet-50 shadow-sm shadow-violet-500/15"
                            : "border-white/9 bg-white/[0.03] text-white/44 hover:border-violet-300/22 hover:text-white/76"
                        }`}
                      >
                        {percentage}%
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className={modalCloseButtonClass} aria-label="Close card search">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="shrink-0 border-b border-white/8 bg-black/10 px-3 py-3 sm:px-6 sm:py-4">
          <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-white/11 bg-white/[0.045] px-3.5 shadow-inner shadow-black/20 transition-colors focus-within:border-violet-300/32 focus-within:bg-violet-500/[0.055] sm:min-h-14 sm:px-4">
            <Search className="h-4 w-4 shrink-0 text-violet-100/52 sm:h-5 sm:w-5" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                const nextQuery = event.target.value;
                setQuery(nextQuery);
                setError(null);
                if (nextQuery.trim()) {
                  setLoading(true);
                } else {
                  setResults([]);
                  setSearched(false);
                  setLoading(false);
                }
              }}
              type="text"
              placeholder={
                suggestionTarget == null
                  ? "Name, set, number or code…"
                  : "Search instead of using value matches…"
              }
              className="min-w-0 flex-1 bg-transparent text-base font-semibold text-white outline-none placeholder:text-white/28"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              aria-label={`Search card for ${label}`}
            />
            {loading ? (
              <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/15 border-t-violet-200" aria-label="Searching" />
            ) : query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setResults([]);
                  setSearched(false);
                  setError(null);
                  inputRef.current?.focus();
                }}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/38 hover:bg-white/[0.07] hover:text-white"
                aria-label="Clear card search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </label>

          <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">
            {SORT_OPTIONS.map((option) => {
              const active = sortMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSortMode(option.value)}
                  aria-pressed={active}
                  className={`min-h-9 rounded-xl border px-3 text-[10px] font-black transition-colors ${
                    active
                      ? "border-violet-300/28 bg-violet-500/[0.16] text-violet-50"
                      : "border-white/8 bg-white/[0.025] text-white/38 hover:border-white/14 hover:text-white/68"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
            {releaseYears.length > 1 ? (
              <select
                value={activeReleaseYear}
                onChange={(event) => setReleaseYear(event.target.value)}
                aria-label="Filter by release year"
                className="min-h-9 rounded-xl border border-white/8 bg-white/[0.025] px-3 text-[10px] font-black text-white/55 outline-none transition-colors hover:border-white/14 hover:text-white/75 [&>option]:bg-zinc-950"
              >
                <option value="all">All years</option>
                {releaseYears.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            ) : null}
          </div>
        </div>

        <div
          ref={resultsViewportRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 sm:px-6 sm:pb-6 sm:pt-4"
        >
          {(trimmedQuery || isValueSuggestionMode) && !error && (sortedResults.length > 0 || loading) ? (
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <p className="text-[10px] font-bold text-white/38">
                {isValueSuggestionMode
                  ? sortedResults.length > 0
                    ? `${sortedResults.length} closest matches · target ${formatCollectionCurrency(suggestionTarget)}`
                    : "Finding cards with the closest value…"
                  : sortedResults.length > 0
                    ? `${loading ? "Updating" : sortedResults.length} card result${sortedResults.length === 1 ? "" : "s"}${loading ? ` · ${sortedResults.length} currently shown` : ""}`
                    : "Finding matching cards…"}
              </p>
              {sortedResults.length > 0 ? (
                <span className="text-[9px] font-bold text-white/24">Tap a card to select it</span>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-rose-300/16 bg-rose-500/[0.055] px-4 py-8 text-center text-xs font-semibold text-rose-100/72">
              {error}
            </div>
          ) : sortedResults.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2">
              {sortedResults.map((card) => {
                const selected = card.id === selectedCardId;
                const valueDifference =
                  isValueSuggestionMode &&
                  card.cm_en_lowest_nm != null &&
                  suggestionTarget != null
                    ? Number((card.cm_en_lowest_nm - suggestionTarget).toFixed(2))
                    : null;
                return (
                  <button
                    key={card.id}
                    type="button"
                    data-card-search-result={card.id}
                    onClick={() => onSelect(card)}
                    className={`group flex min-w-0 items-center gap-3 rounded-2xl border p-2.5 text-left transition-colors sm:p-3 ${
                      selected
                        ? "border-violet-300/32 bg-violet-500/[0.12]"
                        : "border-white/8 bg-white/[0.028] hover:border-white/16 hover:bg-white/[0.055]"
                    }`}
                  >
                    <span className="relative aspect-[63/88] w-14 shrink-0 overflow-hidden rounded-lg border border-white/8 bg-black/24 sm:w-16">
                      {card.image_url ? (
                        <CachedImage
                          sourceUrl={card.image_url}
                          alt=""
                          fill
                          sizes="64px"
                          className="object-contain"
                          unoptimized
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center text-white/16"><Search className="h-4 w-4" /></span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 self-stretch py-0.5">
                      <span className="flex min-w-0 items-start justify-between gap-2">
                        <span className="min-w-0">
                          <strong className="block truncate text-xs font-black text-white/84 sm:text-sm">
                            {card.name}
                          </strong>
                          {card.version || card.rarity ? (
                            <small className="mt-0.5 block truncate text-[9px] font-bold text-violet-100/48 sm:text-[10px]">
                              {[card.version, card.rarity].filter(Boolean).join(" · ")}
                            </small>
                          ) : null}
                        </span>
                        {selected ? (
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        ) : null}
                      </span>
                      <small className="mt-1.5 block line-clamp-2 text-[9px] leading-snug text-white/34 sm:text-[10px]">
                        {card.episode_name}
                        {card.episode_code ? ` · ${card.episode_code}` : ""}
                        {card.card_number ? ` · #${card.card_number}` : ""}
                      </small>
                      <span className="mt-2 flex items-center justify-between gap-2">
                        <span className="block text-sm font-black tabular-nums text-white sm:text-base">
                          {card.cm_en_lowest_nm == null
                            ? "No EU price"
                            : formatCollectionCurrency(card.cm_en_lowest_nm)}
                        </span>
                        {valueDifference != null ? (
                          <span
                            className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-black tabular-nums ${
                              Math.abs(valueDifference) <= 1
                                ? "border-emerald-300/18 bg-emerald-400/[0.08] text-emerald-200"
                                : "border-white/8 bg-white/[0.035] text-white/38"
                            }`}
                          >
                            {valueDifference > 0 ? "+" : ""}
                            {formatCollectionCurrency(valueDifference)}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : searched && !loading ? (
            <div className="rounded-2xl border border-dashed border-white/9 bg-white/[0.02] px-4 py-10 text-center">
              <Search className="mx-auto h-5 w-5 text-white/20" />
              <p className="mt-3 text-xs font-black text-white/54">No card results found</p>
              <p className="mt-1 text-[10px] text-white/30">Try a card number, set code or a shorter name.</p>
            </div>
          ) : !trimmedQuery && !isValueSuggestionMode ? (
            <div className="rounded-2xl border border-dashed border-violet-300/12 bg-violet-500/[0.025] px-4 py-10 text-center sm:py-14">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-300/14 bg-violet-500/[0.08] text-violet-100/55">
                <Sparkles className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-black text-white/62">Search the complete card catalog</p>
              <p className="mx-auto mt-1 max-w-sm text-[10px] leading-relaxed text-white/32 sm:text-xs">
                Examples: Gengar, ASC 284, 94/99 or a set name. Every returned single is shown here.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </div>,
    document.body
  );
}
