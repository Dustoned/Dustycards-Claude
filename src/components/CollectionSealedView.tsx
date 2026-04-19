"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Package } from "lucide-react";
import SealedProductModal, {
  type SealedModalProductData,
} from "@/components/SealedProductModal";
import CollectionAddSealedButton from "@/components/CollectionAddSealedButton";
import { formatCollectionCurrency } from "@/lib/collection";
import { useSettings } from "@/components/SettingsProvider";

export interface CollectionSealedViewItem {
  id: string;
  product_id: string;
  name: string;
  image_url: string | null;
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  cardmarket_url: string | null;
  quantity: number;
  purchase_price_per_item: number | null;
  current_value_per_item: number | null;
}

interface Props {
  items: CollectionSealedViewItem[];
  emptyTitle: string;
  emptyText: string;
}

const cardMinWidth = {
  small: { normal: "120px", wide: "160px" },
  medium: { normal: "160px", wide: "220px" },
  large: { normal: "220px", wide: "300px" },
} as const;

export default function CollectionSealedView({ items, emptyTitle, emptyText }: Props) {
  const { settings } = useSettings();
  const [selectedSealed, setSelectedSealed] = useState<SealedModalProductData | null>(null);

  if (items.length === 0) {
    return (
      <div className="glass rounded-3xl p-12 text-center shadow-md shadow-black/5">
        <p className="mb-1 font-medium text-gray-700 dark:text-gray-300">{emptyTitle}</p>
        <p className="text-sm text-gray-400">{emptyText}</p>
      </div>
    );
  }

  return (
    <>
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${
            cardMinWidth[settings.cardSize][settings.widescreen ? "wide" : "normal"]
          }, 1fr))`,
        }}
      >
        {items.map((item, index) => {
          const currentTotal =
            item.current_value_per_item != null
              ? Number((item.current_value_per_item * item.quantity).toFixed(2))
              : null;
          const paidTotal =
            item.purchase_price_per_item != null
              ? Number((item.purchase_price_per_item * item.quantity).toFixed(2))
              : null;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                setSelectedSealed({
                  id: item.product_id,
                  name: item.name,
                  image_url: item.image_url,
                  cardmarket_url: item.cardmarket_url,
                  episode: {
                    id: item.episode_id,
                    name: item.episode_name,
                    code: item.episode_code,
                  },
                  price: {
                    cm_lowest: item.current_value_per_item,
                    cm_lowest_eu: null,
                    cm_lowest_de: null,
                    cm_lowest_fr: null,
                    cm_lowest_es: null,
                    cm_lowest_it: null,
                    cm_avg_7d: null,
                    cm_avg_30d: null,
                  },
                })
              }
              className="group flex flex-col gap-1.5 text-left"
            >
              <div className="relative aspect-[63/88] overflow-hidden rounded-xl bg-black/4 shadow-md shadow-black/20 transition-all duration-200 group-hover:scale-[1.02] group-hover:shadow-xl group-hover:shadow-black/30 dark:bg-white/4">
                {item.image_url ? (
                  <Image
                    src={item.image_url}
                    alt={item.name}
                    fill
                    className="object-contain p-1"
                    sizes="180px"
                    loading={index < 18 ? "eager" : undefined}
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Package className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                  </div>
                )}

                <div className="absolute right-2 top-2">
                  <CollectionAddSealedButton
                    product={{
                      id: item.product_id,
                      name: item.name,
                      image_url: item.image_url,
                      episode: {
                        id: item.episode_id,
                        name: item.episode_name,
                        code: item.episode_code,
                      },
                    }}
                    theme="dark"
                    className="h-8 w-8 bg-black/65 text-white hover:bg-black/78"
                  />
                </div>

                <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/80 backdrop-blur">
                  x{item.quantity}
                </span>
              </div>

              <div className="px-0.5">
                <p className="line-clamp-2 text-xs font-semibold leading-snug text-gray-900 dark:text-white">
                  {item.name}
                </p>
                <Link
                  href={`/expansions/${item.episode_id}?tab=sealed`}
                  onClick={(event) => event.stopPropagation()}
                  className="mt-0.5 block truncate text-[10px] text-gray-400 transition-colors hover:text-gray-600 hover:underline dark:text-gray-500 dark:hover:text-gray-300"
                >
                  {item.episode_name}
                  {item.episode_code ? <span className="ml-1 opacity-60">({item.episode_code})</span> : null}
                </Link>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                  {paidTotal != null && (
                    <span className="rounded-full bg-black/5 px-2 py-1 text-gray-500 dark:bg-white/8 dark:text-white/55">
                      Paid {formatCollectionCurrency(paidTotal)}
                    </span>
                  )}
                  {currentTotal != null && (
                    <span className="rounded-full bg-black/5 px-2 py-1 text-gray-500 dark:bg-white/8 dark:text-white/55">
                      Value {formatCollectionCurrency(currentTotal)}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedSealed && (
        <SealedProductModal product={selectedSealed} onClose={() => setSelectedSealed(null)} />
      )}
    </>
  );
}
