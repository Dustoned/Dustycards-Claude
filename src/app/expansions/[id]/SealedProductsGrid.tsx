"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useSettings } from "@/components/SettingsProvider";
import { withCardMarketFilters } from "@/lib/cardmarket";
import type { NormalizedSealedProduct } from "@/lib/tcggo";

type SealedCategory =
  | "booster_box"
  | "booster_bundle"
  | "elite_trainer_box"
  | "build_battle_kit"
  | "build_battle_stadium"
  | "case"
  | "blister"
  | "booster"
  | "sampling_pack"
  | "box"
  | "tin"
  | "mini_tin"
  | "toolkit"
  | "theme_deck"
  | "battle_deck"
  | "playmat"
  | "chest"
  | "ultra_premium_collection"
  | "super_premium_collection"
  | "premium_collection"
  | "figure_collection"
  | "binder_collection"
  | "illustration_collection"
  | "pin_collection"
  | "poster_collection"
  | "sticker_collection"
  | "playmat_collection"
  | "tournament_collection"
  | "special_collection"
  | "ex_collection"
  | "knockout_collection"
  | "collection"
  | "fun_pack"
  | "other";

type SealedFilter = "all" | SealedCategory;

const CATEGORY_ORDER: SealedCategory[] = [
  "booster_box",
  "booster_bundle",
  "elite_trainer_box",
  "build_battle_kit",
  "build_battle_stadium",
  "case",
  "blister",
  "booster",
  "sampling_pack",
  "box",
  "tin",
  "mini_tin",
  "toolkit",
  "theme_deck",
  "battle_deck",
  "playmat",
  "chest",
  "ultra_premium_collection",
  "super_premium_collection",
  "premium_collection",
  "figure_collection",
  "binder_collection",
  "illustration_collection",
  "pin_collection",
  "poster_collection",
  "sticker_collection",
  "playmat_collection",
  "tournament_collection",
  "special_collection",
  "ex_collection",
  "knockout_collection",
  "collection",
  "fun_pack",
  "other",
];

const CATEGORY_LABELS: Record<SealedCategory, string> = {
  booster_box: "Booster Boxes",
  booster_bundle: "Booster Bundles",
  elite_trainer_box: "ETBs",
  build_battle_kit: "Build & Battle Kits",
  build_battle_stadium: "Build & Battle Stadiums",
  case: "Cases",
  blister: "Blisters",
  booster: "Boosters",
  sampling_pack: "Sampling Packs",
  box: "Boxes",
  tin: "Tins",
  mini_tin: "Mini Tins",
  toolkit: "Toolkits",
  theme_deck: "Theme Decks",
  battle_deck: "Battle Decks",
  playmat: "Playmats",
  chest: "Chests",
  ultra_premium_collection: "Ultra Premium Collections",
  super_premium_collection: "Super Premium Collections",
  premium_collection: "Premium Collections",
  figure_collection: "Figure Collections",
  binder_collection: "Binder Collections",
  illustration_collection: "Illustration Collections",
  pin_collection: "Pin Collections",
  poster_collection: "Poster Collections",
  sticker_collection: "Sticker Collections",
  playmat_collection: "Playmat Collections",
  tournament_collection: "Tournament Collections",
  special_collection: "Special Collections",
  ex_collection: "ex Collections",
  knockout_collection: "Knock Out Collections",
  collection: "Collections",
  fun_pack: "Fun Packs",
  other: "Other Sealed",
};

const nameCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

