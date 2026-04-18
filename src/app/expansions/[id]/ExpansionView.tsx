"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import CardThreeViewer from "./CardThreeViewer";
import {
  buildCardMarketProductUrl,
  buildCardMarketProxyUrl,
  isDirectCardMarketUrl,
  withCardMarketFilters,
} from "@/lib/cardmarket";
import { KNOWN_RARITY_ORDER, normalizeRarityLabel } from "@/lib/rarity";
import PriceRefreshCountdown from "@/components/PriceRefreshCountdown";
import {
  useSettings,
  CardView,
  CardSize,
  SortBy,
  SortDir,
  ModalSize,
  PriceSource,
} from "@/components/SettingsProvider";

export interface CardData {
  id: string;
  name: string;
  card_number: string | null;
  rarity: string | null;
  hp: number | string | null;
  image_url: string | null;
  supertype: string | null;
  subtypes: string | null;
  artist: string | null;
  cardmarket_id: string | null;
  cardmarket_url: string | null;
  tcggo_url: string | null;
  price_source_status: string | null;
  price_source_checked_at: string | null;
  price_fetched_at: string | null;
  price: {
    cm_en_lowest_nm: number | null;
    cm_de_lowest_nm: number | null;
    cm_fr_lowest_nm: number | null;
    cm_es_lowest_nm: number | null;
    cm_it_lowest_nm: number | null;
    tcp_market: number | null;
    tcp_mid: number | null;
    tcp_low: number | null;
    cm_en_avg_7d: number | null;
    cm_en_avg_30d: number | null;
  } | null;
}

type CurrencyCode = "EUR" | "USD";

const CARD_NUMBER_FALLBACK = "999999";
const cardNumberCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

function formatCurrency(
  value: number | null | undefined,
  currency: CurrencyCode = "EUR"
): string {
  if (value == null) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getCardMarketPrice(card: CardData): number | null {
  return (
    card.price?.cm_en_lowest_nm ??
    card.price?.cm_de_lowest_nm ??
    card.price?.cm_fr_lowest_nm ??
    card.price?.cm_es_lowest_nm ??
    card.price?.cm_it_lowest_nm ??
    null
  );
}

function getSortPrice(card: CardData, sortBy: SortBy): number | null {
  return sortBy === "tcp" ? card.price?.tcp_market ?? null : getCardMarketPrice(card);
}

function getPriceBySource(card: CardData, source: PriceSource): number | null {
  return source === "tcp" ? card.price?.tcp_market ?? null : getCardMarketPrice(card);
}

function getPriceSourceCurrency(source: PriceSource): CurrencyCode {
  return source === "tcp" ? "USD" : "EUR";
}

function getSortLabel(sortBy: SortBy): string {
  if (sortBy === "number") return "Number";
  return sortBy === "cm_en" ? "CardMarket" : "TCGPlayer";
}

function getDefaultSortDir(sortBy: SortBy): SortDir {
  return sortBy === "number" ? "asc" : "desc";
}

function comparePriceValues(a: number | null, b: number | null, sortDir: SortDir): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return sortDir === "asc" ? a - b : b - a;
}

