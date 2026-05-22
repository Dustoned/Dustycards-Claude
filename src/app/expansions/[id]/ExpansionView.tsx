"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { KNOWN_RARITY_ORDER, normalizeRarityLabel } from "@/lib/rarity";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";
import type { ModalCardData } from "@/components/card-modal/types";
import { getCardGridImageSizes, getCardGridTemplateColumns } from "@/lib/display-scale";
import { formatCurrency } from "@/lib/format";
import { getCachedImageUrl } from "@/lib/image-cache";
import { getCardImageClassName, getCardImageFrameClassName } from "@/lib/card-image-display";
import { getExpansionHref } from "@/lib/games";
import { useIncrementalItems } from "@/lib/use-incremental-items";
import { rarityBadge } from "@/lib/rarity-styles";
import {
  cardNumberCollator,
  compareCardNumbers,
  comparePriceValues,
  formatSortSummary,
  getCardMarketPrice,
  getDefaultSortDir,
  getPriceBySource,
  getPriceSourceCurrency,
  getSortPrice,
  hasAnyVisiblePrice,
  neutralFilterChip,
  rarityFilterChip,
} from "./expansion-view-helpers";
import CardBrowserToolbar, {
  type CardBrowserToolbarActiveFilter,
  type CardBrowserToolbarFilterOption,
  type CardBrowserToolbarFilterSection,
  type CardBrowserToolbarOption,
} from "@/components/CardBrowserToolbar";
import { cardMatchesSearchQuery } from "@/lib/card-search";
import {
  useSettings,
  CardView,
  CardSize,
  SortBy,
  SortDir,
} from "@/components/SettingsProvider";
import type { CardData } from "@/types/card-data";

const CardModal = dynamic(() => import("@/components/CardModal"), {
  ssr: false,
  loading: () => null,
});
const CollectionBulkAddCardsModal = dynamic(
  () => import("@/components/CollectionBulkAddCardsModal"),
  {
    ssr: false,
    loading: () => null,
  }
);

export type { CardData } from "@/types/card-data";

type CardDetailData = ModalCardData;

const KNOWN_SUPERTYPE_ORDER = ["Pokémon", "Trainer", "Energy"];
const INITIAL_IMAGE_PRELOAD_COUNT = 8;
const DESKTOP_BACKGROUND_IMAGE_PRELOAD_LIMIT = 24;
const BACKGROUND_IMAGE_PRELOAD_BATCH = 8;
const BACKGROUND_IMAGE_PRELOAD_DELAY_MS = 900;
const WARMED_CARD_IMAGE_CACHE_LIMIT = 600;
const INITIAL_RENDERED_CARDS = 36;
const RENDERED_CARD_BATCH_SIZE = 36;
const EAGER_IMAGE_COUNT = 8;
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
  warmCardImages?: boolean;
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

function buildModalCardData(
  card: CardData,
  episodeFallback: { id: string; name: string; code: string | null },
  details?: CardDetailData | null
): ModalCardData {
  if (details) {
    return details;
  }

  return {
    id: card.id,
    name: card.name,
    card_number: card.card_number,
    rarity: card.rarity,
    hp: card.hp,
    image_url: card.image_url,
    supertype: card.supertype,
    subtypes: card.subtypes,
    artist: card.artist,
    cardmarket_id: card.cardmarket_id,
    cardmarket_url: card.cardmarket_url,
    tcggo_url: card.tcggo_url,
    episode_id: card.episode_id ?? episodeFallback.id,
    episode_name: card.episode_name ?? episodeFallback.name,
    episode_code: card.episode_code ?? episodeFallback.code,
    price_source_status: card.price_source_status,
    price_source_checked_at: card.price_source_checked_at,
    price_fetched_at: card.price_fetched_at,
    price: card.price,
    graded_prices: card.graded_prices ?? [],
    ebay_sold_graded_prices: card.ebay_sold_graded_prices ?? [],
    price_history: [],
    pull_rate_info: card.pull_rate_info ?? null,
    collection_item: null,
  };
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
  image.src = getCachedImageUrl(url) ?? url;
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

function shouldWarmBackgroundCardImages(isMobileViewport: boolean): boolean {
  if (isMobileViewport || typeof navigator === "undefined") return false;

  const connection = (
    navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean };
    }
  ).connection;

  return !connection?.saveData && !/2g/i.test(connection?.effectiveType ?? "");
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

