"use client";

import { Check, Loader2, PackageOpen, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CachedImage from "@/components/CachedImage";
import {
  modalBottomSheetOverlayClass,
  modalBottomSheetPanelClass,
  modalCloseButtonClass,
} from "@/components/modal-glass-styles";
import { formatCollectionCurrency } from "@/lib/collection";
import type { CatalogSealedChoice, OpeningSealedChoice, OwnedSealedChoice } from "./OpeningSessionsClient";

type PickerTab = "collection" | "catalog";
type CatalogResponse = {
  items?: CatalogSealedChoice[];
  total?: number;
  nextOffset?: number | null;
  error?: string;
};

function asOwnedChoice(item: OwnedSealedChoice): OpeningSealedChoice {
  return {
    selectionKey: `collection:${item.id}`,
    source: "collection",
    collectionSealedId: item.id,
    productId: item.productId,
    name: item.name,
    imageUrl: item.imageUrl,
    quantity: item.quantity,
    purchasePricePerItem: item.purchasePricePerItem,
    marketPrice: item.marketPrice,
    suggestedPacks: item.suggestedPacks,
    episode: item.episode,
  };
}

function asCatalogChoice(item: CatalogSealedChoice): OpeningSealedChoice {
  return {
    selectionKey: `catalog:${item.productId}`,
    source: "catalog",
    collectionSealedId: null,
    productId: item.productId,
    name: item.name,
    imageUrl: item.imageUrl,
    quantity: null,
    purchasePricePerItem: null,
    marketPrice: item.marketPrice,
    suggestedPacks: item.suggestedPacks,
    episode: item.episode,
  };
}

function ResultTile({ item, selected, onSelect }: {
  item: OpeningSealedChoice;
  selected: boolean;
  onSelect: () => void;
}) {
  const price = item.purchasePricePerItem ?? item.marketPrice;
  return (
    <button
      type="button"
      data-opening-sealed-result={item.selectionKey}
      onClick={onSelect}
      className={`group flex min-w-0 items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
        selected
          ? "border-violet-300/32 bg-violet-500/[0.12]"
          : "border-white/8 bg-white/[0.028] hover:border-white/16 hover:bg-white/[0.055]"
      }`}
    >
      <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/8 bg-black/24 sm:h-[4.5rem] sm:w-[4.5rem]">
        {item.imageUrl ? (
          <CachedImage sourceUrl={item.imageUrl} alt="" fill sizes="72px" className="object-contain p-1" unoptimized />
        ) : (
          <PackageOpen className="absolute inset-0 m-auto h-5 w-5 text-white/18" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-start justify-between gap-2">
          <strong className="line-clamp-2 text-xs leading-snug text-white/84 sm:text-sm">{item.name}</strong>
          {selected ? <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white"><Check className="h-3.5 w-3.5" /></span> : null}
        </span>
        <span className="mt-1 block truncate text-[9px] font-semibold text-white/30">
          {item.episode.name}{item.episode.code ? ` · ${item.episode.code}` : ""}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-white/8 bg-white/[0.035] px-2 py-1 text-[9px] font-black text-white/48">
            {item.source === "collection" ? `${item.quantity} owned` : "Catalogue"}
          </span>
          <span className="rounded-full border border-white/8 bg-white/[0.035] px-2 py-1 text-[9px] font-black tabular-nums text-white/48">
            {price == null ? "No price" : item.purchasePricePerItem != null ? `${formatCollectionCurrency(price)} paid` : `${formatCollectionCurrency(price)} best`}
          </span>
          <span className="rounded-full border border-cyan-300/12 bg-cyan-400/[0.05] px-2 py-1 text-[9px] font-black text-cyan-100/58">
            {item.suggestedPacks == null ? "Set packs" : `${item.suggestedPacks} pack${item.suggestedPacks === 1 ? "" : "s"}`}
          </span>
        </span>
      </span>
    </button>
  );
}

export default function OwnedSealedPickerDialog({ items, selectedKey, onClose, onSelect }: {
  items: OwnedSealedChoice[];
  selectedKey: string | null;
  onClose: () => void;
  onSelect: (item: OpeningSealedChoice) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<PickerTab>(items.length > 0 ? "collection" : "catalog");
  const [query, setQuery] = useState("");
  const [catalogItems, setCatalogItems] = useState<CatalogSealedChoice[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const ownedChoices = useMemo(() => items.map(asOwnedChoice), [items]);
  const filteredOwned = useMemo(
    () => normalizedQuery
      ? ownedChoices.filter((item) => `${item.name} ${item.episode.name} ${item.episode.code ?? ""}`.toLocaleLowerCase().includes(normalizedQuery))
      : ownedChoices,
    [normalizedQuery, ownedChoices]
  );

  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("dc-scroll-locked");
    const focusFrame = window.requestAnimationFrame(() => inputRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      html.classList.remove("dc-scroll-locked");
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (tab !== "catalog") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadingCatalog(true);
      setCatalogError(null);
      try {
        const response = await fetch(`/api/openings/sealed-products?q=${encodeURIComponent(query.trim())}`, { cache: "no-store", signal: controller.signal });
        const payload = (await response.json().catch(() => ({}))) as CatalogResponse;
        if (!response.ok) throw new Error(payload.error ?? "Could not load sealed catalogue");
        setCatalogItems(payload.items ?? []);
        setCatalogTotal(payload.total ?? 0);
        setNextOffset(payload.nextOffset ?? null);
      } catch (error) {
        if (controller.signal.aborted) return;
        setCatalogItems([]);
        setCatalogTotal(0);
        setNextOffset(null);
        setCatalogError(error instanceof Error ? error.message : "Could not load sealed catalogue");
      } finally {
        if (!controller.signal.aborted) setLoadingCatalog(false);
      }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, tab]);

  async function loadMore() {
    if (loadingMore || nextOffset == null) return;
    setLoadingMore(true);
    setCatalogError(null);
    try {
      const response = await fetch(`/api/openings/sealed-products?q=${encodeURIComponent(query.trim())}&offset=${nextOffset}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as CatalogResponse;
      if (!response.ok) throw new Error(payload.error ?? "Could not load more products");
      setCatalogItems((current) => {
        const merged = new Map(current.map((item) => [item.productId, item]));
        for (const item of payload.items ?? []) merged.set(item.productId, item);
        return [...merged.values()];
      });
      setCatalogTotal(payload.total ?? catalogTotal);
      setNextOffset(payload.nextOffset ?? null);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Could not load more products");
    } finally {
      setLoadingMore(false);
    }
  }

  const visibleItems = tab === "collection" ? filteredOwned : catalogItems.map(asCatalogChoice);
  const total = tab === "collection" ? filteredOwned.length : catalogTotal;

  return createPortal(
    <div className={`${modalBottomSheetOverlayClass} z-[260] sm:p-5`} onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="owned-sealed-picker-title" data-testid="owned-sealed-picker" className={`${modalBottomSheetPanelClass} max-w-4xl`}>
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/9 px-4 py-3.5 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-violet-200/55">Sealed opening</p>
            <h2 id="owned-sealed-picker-title" className="mt-1 text-lg font-black text-white sm:text-2xl">Choose a product to open</h2>
            <p className="mt-1 text-[10px] text-white/38 sm:text-xs">Use something you own or choose from the complete sealed catalogue.</p>
          </div>
          <button type="button" onClick={onClose} className={modalCloseButtonClass} aria-label="Close sealed search"><X className="h-4 w-4" /></button>
        </header>

        <div className="shrink-0 border-b border-white/8 bg-black/10 px-3 py-3 sm:px-6 sm:py-4">
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl border border-white/8 bg-black/18 p-1">
            {(["collection", "catalog"] as const).map((value) => (
              <button key={value} type="button" onClick={() => setTab(value)} className={`min-h-10 rounded-xl px-3 text-xs font-black transition ${tab === value ? "bg-violet-500 text-white" : "text-white/44 hover:bg-white/[0.05] hover:text-white/70"}`}>
                {value === "collection" ? `My collection (${items.length})` : "All sealed products"}
              </button>
            ))}
          </div>
          <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-white/11 bg-white/[0.045] px-3.5 shadow-inner shadow-black/20 transition-colors focus-within:border-violet-300/32 focus-within:bg-violet-500/[0.055] sm:min-h-14 sm:px-4">
            <Search className="h-4 w-4 shrink-0 text-violet-100/52 sm:h-5 sm:w-5" />
            <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} type="text" placeholder={tab === "collection" ? "Search your sealed products..." : "Search every sealed product or set..."} className="min-w-0 flex-1 bg-transparent text-base font-semibold text-white outline-none placeholder:text-white/28" autoComplete="off" spellCheck={false} aria-label="Search sealed products" />
            {loadingCatalog && tab === "catalog" ? <Loader2 className="h-4 w-4 animate-spin text-violet-200" /> : null}
            {query ? <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/38 hover:bg-white/[0.07] hover:text-white" aria-label="Clear sealed search"><X className="h-3.5 w-3.5" /></button> : null}
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 sm:px-6 sm:pb-6 sm:pt-4">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <p className="text-[10px] font-bold text-white/38">{total} product{total === 1 ? "" : "s"}</p>
            <span className="text-[9px] font-bold text-white/24">Price and packs stay editable after selection</span>
          </div>
          {catalogError ? <p className="mb-3 rounded-xl border border-rose-300/14 bg-rose-500/[0.07] px-3 py-2 text-xs text-rose-100">{catalogError}</p> : null}
          {visibleItems.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2">
              {visibleItems.map((item) => <ResultTile key={item.selectionKey} item={item} selected={item.selectionKey === selectedKey} onSelect={() => onSelect(item)} />)}
            </div>
          ) : loadingCatalog && tab === "catalog" ? (
            <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-violet-200" /></div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/9 bg-white/[0.02] px-4 py-12 text-center">
              <PackageOpen className="mx-auto h-6 w-6 text-white/18" />
              <p className="mt-3 text-sm font-black text-white/56">No matching sealed products</p>
              <p className="mx-auto mt-1 max-w-sm text-[10px] leading-relaxed text-white/30 sm:text-xs">Try a shorter product or set name.</p>
            </div>
          )}
          {tab === "catalog" && nextOffset != null ? (
            <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/9 bg-white/[0.025] text-xs font-black text-white/56 hover:bg-white/[0.05] disabled:opacity-50">
              {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Load more
            </button>
          ) : null}
        </div>
      </section>
    </div>,
    document.body
  );
}