function compareCardNumbers(a: CardData, b: CardData): number {
  const diff = cardNumberCollator.compare(
    a.card_number?.trim() || CARD_NUMBER_FALLBACK,
    b.card_number?.trim() || CARD_NUMBER_FALLBACK
  );
  if (diff !== 0) return diff;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function formatSortSummary(sortBy: SortBy, sortDir: SortDir): string {
  const direction = sortDir === "asc" ? "low-high" : "high-low";
  return `${getSortLabel(sortBy)} ${direction}`;
}

function rarityBadge(rarity: string | null): string {
  const map: Record<string, string> = {
    Common: "bg-black/6 dark:bg-white/8 text-gray-500 dark:text-gray-400",
    Uncommon:
      "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
    Rare: "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
    "Rare Holo": "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
    "Rare Ultra": "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
    "Ultra Rare": "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
    "Secret Rare": "bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400",
    "Amazing Rare": "bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400",
    Promo: "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
    "Radiant Rare": "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
    "ACE SPEC Rare": "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300",
    "Double Rare": "bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300",
    "Illustration Rare": "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300",
    "Special Illustration Rare":
      "bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300",
    "Hyper Rare": "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
    "Shiny Rare": "bg-lime-50 dark:bg-lime-900/30 text-lime-700 dark:text-lime-300",
    "Shiny Ultra Rare":
      "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300",
    "Rare Rainbow": "bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300",
    "Rare Holo EX": "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300",
    "Rare Holo V": "bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300",
    "Rare Holo GX":
      "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
    "Trainer Gallery Rare Holo":
      "bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300",
    "Rare Holo LV.X":
      "bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300",
    "Rare Holo VSTAR":
      "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
    "Rare Shiny": "bg-lime-50 dark:bg-lime-900/30 text-lime-700 dark:text-lime-300",
    "Rare Shiny GX":
      "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
    "Rare BREAK": "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
    "Rare Prism Star":
      "bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300",
    "Rare Prime": "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300",
    "Classic Collection":
      "bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300",
    "Rare Holo Star":
      "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
    LEGEND: "bg-stone-100 dark:bg-stone-800/60 text-stone-700 dark:text-stone-300",
    "Rare Shining":
      "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
    "Rare ACE": "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300",
    "Art Rare": "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300",
    "Special Art Rare":
      "bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300",
    "Mega Hyper Rare":
      "bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300",
    "Black White Rare":
      "bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300",
  };
  return (
    map[normalizeRarityLabel(rarity) ?? ""] ??
    "bg-black/5 dark:bg-white/6 text-gray-500 dark:text-gray-400"
  );
}

function rarityFilterChip(rarity: string | null, active: boolean): string {
  const palette = rarityBadge(rarity);

  if (active) {
    return `${palette} border-black/12 dark:border-white/12 shadow-sm shadow-black/5 dark:shadow-black/20`;
  }

  return `${palette} border-black/8 dark:border-white/8 opacity-75 hover:opacity-100 hover:border-black/20 dark:hover:border-white/20`;
}

const cardMinWidth: Record<CardSize, Record<"normal" | "wide", string>> = {
  small: { normal: "120px", wide: "160px" },
  medium: { normal: "160px", wide: "220px" },
  large: { normal: "220px", wide: "300px" },
};

const KNOWN_SUPERTYPE_ORDER = ["Pokémon", "Trainer", "Energy"];
const INITIAL_IMAGE_PRELOAD_COUNT = 18;
const BACKGROUND_IMAGE_PRELOAD_BATCH = 18;
const BACKGROUND_IMAGE_PRELOAD_DELAY_MS = 180;
const WARMED_CARD_IMAGE_CACHE_LIMIT = 1200;
const warmedCardImageUrls = new Set<string>();
const warmedCardImageQueue: string[] = [];

interface Props {
  cards: CardData[];
}

interface FilterOption {
  value: string;
  count: number;
}

function rememberWarmedCardImage(url: string): boolean {
  if (warmedCardImageUrls.has(url)) return false;

  warmedCardImageUrls.add(url);
  warmedCardImageQueue.push(url);

  const overflow = warmedCardImageQueue.length - WARMED_CARD_IMAGE_CACHE_LIMIT;
  if (overflow > 0) {
    for (const staleUrl of warmedCardImageQueue.splice(0, overflow)) {
      warmedCardImageUrls.delete(staleUrl);
    }
  }

  return true;
}

function warmCardImage(url: string, priority: "auto" | "low" = "auto") {
  if (typeof window === "undefined" || !rememberWarmedCardImage(url)) return;

  const image = new window.Image();
  image.decoding = "async";
  if ("fetchPriority" in image) {
    image.fetchPriority = priority;
  }
  image.src = url;
}

function getUniqueCardImageUrls(cards: CardData[]): string[] {
  const urls = new Set<string>();
  for (const card of cards) {
    if (card.image_url) {
      urls.add(card.image_url);
    }
  }
  return [...urls];
}

function buildFilterOptions(
  values: Array<string | null | undefined>,
  preferredOrder: readonly string[],
  normalizeValue?: (value: string | null | undefined) => string | null
): FilterOption[] {
  const counts = new Map<string, number>();

  for (const rawValue of values) {
    const value = normalizeValue ? normalizeValue(rawValue) : rawValue?.trim() ?? null;
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const rankByValue = new Map(preferredOrder.map((value, index) => [value, index]));

  return [...counts.entries()]
    .sort(([a], [b]) => {
      const aRank = rankByValue.get(a);
      const bRank = rankByValue.get(b);

      if (aRank != null || bRank != null) {
        if (aRank == null) return 1;
        if (bRank == null) return -1;
        if (aRank !== bRank) return aRank - bRank;
      }

      return cardNumberCollator.compare(a, b);
    })
    .map(([value, count]) => ({ value, count }));
}

export default function ExpansionView({ cards }: Props) {
  const { settings, set, isLoaded } = useSettings();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CardData | null>(null);
  const [threeDCard, setThreeDCard] = useState<CardData | null>(null);
  const [resolvedCardMarketUrls, setResolvedCardMarketUrls] = useState<Record<string, string>>({});
  const view = settings.defaultView;
  const rarities = settings.defaultRarities;
  const supertypes = settings.defaultSupertypes;
  const onlyPriced = settings.showOnlyPriced;
  const primaryPriceSource = settings.primaryPriceSource;
  const sortBy = settings.sortBy;
  const sortDir = settings.sortDir;
  const availableRarities = useMemo(
    () =>
      buildFilterOptions(cards.map((card) => card.rarity), KNOWN_RARITY_ORDER, normalizeRarityLabel),
    [cards]
  );
  const availableSupertypes = useMemo(
    () => buildFilterOptions(cards.map((card) => card.supertype), KNOWN_SUPERTYPE_ORDER),
    [cards]
  );
  const normalizedSearch = search.trim().toLowerCase();
  const availableRarityValues = useMemo(
    () => new Set(availableRarities.map((option) => option.value)),
    [availableRarities]
  );
  const availableSupertypeValues = useMemo(
    () => new Set(availableSupertypes.map((option) => option.value)),
    [availableSupertypes]
  );
  const activeRarities = useMemo(
    () =>
      [
        ...new Set(
          rarities
            .map((rarity) => normalizeRarityLabel(rarity))
            .filter((value): value is string => Boolean(value))
        ),
      ].filter((rarity) => availableRarityValues.has(rarity)),
    [rarities, availableRarityValues]
  );
  const activeSupertypes = useMemo(
    () => supertypes.filter((supertype) => availableSupertypeValues.has(supertype)),
    [supertypes, availableSupertypeValues]
  );

  useEffect(() => {
    const imageUrls = getUniqueCardImageUrls(cards);
    if (imageUrls.length === 0) return;

    imageUrls
      .slice(0, INITIAL_IMAGE_PRELOAD_COUNT)
      .forEach((url) => warmCardImage(url, "auto"));

    const remaining = imageUrls.slice(INITIAL_IMAGE_PRELOAD_COUNT);
    if (remaining.length === 0) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const pump = (startIndex: number) => {
      if (cancelled) return;

      remaining
        .slice(startIndex, startIndex + BACKGROUND_IMAGE_PRELOAD_BATCH)
        .forEach((url) => warmCardImage(url, "low"));

      if (startIndex + BACKGROUND_IMAGE_PRELOAD_BATCH < remaining.length) {
        timer = setTimeout(
          () => pump(startIndex + BACKGROUND_IMAGE_PRELOAD_BATCH),
          BACKGROUND_IMAGE_PRELOAD_DELAY_MS
        );
      }
    };

    timer = setTimeout(() => pump(0), BACKGROUND_IMAGE_PRELOAD_DELAY_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [cards]);

  function getResolvedCardMarketUrl(card: CardData): string | null {
    const storedUrl = resolvedCardMarketUrls[card.id] ?? card.cardmarket_url;
    if (isDirectCardMarketUrl(storedUrl)) {
      return withCardMarketFilters(storedUrl);
    }

    if (card.cardmarket_id) {
      return buildCardMarketProductUrl(card.cardmarket_id);
    }

    return storedUrl;
  }

  async function openCardMarket(card: CardData) {
    let targetUrl = getResolvedCardMarketUrl(card) ?? buildCardMarketProxyUrl(card.id);
    if (!isDirectCardMarketUrl(targetUrl)) {
      try {
        const res = await fetch(`/api/cm-url?card_id=${encodeURIComponent(card.id)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as { url?: string };
          const directUrl = typeof data.url === "string" && isDirectCardMarketUrl(data.url)
            ? withCardMarketFilters(data.url)
            : null;
          if (directUrl) {
            setResolvedCardMarketUrls((prev) =>
              prev[card.id] === directUrl ? prev : { ...prev, [card.id]: directUrl }
            );
            targetUrl = directUrl;
            setSelected((prev) =>
              prev?.id === card.id && prev.cardmarket_url !== directUrl
                ? { ...prev, cardmarket_url: directUrl }
                : prev
            );
          }
        }
      } catch (error) {
        console.error("Failed to resolve direct CardMarket URL", error);
      }
    }
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  }

  function toggleSort(col: SortBy) {
    if (col === "cm_en" || col === "tcp") {
      set("primaryPriceSource", col);
    }

    if (sortBy === col) {
      const next: SortDir = sortDir === "asc" ? "desc" : "asc";
      set("sortDir", next);
      return;
    }

    const nextDir = getDefaultSortDir(col);
    set("sortBy", col);
    set("sortDir", nextDir);
  }

  function toggleRarity(r: string) {
    const current = [
      ...new Set(
        rarities
          .map((rarity) => normalizeRarityLabel(rarity))
          .filter((value): value is string => Boolean(value))
      ),
    ];
    const next = current.includes(r) ? current.filter((x) => x !== r) : [...current, r];
    set("defaultRarities", next);
  }

  function toggleSupertype(s: string) {
    const next = supertypes.includes(s)
      ? supertypes.filter((x) => x !== s)
      : [...supertypes, s];
    set("defaultSupertypes", next);
  }

  const filtered = useMemo(() => {
    if (!isLoaded) return [];

    const next = cards.filter((card) => {
      if (normalizedSearch && !card.name.toLowerCase().includes(normalizedSearch)) return false;
      if (
        activeRarities.length > 0 &&
        !activeRarities.includes(normalizeRarityLabel(card.rarity) ?? "")
      ) {
        return false;
      }
      if (activeSupertypes.length > 0 && !activeSupertypes.includes(card.supertype ?? "")) {
        return false;
      }
      if (onlyPriced && getPriceBySource(card, primaryPriceSource) == null) return false;
      return true;
    });

    return next.sort((a, b) => {
      if (sortBy === "number") {
        const diff = compareCardNumbers(a, b);
        return sortDir === "asc" ? diff : -diff;
      }

      const priceDiff = comparePriceValues(getSortPrice(a, sortBy), getSortPrice(b, sortBy), sortDir);
      if (priceDiff !== 0) return priceDiff;
      return compareCardNumbers(a, b);
    });
  }, [
    cards,
    normalizedSearch,
    activeRarities,
    activeSupertypes,
    onlyPriced,
    sortBy,
    sortDir,
    isLoaded,
    primaryPriceSource,
  ]);

  const hasActiveFilters =
    Boolean(search) || activeRarities.length > 0 || activeSupertypes.length > 0 || onlyPriced;
  const sortSummary = formatSortSummary(sortBy, sortDir);

  const SORT_OPTIONS: Array<{ value: SortBy; label: string }> = [
    { value: "number", label: "#" },
    { value: "cm_en", label: "CM" },
    { value: "tcp", label: "TCP" },
  ];

  const SIZE_OPTIONS: Array<{ value: CardSize; label: string }> = [
    { value: "small", label: "S" },
    { value: "medium", label: "M" },
    { value: "large", label: "L" },
  ];

  if (!isLoaded) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center px-6 py-12">
        <div className="rounded-2xl border border-black/8 bg-white/75 px-4 py-2 text-sm text-gray-500 shadow-sm backdrop-blur-xl dark:border-white/8 dark:bg-white/5 dark:text-white/55">
          Loading saved view...
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="glass rounded-2xl px-4 py-3 mb-4 shadow-sm shadow-black/5 space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg overflow-hidden border border-black/8 dark:border-white/8 shrink-0">
            {(["table", "grid"] as CardView[]).map((v) => (
              <button
                key={v}
                onClick={() => {
                  set("defaultView", v);
                }}
                className={`px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                  view === v
                    ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-black/10 dark:bg-white/10 shrink-0" />

          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs text-gray-400 mr-0.5">Sort</span>
            <div className="flex rounded-lg overflow-hidden border border-black/8 dark:border-white/8">
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  title={
                    option.value === "cm_en"
                      ? "Sort by CardMarket and use CardMarket as main prices"
                      : option.value === "tcp"
                        ? "Sort by TCGPlayer and use TCGPlayer as main prices"
                        : "Sort by card number"
                  }
                  onClick={() => toggleSort(option.value)}
                  className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    sortBy === option.value
                      ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  {option.label}
                  {sortBy === option.value ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                </button>
              ))}
            </div>
          </div>

          <div className="w-px h-4 bg-black/10 dark:bg-white/10 shrink-0" />

          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs text-gray-400 mr-0.5">Size</span>
            <div className="flex rounded-lg overflow-hidden border border-black/8 dark:border-white/8">
              {SIZE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => set("cardSize", option.value)}
                  className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    settings.cardSize === option.value
                      ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[120px] px-3 py-1.5 rounded-lg text-xs bg-black/5 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 border border-transparent focus:border-black/10 dark:focus:border-white/10 outline-none"
          />

          <span className="text-xs text-gray-400 shrink-0 tabular-nums">
            {filtered.length} / {cards.length}
          </span>
          <span className="rounded-full border border-black/8 px-2 py-1 text-[11px] font-medium text-gray-500 dark:border-white/8 dark:text-gray-400 shrink-0">
            {sortSummary}
          </span>
          {hasActiveFilters && (
            <button
              onClick={() => {
                setSearch("");
                set("defaultRarities", []);
                set("defaultSupertypes", []);
                set("showOnlyPriced", false);
              }}
              className="text-xs text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors shrink-0"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          {availableRarities.map((rarity) => (
            <button
              key={rarity.value}
              onClick={() => toggleRarity(rarity.value)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all ${rarityFilterChip(
                rarity.value,
                activeRarities.includes(rarity.value)
              )}`}
            >
              {rarity.value}
            </button>
          ))}
          {availableRarities.length > 0 && availableSupertypes.length > 0 && (
            <div className="w-px h-3.5 bg-black/10 dark:bg-white/10" />
          )}
          {availableSupertypes.map((supertype) => (
            <button
              key={supertype.value}
              onClick={() => toggleSupertype(supertype.value)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all ${
                activeSupertypes.includes(supertype.value)
                  ? "border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                  : "border-black/8 dark:border-white/8 text-gray-400 hover:border-black/20 dark:hover:border-white/20 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {supertype.value}
            </button>
          ))}
          {(availableRarities.length > 0 || availableSupertypes.length > 0) && (
            <div className="w-px h-3.5 bg-black/10 dark:bg-white/10" />
          )}
          <button
            onClick={() => {
              set("showOnlyPriced", !onlyPriced);
            }}
            className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all ${
              onlyPriced
                ? "border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                : "border-black/8 dark:border-white/8 text-gray-400 hover:border-black/20 dark:hover:border-white/20"
            }`}
          >
            Priced only
          </button>
        </div>
      </div>

      {view === "table" && (
        <div className="glass rounded-3xl shadow-lg shadow-black/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-black/6 dark:border-white/6 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="px-5 py-4 w-12">#</th>
                  <th className="px-2 py-4 w-16">Card</th>
                  <th className="px-4 py-4">Name</th>
                  <th className="px-4 py-4">Rarity</th>
                  <th className="px-4 py-4 text-right">CardMarket</th>
                  <th className="px-5 py-4 text-right">TCGPlayer</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((card, index) => (
                  <tr
                    key={card.id}
                    onClick={() => setSelected(card)}
                    className={`group border-b border-black/4 dark:border-white/6 last:border-0 hover:bg-black/3 dark:hover:bg-white/5 transition-colors cursor-pointer ${
                      index % 2 === 0 ? "" : "bg-black/[0.015] dark:bg-white/[0.025]"
                    }`}
                  >
                    <td className="px-5 py-3 text-gray-400 dark:text-white/30 tabular-nums text-xs">
                      {card.card_number ?? "--"}
                    </td>
                    <td className="px-2 py-2">
                      {card.image_url ? (
                        <div className="relative w-10 h-14 rounded-lg overflow-hidden shadow-sm">
                          <Image
                            src={card.image_url}
                            alt={card.name}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                            sizes="40px"
                            loading={index < 10 ? "eager" : undefined}
                            unoptimized
                          />
                        </div>
                      ) : (
                        <div className="w-10 h-14 bg-black/6 dark:bg-white/6 rounded-lg flex items-center justify-center text-gray-300 text-xs">
                          ?
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-gray-900 dark:text-white">{card.name}</span>
                      {card.hp && <span className="ml-2 text-gray-400 text-xs">HP {card.hp}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {card.rarity ? (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${rarityBadge(
                            card.rarity
                          )}`}
                        >
                          {normalizeRarityLabel(card.rarity) ?? card.rarity}
                        </span>
                      ) : (
                        <span className="text-gray-200 dark:text-gray-700">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-white font-semibold">
                      {formatCurrency(getCardMarketPrice(card), "EUR")}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-400">
                      {formatCurrency(card.price?.tcp_market, "USD")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "grid" && (
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${
              cardMinWidth[settings.cardSize][settings.widescreen ? "wide" : "normal"]
            }, 1fr))`,
          }}
        >
          {filtered.map((card, index) => {
            const gridPrice = getPriceBySource(card, primaryPriceSource);
            const gridCurrency = getPriceSourceCurrency(primaryPriceSource);
            return (
              <div
                key={card.id}
                className="flex flex-col gap-1.5 cursor-pointer"
                onClick={() => setSelected(card)}
              >
                <div className="relative w-full aspect-[63/88] rounded-xl overflow-hidden shadow-md shadow-black/20 hover:shadow-xl hover:shadow-black/30 hover:scale-[1.03] transition-all duration-200">
                  {card.image_url ? (
                    <Image
                      src={card.image_url}
                      alt={card.name}
                      fill
                      className="object-contain"
                      sizes="160px"
                      loading={index < 18 ? "eager" : undefined}
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full bg-black/6 dark:bg-white/6 flex items-center justify-center text-gray-300 text-xs rounded-xl">
                      {card.name.slice(0, 2)}
                    </div>
                  )}
                </div>
                <div className="px-0.5">
                  <p className="text-xs font-semibold text-gray-900 dark:text-white truncate leading-snug">
                    {card.name}
                  </p>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] tabular-nums">
                    <span className="text-gray-400 dark:text-gray-500">
                      {card.card_number ? `#${card.card_number}` : "--"}
                    </span>
                    {gridPrice != null && (
                      <span className="text-gray-500 dark:text-gray-400">
                        {primaryPriceSource === "tcp"
                          ? `TCP ${formatCurrency(gridPrice, gridCurrency)}`
                          : formatCurrency(gridPrice, gridCurrency)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="glass rounded-3xl p-12 text-center shadow-md shadow-black/5 mt-4">
          <p className="text-gray-700 dark:text-gray-300 font-medium mb-1">
            No cards match your filters
          </p>
          <p className="text-gray-400 text-sm">Try adjusting or clearing the filters above.</p>
        </div>
      )}

      {selected &&
        (() => {
          const ms: ModalSize = settings.modalSize;
          const storedCardMarketUrl = getResolvedCardMarketUrl(selected);
          const imgW =
            ms === "small"
              ? "w-44 sm:w-48"
              : ms === "large"
                ? "w-56 sm:w-72 xl:w-80"
                : "w-52 sm:w-64";
          const imgSize = ms === "small" ? "192px" : ms === "large" ? "320px" : "256px";
          const maxW = ms === "small" ? "max-w-xl" : ms === "large" ? "max-w-5xl" : "max-w-4xl";
          const pad = ms === "small" ? "p-6" : ms === "large" ? "p-8 sm:p-9" : "p-7";
          const gap = ms === "small" ? "gap-5" : ms === "large" ? "gap-8" : "gap-7";
          const titleCls = ms === "small" ? "text-2xl" : ms === "large" ? "text-4xl" : "text-3xl";
          const priceCls = ms === "small" ? "text-sm" : ms === "large" ? "text-base" : "text-[15px]";
          const metaCls = ms === "small" ? "text-sm" : ms === "large" ? "text-base" : "text-[15px]";

          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-6"
              style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)" }}
              onClick={() => setSelected(null)}
            >
              <div
                className={`${maxW} glass w-full rounded-3xl shadow-2xl shadow-black/45 overflow-hidden`}
                style={{
                  background: "rgba(12,12,14,0.82)",
                  border: "1px solid rgba(255,255,255,0.14)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={`flex flex-col sm:flex-row ${gap} ${pad}`}>
                  <div className={`shrink-0 ${imgW} mx-auto sm:mx-0`}>
                    {selected.image_url ? (
                      <button
                        type="button"
                        onClick={() => setThreeDCard(selected)}
                        className={`group relative ${imgW} aspect-[63/88] cursor-grab overflow-hidden rounded-2xl shadow-2xl shadow-black/50 transition-transform hover:scale-[1.015]`}
                        aria-label={`Open ${selected.name} in 3D`}
                      >
                        <Image
                          src={selected.image_url}
                          alt={selected.name}
                          fill
                          className="object-contain"
                          sizes={imgSize}
                          loading="eager"
                          unoptimized
                        />
                      </button>
                    ) : (
                      <div
                        className={`${imgW} aspect-[63/88] bg-white/6 rounded-2xl flex items-center justify-center text-white/30`}
                      >
                        ?
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col gap-4">
                    <div>
                      <h2 className={`${titleCls} font-bold text-white leading-tight`}>
                        {selected.name}
                      </h2>
                      <div className={`mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-white/50 ${metaCls}`}>
                        {selected.card_number && <span>#{selected.card_number}</span>}
                        {selected.supertype && <span>{selected.supertype}</span>}
                        {selected.subtypes && <span>{selected.subtypes}</span>}
                        {selected.hp && <span>HP {selected.hp}</span>}
                      </div>
                      {selected.rarity && (
                        <span
                          className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-semibold ${rarityBadge(
                            selected.rarity
                          )}`}
                        >
                          {normalizeRarityLabel(selected.rarity) ?? selected.rarity}
                        </span>
                      )}
                    </div>

                    <div className={`grid grid-cols-2 gap-2 ${priceCls}`}>
                      <div className="flex flex-col gap-2">
                        {[
                          {
                            label: "CardMarket",
                            val: selected.price?.cm_en_lowest_nm,
                            currency: "EUR" as const,
                          },
                          { label: "7d avg", val: selected.price?.cm_en_avg_7d, currency: "EUR" as const },
                          { label: "30d avg", val: selected.price?.cm_en_avg_30d, currency: "EUR" as const },
                        ].map(
                          ({ label, val, currency }) =>
                            val != null && (
                              <div
                                key={label}
                                className="flex justify-between rounded-xl px-3 py-2"
                                style={{ background: "rgba(255,255,255,0.08)" }}
                              >
                                <span className="text-white/50">{label}</span>
                                <span className="font-bold text-white tabular-nums">
                                  {formatCurrency(val, currency)}
                                </span>
                              </div>
                            )
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        {[
                          { label: "TCGPlayer", val: selected.price?.tcp_market, currency: "USD" as const },
                          { label: "TCP Mid", val: selected.price?.tcp_mid, currency: "USD" as const },
                          { label: "TCP Low", val: selected.price?.tcp_low, currency: "USD" as const },
                        ].map(
                          ({ label, val, currency }) =>
                            val != null && (
                              <div
                                key={label}
                                className="flex justify-between rounded-xl px-3 py-2"
                                style={{ background: "rgba(255,255,255,0.08)" }}
                              >
                                <span className="text-white/50">{label}</span>
                                <span className="font-bold text-white tabular-nums">
                                  {formatCurrency(val, currency)}
                                </span>
                              </div>
                            )
                        )}
                      </div>
                    </div>

                    <PriceRefreshCountdown
                      rarity={selected.rarity}
                      priceFetchedAt={selected.price_fetched_at}
                      priceSourceStatus={selected.price_source_status}
                      priceSourceCheckedAt={selected.price_source_checked_at}
                    />

                    {selected.artist && <p className="text-sm text-white/40">Illus. {selected.artist}</p>}
                  </div>
                </div>

                <div className="flex gap-3 px-6 pb-6">
                  {storedCardMarketUrl ? (
                    <a
                      href={storedCardMarketUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-center font-semibold text-white transition-colors hover:bg-blue-500"
                    >
                      Open CardMarket
                    </a>
                  ) : (
                    <button
                      onClick={() => openCardMarket(selected)}
                      className="flex-1 py-3 rounded-2xl font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                    >
                      Open CardMarket
                    </button>
                  )}
                  <button
                    onClick={() => setSelected(null)}
                    className="px-6 py-3 rounded-2xl font-semibold text-white/60 hover:text-white transition-colors"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {selected && threeDCard?.image_url && threeDCard.id === selected.id && (
        <CardThreeViewer
          key={threeDCard.id}
          card={threeDCard}
          frontImageUrl={threeDCard.image_url}
          cardMarketUrl={getResolvedCardMarketUrl(threeDCard)}
          onClose={() => setThreeDCard(null)}
        />
      )}
    </div>
  );
}
