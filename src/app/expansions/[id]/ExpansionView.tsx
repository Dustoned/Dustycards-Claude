"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LineChart, RefreshCw } from "lucide-react";
import CardThreeViewer from "./CardThreeViewer";
import {
  buildCardMarketProductUrl,
  buildCardMarketProxyUrl,
  isDirectCardMarketUrl,
  withCardMarketFilters,
} from "@/lib/cardmarket";
import { KNOWN_RARITY_ORDER, normalizeRarityLabel } from "@/lib/rarity";
import {
  CARD_MARKET_HISTORY_SERIES,
  getCardMarketHistorySeriesCurrentValue,
  getCardMarketHistorySeriesValue,
  hasCardMarketHistorySeries,
  type CardMarketHistorySeriesKey,
  type CardPriceHistoryPoint,
} from "@/lib/price-history";
import PriceHistoryPanel from "@/components/PriceHistoryPanel";
import PriceRefreshCountdown from "@/components/PriceRefreshCountdown";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";
import CardBrowserToolbar, {
  type CardBrowserToolbarActiveFilter,
  type CardBrowserToolbarFilterOption,
  type CardBrowserToolbarFilterSection,
  type CardBrowserToolbarOption,
} from "@/components/CardBrowserToolbar";
import CollectionBulkAddCardsModal from "@/components/CollectionBulkAddCardsModal";
import IllustratorLink from "@/components/IllustratorLink";
import {
  useSettings,
  CardView,
  CardSize,
  SortBy,
  SortDir,
  ModalSize,
  PriceSource,
} from "@/components/SettingsProvider";

interface GradedPriceData {
  label: string;
  price: number;
}

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
  episode_id?: string;
  episode_name?: string | null;
  episode_code?: string | null;
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
  graded_prices?: GradedPriceData[];
}

interface CardDetailData {
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
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  price_source_status: string | null;
  price_source_checked_at: string | null;
  price_fetched_at: string | null;
  price: CardData["price"];
  graded_prices: GradedPriceData[];
  price_history: CardPriceHistoryPoint[];
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

function hasAnyVisiblePrice(card: CardData): boolean {
  const price = card.price;
  if (!price) return false;

  return [
    price.cm_en_lowest_nm,
    price.cm_de_lowest_nm,
    price.cm_fr_lowest_nm,
    price.cm_es_lowest_nm,
    price.cm_it_lowest_nm,
    price.cm_en_avg_7d,
    price.cm_en_avg_30d,
    price.tcp_market,
    price.tcp_mid,
    price.tcp_low,
  ].some((value) => value != null);
}

function mergeCardWithDetails(card: CardData, details: CardDetailData): CardData {
  return {
    ...card,
    id: details.id,
    name: details.name,
    card_number: details.card_number,
    rarity: details.rarity,
    hp: details.hp,
    image_url: details.image_url,
    supertype: details.supertype,
    subtypes: details.subtypes,
    artist: details.artist,
    cardmarket_id: details.cardmarket_id,
    cardmarket_url: details.cardmarket_url,
    tcggo_url: details.tcggo_url,
    episode_id: details.episode_id,
    episode_name: details.episode_name,
    episode_code: details.episode_code,
    price_source_status: details.price_source_status,
    price_source_checked_at: details.price_source_checked_at,
    price_fetched_at: details.price_fetched_at,
    price: details.price,
    graded_prices: details.graded_prices,
  };
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
    return `${palette} border-black/15 dark:border-white/15 opacity-100 ring-2 ring-gray-900/70 ring-offset-1 ring-offset-white shadow-md shadow-black/10 dark:border-white/15 dark:ring-white/80 dark:ring-offset-black dark:shadow-black/25`;
  }

  return `${palette} border-black/8 dark:border-white/8 opacity-75 hover:opacity-100 hover:border-black/20 hover:shadow-sm dark:hover:border-white/20`;
}

function neutralFilterChip(active: boolean): string {
  if (active) {
    return "border-gray-900 bg-gray-900 text-white opacity-100 ring-2 ring-gray-900/70 ring-offset-1 ring-offset-white shadow-md shadow-black/10 dark:border-white dark:bg-white dark:text-gray-900 dark:ring-white/80 dark:ring-offset-black dark:shadow-black/25";
  }

  return "border-black/8 text-gray-500 opacity-80 hover:border-black/20 hover:opacity-100 hover:text-gray-900 hover:shadow-sm dark:border-white/8 dark:text-white/55 dark:hover:border-white/20 dark:hover:text-white";
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
  episode?: {
    id: string;
    name: string;
    code: string | null;
  };
  onVisibleCardsChange?: (cards: CardData[]) => void;
}

interface FilterOption {
  value: string;
  count: number;
}

