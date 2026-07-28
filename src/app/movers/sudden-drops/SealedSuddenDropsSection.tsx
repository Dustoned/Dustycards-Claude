"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useState } from "react";
import { ArrowDownRight, Package } from "lucide-react";
import type { SealedModalProductData } from "@/components/sealed-modal/types";
import type { FastSealedSuddenDropItem } from "@/lib/home-sudden-drops-server";
import { formatCurrency } from "@/lib/format";

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
      cm_lowest: item.currentPrice,
      cm_lowest_eu: null,
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

  if (items.length === 0) return null;

  return (
    <section id="sealed" className="scroll-mt-24">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-600 dark:text-amber-300/80">
            Sealed Sudden Drops
          </p>
          <h2 className="mt-1 text-xl font-black tracking-tight text-gray-900 dark:text-white">
            Sealed products that became cheaper in the last 24 hours
          </h2>
          <p className="mt-1 text-sm font-medium text-gray-500 dark:text-white/48">
            Kept separate from the single cards above so the two never mix. CardMarket lowest
            price versus the immediately previous snapshot.
          </p>
        </div>
        <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-amber-400/24 bg-amber-400/[0.08] px-3 text-[12px] font-black tabular-nums text-amber-700 dark:text-amber-200">
          <Package className="h-3.5 w-3.5" />
          {total.toLocaleString("en-US")}
        </span>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3 2xl:grid-cols-4">
        {items.map((item) => (
          <button
            key={item.productId}
            type="button"
            onClick={() => setSelectedProduct(buildSealedProductData(item))}
            className="group flex min-w-0 items-center gap-3 rounded-2xl border border-black/8 bg-black/[0.03] p-3 text-left transition-colors hover:border-amber-300/30 hover:bg-amber-400/[0.05] dark:border-white/8 dark:bg-white/[0.04] dark:hover:border-amber-300/24"
          >
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-black/6 bg-white/70 dark:border-white/8 dark:bg-white/[0.06]">
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.name}
                  fill
                  sizes="64px"
                  className="object-contain p-1"
                  unoptimized
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-gray-400 dark:text-white/30">
                  <Package className="h-5 w-5" />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[13px] font-bold leading-tight text-gray-900 transition-colors group-hover:text-black dark:text-white/88 dark:group-hover:text-white">
                {item.name}
              </p>
              <p className="mt-0.5 truncate text-[11px] font-semibold text-gray-500 dark:text-white/42">
                {item.episodeCode ? `${item.episodeName} (${item.episodeCode})` : item.episodeName}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="inline-flex items-center gap-1 text-[13px] font-black tabular-nums text-rose-600 dark:text-rose-300">
                  <ArrowDownRight className="h-3.5 w-3.5" />
                  -{formatCurrency(item.dropAmount, item.currency)}
                  {item.dropPercent != null ? (
                    <span className="text-[11px] font-bold text-rose-500/80 dark:text-rose-300/70">
                      ({item.dropPercent.toFixed(1)}%)
                    </span>
                  ) : null}
                </span>
                <span className="text-[11px] font-bold tabular-nums text-gray-500 dark:text-white/48">
                  Now {formatCurrency(item.currentPrice, item.currency)}
                  <span className="mx-1 text-gray-400 dark:text-white/28">·</span>
                  Was {formatCurrency(item.previousPrice, item.currency)}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

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