function normalizeSealedName(name: string): string {
  return ` ${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getCardMarketPrice(product: NormalizedSealedProduct): number | null {
  return (
    product.price.cm_lowest ??
    product.price.cm_lowest_eu ??
    product.price.cm_lowest_de ??
    product.price.cm_lowest_fr ??
    product.price.cm_lowest_es ??
    product.price.cm_lowest_it ??
    null
  );
}

function classifySealedProduct(name: string): SealedCategory {
  const normalized = normalizeSealedName(name);

  if (normalized.includes(" case ")) return "case";
  if (normalized.includes(" booster bundle ")) return "booster_bundle";
  if (normalized.includes(" elite trainer box ")) return "elite_trainer_box";
  if (normalized.includes(" build battle stadium ")) return "build_battle_stadium";
  if (normalized.includes(" build battle kit ")) return "build_battle_kit";
  if (normalized.includes(" booster box ")) return "booster_box";
  if (normalized.includes(" fun pack ")) return "fun_pack";
  if (normalized.includes(" sampling pack ")) return "sampling_pack";
  if (
    normalized.includes(" blister ") ||
    normalized.includes(" checklane ") ||
    normalized.includes(" klappblister ")
  ) {
    return "blister";
  }
  if (normalized.includes(" mini tin ") || normalized.includes(" mini tins ")) {
    return "mini_tin";
  }
  if (normalized.includes(" ultra premium collection ")) {
    return "ultra_premium_collection";
  }
  if (normalized.includes(" super premium collection ")) {
    return "super_premium_collection";
  }
  if (
    normalized.includes(" premium figure collection ") ||
    normalized.includes(" figure collection ")
  ) {
    return "figure_collection";
  }
  if (normalized.includes(" binder collection ")) return "binder_collection";
  if (normalized.includes(" illustration collection ")) return "illustration_collection";
  if (normalized.includes(" pin collection ")) return "pin_collection";
  if (normalized.includes(" poster collection ")) return "poster_collection";
  if (normalized.includes(" sticker collection ")) return "sticker_collection";
  if (normalized.includes(" playmat collection ")) return "playmat_collection";
  if (normalized.includes(" tournament collection ")) return "tournament_collection";
  if (normalized.includes(" knock out collection ")) return "knockout_collection";
  if (normalized.includes(" special collection ")) return "special_collection";
  if (normalized.includes(" premium collection ")) return "premium_collection";
  if (normalized.includes(" ex collection ")) return "ex_collection";
  if (normalized.includes(" tin ") || normalized.includes(" tins ")) return "tin";
  if (normalized.includes(" toolkit ")) return "toolkit";
  if (normalized.includes(" theme deck ")) return "theme_deck";
  if (normalized.includes(" battle deck ")) return "battle_deck";
  if (normalized.includes(" playmat ")) return "playmat";
  if (normalized.includes(" chest ")) return "chest";
  if (
    normalized.includes(" ex box ") ||
    normalized.endsWith(" box ") ||
    (normalized.includes(" mega ") && normalized.includes(" box "))
  ) {
    return "box";
  }
  if (normalized.includes(" booster ")) return "booster";
  if (
    normalized.includes(" collection ") ||
    normalized.includes(" binder ") ||
    normalized.includes(" figure ")
  ) {
    return "collection";
  }
  return "other";
}

function getCategorySortRank(category: SealedCategory, name: string): number {
  const normalized = normalizeSealedName(name);

  if (category === "case") {
    if (normalized.includes(" booster box ")) return 0;
    if (normalized.includes(" booster bundle ")) return 1;
    if (normalized.includes(" elite trainer box ")) return 2;
    if (normalized.includes(" sleeved booster ")) return 3;
    return 4;
  }

  if (category === "elite_trainer_box") {
    if (normalized.includes(" pokemon center ")) return 1;
    return 0;
  }

  if (
    category === "build_battle_kit" ||
    category === "booster_bundle" ||
    category === "tin" ||
    category === "mini_tin" ||
    category === "theme_deck" ||
    category === "battle_deck" ||
    category === "tournament_collection" ||
    category === "sticker_collection"
  ) {
    if (normalized.includes(" display ")) return 0;
    if (normalized.includes(" bundle ")) return 1;
    return 2;
  }

  if (
    category === "ultra_premium_collection" ||
    category === "super_premium_collection"
  ) {
    if (normalized.includes(" playmat ")) return 1;
    return 0;
  }

  if (
    category === "premium_collection" ||
    category === "figure_collection" ||
    category === "binder_collection" ||
    category === "illustration_collection" ||
    category === "pin_collection" ||
    category === "poster_collection" ||
    category === "playmat_collection" ||
    category === "special_collection" ||
    category === "ex_collection" ||
    category === "knockout_collection" ||
    category === "collection"
  ) {
    if (normalized.includes(" display ")) return 0;
    if (normalized.includes(" deluxe ")) return 1;
    if (normalized.includes(" figure ")) return 2;
    return 3;
  }

  if (category === "booster") {
    if (normalized.includes(" sleeved booster ")) return 0;
    return 1;
  }

  return 0;
}

function getGroupedProducts(products: NormalizedSealedProduct[]) {
  const grouped = new Map<SealedCategory, NormalizedSealedProduct[]>();

  for (const product of products) {
    const category = classifySealedProduct(product.name);
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(product);
  }

  return CATEGORY_ORDER.map((category) => {
    const items = [...(grouped.get(category) ?? [])].sort((a, b) => {
      const rankDiff =
        getCategorySortRank(category, a.name) - getCategorySortRank(category, b.name);
      if (rankDiff !== 0) return rankDiff;
      return nameCollator.compare(a.name, b.name);
    });

    return {
      category,
      label: CATEGORY_LABELS[category],
      products: items,
    };
  }).filter((group) => group.products.length > 0);
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
  compact = false,
  cardSize = "medium",
}: {
  product: NormalizedSealedProduct;
  compact?: boolean;
  cardSize?: "small" | "medium" | "large";
}) {
  const productPrice = getCardMarketPrice(product);
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

  const buttonClass = compact
    ? isLarge
      ? "rounded-2xl px-3 py-2 text-[13px]"
      : isSmall
        ? "rounded-xl px-2 py-1.5 text-[11px]"
        : "rounded-2xl px-3 py-2 text-xs"
    : "rounded-2xl px-3 py-2.5 text-sm";

  return (
    <div className={`glass flex flex-col shadow-md shadow-black/5 ${cardClass}`}>
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
            <div
              className={`bg-black/4 dark:bg-white/6 ${blockClass}`}
            >
              <p className={`uppercase tracking-wide text-gray-400 dark:text-white/35 ${labelClass}`}>
                7d avg
              </p>
              <p className={`mt-1 font-semibold tabular-nums text-gray-900 dark:text-white ${bodyTextClass}`}>
                {formatCurrency(product.price.cm_avg_7d)}
              </p>
            </div>

            <div
              className={`bg-black/4 dark:bg-white/6 ${blockClass}`}
            >
              <p className={`uppercase tracking-wide text-gray-400 dark:text-white/35 ${labelClass}`}>
                30d avg
              </p>
              <p className={`mt-1 font-semibold tabular-nums text-gray-900 dark:text-white ${bodyTextClass}`}>
                {formatCurrency(product.price.cm_avg_30d)}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-auto flex gap-2">
        {product.cardmarket_url && (
          <a
            href={withCardMarketFilters(product.cardmarket_url)}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex-1 bg-blue-600 text-center font-semibold text-white transition-colors hover:bg-blue-500 ${buttonClass}`}
          >
            CardMarket
          </a>
        )}
      </div>
    </div>
  );
}

