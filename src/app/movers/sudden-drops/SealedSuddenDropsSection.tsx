"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { ArrowDownRight, ChevronRight, Package, Search, X } from "lucide-react";
import CachedImage from "@/components/CachedImage";
import {
  CardListTile,
  CardListTileAnalysisLink,
  CardListTileBody,
  CardListTileFooter,
  CardListTileGrid,
  CardListTileHeader,
  CardListTileInsight,
  CardListTileMedia,
} from "@/components/CardListTile";
import CollectionAddSealedButton from "@/components/CollectionAddSealedButton";
import type { SealedModalProductData } from "@/components/sealed-modal/types";
import { formatCurrency } from "@/lib/format";
import type { FastSealedSuddenDropItem } from "@/lib/home-sudden-drops-server";
import { SectionHeader } from "@/components/PageHeader";

const SealedProductModal = dynamic(() => import("@/components/SealedProductModal"), {
  ssr: false,
  loading: () => null,
});

function buildSealedProductData(item: FastSealedSuddenDropItem): SealedModalProductData {
  return {
    id: item.productId,
    name: item.name,
    image_url: item.imageUrl,
    cardmarket_url: item.cardmarketUrl,
    price: {
      cm_lowest: null,
      cm_lowest_eu: item.currentPrice,
      cm_lowest_de: null,
      cm_lowest_fr: null,
      cm_lowest_es: null,
      cm_lowest_it: null,
      cm_avg_7d: null,
      cm_avg_30d: null,
    },
    episode: {
      id: item.episodeId,
      name: item.episodeName,
      code: item.episodeCode,
    },
  };
}

export default function SealedSuddenDropsSection({
  items,
  total,
}: {
  items: FastSealedSuddenDropItem[];
  total: number;
}) {
  const [selectedProduct, setSelectedProduct] = useState<SealedModalProductData | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"drop" | "price">("drop");
  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return [...items]
      .filter((item) => !query || `${item.name} ${item.episodeName} ${item.episodeCode ?? ""}`.toLocaleLowerCase().includes(query))
      .sort((left, right) => (
        sort === "price"
          ? right.currentPrice - left.currentPrice
          : right.dropAmount - left.dropAmount
      ));
  }, [items, search, sort]);

  if (items.length === 0) return null;

  function openProduct(item: FastSealedSuddenDropItem) {
    setSelectedProduct(buildSealedProductData(item));
  }

  return (
    <section id="sealed" className="sudden-drops-panel scroll-mt-24">
      <SectionHeader
        eyebrow="Sudden drops"
        title="Sealed"
        description="Verified CardMarket EU drops in the same rolling 24-hour window."
        className="sudden-drops-section-header"
        actions={
          <span className="text-sm font-semibold tabular-nums text-white/42">
            {visibleItems.length.toLocaleString("en-US")} / {total.toLocaleString("en-US")}
          </span>
        }
      />

      <div className="sudden-drops-toolbar binder-panel mb-4 rounded-2xl px-3 py-3 sm:px-4 sm:py-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,12rem)] sm:items-end">
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
              Search
            </span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                type="text"
                placeholder="Product or set"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-11 w-full rounded-xl border border-white/8 bg-white/[0.05] pl-10 pr-10 text-sm text-white outline-none transition-colors placeholder:text-white/28 focus:border-white/16"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 transition-colors hover:text-white"
                  aria-label="Clear sealed search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
              Sort
            </span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as "drop" | "price")}
              className="h-11 w-full rounded-xl border border-white/8 bg-white/[0.05] px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-white/16"
            >
              <option className="bg-gray-950 text-white" value="drop">Largest drop</option>
              <option className="bg-gray-950 text-white" value="price">Highest price</option>
            </select>
          </label>
        </div>
      </div>

      <CardListTileGrid>
        {visibleItems.map((item) => (
          <CardListTile
            key={item.productId}
            role="button"
            tabIndex={0}
            interactive
            layout="showcase"
            onClick={() => openProduct(item)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              openProduct(item);
            }}
            aria-label={`Open details for ${item.name}`}
          >
            <CardListTileMedia imageUrl={item.imageUrl} kind="product" emptyLabel={item.name}>
              {item.imageUrl ? (
                <CachedImage
                  sourceUrl={item.imageUrl}
                  alt={item.name}
                  fill
                  sizes="(max-width: 640px) 116px, 120px"
                  className="object-contain p-2"
                />
              ) : undefined}
            </CardListTileMedia>

            <CardListTileBody>
              <CardListTileHeader
                badges={
                  <>
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/22 bg-amber-300/[0.09] px-2 py-1 text-[8px] font-bold uppercase tracking-[0.08em] text-amber-100/82">
                      <Package className="h-3 w-3" />
                      Sealed
                    </span>
                    {item.dropPercent != null ? (
                      <span className="inline-flex rounded-full border border-rose-300/20 bg-rose-300/[0.08] px-2 py-1 text-[8px] font-bold uppercase tracking-[0.08em] text-rose-100/80">
                        -{Math.abs(item.dropPercent).toFixed(1)}% 24H
                      </span>
                    ) : null}
                  </>
                }
                priceLabel="Current"
                priceValue={formatCurrency(item.currentPrice, item.currency)}
                title={item.name}
                meta={
                  <span className="truncate">
                    {item.episodeName}
                    {item.episodeCode ? ` (${item.episodeCode})` : ""}
                  </span>
                }
              />

              <CardListTileInsight>
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-300/75 shadow-[0_0_10px_rgba(253,164,175,0.38)]"
                />
                <span className="min-w-0 truncate tabular-nums">
                  <strong className="font-bold text-rose-200">
                    <span className="inline-flex items-center gap-0.5">
                      <ArrowDownRight className="h-3.5 w-3.5" />
                      -{formatCurrency(item.dropAmount, item.currency)}
                    </span>
                  </strong>
                  <span className="text-white/42">
                    {` · Was ${formatCurrency(item.previousPrice, item.currency)}`}
                  </span>
                </span>
              </CardListTileInsight>

              <CardListTileFooter>
                <CardListTileAnalysisLink>
                  Details
                  <ChevronRight className="h-3.5 w-3.5" />
                </CardListTileAnalysisLink>
                <CollectionAddSealedButton
                  product={{
                    id: item.productId,
                    name: item.name,
                    image_url: item.imageUrl,
                    episode: {
                      id: item.episodeId,
                      name: item.episodeName,
                      code: item.episodeCode,
                    },
                  }}
                  mode="icon"
                  theme="dark"
                  className="relative z-10"
                />
              </CardListTileFooter>
            </CardListTileBody>
          </CardListTile>
        ))}
      </CardListTileGrid>

      {visibleItems.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-white/[0.035] px-5 py-8 text-center text-sm text-white/42">
          No sealed products match this search.
        </div>
      ) : null}

      {selectedProduct ? (
        <SealedProductModal
          key={selectedProduct.id}
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      ) : null}
    </section>
  );
}
