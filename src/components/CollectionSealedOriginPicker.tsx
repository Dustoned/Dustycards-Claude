"use client";

import { useId, useMemo, useState } from "react";
import { Check, ChevronDown, PackageOpen, Search, X } from "lucide-react";
import CachedImage from "@/components/CachedImage";
import { modalInputClass } from "@/components/modal-glass-styles";
import {
  rankSealedOriginAutocompleteOptions,
} from "@/lib/collection-sealed-origin";
import { formatCurrency } from "@/lib/format";

export interface CollectionSealedOriginOption {
  id: string;
  name: string;
  image_url: string | null;
  episode: {
    id: string;
    name: string;
    code: string | null;
  };
  owned: boolean;
  matches_cards: boolean;
  price_basis: number | null;
  price_basis_source: "owned" | "market" | null;
}

const EMPTY_SEALED_ORIGIN_OPTIONS: CollectionSealedOriginOption[] = [];

export default function CollectionSealedOriginPicker({
  cardIds,
  value,
  usingPriceBasis,
  priceBasisMode = "card",
  disabled = false,
  onChange,
  onUsePriceBasis,
  onClearPriceBasis,
}: {
  cardIds: string[];
  value: string;
  usingPriceBasis: boolean;
  priceBasisMode?: "card" | "selection";
  disabled?: boolean;
  onChange: (option: CollectionSealedOriginOption | null) => void;
  onUsePriceBasis: (option: CollectionSealedOriginOption) => void;
  onClearPriceBasis: () => void;
}) {
  const [requestState, setRequestState] = useState<{
    key: string;
    status: "idle" | "loading" | "success" | "error";
    options: CollectionSealedOriginOption[];
    error: string | null;
  }>({ key: "", status: "idle", options: [], error: null });
  const [queryState, setQueryState] = useState({ key: "", value: "" });
  const [resultsOpen, setResultsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listboxId = useId();
  const cardIdsKey = cardIds.join("\u0000");
  const isCurrentRequest = requestState.key === cardIdsKey;
  const options = isCurrentRequest ? requestState.options : EMPTY_SEALED_ORIGIN_OPTIONS;
  const loading = isCurrentRequest && requestState.status === "loading";
  const loaded = isCurrentRequest && requestState.status === "success";
  const loadError = isCurrentRequest ? requestState.error : null;
  const selectedOption = options.find((option) => option.id === value) ?? null;
  const query =
    queryState.key === cardIdsKey ? queryState.value : selectedOption?.name ?? "";
  const suggestedOptions = useMemo(() => {
    const normalizedQuery = query.trim();
    const knownMatches = options.filter((option) => option.matches_cards);
    const searchableOptions =
      normalizedQuery || knownMatches.length === 0 ? options : knownMatches;
    return rankSealedOriginAutocompleteOptions(searchableOptions, normalizedQuery);
  }, [options, query]);

  function updateQuery(nextQuery: string) {
    setQueryState({ key: cardIdsKey, value: nextQuery });
    setActiveIndex(0);
  }

  async function loadOptions() {
    if (loading || loaded) return;
    setRequestState({ key: cardIdsKey, status: "loading", options: [], error: null });

    try {
      const response = await fetch("/api/collection/sealed-origins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardIds: cardIdsKey.split("\u0000").filter(Boolean) }),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | { options?: CollectionSealedOriginOption[]; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not load matching sealed products");
      }
      setRequestState({
        key: cardIdsKey,
        status: "success",
        options: Array.isArray(payload?.options) ? payload.options : [],
        error: null,
      });
    } catch (error) {
      setRequestState({
        key: cardIdsKey,
        status: "error",
        options: [],
        error:
          error instanceof Error ? error.message : "Could not load matching sealed products",
      });
    }
  }

  function selectOption(option: CollectionSealedOriginOption) {
    onChange(option);
    updateQuery(option.name);
    setResultsOpen(false);
    if (option.price_basis != null) {
      onUsePriceBasis(option);
    } else {
      onClearPriceBasis();
    }
  }

  function clearSelection() {
    onChange(null);
    onClearPriceBasis();
    updateQuery("");
    setResultsOpen(true);
  }

  const summary = selectedOption
    ? `Pulled from ${selectedOption.name}`
    : value
      ? "Sealed origin selected"
      : "Pulled from sealed?";

  return (
    <details
      className="group rounded-xl border border-white/9 bg-white/[0.035]"
      onToggle={(event) => {
        if (event.currentTarget.open) {
          setResultsOpen(true);
          void loadOptions();
        } else {
          setResultsOpen(false);
        }
      }}
    >
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-white/62 marker:hidden hover:text-white">
        <PackageOpen className="h-3.5 w-3.5 shrink-0 text-amber-200/72" />
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        {!value ? (
          <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-white/30">
            Optional
          </span>
        ) : null}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-white/8 px-3 py-3">
        <div
          className="relative"
          onBlur={(event) => {
            const nextFocus = event.relatedTarget;
            if (!(nextFocus instanceof Node) || !event.currentTarget.contains(nextFocus)) {
              setResultsOpen(false);
            }
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            value={query}
            disabled={disabled || loading}
            autoComplete="off"
            role="combobox"
            aria-label="Find sealed origin"
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={resultsOpen && loaded}
            aria-activedescendant={
              resultsOpen && suggestedOptions[activeIndex]
                ? `${listboxId}-${suggestedOptions[activeIndex].id}`
                : undefined
            }
            placeholder={loading ? "Finding sealed products…" : "Type any sealed product…"}
            className={`${modalInputClass} !pl-9 !pr-9 text-sm`}
            onFocus={() => setResultsOpen(true)}
            onChange={(event) => {
              const nextQuery = event.target.value;
              updateQuery(nextQuery);
              setResultsOpen(true);
              if (value && nextQuery !== selectedOption?.name) {
                onChange(null);
                onClearPriceBasis();
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setResultsOpen(true);
                setActiveIndex((current) =>
                  Math.min(current + 1, Math.max(0, suggestedOptions.length - 1))
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setResultsOpen(true);
                setActiveIndex((current) => Math.max(0, current - 1));
              } else if (event.key === "Enter" && resultsOpen) {
                const option = suggestedOptions[activeIndex];
                if (option) {
                  event.preventDefault();
                  selectOption(option);
                }
              } else if (event.key === "Escape") {
                setResultsOpen(false);
              }
            }}
          />

          {query || value ? (
            <button
              type="button"
              disabled={disabled}
              aria-label="Clear sealed origin"
              onMouseDown={(event) => event.preventDefault()}
              onClick={clearSelection}
              className="absolute right-2 top-1/2 z-10 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-white/34 transition hover:bg-white/[0.06] hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}

          {resultsOpen && loaded ? (
            <div
              id={listboxId}
              role="listbox"
              aria-label="Sealed product results"
              className="absolute inset-x-0 top-full z-40 mt-1.5 max-h-64 overflow-y-auto rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.88)] bg-[var(--dc-surface-glass-strong)] p-1.5 shadow-[0_24px_70px_var(--dc-shadow-color)] backdrop-blur-2xl max-[640px]:relative max-[640px]:inset-auto max-[640px]:top-auto max-[640px]:max-h-48"
            >
              <p className="px-2 pb-1.5 pt-1 text-[9px] font-bold uppercase tracking-[0.13em] text-white/28">
                {query.trim() ? "All sealed products" : "Products containing this set"}
              </p>
              {suggestedOptions.length > 0 ? (
                suggestedOptions.map((option, index) => (
                  <button
                    key={option.id}
                    id={`${listboxId}-${option.id}`}
                    type="button"
                    role="option"
                    aria-selected={option.id === value}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectOption(option)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition ${
                      index === activeIndex
                        ? "bg-violet-500/14 text-white"
                        : "text-white/72 hover:bg-white/[0.05] hover:text-white"
                    }`}
                  >
                    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-white/9 bg-white/[0.04]">
                      {option.image_url ? (
                        <CachedImage
                          sourceUrl={option.image_url}
                          alt=""
                          fill
                          sizes="36px"
                          className="object-contain p-1"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-amber-100/42">
                          <PackageOpen className="h-4 w-4" />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">
                        {option.name}
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] text-white/34">
                        <span className="truncate">
                          {option.episode.code ?? option.episode.name}
                        </span>
                        {option.owned ? (
                          <span className="shrink-0 text-emerald-200/68">Owned</span>
                        ) : null}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      {index === 0 && option.matches_cards ? (
                        <span className="block text-[8px] font-bold uppercase tracking-[0.11em] text-violet-200/56">
                          Best match
                        </span>
                      ) : !option.matches_cards ? (
                        <span className="block text-[8px] font-bold uppercase tracking-[0.11em] text-amber-200/48">
                          Manual choice
                        </span>
                      ) : null}
                      <span className="mt-0.5 block text-[11px] font-bold tabular-nums text-white/64">
                        {formatCurrency(option.price_basis, "EUR")}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-2 py-3 text-center text-[11px] text-white/38">
                  No sealed product found for “{query}”.
                </p>
              )}
            </div>
          ) : null}
        </div>

        {loading ? (
          <p className="mt-2 text-[11px] text-white/38">Finding closest sealed products…</p>
        ) : null}
        {loadError ? <p className="mt-2 text-[11px] text-rose-200/78">{loadError}</p> : null}
        {loaded && options.length === 0 ? (
          <p className="mt-2 text-[11px] text-white/38">No matching sealed products found.</p>
        ) : null}

        {selectedOption?.price_basis != null ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              usingPriceBasis
                ? onClearPriceBasis()
                : onUsePriceBasis(selectedOption)
            }
            className={`mt-2 flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[11px] font-semibold transition-colors ${
              usingPriceBasis
                ? "border-emerald-300/26 bg-emerald-300/[0.09] text-emerald-100"
                : "border-white/9 bg-black/15 text-white/54 hover:text-white"
            }`}
          >
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-current/20">
              {usingPriceBasis ? <Check className="h-3 w-3" /> : null}
            </span>
            <span className="min-w-0">
              Use {formatCurrency(selectedOption.price_basis, "EUR")} as{" "}
              {priceBasisMode === "selection" ? "total paid" : "cost basis"}
              <span className="ml-1 font-normal text-current/60">
                (current EU market)
              </span>
            </span>
          </button>
        ) : null}
      </div>
    </details>
  );
}
