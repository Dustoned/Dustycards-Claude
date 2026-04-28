"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Package } from "lucide-react";
import CollectionAddSealedButton from "@/components/CollectionAddSealedButton";
import { SectionHeader } from "@/components/PageHeader";
import { useSettings } from "@/components/SettingsProvider";
import {
  sealedTileActionButtonClass,
  sealedTileBubbleClass,
  sealedTileBubbleLabelClass,
  sealedTileBubbleWrapClass,
  sealedTileGridGapClass,
  sealedTileImageClass,
  sealedTileImagePaddingClass,
  sealedTileInfoClass,
  sealedTileMetaLineClass,
  sealedTileNoPriceClass,
  sealedTilePriceClass,
  sealedTileRootClass,
  sealedTileTitleClass,
} from "@/components/sealed-tile-styles";
import { getFixedTrackGridTemplate, getSealedProductTrackWidth } from "@/lib/display-scale";
import { getCachedImageUrl } from "@/lib/image-cache";
import type { CardSize } from "@/lib/user-settings";
import {
  getActiveSealedGroup,
  getActiveSealedProducts,
  getGroupedSealedProducts,
  getSealedProductPrice,
  type SealedFilter,
} from "@/lib/sealed-products";
import type { NormalizedSealedProduct } from "@/lib/tcggo";
import type { SealedModalProductData } from "@/components/sealed-modal/types";

