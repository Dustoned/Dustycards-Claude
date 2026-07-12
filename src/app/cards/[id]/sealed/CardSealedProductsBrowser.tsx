"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useMemo, useState } from "react";
import { Boxes, Gift, Package, Search } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { getCachedImageUrl } from "@/lib/image-cache";
import {
  getCardSealedProductPrice,
  type CardSealedMatchType,
  type CardSealedProductItem,
} from "@/lib/card-sealed-products";
import type { SealedModalProductData } from "@/components/sealed-modal/types";

const SealedProductModal = dynamic(() => import("@/components/SealedProductModal"), {
  ssr: false,
  loading: () => null,
});

type FilterValue = "all" | CardSealedMatchType;

const FILTERS: Array<{ value: FilterValue; label: string }> = [
  { value: "all", label: "All products" },
  { value: "set_product", label: "Set products" },
  { value: "mixed_pack", label: "Mixed packs" },
  { value: "included_promo", label: "Included promos" },
];

const MATCH_META: Record<
  CardSealedMatchType,
  { label: string; description: string; className: string; Icon: typeof Package }
> = {
  set_product: {
    label: "Set product",
    description: "Contains boosters from this card's set",
    className: "border-violet-300/18 bg-violet-400/[0.08] text-violet-100",
    Icon: Package,
  },
  mixed_pack: {
    label: "Mixed packs",
    description: "Contains this set alongside other sets",
    className: "border-amber-300/18 bg-amber-400/[0.08] text-amber-100",
    Icon: Boxes,
  },
  included_promo: {
    label: "Included promo",
    description: "This exact card is included directly",
    className: "border-sky-300/18 bg-sky-400/[0.08] text-sky-100",
    Icon: Gift,
  },
};

function toModalProduct(item: CardSealedProductItem): SealedModalProductData {
  return {
    id: item.id,
    name: item.name,
    image_url: item.imageUrl,
    tcggo_url: item.tcggoUrl,
    cardmarket_url: item.cardmarketUrl,
    cardmarket_id: item.cardmarketId,
    release_date: item.releaseDate,
    price: item.price,
    episode: item.episode,
  };
}

export default function CardSealedProductsBrowser({
  products,
}: {
  products: CardSealedProductItem[];
}) {
  const [activeFilter, setActiveFilter] = useState<FilterValue>("all");
  const [query, setQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<CardSealedProductItem | null>(null);
  const counts = useMemo(
    () =>
      products.reduce(
        (current, item) => {
          current[item.matchType] += 1;
          return current;
        },
        { set_product: 0, mixed_pack: 0, included_promo: 0 }
      ),
    [products]
  );
  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return products.filter((item) => {
      if (activeFilter !== "all" && item.matchType !== activeFilter) return false;
      if (!normalizedQuery) return true;
      return [item.name, item.episode.name, item.episode.code]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedQuery));
    });
  }, [activeFilter, products, query]);

  return (
    <>
      <section className="binder-panel rounded-[var(--ui-page-header-radius)] p-3 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-wrap gap-2">
            {FILTERS.map((filter) => {
              const count =
                filter.value === "all" ? products.length : counts[filter.value];
              const active = filter.value === activeFilter;
              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setActiveFilter(filter.value)}
                  className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-bold transition-colors ${
                    active
                      ? "border-violet-300/28 bg-violet-500/18 text-white"
                      : "border-white/8 bg-white/[0.025] text-white/52 hover:border-white/16 hover:text-white"
                  }`}
                >
                  {filter.label}
                  <span className="tabular-nums text-white/38">{count}</span>
                </button>
              );
            })}
          </div>
          <label className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-white/8 bg-black/18 px-3 xl:w-80">
            <Search className="h-4 w-4 shrink-0 text-white/34" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search sealed products..."
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/28"
            />
          </label>
        </div>
      </section>

      {visibleProducts.length > 0 ? (
        <div
          className="dc-wide-grid-zone grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 22rem), 1fr))" }}
        >
          {visibleProducts.map((item) => {
            const meta = MATCH_META[item.matchType];
            const price = getCardSealedProductPrice(item);
            return (
              <button
                key={item.id}
                type="button"
                data-card-sealed-product
                onClick={() => setSelectedProduct(item)}
                className="group grid h-40 min-w-0 grid-cols-[7.5rem_minmax(0,1fr)] gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-3 text-left transition-all hover:-translate-y-0.5 hover:border-violet-300/24 hover:bg-violet-400/[0.045]"
              >
                <span className="relative min-h-28 overflow-hidden rounded-xl border border-white/8 bg-black/22">
                  {item.imageUrl ? (
                    <Image
                      src={getCachedImageUrl(item.imageUrl) ?? item.imageUrl}
                      alt={item.name}
                      fill
                      sizes="120px"
                      className="object-contain p-2"
                      unoptimized
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-white/24">
                      <Package className="h-8 w-8" />
                    </span>
                  )}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.11em] ${meta.className}`}>
                    <meta.Icon className="h-3 w-3" />
                    {meta.label}
                  </span>
                  <span className="mt-2 line-clamp-2 text-sm font-black leading-5 text-white/88 group-hover:text-white">
                    {item.name}
                  </span>
                  <span className="mt-1 line-clamp-1 text-[11px] font-semibold text-white/38">
                    {meta.description}
                  </span>
                  <span className="mt-auto flex items-end justify-between gap-2 pt-3">
                    <span className="min-w-0 truncate text-[10px] font-semibold text-white/34">
                      {item.episode.code ?? item.episode.name}
                    </span>
                    <span className="shrink-0 text-sm font-black tabular-nums text-violet-100">
                      {price == null ? "No price" : formatCurrency(price, "EUR")}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <section className="binder-panel rounded-[var(--ui-page-header-radius)] px-5 py-14 text-center">
          <Package className="mx-auto h-8 w-8 text-white/20" />
          <h2 className="mt-3 text-base font-black text-white/72">No matching products</h2>
          <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-white/38">
            No verified product matches this filter yet. Promo links only appear after the exact
            included card has been confirmed.
          </p>
        </section>
      )}

      {selectedProduct ? (
        <SealedProductModal
          key={selectedProduct.id}
          product={toModalProduct(selectedProduct)}
          onClose={() => setSelectedProduct(null)}
        />
      ) : null}
    </>
  );
}
