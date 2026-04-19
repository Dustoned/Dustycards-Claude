"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import SealedProductModal, {
  type SealedModalProductData,
} from "@/components/SealedProductModal";
import CollectionAddSealedButton from "@/components/CollectionAddSealedButton";
import { useSettings } from "@/components/SettingsProvider";
import {
  getActiveSealedGroup,
  getActiveSealedProducts,
  getGroupedSealedProducts,
  getSealedProductPrice,
  type SealedFilter,
} from "@/lib/sealed-products";
import type { NormalizedSealedProduct } from "@/lib/tcggo";

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getSealedGridMinWidth(
  cardSize: "small" | "medium" | "large",
  compact: boolean
): string {
  if (compact) {
    if (cardSize === "small") return "170px";
    if (cardSize === "large") return "236px";
    return "210px";
  }

  if (cardSize === "small") return "198px";
  if (cardSize === "large") return "296px";
  return "248px";
}

function SealedProductCard({
  product,
  onOpen,
  episode,
  compact = false,
  cardSize = "medium",
}: {
  product: NormalizedSealedProduct;
  onOpen: () => void;
  episode?: SealedEpisodeRef;
  compact?: boolean;
  cardSize?: "small" | "medium" | "large";
}) {
  const productPrice = getSealedProductPrice(product);
  const isLarge = cardSize === "large";
  const isSmall = cardSize === "small";

  const cardClass = compact
    ? isLarge
      ? "gap-3.5 rounded-[18px] p-3.5"
      : isSmall
        ? "gap-2 rounded-2xl p-2.5"
        : "gap-3 rounded-[18px] p-3.5"
    : isLarge
      ? "gap-5 rounded-3xl p-5"
      : isSmall
        ? "gap-3 rounded-2xl p-3"
        : "gap-4 rounded-3xl p-4";

  const mediaClass = compact
    ? isLarge
      ? "rounded-2xl"
      : "rounded-xl"
    : "rounded-2xl";

  const titleClass = compact
    ? isLarge
      ? "text-sm"
      : isSmall
        ? "text-[11px]"
        : "text-[13px]"
    : isLarge
      ? "text-base"
      : isSmall
        ? "text-xs"
        : "text-sm";

  const bodyTextClass = compact
    ? isLarge
      ? "text-[13px]"
      : isSmall
        ? "text-[11px]"
        : "text-xs"
    : isLarge
      ? "text-base"
      : "text-sm";

  const blockClass = compact
    ? isLarge
      ? "rounded-2xl px-3 py-2"
      : isSmall
        ? "rounded-xl px-2 py-1.5"
        : "rounded-2xl px-3 py-2"
    : "rounded-2xl px-3 py-2";

  const labelClass = compact
    ? isLarge
      ? "text-[10px]"
      : isSmall
        ? "text-[9px]"
        : "text-[10px]"
    : "text-[11px]";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`glass group flex flex-col text-left shadow-md shadow-black/5 transition-transform hover:scale-[1.015] hover:bg-white/8 active:scale-[0.99] dark:hover:bg-white/6 ${cardClass}`}
    >
      <div
        className={`relative aspect-square overflow-hidden bg-black/4 dark:bg-white/4 ${mediaClass}`}
      >
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            className="object-contain"
            sizes={
              compact
                ? isLarge
                  ? "236px"
                  : isSmall
                    ? "170px"
                    : "210px"
                : isLarge
                  ? "320px"
                  : isSmall
                    ? "198px"
                    : "248px"
            }
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs font-medium text-gray-400 dark:text-white/35">
            No image
          </div>
        )}

        <div className="absolute right-2 top-2">
          <CollectionAddSealedButton
            product={{
              id: product.id,
              name: product.name,
              image_url: product.image_url,
              episode,
            }}
            theme="dark"
            className="h-8 w-8 bg-black/65 text-white hover:bg-black/78"
          />
        </div>
      </div>

      <div className="min-w-0">
        <h2
          className={`font-semibold leading-snug text-gray-900 dark:text-white line-clamp-2 ${titleClass}`}
        >
          {product.name}
        </h2>
      </div>

      <div className={`space-y-2 ${bodyTextClass}`}>
        <div
          className={`flex items-center justify-between bg-black/4 dark:bg-white/6 ${blockClass}`}
        >
          <span className="text-gray-500 dark:text-white/55">CardMarket</span>
          <span className="font-semibold tabular-nums text-gray-900 dark:text-white">
            {formatCurrency(productPrice)}
          </span>
        </div>

        {(product.price.cm_avg_7d != null || product.price.cm_avg_30d != null) && (
          <div className="grid grid-cols-2 gap-2">
            <div className={`bg-black/4 dark:bg-white/6 ${blockClass}`}>
              <p className={`uppercase tracking-wide text-gray-400 dark:text-white/35 ${labelClass}`}>
                7d avg
              </p>
              <p
                className={`mt-1 font-semibold tabular-nums text-gray-900 dark:text-white ${bodyTextClass}`}
              >
                {formatCurrency(product.price.cm_avg_7d)}
              </p>
            </div>

            <div className={`bg-black/4 dark:bg-white/6 ${blockClass}`}>
              <p className={`uppercase tracking-wide text-gray-400 dark:text-white/35 ${labelClass}`}>
                30d avg
              </p>
              <p
                className={`mt-1 font-semibold tabular-nums text-gray-900 dark:text-white ${bodyTextClass}`}
              >
                {formatCurrency(product.price.cm_avg_30d)}
              </p>
            </div>
          </div>
        )}
      </div>
    </button>
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
      <div className="inline-flex min-w-max gap-2">
        <button
          type="button"
          onClick={() => updateFilter("all")}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
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
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
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
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/40">
              {activeLabel}
            </h2>
            <span className="rounded-full bg-black/6 px-2 py-0.5 text-xs text-gray-400 dark:bg-white/6 dark:text-white/40">
              {activeProducts.length}
            </span>
            <div className="h-px flex-1 bg-black/8 dark:bg-white/10" />
          </div>

          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${getSealedGridMinWidth(
                settings.cardSize,
                true
              )}, 1fr))`,
            }}
          >
            {activeProducts.map((product) => (
              <SealedProductCard
                key={product.id}
                product={product}
                onOpen={() => setSelectedProduct(product)}
                episode={episode}
                compact
                cardSize={settings.cardSize}
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
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-white/40">
                {group.label}
              </h2>
              <span className="rounded-full bg-black/6 px-2 py-0.5 text-xs text-gray-400 dark:bg-white/6 dark:text-white/40">
                {group.products.length}
              </span>
              <div className="h-px flex-1 bg-black/8 dark:bg-white/10" />
            </div>

            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${getSealedGridMinWidth(
                  settings.cardSize,
                  false
                )}, 1fr))`,
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