const SealedProductModal = dynamic(() => import("@/components/SealedProductModal"), {
  ssr: false,
  loading: () => null,
});

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function SealedProductCard({
  product,
  onOpen,
  episode,
  cardSize = "medium",
  widescreen = false,
}: {
  product: NormalizedSealedProduct;
  onOpen: () => void;
  episode?: SealedEpisodeRef;
  cardSize?: CardSize;
  widescreen?: boolean;
}) {
  const productPrice = getSealedProductPrice(product);
  const trackWidth = getSealedProductTrackWidth(cardSize, widescreen);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={sealedTileRootClass()}
    >
      <div className={sealedTileImageClass(cardSize)}>
        {product.image_url ? (
          <Image
            src={getCachedImageUrl(product.image_url) ?? product.image_url}
            alt={product.name}
            fill
            className={`object-contain ${sealedTileImagePaddingClass(cardSize)}`}
            sizes={trackWidth}
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Package className="h-10 w-10 text-gray-300 dark:text-gray-600" />
          </div>
        )}
      </div>

      <div className={sealedTileInfoClass(cardSize)}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className={sealedTileTitleClass(cardSize)}>{product.name}</h2>
            <div className={sealedTileMetaLineClass(cardSize)}>
              <span className="text-gray-400 dark:text-white/42">Sealed product</span>
            </div>
          </div>

          <div className="flex min-w-0 shrink-0 items-center justify-end gap-1.5">
            {productPrice != null ? (
              <span className={sealedTilePriceClass(cardSize)}>
                {formatCurrency(productPrice)}
              </span>
            ) : (
              <span className={sealedTileNoPriceClass(cardSize)}>No price</span>
            )}

            <CollectionAddSealedButton
              product={{
                id: product.id,
                name: product.name,
                image_url: product.image_url,
                episode,
              }}
              className={sealedTileActionButtonClass()}
            />
          </div>
        </div>

        <div className={sealedTileBubbleWrapClass(cardSize)}>
          <span className={sealedTileBubbleClass("market")}>
            <span className={sealedTileBubbleLabelClass()}>CardMarket</span>
            <span className="tabular-nums">{formatCurrency(productPrice)}</span>
          </span>
          {product.price.cm_avg_7d != null && (
            <span className={sealedTileBubbleClass()}>
              <span className={sealedTileBubbleLabelClass()}>7D Avg</span>
              <span className="tabular-nums">{formatCurrency(product.price.cm_avg_7d)}</span>
            </span>
          )}
          {product.price.cm_avg_30d != null && (
            <span className={sealedTileBubbleClass()}>
              <span className={sealedTileBubbleLabelClass()}>30D Avg</span>
              <span className="tabular-nums">{formatCurrency(product.price.cm_avg_30d)}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface SealedEpisodeRef {
  id: string;
  name: string;
  code: string | null;
}

export default function SealedProductsGrid({
  products,
  activeFilter,
  episode,
}: {
  products: NormalizedSealedProduct[];
  activeFilter: SealedFilter;
  episode?: SealedEpisodeRef;
}) {
  const { settings } = useSettings();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const groupedProducts = useMemo(() => getGroupedSealedProducts(products), [products]);
  const activeGroup = useMemo(
    () => getActiveSealedGroup(groupedProducts, activeFilter),
    [groupedProducts, activeFilter]
  );
  const activeProducts = useMemo(
    () => getActiveSealedProducts(groupedProducts, activeFilter),
    [groupedProducts, activeFilter]
  );
  const visibleGroups =
    activeFilter === "all" ? groupedProducts : activeGroup ? [activeGroup] : [];
  const activeLabel = activeFilter === "all" ? "All Sealed" : activeGroup?.label ?? "All Sealed";
  const [selectedProduct, setSelectedProduct] = useState<NormalizedSealedProduct | null>(null);

  function updateFilter(nextFilter: SealedFilter) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "sealed");

    if (nextFilter === "all") {
      params.delete("sealed");
    } else {
      params.set("sealed", nextFilter);
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function toModalProduct(product: NormalizedSealedProduct): SealedModalProductData {
    return {
      id: product.id,
      name: product.name,
      image_url: product.image_url,
      tcggo_url: product.tcggo_url,
      cardmarket_url: product.cardmarket_url,
      price: product.price,
      episode,
    };
  }

  if (products.length === 0) {
    return (
      <div className="glass rounded-3xl p-12 text-center shadow-md shadow-black/5">
        <p className="mb-1 font-medium text-gray-700 dark:text-gray-300">
          No sealed products found yet
        </p>
        <p className="text-sm text-gray-400">
          TCGGO does not currently list sealed for this set.
        </p>
      </div>
    );
  }

  const filterBar = (
    <div className="overflow-x-auto pb-1">
      <div className="inline-flex min-w-max gap-[var(--ui-chip-gap)]">
        <button
          type="button"
          onClick={() => updateFilter("all")}
          className={`inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full border px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none transition-all ${
            activeFilter === "all"
              ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
              : "border-black/8 text-gray-500 hover:border-black/20 hover:text-gray-900 dark:border-white/8 dark:text-white/55 dark:hover:border-white/20 dark:hover:text-white"
          }`}
        >
          All Sealed{" "}
          <span
            className={
              activeFilter === "all"
                ? "text-white/75 dark:text-gray-600"
                : "text-gray-400 dark:text-white/35"
            }
          >
            {products.length}
          </span>
        </button>
        {groupedProducts.map((group) => {
          const active = group.category === activeFilter;
          return (
            <button
              key={group.category}
              type="button"
              onClick={() => updateFilter(group.category)}
              className={`inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full border px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none transition-all ${
                active
                  ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                  : "border-black/8 text-gray-500 hover:border-black/20 hover:text-gray-900 dark:border-white/8 dark:text-white/55 dark:hover:border-white/20 dark:hover:text-white"
              }`}
            >
              {group.label}{" "}
              <span
                className={
                  active ? "text-white/75 dark:text-gray-600" : "text-gray-400 dark:text-white/35"
                }
              >
                {group.products.length}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  if (settings.widescreen) {
    return (
      <div className="space-y-6">
        {filterBar}

        <section className="space-y-4">
          <SectionHeader title={activeLabel} count={activeProducts.length} compact className="mb-0" />

          <div
            className={`grid ${sealedTileGridGapClass(settings.cardSize)}`}
            style={{
              gridTemplateColumns: getFixedTrackGridTemplate(
                getSealedProductTrackWidth(settings.cardSize, true)
              ),
              justifyContent: "start",
            }}
          >
            {activeProducts.map((product) => (
              <SealedProductCard
                key={product.id}
                product={product}
                onOpen={() => setSelectedProduct(product)}
                episode={episode}
                cardSize={settings.cardSize}
                widescreen
              />
            ))}
          </div>
        </section>

        {selectedProduct && (
          <SealedProductModal
            product={toModalProduct(selectedProduct)}
            onClose={() => setSelectedProduct(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {filterBar}

      <div className="space-y-10">
        {visibleGroups.map((group) => (
          <section key={group.category}>
            <SectionHeader title={group.label} count={group.products.length} compact className="mb-4" />

            <div
              className={`grid ${sealedTileGridGapClass(settings.cardSize)}`}
              style={{
                gridTemplateColumns: getFixedTrackGridTemplate(
                  getSealedProductTrackWidth(settings.cardSize, false)
                ),
                justifyContent: "start",
              }}
            >
              {group.products.map((product) => (
                <SealedProductCard
                  key={product.id}
                  product={product}
                  onOpen={() => setSelectedProduct(product)}
                  episode={episode}
                  cardSize={settings.cardSize}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {selectedProduct && (
        <SealedProductModal
          product={toModalProduct(selectedProduct)}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
}
