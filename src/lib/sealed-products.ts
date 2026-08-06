import type { NormalizedSealedProduct } from "@/lib/tcggo";

export type SealedCategory =
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

export type SealedFilter = "all" | SealedCategory;

export interface SealedProductGroup {
  category: SealedCategory;
  label: string;
  products: NormalizedSealedProduct[];
}

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

export function getSealedCategoryLabel(category: SealedCategory): string {
  return CATEGORY_LABELS[category] ?? CATEGORY_LABELS.other;
}

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

const CARD_DETAIL_PREVIEW_CATEGORY_RANK: Partial<Record<SealedCategory, number>> = {
  booster_box: 0,
  elite_trainer_box: 1,
  ultra_premium_collection: 2,
  super_premium_collection: 3,
  premium_collection: 4,
  box: 5,
  special_collection: 6,
  ex_collection: 7,
  figure_collection: 8,
  illustration_collection: 9,
  collection: 10,
  booster_bundle: 11,
  build_battle_stadium: 12,
  build_battle_kit: 13,
  tin: 14,
  mini_tin: 15,
  blister: 16,
  chest: 17,
  other: 18,
};

/**
 * Collection-card origins can point at any individually opened sealed item.
 * Only outer packaging that contains multiple complete products is excluded.
 */
export function isCollectionSealedOriginProduct(name: string): boolean {
  const normalized = normalizeSealedName(name);
  return !normalized.includes(" case ") && !normalized.includes(" display ");
}

/**
 * Keeps the compact card-detail preview focused on consumer products.
 * Wholesale cases and retail displays remain available on the full sealed page.
 */
export function selectCardDetailSealedProducts<T extends { name: string }>(
  products: readonly T[],
  limit = 8
): T[] {
  return products
    .filter((product) => {
      const normalized = normalizeSealedName(product.name);
      return classifySealedProduct(product.name) !== "case" && !normalized.includes(" display ");
    })
    .sort((a, b) => {
      const categoryA = classifySealedProduct(a.name);
      const categoryB = classifySealedProduct(b.name);
      const rankA = CARD_DETAIL_PREVIEW_CATEGORY_RANK[categoryA] ?? 50;
      const rankB = CARD_DETAIL_PREVIEW_CATEGORY_RANK[categoryB] ?? 50;
      if (rankA !== rankB) return rankA - rankB;

      if (categoryA === "elite_trainer_box") {
        const aPokemonCenter = normalizeSealedName(a.name).includes(" pokemon center ");
        const bPokemonCenter = normalizeSealedName(b.name).includes(" pokemon center ");
        if (aPokemonCenter !== bPokemonCenter) return aPokemonCenter ? 1 : -1;
      }

      return nameCollator.compare(a.name, b.name);
    })
    .slice(0, Math.max(0, limit));
}

export interface SealedProductPriceFields {
  cm_lowest: number | null;
  cm_lowest_eu: number | null;
  cm_lowest_de: number | null;
  cm_lowest_fr: number | null;
  cm_lowest_es: number | null;
  cm_lowest_it: number | null;
}

export const SEALED_EU_MARKET_PRICE_SOURCES = [
  "cm_lowest_eu",
  "cm_lowest",
  "cm_lowest_de",
  "cm_lowest_fr",
  "cm_lowest_es",
  "cm_lowest_it",
] as const;

export type SealedEuMarketPriceSource =
  (typeof SEALED_EU_MARKET_PRICE_SOURCES)[number];

export interface SealedEuMarketPriceSelection {
  source: SealedEuMarketPriceSource;
  value: number;
}

export function getSealedMarketPriceForSource(
  price: SealedProductPriceFields | null | undefined,
  source: SealedEuMarketPriceSource
): number | null {
  return price?.[source] ?? null;
}

export function getSealedEuMarketPriceSelection(
  price: SealedProductPriceFields | null | undefined
): SealedEuMarketPriceSelection | null {
  if (!price) return null;

  for (const source of SEALED_EU_MARKET_PRICE_SOURCES) {
    const value = getSealedMarketPriceForSource(price, source);
    if (value != null) {
      return { source, value };
    }
  }

  return null;
}

export function getSealedEuMarketPrice(price: SealedProductPriceFields): number | null {
  return getSealedEuMarketPriceSelection(price)?.value ?? null;
}

export function getSealedProductPrice(product: {
  price: SealedProductPriceFields;
}): number | null {
  return getSealedEuMarketPrice(product.price);
}

export function classifySealedProduct(name: string): SealedCategory {
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

export function getGroupedSealedProducts(
  products: NormalizedSealedProduct[]
): SealedProductGroup[] {
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

export function resolveSealedFilter(
  value: string | null | undefined,
  groups: SealedProductGroup[]
): SealedFilter {
  if (!value || value === "all") return "all";

  const maybeCategory = value as SealedCategory;
  if (!CATEGORY_ORDER.includes(maybeCategory)) {
    return "all";
  }

  return groups.some((group) => group.category === maybeCategory) ? maybeCategory : "all";
}

export function getActiveSealedGroup(
  groups: SealedProductGroup[],
  activeFilter: SealedFilter
): SealedProductGroup | null {
  if (activeFilter === "all") return null;
  return groups.find((group) => group.category === activeFilter) ?? null;
}

export function getActiveSealedProducts(
  groups: SealedProductGroup[],
  activeFilter: SealedFilter
): NormalizedSealedProduct[] {
  const activeGroup = getActiveSealedGroup(groups, activeFilter);
  return activeFilter === "all"
    ? groups.flatMap((group) => group.products)
    : activeGroup?.products ?? [];
}