function hasCardEpisodeMeta(card: CardData): card is CardData & {
  episode_id: string;
  episode_name: string;
  episode_code?: string | null;
} {
  return Boolean(card.episode_id && card.episode_name);
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

  const rankByValue = new Map(
    preferredOrder.map((value, index) => [value.trim().toLowerCase(), index])
  );

  return [...counts.entries()]
    .sort(([a], [b]) => {
      const aRank = rankByValue.get(a.trim().toLowerCase());
      const bRank = rankByValue.get(b.trim().toLowerCase());

      if (aRank != null || bRank != null) {
        if (aRank == null) return 1;
        if (bRank == null) return -1;
        if (aRank !== bRank) return aRank - bRank;
      }

      return cardNumberCollator.compare(a, b);
    })
    .map(([value, count]) => ({ value, count }));
}

export default function ExpansionView({ cards, episode, onVisibleCardsChange }: Props) {
  const { settings, set } = useSettings();
  const [search, setSearch] = useState("");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [selected, setSelected] = useState<CardData | null>(null);
  const [threeDCard, setThreeDCard] = useState<CardData | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [resolvedCardMarketUrls, setResolvedCardMarketUrls] = useState<Record<string, string>>({});
  const [cardDetailsById, setCardDetailsById] = useState<Record<string, CardDetailData>>({});
  const [loadingDetailsId, setLoadingDetailsId] = useState<string | null>(null);
  const [refreshingCardId, setRefreshingCardId] = useState<string | null>(null);
  const [syncingHistoryCardId, setSyncingHistoryCardId] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [cardMarketHistorySeries, setCardMarketHistorySeries] =
    useState<CardMarketHistorySeriesKey>("cm_market_en");
  const view: Exclude<CardView, "binder"> =
    settings.defaultView === "binder" ? "grid" : settings.defaultView;
  const rarities = settings.defaultRarities;
  const supertypes = settings.defaultSupertypes;
  const onlyPriced = settings.showOnlyPriced;
  const primaryPriceSource = settings.primaryPriceSource;
  const sortBy = settings.sortBy;
  const sortDir = settings.sortDir;
  const collectionEpisode = episode ?? {
    id: "",
    name: "",
    code: null,
  };
  const showEpisodeMeta = useMemo(
    () => !episode && cards.some((card) => hasCardEpisodeMeta(card)),
    [cards, episode]
  );

  function getCollectionEpisodeForCard(card: CardData) {
    if (hasCardEpisodeMeta(card)) {
      return {
        id: card.episode_id,
        name: card.episode_name,
        code: card.episode_code ?? null,
      };
    }

    return collectionEpisode;
  }
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
  const setHasAnyPricedCards = useMemo(
    () => cards.some((card) => hasAnyVisiblePrice(card)),
    [cards]
  );
  const selectedCardIdSet = useMemo(() => new Set(selectedCardIds), [selectedCardIds]);
  const effectiveOnlyPriced = onlyPriced && setHasAnyPricedCards;
  const pricedOnlyUnavailable = onlyPriced && !setHasAnyPricedCards;

  useEffect(() => {
    if (settings.defaultView === "binder") {
      set("defaultView", "grid");
    }
  }, [settings.defaultView, set]);

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

  useEffect(() => {
    if (!selected || cardDetailsById[selected.id]) return;

    const controller = new AbortController();
    const cardId = selected.id;

    void (async () => {
      try {
        const res = await fetch(`/api/cards/${encodeURIComponent(cardId)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("card details failed");

        const data = (await res.json()) as CardDetailData;
        setCardDetailsById((prev) => (prev[cardId] ? prev : { ...prev, [cardId]: data }));
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      } finally {
        setLoadingDetailsId((prev) => (prev === cardId ? null : prev));
      }
    })();

    return () => {
      controller.abort();
    };
  }, [selected, cardDetailsById]);

  function openDetails(card: CardData) {
    setRefreshError(null);
    setSelected(card);
    setLoadingDetailsId(cardDetailsById[card.id] ? null : card.id);
  }

  async function runSelectedCardAction(action: "refresh" | "sync-history") {
    if (!selected) return;

    const cardId = selected.id;
    if (action === "refresh") {
      setRefreshingCardId(cardId);
    } else {
      setSyncingHistoryCardId(cardId);
    }
    setRefreshError(null);

    try {
      const response = await fetch(`/api/cards/${encodeURIComponent(cardId)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
        cache: "no-store",
      });
      const data = (await response.json()) as CardDetailData & {
        error?: string;
        activeType?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error ??
            (action === "refresh"
              ? "Could not refresh this card"
              : "Could not import price history for this card")
        );
      }

      setCardDetailsById((prev) => ({
        ...prev,
        [cardId]: data,
      }));
      setSelected((prev) => (prev?.id === cardId ? mergeCardWithDetails(prev, data) : prev));

      if (data.cardmarket_url && isDirectCardMarketUrl(data.cardmarket_url)) {
        const directUrl = withCardMarketFilters(data.cardmarket_url);
        setResolvedCardMarketUrls((prev) =>
          prev[cardId] === directUrl ? prev : { ...prev, [cardId]: directUrl }
        );
      }
    } catch (error) {
      setRefreshError(
        error instanceof Error
          ? error.message
          : action === "refresh"
            ? "Could not refresh this card"
            : "Could not import price history for this card"
      );
    } finally {
      if (action === "refresh") {
        setRefreshingCardId((prev) => (prev === cardId ? null : prev));
      } else {
        setSyncingHistoryCardId((prev) => (prev === cardId ? null : prev));
      }
    }
  }

  function handleCardClick(card: CardData) {
    if (selectionMode) {
      setSelectedCardIds((prev) =>
        prev.includes(card.id) ? prev.filter((id) => id !== card.id) : [...prev, card.id]
      );
      return;
    }

    openDetails(card);
  }

  function toggleSelectionMode() {
    setBulkAddOpen(false);
    setSelectionMode((prev) => {
      if (prev) {
        setSelectedCardIds([]);
      }
      return !prev;
    });
  }

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

  const sortedCards = useMemo(() => {
    const next = cards.filter((card) => {
      if (normalizedSearch) {
        const compactIdentifier = `${card.episode_code ?? ""}${card.card_number ?? ""}`;
        const haystack = [
          card.name,
          card.card_number ?? "",
          card.episode_name ?? "",
          card.episode_code ?? "",
          compactIdentifier,
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(normalizedSearch)) return false;
      }

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
  }, [cards, normalizedSearch, sortBy, sortDir]);

  const filteredCards = useMemo(() => {
    return sortedCards.filter((card) => {
      if (
        activeRarities.length > 0 &&
        !activeRarities.includes(normalizeRarityLabel(card.rarity) ?? "")
      ) {
        return false;
      }
      if (activeSupertypes.length > 0 && !activeSupertypes.includes(card.supertype ?? "")) {
        return false;
      }
      if (effectiveOnlyPriced && !hasAnyVisiblePrice(card)) return false;
      return true;
    });
  }, [
    sortedCards,
    activeRarities,
    activeSupertypes,
    effectiveOnlyPriced,
  ]);

  const persistentFiltersHideEverything =
    !normalizedSearch &&
    sortedCards.length > 0 &&
    filteredCards.length === 0 &&
    (activeRarities.length > 0 || activeSupertypes.length > 0 || effectiveOnlyPriced);

  const filtered = persistentFiltersHideEverything ? sortedCards : filteredCards;
  const selectedCards = useMemo(
    () => cards.filter((card) => selectedCardIdSet.has(card.id)),
    [cards, selectedCardIdSet]
  );

  useEffect(() => {
    onVisibleCardsChange?.(filtered);
  }, [filtered, onVisibleCardsChange]);

  const hasActiveFilters =
    Boolean(search) ||
    activeRarities.length > 0 ||
    activeSupertypes.length > 0 ||
    onlyPriced;
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
  const filtersPanelExpanded = filtersExpanded || persistentFiltersHideEverything;
  const filterBadgeCount =
    activeRarities.length +
    activeSupertypes.length +
    (onlyPriced ? 1 : 0) +
    (search.trim() ? 1 : 0);
  const toolbarSortOptions: CardBrowserToolbarOption[] = [
    {
      value: "number",
      label: "#",
      title: "Sort by card number",
    },
    {
      value: "cm_en",
      label: "CM",
      title: "Sort by CardMarket and use CardMarket as main prices",
    },
    {
      value: "tcp",
      label: "TCP",
      title: "Sort by TCGPlayer and use TCGPlayer as main prices",
    },
  ];
  const toolbarSizeOptions: CardBrowserToolbarOption[] = [
    { value: "small", label: "S" },
    { value: "medium", label: "M" },
    { value: "large", label: "L" },
  ];
  const toolbarActiveFilters: CardBrowserToolbarActiveFilter[] = [
    ...(search.trim()
      ? [
          {
            key: `search-${search.trim().toLowerCase()}`,
            label: `Search: ${search.trim()}`,
            onRemove: () => setSearch(""),
          },
        ]
      : []),
    ...activeRarities.map((rarity) => ({
      key: `rarity-${rarity}`,
      label: rarity,
      onRemove: () => toggleRarity(rarity),
    })),
    ...activeSupertypes.map((supertype) => ({
      key: `supertype-${supertype}`,
      label: supertype,
      onRemove: () => toggleSupertype(supertype),
    })),
    ...(onlyPriced
      ? [
          {
            key: "priced-only",
            label: "Priced only",
            onRemove: () => set("showOnlyPriced", false),
          },
        ]
      : []),
  ];
  const toolbarQuickFilters: CardBrowserToolbarFilterOption[] = [
    {
      key: "quick-priced-only",
      label: pricedOnlyUnavailable ? "No prices yet" : "Priced only",
      active: onlyPriced,
      onToggle: () => set("showOnlyPriced", !onlyPriced),
      className: `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-all ${
        onlyPriced ? "font-semibold" : "font-medium"
      } ${neutralFilterChip(onlyPriced)}`,
    },
    ...availableSupertypes.map((supertype) => {
      const active = activeSupertypes.includes(supertype.value);

      return {
        key: `quick-type-${supertype.value}`,
        label: supertype.value,
        active,
        count: supertype.count,
        onToggle: () => toggleSupertype(supertype.value),
        className: `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-all ${
          active ? "font-semibold" : "font-medium"
        } ${neutralFilterChip(active)}`,
      };
    }),
  ];
  const toolbarFilterSections: CardBrowserToolbarFilterSection[] = [
    {
      key: "rarity",
      title: "Rarity",
      summary: activeRarities.length > 0 ? `${activeRarities.length} selected` : "All",
      className: "xl:min-w-0",
      options: availableRarities.map((rarity) => {
        const active = activeRarities.includes(rarity.value);

        return {
          key: rarity.value,
          label: rarity.value,
          active,
          count: rarity.count,
          onToggle: () => toggleRarity(rarity.value),
          className: `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-all ${
            active ? "font-semibold" : "font-medium"
          } ${rarityFilterChip(rarity.value, active)}`,
        };
      }),
    },
  ];
  const toolbarWarnings = [
    ...(pricedOnlyUnavailable
      ? [
          "This set has no price data yet, so the priced-only filter stays visible but does not hide cards.",
        ]
      : []),
    ...(persistentFiltersHideEverything
      ? ["Saved filters matched 0 cards here, so this set is shown without them."]
      : []),
  ];

  function clearAllFilters() {
    setSearch("");
    set("defaultRarities", []);
    set("defaultSupertypes", []);
    set("showOnlyPriced", false);
  }

  return (
    <div>
      <CardBrowserToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, number, rarity..."
        resultLabel={`${filtered.length} / ${cards.length}`}
        sortSummary={sortSummary}
        priceSourceLabel={primaryPriceSource === "tcp" ? "TCGPlayer" : "CardMarket"}
        viewOptions={[
          { value: "table", label: "Table" },
          { value: "grid", label: "Grid" },
        ]}
        activeView={view}
        onViewChange={(value) => set("defaultView", value as CardView)}
        sortOptions={toolbarSortOptions}
        activeSort={sortBy}
        onSortChange={(value) => toggleSort(value as SortBy)}
        sizeOptions={toolbarSizeOptions}
        activeSize={settings.cardSize}
        onSizeChange={(value) => set("cardSize", value as CardSize)}
        filtersExpanded={filtersPanelExpanded}
        onToggleFilters={() => setFiltersExpanded((prev) => !prev)}
        filterBadgeCount={filterBadgeCount}
        hasActiveFilters={hasActiveFilters}
        onClearAll={clearAllFilters}
        activeFilters={toolbarActiveFilters}
        quickFilters={toolbarQuickFilters}
        filterSections={toolbarFilterSections}
        warnings={toolbarWarnings}
        selectionSlot={
          <div className="flex flex-wrap items-center gap-2">
            {selectionMode && (
              <>
                <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                  {selectedCardIds.length} selected
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedCardIds(filtered.map((card) => card.id))}
                  disabled={filtered.length === 0 || selectedCardIds.length === filtered.length}
                  className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/70 px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:border-black/15 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/8 dark:bg-white/[0.04] dark:text-white/60 dark:hover:border-white/16 dark:hover:text-white"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCardIds([])}
                  disabled={selectedCardIds.length === 0}
                  className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/70 px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:border-black/15 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/8 dark:bg-white/[0.04] dark:text-white/60 dark:hover:border-white/16 dark:hover:text-white"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setBulkAddOpen(true)}
                  disabled={selectedCardIds.length === 0}
                  className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Bulk add
                </button>
              </>
            )}
            <button
              type="button"
              onClick={toggleSelectionMode}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                selectionMode
                  ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                  : "border-black/8 bg-white/70 text-gray-600 hover:border-black/15 hover:text-gray-900 dark:border-white/8 dark:bg-white/[0.04] dark:text-white/60 dark:hover:border-white/16 dark:hover:text-white"
              }`}
            >
              {selectionMode ? "Done" : "Select"}
            </button>
          </div>
        }
      />

      {false && (
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
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {selectionMode && (
              <>
                <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                  {selectedCardIds.length} selected
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedCardIds(filtered.map((card) => card.id))}
                  disabled={filtered.length === 0 || selectedCardIds.length === filtered.length}
                  className="rounded-full border border-black/8 px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:border-black/18 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/8 dark:text-gray-400 dark:hover:border-white/18 dark:hover:text-white"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCardIds([])}
                  disabled={selectedCardIds.length === 0}
                  className="rounded-full border border-black/8 px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:border-black/18 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/8 dark:text-gray-400 dark:hover:border-white/18 dark:hover:text-white"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setBulkAddOpen(true)}
                  disabled={selectedCardIds.length === 0}
                  className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Bulk add
                </button>
              </>
            )}
            <button
              type="button"
              onClick={toggleSelectionMode}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                selectionMode
                  ? "border-blue-500/35 bg-blue-500/12 text-blue-700 dark:text-blue-300"
                  : "border-black/8 text-gray-500 hover:border-black/18 hover:text-gray-900 dark:border-white/8 dark:text-gray-400 dark:hover:border-white/18 dark:hover:text-white"
              }`}
            >
              {selectionMode ? "Done" : "Select"}
            </button>
          </div>
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
          {availableRarities.map((rarity) => {
            const active = activeRarities.includes(rarity.value);

            return (
              <button
                key={rarity.value}
                type="button"
                aria-pressed={active}
                onClick={() => toggleRarity(rarity.value)}
                className={`rounded-full border px-2.5 py-1 text-xs leading-none transition-all ${
                  active ? "font-semibold" : "font-medium"
                } ${rarityFilterChip(rarity.value, active)}`}
              >
                <span>{rarity.value}</span>
              </button>
            );
          })}
          {availableRarities.length > 0 && availableSupertypes.length > 0 && (
            <div className="w-px h-3.5 bg-black/10 dark:bg-white/10" />
          )}
          {availableSupertypes.map((supertype) => {
            const active = activeSupertypes.includes(supertype.value);

            return (
              <button
                key={supertype.value}
                type="button"
                aria-pressed={active}
                onClick={() => toggleSupertype(supertype.value)}
                className={`rounded-full border px-2.5 py-1 text-xs leading-none transition-all ${
                  active ? "font-semibold" : "font-medium"
                } ${neutralFilterChip(active)}`}
              >
                <span>{supertype.value}</span>
              </button>
            );
          })}
          {(availableRarities.length > 0 || availableSupertypes.length > 0) && (
            <div className="w-px h-3.5 bg-black/10 dark:bg-white/10" />
          )}
          <button
            type="button"
            aria-pressed={onlyPriced}
            onClick={() => {
              set("showOnlyPriced", !onlyPriced);
            }}
            className={`rounded-full border px-2.5 py-1 text-xs leading-none transition-all ${
              effectiveOnlyPriced ? "font-semibold" : "font-medium"
            } ${neutralFilterChip(effectiveOnlyPriced)}`}
          >
            <span>{pricedOnlyUnavailable ? "No prices yet" : "Priced only"}</span>
          </button>
        </div>
        {pricedOnlyUnavailable && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            This set has no price data yet, so all cards are shown.
          </p>
        )}
        {persistentFiltersHideEverything && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Saved filters matched 0 cards here, so this set is shown without them.
          </p>
        )}
        </div>
      )}

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
                {filtered.map((card, index) => {
                  const tableSelected = selectedCardIdSet.has(card.id);

                  return (
                    <tr
                      key={card.id}
                      onClick={() => handleCardClick(card)}
                      className={`group border-b border-black/4 dark:border-white/6 last:border-0 transition-colors cursor-pointer ${
                        tableSelected
                          ? "bg-blue-500/[0.09] dark:bg-blue-400/[0.14]"
                          : index % 2 === 0
                            ? "hover:bg-black/3 dark:hover:bg-white/5"
                            : "bg-black/[0.015] hover:bg-black/[0.03] dark:bg-white/[0.025] dark:hover:bg-white/[0.06]"
                      }`}
                    >
                      <td className="px-5 py-3 text-gray-400 dark:text-white/30 tabular-nums text-xs">
                        <span>{card.card_number ?? "--"}</span>
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
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-semibold text-gray-900 dark:text-white">{card.name}</span>
                          </div>
                          {!selectionMode && (
                          <CollectionAddCardButton
                            card={{
                              id: card.id,
                              name: card.name,
                              image_url: card.image_url,
                              episode: getCollectionEpisodeForCard(card),
                            }}
                            className="h-7 w-7 shrink-0 rounded-md"
                          />
                        )}
                        </div>
                        {showEpisodeMeta && hasCardEpisodeMeta(card) && (
                          <div className="mt-1">
                            <Link
                              href={`/expansions/${card.episode_id}`}
                              onClick={(event) => event.stopPropagation()}
                              className="text-xs font-medium text-gray-400 transition-colors hover:text-gray-700 hover:underline underline-offset-2 dark:text-gray-500 dark:hover:text-gray-300"
                            >
                              {card.episode_name}
                              {card.episode_code ? (
                                <span className="ml-1 opacity-60">({card.episode_code})</span>
                              ) : null}
                            </Link>
                          </div>
                        )}
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
                  );
                })}
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
            const gridSelected = selectedCardIdSet.has(card.id);
            return (
              <div
                key={card.id}
                className="flex flex-col gap-1.5 cursor-pointer"
                onClick={() => handleCardClick(card)}
              >
                <div
                  className={`relative w-full aspect-[63/88] overflow-hidden rounded-xl border transition-all duration-200 ${
                    gridSelected
                      ? "border-blue-400/80 shadow-lg shadow-blue-500/25 ring-2 ring-blue-400/80"
                      : "border-transparent shadow-md shadow-black/20 hover:scale-[1.03] hover:shadow-xl hover:shadow-black/30"
                  }`}
                >
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

                  {gridSelected && <div className="pointer-events-none absolute inset-0 bg-blue-500/10" />}
                </div>
                <div className="mt-2 px-0.5">
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold leading-snug text-gray-900 dark:text-white">
                        {card.name}
                      </p>
                      <div className="mt-0.5 space-y-0.5">
                        <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                          {card.card_number ? `#${card.card_number}` : "--"}
                        </span>
                        {showEpisodeMeta && hasCardEpisodeMeta(card) && (
                          <Link
                            href={`/expansions/${card.episode_id}`}
                            onClick={(event) => event.stopPropagation()}
                            className="block truncate text-[11px] font-medium text-gray-400 transition-colors hover:text-gray-700 hover:underline underline-offset-2 dark:text-gray-500 dark:hover:text-gray-300"
                          >
                            {card.episode_name}
                            {card.episode_code ? (
                              <span className="ml-1 opacity-60">({card.episode_code})</span>
                            ) : null}
                          </Link>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {gridPrice != null ? (
                        <span className="text-[15px] font-semibold tabular-nums text-gray-900 dark:text-white">
                          {primaryPriceSource === "tcp"
                            ? `TCP ${formatCurrency(gridPrice, gridCurrency)}`
                            : formatCurrency(gridPrice, gridCurrency)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">No price</span>
                      )}

                      {!selectionMode && (
                        <CollectionAddCardButton
                          card={{
                            id: card.id,
                            name: card.name,
                            image_url: card.image_url,
                            episode: getCollectionEpisodeForCard(card),
                          }}
                          className="h-[22px] w-[22px] shrink-0 rounded-md border-black/8 bg-black/5 text-gray-900 hover:border-black/15 hover:bg-black/8 dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:bg-white/12"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {bulkAddOpen && (
        <CollectionBulkAddCardsModal
          cards={selectedCards.map((card) => ({
            id: card.id,
            name: card.name,
            image_url: card.image_url,
            episode: getCollectionEpisodeForCard(card),
          }))}
          onClose={() => setBulkAddOpen(false)}
          onAdded={() => {
            setBulkAddOpen(false);
            setSelectionMode(false);
            setSelectedCardIds([]);
          }}
        />
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
          const selectedDetails = cardDetailsById[selected.id] ?? null;
          const selectedPrice = selectedDetails?.price ?? selected.price;
          const selectedGradedPrices =
            selectedDetails?.graded_prices ?? selected.graded_prices ?? [];
          const selectedPriceFetchedAt = selectedDetails?.price_fetched_at ?? selected.price_fetched_at;
          const selectedPriceSourceStatus =
            selectedDetails?.price_source_status ?? selected.price_source_status;
          const selectedPriceSourceCheckedAt =
            selectedDetails?.price_source_checked_at ?? selected.price_source_checked_at;
          const selectedCardMarketUrl =
            selectedDetails?.cardmarket_url != null
              ? getResolvedCardMarketUrl({
                  ...selected,
                  cardmarket_url: selectedDetails.cardmarket_url,
                })
              : getResolvedCardMarketUrl(selected);
          const selectedTcgPlayerHistory = (selectedDetails?.price_history ?? []).map((point) => ({
            date: point.date,
            label: point.label,
            value: point.tcp_market,
          }));
          const availableCardMarketHistorySeries = CARD_MARKET_HISTORY_SERIES.filter((series) =>
            hasCardMarketHistorySeries(selectedDetails?.price_history ?? [], series.key)
          );
          const activeCardMarketHistorySeries = availableCardMarketHistorySeries.some(
            (series) => series.key === cardMarketHistorySeries
          )
            ? cardMarketHistorySeries
            : availableCardMarketHistorySeries[0]?.key ?? "cm_market_en";
          const selectedLocalizedCardMarketHistory = (
            selectedDetails?.price_history ?? []
          ).map((point) => ({
            date: point.date,
            label: point.label,
            value:
              availableCardMarketHistorySeries.length > 0
                ? getCardMarketHistorySeriesValue(point, activeCardMarketHistorySeries)
                : point.cm_market,
          }));
          const activeCardMarketCurrentValue =
            availableCardMarketHistorySeries.length > 0
              ? getCardMarketHistorySeriesCurrentValue(
                  selectedPrice,
                  activeCardMarketHistorySeries
                )
              : selectedPrice?.cm_en_lowest_nm ??
                selectedPrice?.cm_de_lowest_nm ??
                selectedPrice?.cm_fr_lowest_nm ??
                selectedPrice?.cm_es_lowest_nm ??
                selectedPrice?.cm_it_lowest_nm ??
                null;
          const wide = settings.widescreen;
          const imgW =
            ms === "small"
              ? wide
                ? "w-80 sm:w-[22rem] xl:w-[24rem]"
                : "w-44 sm:w-48"
              : ms === "large"
                ? wide
                  ? "w-[24rem] sm:w-[28rem] xl:w-[32rem]"
                  : "w-56 sm:w-72 xl:w-80"
                : wide
                  ? "w-[22rem] sm:w-[25rem] xl:w-[28rem]"
                  : "w-52 sm:w-64";
          const imgSize =
            ms === "small"
              ? wide
                ? "320px"
                : "192px"
              : ms === "large"
                ? wide
                  ? "496px"
                  : "320px"
                : wide
                  ? "432px"
                  : "256px";
          const maxW =
            ms === "small"
              ? wide
                ? "max-w-[70rem]"
                : "max-w-xl"
              : ms === "large"
                ? wide
                  ? "max-w-[84rem]"
                  : "max-w-5xl"
                : wide
                  ? "max-w-[76rem]"
                  : "max-w-4xl";
          const pad =
            ms === "small"
              ? wide
                ? "p-7"
                : "p-6"
              : ms === "large"
                ? wide
                  ? "p-9 sm:p-10"
                  : "p-8 sm:p-9"
                : wide
                  ? "p-8 sm:p-9"
                  : "p-7";
          const gap =
            ms === "small"
              ? wide
                ? "gap-4"
                : "gap-5"
              : ms === "large"
                ? wide
                  ? "gap-5"
                  : "gap-8"
                : wide
                  ? "gap-4"
                  : "gap-7";
          const contentWidthCls =
            ms === "small" ? "sm:w-[31rem]" : ms === "large" ? "sm:w-[35rem]" : "sm:w-[33rem]";
          const layoutCls = wide
            ? "flex flex-col sm:grid sm:grid-cols-[auto_auto] sm:items-start"
            : "flex flex-col sm:flex-row sm:items-start";
          const mediaColCls = wide
            ? `shrink-0 ${imgW} mx-auto sm:mx-0 sm:self-start`
            : `shrink-0 ${imgW} mx-auto sm:mx-0`;
          const contentCls = wide
            ? `w-full min-w-0 flex flex-col gap-3 ${contentWidthCls}`
            : "flex-1 min-w-0 flex flex-col gap-4";
          const titleCls = ms === "small" ? "text-2xl" : ms === "large" ? "text-4xl" : "text-3xl";
          const priceCls = ms === "small" ? "text-sm" : ms === "large" ? "text-base" : "text-[15px]";
          const metaCls = ms === "small" ? "text-sm" : ms === "large" ? "text-base" : "text-[15px]";

          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-6"
              style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)" }}
              onClick={() => {
                setRefreshError(null);
                setSelected(null);
              }}
            >
              <div
                className={`${maxW} glass w-full sm:w-auto rounded-3xl shadow-2xl shadow-black/45 overflow-hidden`}
                style={{
                  background: "rgba(12,12,14,0.82)",
                  border: "1px solid rgba(255,255,255,0.14)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={`${layoutCls} ${gap} ${pad}`}>
                  <div className={mediaColCls}>
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

                  <div className={contentCls}>
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className={`${titleCls} font-bold text-white leading-tight`}>
                            {selected.name}
                          </h2>
                          <div className={`mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-white/50 ${metaCls}`}>
                            {selected.card_number && <span>#{selected.card_number}</span>}
                            {selected.supertype && <span>{selected.supertype}</span>}
                            {selected.subtypes && <span>{selected.subtypes}</span>}
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
                        <div className="flex shrink-0 flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void runSelectedCardAction("sync-history")}
                            disabled={
                              refreshingCardId === selected.id ||
                              syncingHistoryCardId === selected.id
                            }
                            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-white/82 transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <LineChart
                              className={`h-4 w-4 ${syncingHistoryCardId === selected.id ? "animate-pulse" : ""}`}
                            />
                            {syncingHistoryCardId === selected.id ? "Syncing..." : "Sync History"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void runSelectedCardAction("refresh")}
                            disabled={
                              refreshingCardId === selected.id ||
                              syncingHistoryCardId === selected.id
                            }
                            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-white/82 transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <RefreshCw
                              className={`h-4 w-4 ${refreshingCardId === selected.id ? "animate-spin" : ""}`}
                            />
                            {refreshingCardId === selected.id ? "Refreshing..." : "Refresh"}
                          </button>
                        </div>
                      </div>
                      {refreshError && (
                        <p className="mt-2 text-xs text-rose-300">{refreshError}</p>
                      )}
                    </div>

                    <div className={`grid grid-cols-2 gap-2.5 ${priceCls}`}>
                      <div className="flex flex-col gap-2">
                        {[
                          {
                            label: "CardMarket",
                            val: selectedPrice?.cm_en_lowest_nm,
                            currency: "EUR" as const,
                          },
                          { label: "7d avg", val: selectedPrice?.cm_en_avg_7d, currency: "EUR" as const },
                          { label: "30d avg", val: selectedPrice?.cm_en_avg_30d, currency: "EUR" as const },
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
                          { label: "TCGPlayer", val: selectedPrice?.tcp_market, currency: "USD" as const },
                          { label: "TCP Mid", val: selectedPrice?.tcp_mid, currency: "USD" as const },
                          { label: "TCP Low", val: selectedPrice?.tcp_low, currency: "USD" as const },
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

                    {selectedGradedPrices.length > 0 && (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/42">
                          Graded
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {selectedGradedPrices.map((gradedPrice) => (
                            <div
                              key={gradedPrice.label}
                              className="flex items-center justify-between rounded-xl px-3 py-2"
                              style={{ background: "rgba(255,255,255,0.06)" }}
                            >
                              <span className="text-sm text-white/56">{gradedPrice.label}</span>
                              <span className="text-sm font-bold tabular-nums text-white">
                                {formatCurrency(gradedPrice.price, "EUR")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="space-y-2">
                        {availableCardMarketHistorySeries.length > 1 && (
                          <div className="flex flex-wrap gap-1.5">
                            {availableCardMarketHistorySeries.map((series) => (
                              <button
                                key={series.key}
                                type="button"
                                onClick={() => setCardMarketHistorySeries(series.key)}
                                className={`rounded-full border px-2.5 py-1 text-[11px] leading-none transition-all ${
                                  activeCardMarketHistorySeries === series.key
                                    ? "border-white/28 bg-white/14 font-semibold text-white"
                                    : "border-white/10 text-white/52 hover:border-white/18 hover:text-white/78"
                                }`}
                              >
                                {series.label}
                              </button>
                            ))}
                          </div>
                        )}
                        <PriceHistoryPanel
                          title={
                            availableCardMarketHistorySeries.length > 0
                              ? `CardMarket History (${availableCardMarketHistorySeries.find((series) => series.key === activeCardMarketHistorySeries)?.label ?? "EN"})`
                              : "CardMarket History"
                          }
                          currency="EUR"
                          points={selectedLocalizedCardMarketHistory}
                          currentValue={activeCardMarketCurrentValue}
                          tone="dark"
                          loading={loadingDetailsId === selected.id && !selectedDetails}
                          compact
                        />
                      </div>
                      <PriceHistoryPanel
                        title="TCGPlayer History"
                        currency="USD"
                        points={selectedTcgPlayerHistory}
                        currentValue={selectedPrice?.tcp_market ?? null}
                        tone="dark"
                        loading={loadingDetailsId === selected.id && !selectedDetails}
                        compact
                      />
                    </div>

                    <PriceRefreshCountdown
                      rarity={selected.rarity}
                      priceFetchedAt={selectedPriceFetchedAt}
                      priceSourceStatus={selectedPriceSourceStatus}
                      priceSourceCheckedAt={selectedPriceSourceCheckedAt}
                    />

                    {selected.artist && (
                      <p className="text-sm text-white/40">
                        Illus.{" "}
                        <IllustratorLink
                          artist={selected.artist}
                          className="text-white/70 transition-colors hover:text-white hover:underline underline-offset-2"
                        />
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 px-6 pb-6">
                  <CollectionAddCardButton
                    card={{
                      id: selected.id,
                      name: selected.name,
                      image_url: selected.image_url,
                      episode: getCollectionEpisodeForCard(selected),
                    }}
                    mode="button"
                    theme="dark"
                    label="Add to DustyCards"
                    className="flex-1 rounded-2xl"
                  />
                  {selectedCardMarketUrl ? (
                    <a
                      href={selectedCardMarketUrl}
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
                    onClick={() => {
                      setRefreshError(null);
                      setSelected(null);
                    }}
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
          card={cardDetailsById[threeDCard.id] ? mergeCardWithDetails(threeDCard, cardDetailsById[threeDCard.id]) : threeDCard}
          frontImageUrl={threeDCard.image_url}
          cardMarketUrl={getResolvedCardMarketUrl(threeDCard)}
          onClose={() => setThreeDCard(null)}
        />
      )}
    </div>
  );
}