export default function SealedProductsGrid({
  products,
}: {
  products: NormalizedSealedProduct[];
}) {
  const { settings } = useSettings();
  const groupedProducts = useMemo(() => getGroupedProducts(products), [products]);
  const [activeFilter, setActiveFilter] = useState<SealedFilter>("all");

  if (products.length === 0) {
    return (
      <div className="glass rounded-3xl p-12 text-center shadow-md shadow-black/5">
        <p className="text-gray-700 dark:text-gray-300 font-medium mb-1">
          No sealed products found yet
        </p>
        <p className="text-gray-400 text-sm">
          TCGGO does not currently list sealed for this set.
        </p>
      </div>
    );
  }

  const activeGroup =
    activeFilter === "all"
      ? null
      : groupedProducts.find((group) => group.category === activeFilter) ?? groupedProducts[0];

  const activeProducts =
    activeFilter === "all"
      ? groupedProducts.flatMap((group) => group.products)
      : activeGroup?.products ?? [];

  const activeLabel = activeFilter === "all" ? "All Sealed" : activeGroup?.label ?? "All Sealed";

  if (settings.widescreen) {
    return (
      <div className="space-y-6">
        <div className="overflow-x-auto pb-1">
          <div className="inline-flex min-w-max gap-2">
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
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
                  onClick={() => setActiveFilter(group.category)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                    active
                      ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                      : "border-black/8 text-gray-500 hover:border-black/20 hover:text-gray-900 dark:border-white/8 dark:text-white/55 dark:hover:border-white/20 dark:hover:text-white"
                  }`}
                >
                  {group.label}{" "}
                  <span className={active ? "text-white/75 dark:text-gray-600" : "text-gray-400 dark:text-white/35"}>
                    {group.products.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

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
                compact
                cardSize={settings.cardSize}
              />
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {groupedProducts.map((group) => (
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
              <SealedProductCard key={product.id} product={product} cardSize={settings.cardSize} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
