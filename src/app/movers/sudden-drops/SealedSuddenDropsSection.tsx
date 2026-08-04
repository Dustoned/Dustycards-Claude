"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ArrowDownRight, ChevronRight, Package } from "lucide-react";
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

  if (items.length === 0) return null;

  function openProduct(item: FastSealedSuddenDropItem) {
    setSelectedProduct(buildSealedProductData(item));
  }

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
            CardMarket EU price versus the immediately previous snapshot.
          </p>
        </div>
        <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-amber-400/24 bg-amber-400/[0.08] px-3 text-[12px] font-black tabular-nums text-amber-700 dark:text-amber-200">
          <Package className="h-3.5 w-3.5" />
          {total.toLocaleString("en-US")}
        </span>
      </div>

      <CardListTileGrid>
        {items.map((item) => (
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