export default function ExpansionView({
  cards,
  episode,
  onVisibleCardsChange,
  warmCardImages = true,
}: Props) {
  const { settings, displaySettings, isMobileViewport, set, setDisplay } = useSettings();
  const [search, setSearch] = useState("");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [selected, setSelected] = useState<CardData | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [cardDetailsById, setCardDetailsById] = useState<Record<string, CardDetailData>>({});
  const lastNotifiedVisibleCardsRef = useRef<readonly CardData[] | null>(null);
  const view: Exclude<CardView, "binder"> =
    displaySettings.defaultView === "binder" ? "grid" : displaySettings.defaultView;
  const rarities = settings.defaultRarities;
  const supertypes = settings.defaultSupertypes;
  const onlyPriced = settings.showOnlyPriced;
  const primaryPriceSource = settings.primaryPriceSource;
  const sortBy = settings.sortBy;
  const sortDir = settings.sortDir;
  const collectionEpisode = useMemo(
    () =>
      episode ?? {
        id: "",
        name: "",
        code: null,
      },
    [episode]
  );
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
    if (!warmCardImages) return;

    const imageUrls = getUniqueCardImageUrls(cards);
    if (imageUrls.length === 0) return;

    imageUrls
      .slice(0, INITIAL_IMAGE_PRELOAD_COUNT)
      .forEach((url) => warmCardImage(url, "auto"));

    const remaining = shouldWarmBackgroundCardImages(isMobileViewport)
      ? imageUrls.slice(
          INITIAL_IMAGE_PRELOAD_COUNT,
          INITIAL_IMAGE_PRELOAD_COUNT + DESKTOP_BACKGROUND_IMAGE_PRELOAD_LIMIT
        )
      : [];
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
  }, [cards, isMobileViewport, warmCardImages]);

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
      }
    })();

    return () => {
      controller.abort();
    };
  }, [selected, cardDetailsById]);

  function openDetails(card: CardData) {
    setSelected(card);
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

  function closeDetails() {
    if (selected) {
      setCardDetailsById((prev) => {
        if (!(selected.id in prev)) {
          return prev;
        }

        const next = { ...prev };
        delete next[selected.id];
        return next;
      });
    }

    setSelected(null);
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
        if (
          !cardMatchesSearchQuery(
            {
              name: card.name,
              cardNumber: card.card_number,
              episodeName: card.episode_name,
              episodeCode: card.episode_code,
              rarity: card.rarity,
            },
            normalizedSearch
          )
        ) {
          return false;
        }
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
  const selectedDetails = selected ? cardDetailsById[selected.id] ?? null : null;
  const selectedModalCard = useMemo(
    () =>
      selected
        ? buildModalCardData(selected, collectionEpisode, selectedDetails)
        : null,
    [collectionEpisode, selected, selectedDetails]
  );
  const cardTrackWidth = getCardGridImageSizes(
    displaySettings.cardSize,
    displaySettings.widescreen,
    isMobileViewport
  );
  const gridTemplateColumns = getCardGridTemplateColumns(
    displaySettings.cardSize,
    displaySettings.widescreen,
    isMobileViewport
  );
  const gridGapClass = isMobileViewport
    ? displaySettings.cardSize === "large"
      ? "gap-x-0 gap-y-5"
      : displaySettings.cardSize === "medium"
        ? "gap-x-3 gap-y-4"
        : "gap-x-2 gap-y-3"
    : "gap-2";
  const compactFourColumnGrid = isMobileViewport && displaySettings.cardSize === "xsmall";
  const renderedCards = useIncrementalItems(filtered, {
    initialCount: isMobileViewport ? 28 : INITIAL_RENDERED_CARDS,
    batchSize: isMobileViewport ? 24 : RENDERED_CARD_BATCH_SIZE,
    delayMs: 80,
  });
  const eagerImageCount = isMobileViewport ? 2 : EAGER_IMAGE_COUNT;
  const hasPendingRenderedCards = renderedCards.length < filtered.length;

  useEffect(() => {
    if (!onVisibleCardsChange || lastNotifiedVisibleCardsRef.current === filtered) return;

    lastNotifiedVisibleCardsRef.current = filtered;
    onVisibleCardsChange(filtered);
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
    { value: "large", label: isMobileViewport ? "1" : "Large" },
    { value: "medium", label: isMobileViewport ? "2" : "Medium" },
    { value: "small", label: isMobileViewport ? "3" : "Small" },
    ...(isMobileViewport ? [{ value: "xsmall" as const, label: "4" }] : []),
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
    {
      value: "large",
      label: isMobileViewport ? "1" : "Large",
      title: isMobileViewport ? "Show one card per row" : "Large card tiles",
    },
    {
      value: "medium",
      label: isMobileViewport ? "2" : "Medium",
      title: isMobileViewport ? "Show two cards per row" : "Medium card tiles",
    },
    {
      value: "small",
      label: isMobileViewport ? "3" : "Small",
      title: isMobileViewport ? "Show three cards per row" : "Small card tiles",
    },
    ...(isMobileViewport
      ? [{ value: "xsmall", label: "4", title: "Show four cards per row" }]
      : []),
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
      className: `inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full border px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] leading-none transition-all ${
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
        className: `inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full border px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] leading-none transition-all ${
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
          className: `inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full border px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] leading-none transition-all ${
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
        onViewChange={(value) => setDisplay("defaultView", value as CardView)}
        sortOptions={toolbarSortOptions}
        activeSort={sortBy}
        onSortChange={(value) => toggleSort(value as SortBy)}
        sizeOptions={toolbarSizeOptions}
        activeSize={displaySettings.cardSize}
        onSizeChange={(value) => setDisplay("cardSize", value as CardSize)}
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
                <span className="inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full border border-blue-500/25 bg-blue-500/10 px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-blue-700 dark:text-blue-300">
                  {selectedCardIds.length} selected
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedCardIds(filtered.map((card) => card.id))}
                  disabled={filtered.length === 0 || selectedCardIds.length === filtered.length}
                  className="inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full border border-white/8 bg-white/[0.045] px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-white/62 transition-colors hover:border-white/16 hover:bg-white/[0.075] hover:text-white disabled:cursor-not-allowed disabled:bg-white/[0.025] disabled:text-white/32"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCardIds([])}
                  disabled={selectedCardIds.length === 0}
                  className="inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full border border-white/8 bg-white/[0.045] px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-white/62 transition-colors hover:border-white/16 hover:bg-white/[0.075] hover:text-white disabled:cursor-not-allowed disabled:bg-white/[0.025] disabled:text-white/32"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setBulkAddOpen(true)}
                  disabled={selectedCardIds.length === 0}
                  className="inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full bg-blue-600 px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Bulk add
                </button>
              </>
            )}
            <button
              type="button"
              onClick={toggleSelectionMode}
              className={`inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full border px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none transition-colors ${
                selectionMode
                  ? "border-violet-400/40 bg-violet-600 text-white"
                  : "border-white/8 bg-white/[0.045] text-white/62 hover:border-white/16 hover:bg-white/[0.075] hover:text-white"
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
                  onClick={() => setDisplay("cardSize", option.value)}
                  className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    displaySettings.cardSize === option.value
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
                className={`inline-flex min-h-[var(--ui-chip-min-height)] items-center rounded-full border px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] leading-none transition-all ${
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
                className={`inline-flex min-h-[var(--ui-chip-min-height)] items-center rounded-full border px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] leading-none transition-all ${
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
            className={`inline-flex min-h-[var(--ui-chip-min-height)] items-center rounded-full border px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] leading-none transition-all ${
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
        <div className="space-y-2">
          <div className="grid gap-2 md:hidden">
            {renderedCards.map((card, index) => {
              const tableSelected = selectedCardIdSet.has(card.id);
              const cardMarketPrice = getCardMarketPrice(card);
              const tcgPlayerPrice = card.price?.tcp_market ?? null;

              return (
                <article
                  key={card.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleCardClick(card)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleCardClick(card);
                    }
                  }}
                  className={`min-w-0 rounded-2xl border bg-white/72 p-3 shadow-sm shadow-black/5 transition-colors dark:bg-white/[0.045] ${
                    tableSelected
                      ? "border-blue-400/70 ring-2 ring-blue-400/50"
                      : "border-black/8 dark:border-white/8"
                  }`}
                  style={{
                    contain: "layout paint style",
                    contentVisibility: "auto",
                    containIntrinsicSize: "112px",
                  }}
                >
                  <div className="flex gap-3">
                    <div
                      className={getCardImageFrameClassName(
                        card.image_url,
                        "relative h-24 w-[4.25rem] shrink-0 overflow-hidden rounded-[4.75%] border border-transparent bg-transparent"
                      )}
                    >
                      {card.image_url ? (
                        <Image
                          src={getCachedImageUrl(card.image_url) ?? card.image_url}
                          alt={card.name}
                          fill
                          className={getCardImageClassName(
                            card.image_url,
                            "rounded-[4.75%] object-fill"
                          )}
                          sizes="68px"
                          loading={index < eagerImageCount ? "eager" : undefined}
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-gray-400 dark:text-white/35">
                          {card.name.slice(0, 2)}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-950 dark:text-white">
                            {card.name}
                          </p>
                          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-gray-500 dark:text-white/50">
                            <span className="shrink-0">
                              {card.card_number ? `#${card.card_number}` : "--"}
                            </span>
                            {showEpisodeMeta && hasCardEpisodeMeta(card) ? (
                              <>
                                <span className="text-gray-300 dark:text-white/20">•</span>
                                <Link
                                  href={getExpansionHref(card.episode_id)}
                                  prefetch={false}
                                  onClick={(event) => event.stopPropagation()}
                                  className="min-w-0 truncate transition-colors hover:text-gray-900 hover:underline underline-offset-2 dark:hover:text-white"
                                >
                                  {card.episode_name}
                                  {card.episode_code ? (
                                    <span className="ml-1 opacity-60">({card.episode_code})</span>
                                  ) : null}
                                </Link>
                              </>
                            ) : null}
                          </div>
                        </div>

                        {!selectionMode && (
                          <CollectionAddCardButton
                            card={{
                              id: card.id,
                              name: card.name,
                              image_url: card.image_url,
                              episode: getCollectionEpisodeForCard(card),
                            }}
                            className="h-8 w-8 shrink-0 rounded-lg border-black/8 bg-black/5 text-gray-900 hover:border-black/15 hover:bg-black/8 dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:bg-white/12"
                          />
                        )}
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl border border-black/7 bg-black/[0.025] px-2.5 py-2 dark:border-white/8 dark:bg-white/[0.04]">
                          <p className="font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-white/35">
                            CardMarket
                          </p>
                          <p className="mt-1 whitespace-nowrap font-semibold tabular-nums text-gray-950 dark:text-white">
                            {cardMarketPrice != null
                              ? formatCurrency(cardMarketPrice, "EUR")
                              : "No price"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-black/7 bg-black/[0.025] px-2.5 py-2 dark:border-white/8 dark:bg-white/[0.04]">
                          <p className="font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-white/35">
                            TCGPlayer
                          </p>
                          <p className="mt-1 whitespace-nowrap font-semibold tabular-nums text-gray-950 dark:text-white">
                            {tcgPlayerPrice != null
                              ? formatCurrency(tcgPlayerPrice, "USD")
                              : "No price"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {card.rarity ? (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold leading-none ${rarityBadge(card.rarity)}`}
                          >
                            {normalizeRarityLabel(card.rarity) ?? card.rarity}
                          </span>
                        ) : null}
                        <span className="inline-flex items-center rounded-full border border-black/8 bg-white/70 px-2 py-1 text-[11px] font-medium text-gray-500 dark:border-white/8 dark:bg-white/[0.04] dark:text-white/55">
                          Tap for details
                        </span>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="glass hidden overflow-hidden rounded-3xl shadow-lg shadow-black/5 md:block">
            <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-black/6 dark:border-white/6 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-4">Card</th>
                  <th className="px-4 py-4">Rarity</th>
                  <th className="px-4 py-4">CardMarket</th>
                  <th className="px-4 py-4">TCGPlayer</th>
                  <th className="px-4 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {renderedCards.map((card, index) => {
                  const tableSelected = selectedCardIdSet.has(card.id);

                  return (
                    <tr
                      key={card.id}
                      onClick={() => handleCardClick(card)}
                      className={`border-b border-black/6 transition-colors last:border-b-0 dark:border-white/6 cursor-pointer ${
                        tableSelected
                          ? "bg-blue-500/10"
                          : "hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={getCardImageFrameClassName(
                              card.image_url,
                              "relative h-16 w-12 shrink-0 overflow-hidden rounded-[4.75%] border border-transparent bg-transparent"
                            )}
                          >
                            {card.image_url ? (
                              <Image
                                src={getCachedImageUrl(card.image_url) ?? card.image_url}
                                alt={card.name}
                                fill
                                className={getCardImageClassName(
                                  card.image_url,
                                  "rounded-[4.75%] object-fill"
                                )}
                                sizes="48px"
                                loading={index < eagerImageCount ? "eager" : undefined}
                                unoptimized
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs text-gray-400 dark:text-white/35">
                                {card.name.slice(0, 2)}
                              </div>
                            )}
                          </div>

                          <div className="min-w-0">
                            <p className="truncate font-semibold text-gray-900 dark:text-white">
                              {card.name}
                            </p>
                            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-white/50">
                              <span>{card.card_number ? `#${card.card_number}` : "--"}</span>
                              {showEpisodeMeta && hasCardEpisodeMeta(card) ? (
                                <>
                                  <span className="text-gray-300 dark:text-white/20">•</span>
                                  <Link
                                    href={getExpansionHref(card.episode_id)}
                                    prefetch={false}
                                    onClick={(event) => event.stopPropagation()}
                                    className="truncate transition-colors hover:text-gray-900 hover:underline underline-offset-2 dark:hover:text-white"
                                  >
                                    {card.episode_name}
                                    {card.episode_code ? (
                                      <span className="ml-1 opacity-60">({card.episode_code})</span>
                                    ) : null}
                                  </Link>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {card.rarity ? (
                          <span
                            className={`inline-flex items-center rounded-full px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none ${rarityBadge(
                              card.rarity
                            )}`}
                          >
                            {normalizeRarityLabel(card.rarity) ?? card.rarity}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-white/35">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {getCardMarketPrice(card) != null ? (
                          <p className="font-semibold tabular-nums text-gray-900 dark:text-white">
                            {formatCurrency(getCardMarketPrice(card), "EUR")}
                          </p>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-white/35">
                            No price
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {card.price?.tcp_market != null ? (
                          <p className="font-semibold tabular-nums text-gray-900 dark:text-white">
                            {formatCurrency(card.price?.tcp_market, "USD")}
                          </p>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-white/35">
                            No price
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          {!selectionMode && (
                            <CollectionAddCardButton
                              card={{
                                id: card.id,
                                name: card.name,
                                image_url: card.image_url,
                                episode: getCollectionEpisodeForCard(card),
                              }}
                              className="h-[28px] w-[28px] rounded-md border-black/8 bg-black/5 text-gray-900 hover:border-black/15 hover:bg-black/8 dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:bg-white/12"
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {view === "grid" && (
        <div
          className={`grid ${gridGapClass}`}
          style={{
            gridTemplateColumns,
            justifyContent: "stretch",
          }}
        >
          {renderedCards.map((card, index) => {
            const gridPrice = getPriceBySource(card, primaryPriceSource);
            const gridCurrency = getPriceSourceCurrency(primaryPriceSource);
            const gridSelected = selectedCardIdSet.has(card.id);
            return (
              <div
                key={card.id}
                role="button"
                tabIndex={0}
                className="group flex cursor-pointer flex-col gap-1.5 text-left outline-none"
                style={{
                  contain: "layout paint style",
                  contentVisibility: "auto",
                  containIntrinsicSize: isMobileViewport ? "240px" : "300px",
                }}
                onClick={() => handleCardClick(card)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleCardClick(card);
                  }
                }}
              >
                <div
                  className={getCardImageFrameClassName(
                    card.image_url,
                    `relative aspect-[63/88] w-full overflow-hidden rounded-[4.75%] bg-transparent transition-all duration-200 ${
                      gridSelected
                        ? "drop-shadow-[0_12px_24px_rgba(59,130,246,0.32)] ring-2 ring-blue-400/80"
                        : "drop-shadow-[0_10px_18px_rgba(0,0,0,0.22)] group-hover:scale-[1.02] group-hover:drop-shadow-[0_14px_26px_rgba(0,0,0,0.32)]"
                    }`
                  )}
                >
                  {card.image_url ? (
                    <Image
                      src={getCachedImageUrl(card.image_url) ?? card.image_url}
                      alt={card.name}
                      fill
                      className={getCardImageClassName(
                        card.image_url,
                        "rounded-[4.75%] object-fill"
                      )}
                      sizes={cardTrackWidth}
                      loading={index < eagerImageCount ? "eager" : undefined}
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-[4.75%] bg-black/6 text-xs text-gray-300 dark:bg-white/6">
                      {card.name.slice(0, 2)}
                    </div>
                  )}

                  {gridSelected && <div className="pointer-events-none absolute inset-0 bg-blue-500/10" />}
                </div>
                <div className="mt-1.5 px-0.5 sm:mt-2">
                  <div className="grid gap-1 sm:flex sm:items-end sm:justify-between sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <p
                        className={
                          compactFourColumnGrid
                            ? "line-clamp-3 text-[10px] font-semibold leading-tight text-gray-900 dark:text-white"
                            : "truncate text-[11px] font-semibold leading-snug text-gray-900 dark:text-white sm:text-[13px]"
                        }
                      >
                        {card.name}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] font-medium sm:gap-1.5 sm:text-xs">
                        <span className="shrink-0 text-gray-500 dark:text-gray-400">
                          {card.card_number ? `#${card.card_number}` : "--"}
                        </span>
                        {showEpisodeMeta && !isMobileViewport && hasCardEpisodeMeta(card) && (
                          <>
                            <span className="text-gray-300 dark:text-white/20">•</span>
                            <Link
                              href={getExpansionHref(card.episode_id)}
                              prefetch={false}
                              onClick={(event) => event.stopPropagation()}
                              className="hidden min-w-0 truncate text-gray-400 transition-colors hover:text-gray-600 hover:underline underline-offset-2 dark:text-gray-500 dark:hover:text-gray-300 sm:inline"
                            >
                              {card.episode_name}
                              {card.episode_code ? (
                                <span className="ml-1 opacity-60">({card.episode_code})</span>
                              ) : null}
                            </Link>
                          </>
                        )}
                      </div>
                    </div>

                    <div
                      className={
                        compactFourColumnGrid
                          ? "grid min-w-0 gap-1"
                          : "flex min-w-0 items-center justify-between gap-1.5 sm:shrink sm:justify-end"
                      }
                    >
                      {gridPrice != null ? (
                        <span
                          className={
                            compactFourColumnGrid
                              ? "block min-w-0 max-w-full whitespace-nowrap text-[clamp(9px,2.85vw,11px)] font-semibold tabular-nums leading-tight text-gray-900 dark:text-white"
                            : "whitespace-nowrap text-[12px] font-semibold tabular-nums text-gray-900 dark:text-white sm:text-[15px]"
                          }
                        >
                          {primaryPriceSource === "tcp"
                            ? `TCP ${formatCurrency(gridPrice, gridCurrency)}`
                            : formatCurrency(gridPrice, gridCurrency)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 sm:text-xs">No price</span>
                      )}

                      {!selectionMode && (
                        <div className={compactFourColumnGrid ? "flex justify-start" : ""}>
                          <CollectionAddCardButton
                            card={{
                              id: card.id,
                              name: card.name,
                              image_url: card.image_url,
                              episode: getCollectionEpisodeForCard(card),
                            }}
                            className="h-[20px] w-[20px] shrink-0 rounded-md border-black/8 bg-black/5 text-gray-900 hover:border-black/15 hover:bg-black/8 dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:bg-white/12 sm:h-[22px] sm:w-[22px]"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hasPendingRenderedCards && (
        <p className="text-center text-xs font-medium text-gray-400 dark:text-white/35">
          Loading more cards...
        </p>
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

      {selectedModalCard && (
        <CardModal
          key={`${selectedModalCard.id}:${selectedDetails ? "loaded" : "base"}:${
            selectedDetails?.collection_item?.id ?? "none"
          }:${selectedDetails?.price_fetched_at ?? selectedModalCard.price_fetched_at ?? "none"}`}
          card={selectedModalCard}
          onClose={closeDetails}
        />
      )}
    </div>
  );
}
