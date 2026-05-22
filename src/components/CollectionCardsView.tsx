"use client";

import { type ReactNode, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, TrendingDown, TrendingUp, X } from "lucide-react";
import CardBrowserToolbar, {
  type CardBrowserToolbarActiveFilter,
  type CardBrowserToolbarFilterOption,
  type CardBrowserToolbarFilterSection,
  type CardBrowserToolbarOption,
} from "@/components/CardBrowserToolbar";
import { cardMatchesSearchQuery } from "@/lib/card-search";
import { CardLoadingOverlay } from "@/components/CardLoadingOverlay";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";
import { SectionHeader } from "@/components/PageHeader";
import { formatCollectionCurrency } from "@/lib/collection";
import { getCardImageClassName } from "@/lib/card-image-display";
import { getCardGridImageSizes, getCardGridTemplateColumns } from "@/lib/display-scale";
import { getExpansionHref } from "@/lib/games";
import { getCachedImageUrl } from "@/lib/image-cache";
import type { CollectionCardViewItem } from "@/types/collection-view";
import {
  useSettings,
  type CardSize,
  type CardView,
  type SortBy,
  type SortDir,
} from "@/components/SettingsProvider";
import {
  GRADED_SLAB_ASPECT_CLASS,
  RAW_CARD_ASPECT_CLASS,
  normalizeGradingCompanyLabel,
  normalizeGradingGradeLabel,
} from "@/lib/graded-slabs";
import { rarityBadge } from "@/lib/rarity-styles";
import { KNOWN_RARITY_ORDER, normalizeRarityLabel } from "@/lib/rarity";
import type { ModalCardData } from "@/components/card-modal/types";
import {
  modalActionRowClass,
  modalCenteredMobileOverlayClass,
  modalCenteredPanelClass,
  modalCloseButtonClass,
  modalCompactHeaderClass,
  modalDangerButtonClass,
  modalSecondaryButtonClass,
} from "@/components/modal-glass-styles";
import {
  KNOWN_SUPERTYPE_ORDER,
  buildFilterOptions,
  collectionOverlayBadgeClass,
  collectionTileActionButtonClass,
  collectionTileActionIconClass,
  collectionTileInfoClass,
  collectionTileMetaLineClass,
  collectionTileNoPriceClass,
  collectionTilePriceClass,
  collectionTilePriceRowClass,
  collectionTileTitleClass,
  collectionTileTrendClass,
  collectionTileTrendIconClass,
  compareCollectionCardItems,
  formatMarketCurrency,
  formatSortSummary,
  getCollectionItemCostBasis,
  getCollectionItemCostBasisLabel,
  getCollectionItemPrice,
  getCollectionItemPriceCurrency,
  getDefaultSortDir,
  hasAnyVisiblePrice,
  isGradedCollectionCard,
  neutralFilterChip,
  rarityFilterChip,
  selectionToggleTextClass,
  type PreparedCollectionEntry,
} from "@/components/collection-cards-view-helpers";

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
const GradedSlabPreview = dynamic(() => import("@/components/GradedSlabPreview"), {
  ssr: false,
  loading: () => null,
});

export type { CollectionCardViewItem } from "@/types/collection-view";

interface BulkAddBinderTarget {
  id: string;
  name: string;
}

interface Props {
  items: CollectionCardViewItem[];
  blurMissing?: boolean;
  emptyTitle: string;
  emptyText: string;
  bulkAddBinder?: BulkAddBinderTarget | null;
  allowCollectionRemoval?: boolean;
  allowWantRemoval?: boolean;
  showFilters?: boolean;
  onVisibleItemsChange?: (items: CollectionCardViewItem[]) => void;
  splitByGrading?: boolean;
  sectionTitle?: string;
  sectionCount?: ReactNode;
  sectionTrailing?: ReactNode;
  forcedSortBy?: SortBy;
  forcedSortDir?: SortDir;
  hideSortControls?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  hideToolbarSearch?: boolean;
  showGradedSlabPreview?: boolean;
}

interface RemoveDialogState {
  itemIds: string[];
  target: "collection" | "wants";
  title: string;
  description: string;
}

type CollectionView = Exclude<CardView, "binder">;

const INITIAL_COLLECTION_RENDER_COUNT = 72;
const COLLECTION_RENDER_BATCH_SIZE = 96;
const INITIAL_COLLECTION_EAGER_IMAGE_COUNT = 12;

function getTileTrendPercent(currentValue: number | null | undefined, costBasis: number | null): number | null {
  if (currentValue == null || costBasis == null || costBasis <= 0) return null;
  return Number((((currentValue - costBasis) / costBasis) * 100).toFixed(1));
}


export default function CollectionCardsView({
  items,
  blurMissing = false,
  emptyTitle,
  emptyText,
  bulkAddBinder = null,
  allowCollectionRemoval = false,
  allowWantRemoval = false,
  showFilters = false,
  onVisibleItemsChange,
  splitByGrading = false,
  sectionTitle,
  sectionCount,
  sectionTrailing,
  forcedSortBy,
  forcedSortDir,
  hideSortControls = false,
  searchValue,
  onSearchChange,
  hideToolbarSearch = false,
  showGradedSlabPreview = false,
}: Props) {
  const router = useRouter();
  const { settings, displaySettings, isMobileViewport, set, setDisplay } = useSettings();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const view: CollectionView =
    displaySettings.defaultView === "binder" ? "grid" : displaySettings.defaultView;
  const sortBy = forcedSortBy ?? settings.sortBy;
  const sortDir = forcedSortDir ?? settings.sortDir;
  const sortLocked = forcedSortBy != null || forcedSortDir != null;
  const primaryPriceSource = settings.primaryPriceSource;
  const [internalSearch, setInternalSearch] = useState("");
  const search = searchValue ?? internalSearch;
  const setSearch = onSearchChange ?? setInternalSearch;
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [showOnlyGraded, setShowOnlyGraded] = useState(false);
  const [selectedCard, setSelectedCard] = useState<ModalCardData | null>(null);
  const [openingItemKey, setOpeningItemKey] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [removingItems, setRemovingItems] = useState(false);
  const [removeDialog, setRemoveDialog] = useState<RemoveDialogState | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const selectionEnabled = Boolean(bulkAddBinder) || allowCollectionRemoval || allowWantRemoval;
  const canBulkAddToBinder = Boolean(bulkAddBinder) && blurMissing;
  const canRemoveFromCollection = Boolean(bulkAddBinder) || allowCollectionRemoval;
  const canRemoveFromWants = allowWantRemoval;
  const availableRarities = useMemo(
    () =>
      buildFilterOptions(items.map((item) => item.rarity), KNOWN_RARITY_ORDER, normalizeRarityLabel),
    [items]
  );
  const availableSupertypes = useMemo(
    () => buildFilterOptions(items.map((item) => item.supertype), KNOWN_SUPERTYPE_ORDER),
    [items]
  );
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
          settings.defaultRarities
            .map((rarity) => normalizeRarityLabel(rarity))
            .filter((value): value is string => Boolean(value))
        ),
      ].filter((rarity) => availableRarityValues.has(rarity)),
    [settings.defaultRarities, availableRarityValues]
  );
  const activeSupertypes = useMemo(
    () =>
      settings.defaultSupertypes.filter((supertype) => availableSupertypeValues.has(supertype)),
    [settings.defaultSupertypes, availableSupertypeValues]
  );
  const normalizedSearch = search.trim().toLowerCase();
  const preparedEntries = useMemo<PreparedCollectionEntry[]>(
    () =>
      items.map((item, index) => ({
        item,
        selectionKey: `${item.card_id}-${index}`,
        normalizedRarity: normalizeRarityLabel(item.rarity),
        isPriced: hasAnyVisiblePrice(item),
        isGraded: isGradedCollectionCard(item),
      })),
    [items]
  );
  const hasAnyPricedCards = useMemo(
    () => preparedEntries.some((entry) => entry.isPriced),
    [preparedEntries]
  );
  const hasAnyGradedCards = useMemo(
    () => preparedEntries.some((entry) => entry.isGraded),
    [preparedEntries]
  );
  const hasAnyRawCards = useMemo(
    () => preparedEntries.some((entry) => !entry.isGraded),
    [preparedEntries]
  );
  const showGradedFilter = hasAnyGradedCards && hasAnyRawCards;
  const applySavedFilters = showFilters;
  const appliedRarities = useMemo(
    () => (applySavedFilters ? activeRarities : []),
    [applySavedFilters, activeRarities]
  );
  const appliedSupertypes = useMemo(
    () => (applySavedFilters ? activeSupertypes : []),
    [applySavedFilters, activeSupertypes]
  );
  const effectiveShowOnlyGraded = applySavedFilters && showOnlyGraded && showGradedFilter;
  const effectiveOnlyPriced = applySavedFilters && settings.showOnlyPriced && hasAnyPricedCards;
  const deferredNormalizedSearch = useDeferredValue(normalizedSearch);
  const deferredAppliedRarities = useDeferredValue(appliedRarities);
  const deferredAppliedSupertypes = useDeferredValue(appliedSupertypes);
  const deferredEffectiveShowOnlyGraded = useDeferredValue(effectiveShowOnlyGraded);
  const deferredEffectiveOnlyPriced = useDeferredValue(effectiveOnlyPriced);
  const isFilteringPending =
    normalizedSearch !== deferredNormalizedSearch ||
    appliedRarities !== deferredAppliedRarities ||
    appliedSupertypes !== deferredAppliedSupertypes ||
    effectiveShowOnlyGraded !== deferredEffectiveShowOnlyGraded ||
    effectiveOnlyPriced !== deferredEffectiveOnlyPriced;
  const pricedOnlyUnavailable =
    applySavedFilters && settings.showOnlyPriced && !hasAnyPricedCards;
  const validSelectionKeys = useMemo(
    () => new Set(preparedEntries.map((entry) => entry.selectionKey)),
    [preparedEntries]
  );
  const activeSelectedKeys = useMemo(
    () => selectedKeys.filter((key) => validSelectionKeys.has(key)),
    [selectedKeys, validSelectionKeys]
  );
  const selectedKeySet = useMemo(() => new Set(activeSelectedKeys), [activeSelectedKeys]);
  const activeSelectionMode = selectionEnabled && selectionMode;
  const searchMatchedEntries = useMemo(() => {
    if (!deferredNormalizedSearch) {
      return preparedEntries;
    }

    return preparedEntries.filter((entry) =>
      cardMatchesSearchQuery(
        {
          name: entry.item.name,
          cardNumber: entry.item.card_number,
          episodeName: entry.item.episode_name,
          episodeCode: entry.item.episode_code,
          rarity: entry.item.rarity,
        },
        deferredNormalizedSearch
      )
    );
  }, [preparedEntries, deferredNormalizedSearch]);
  const filteredEntries = useMemo(() => {
    return searchMatchedEntries.filter((entry) => {
      if (
        deferredAppliedRarities.length > 0 &&
        !deferredAppliedRarities.includes(entry.normalizedRarity ?? "")
      ) {
        return false;
      }

      if (
        deferredAppliedSupertypes.length > 0 &&
        !deferredAppliedSupertypes.includes(entry.item.supertype ?? "")
      ) {
        return false;
      }

      if (deferredEffectiveOnlyPriced && !entry.isPriced) {
        return false;
      }

      if (deferredEffectiveShowOnlyGraded && !entry.isGraded) {
        return false;
      }

      return true;
    });
  }, [
    searchMatchedEntries,
    deferredAppliedRarities,
    deferredAppliedSupertypes,
    deferredEffectiveOnlyPriced,
    deferredEffectiveShowOnlyGraded,
  ]);
  const orderedFilteredEntries = useMemo(
    () =>
      [...filteredEntries].sort((a, b) =>
        compareCollectionCardItems(a.item, b.item, sortBy, sortDir)
      ),
    [filteredEntries, sortBy, sortDir]
  );
  const persistentFiltersHideEverything =
    showFilters &&
    !deferredNormalizedSearch &&
    !deferredEffectiveShowOnlyGraded &&
    items.length > 0 &&
    orderedFilteredEntries.length === 0 &&
    (
      deferredAppliedRarities.length > 0 ||
      deferredAppliedSupertypes.length > 0 ||
      deferredEffectiveOnlyPriced
    );
  const visibleEntries = useMemo(
    () => {
      if (!persistentFiltersHideEverything) {
        return orderedFilteredEntries;
      }

      return [...searchMatchedEntries].sort((a, b) =>
        compareCollectionCardItems(a.item, b.item, sortBy, sortDir)
      );
    },
    [
      orderedFilteredEntries,
      persistentFiltersHideEverything,
      searchMatchedEntries,
      sortBy,
      sortDir,
    ]
  );
  const visibleItems = useMemo(
    () => visibleEntries.map((entry) => entry.item),
    [visibleEntries]
  );
  const groupedVisibleEntries = useMemo(() => {
    if (!splitByGrading) {
      return [{ key: "all", title: null, entries: visibleEntries }];
    }

    const gradedEntries: typeof visibleEntries = [];
    const rawEntries: typeof visibleEntries = [];

    for (const entry of visibleEntries) {
      if (entry.isGraded) {
        gradedEntries.push(entry);
      } else {
        rawEntries.push(entry);
      }
    }

    const groups: Array<{
      key: string;
      title: string | null;
      entries: typeof visibleEntries;
    }> = [];

    if (gradedEntries.length > 0) {
      groups.push({ key: "graded", title: "Graded Cards", entries: gradedEntries });
    }

    if (rawEntries.length > 0) {
      groups.push({ key: "raw", title: "Raw Cards", entries: rawEntries });
    }

    return groups;
  }, [visibleEntries, splitByGrading]);
  const [renderState, setRenderState] = useState({
    key: "",
    limit: INITIAL_COLLECTION_RENDER_COUNT,
  });
  const initialRenderCount = isMobileViewport ? 36 : INITIAL_COLLECTION_RENDER_COUNT;
  const renderBatchSize = isMobileViewport ? 36 : COLLECTION_RENDER_BATCH_SIZE;
  const renderKey = `${visibleEntries.length}:${visibleEntries[0]?.selectionKey ?? ""}:${
    visibleEntries[visibleEntries.length - 1]?.selectionKey ?? ""
  }:${sortBy}:${sortDir}:${splitByGrading ? "split" : "all"}`;
  const renderLimit =
    renderState.key === renderKey ? renderState.limit : initialRenderCount;
  const renderedVisibleEntries = useMemo(
    () => visibleEntries.slice(0, renderLimit),
    [renderLimit, visibleEntries]
  );
  const hasMoreVisibleEntries = renderLimit < visibleEntries.length;

  useEffect(() => {
    if (!hasMoreVisibleEntries) {
      return;
    }

    const loadMoreElement = loadMoreRef.current;
    if (!loadMoreElement) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        setRenderState((current) => {
          const currentLimit =
            current.key === renderKey ? current.limit : initialRenderCount;
          const nextLimit = Math.min(
            currentLimit + renderBatchSize,
            visibleEntries.length
          );

          if (current.key === renderKey && nextLimit === current.limit) {
            return current;
          }

          return {
            key: renderKey,
            limit: nextLimit,
          };
        });
      },
      { rootMargin: isMobileViewport ? "320px 0px" : "700px 0px" }
    );

    observer.observe(loadMoreElement);

    return () => {
      observer.disconnect();
    };
  }, [hasMoreVisibleEntries, initialRenderCount, isMobileViewport, renderBatchSize, renderKey, renderLimit, visibleEntries.length]);

  const renderedSelectionKeys = useMemo(
    () => new Set(renderedVisibleEntries.map((entry) => entry.selectionKey)),
    [renderedVisibleEntries]
  );
  const renderedGroupedVisibleEntries = useMemo(
    () =>
      groupedVisibleEntries
        .map((group) => ({
          ...group,
          totalCount: group.entries.length,
          entries: group.entries.filter((entry) => renderedSelectionKeys.has(entry.selectionKey)),
        }))
        .filter((group) => group.entries.length > 0),
    [groupedVisibleEntries, renderedSelectionKeys]
  );
  const selectableKeys = useMemo(
    () => visibleEntries.map(({ selectionKey }) => selectionKey),
    [visibleEntries]
  );
  const allSelectableSelected =
    selectableKeys.length > 0 && selectableKeys.every((key) => selectedKeySet.has(key));
  const selectedCards = useMemo(
    () =>
      preparedEntries.flatMap((entry) =>
        selectedKeySet.has(entry.selectionKey) && !entry.item.owned
          ? [
              {
                id: entry.item.card_id,
                name: entry.item.name,
                image_url: entry.item.image_url,
                episode: {
                  id: entry.item.episode_id,
                  name: entry.item.episode_name,
                  code: entry.item.episode_code,
                },
              },
            ]
          : []
      ),
    [preparedEntries, selectedKeySet]
  );
  const selectedCollectionItemIds = useMemo(
    () => {
      const ids = new Set<string>();

      for (const entry of preparedEntries) {
        if (!selectedKeySet.has(entry.selectionKey)) continue;

        const itemIds =
          entry.item.collection_item_ids ??
          (entry.item.collection_item_id ? [entry.item.collection_item_id] : []);
        for (const itemId of itemIds) {
          ids.add(itemId);
        }
      }

      return [...ids];
    },
    [preparedEntries, selectedKeySet]
  );
  const selectedWantItemIds = useMemo(
    () => {
      const ids = new Set<string>();

      for (const entry of preparedEntries) {
        if (!selectedKeySet.has(entry.selectionKey) || !entry.item.want_item_id) continue;
        ids.add(entry.item.want_item_id);
      }

      return [...ids];
    },
    [preparedEntries, selectedKeySet]
  );

  function getOpeningItemKey(item: CollectionCardViewItem, selectionKey: string): string {
    return item.collection_item_id ?? item.want_item_id ?? selectionKey;
  }

  async function openCard(item: CollectionCardViewItem, selectionKey: string) {
    const openingKey = getOpeningItemKey(item, selectionKey);
    if (openingItemKey === openingKey) return;
    setOpeningItemKey(openingKey);
    try {
      const response = await fetch(`/api/cards/${encodeURIComponent(item.card_id)}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data: ModalCardData = await response.json();
      setSelectedCard({
        ...data,
        collection_item:
          item.owned && item.collection_item_id
            ? {
                id: item.collection_item_id,
                binder_id: item.binder_id ?? null,
                binder_name: item.binder_name ?? null,
                binder_type: item.binder_type ?? null,
                purchase_price: item.purchase_price,
                cost_basis_value: item.cost_basis_value,
                cost_basis_label: item.cost_basis_label,
                cost_basis_source: item.cost_basis_source,
                condition: item.condition,
                language: item.language ?? null,
                notes: item.notes ?? null,
                tags: item.tags ?? [],
                grading_company: item.grading_company,
                grading_grade: item.grading_grade,
                grading_subgrades: item.grading_subgrades ?? null,
              }
            : null,
      });
    } catch {
      // ignore
    } finally {
      setOpeningItemKey(null);
    }
  }

  function toggleSelected(selectionKey: string) {
    setSelectedKeys((prev) =>
      prev.includes(selectionKey)
        ? prev.filter((key) => key !== selectionKey)
        : [...prev, selectionKey]
    );
  }

  function handleTileActivate(
    item: CollectionCardViewItem,
    selectionKey: string,
    selectableInMode: boolean
  ) {
    if (activeSelectionMode) {
      if (!selectableInMode) return;
      toggleSelected(selectionKey);
      return;
    }

    void openCard(item, selectionKey);
  }

  function toggleSelectionMode() {
    setBulkAddOpen(false);
    setSelectionMode((prev) => {
      if (prev) {
        setSelectedKeys([]);
      }
      return !prev;
    });
  }

  async function removeItemsFromCollection(itemIds: string[]) {
    if (itemIds.length === 0) return;

    setRemovingItems(true);
    setRemoveError(null);

    try {
      const response = await fetch("/api/collection/cards", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not remove card from collection");
      }

      setBulkAddOpen(false);
      setSelectionMode(false);
      setSelectedKeys([]);
      setRemoveDialog(null);
      router.refresh();
    } catch (error) {
      setRemoveError(
        error instanceof Error ? error.message : "Could not remove card from collection"
      );
    } finally {
      setRemovingItems(false);
    }
  }

  async function removeItemsFromWants(itemIds: string[]) {
    if (itemIds.length === 0) return;

    setRemovingItems(true);
    setRemoveError(null);

    try {
      const response = await fetch("/api/wants/cards", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not remove cards from Wants");
      }

      setBulkAddOpen(false);
      setSelectionMode(false);
      setSelectedKeys([]);
      setRemoveDialog(null);
      router.refresh();
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : "Could not remove cards from Wants");
    } finally {
      setRemovingItems(false);
    }
  }

  function handleBulkAdd() {
    setBulkAddOpen(true);
  }

  function handleBulkRemove() {
    if (canRemoveFromWants) {
      if (selectedWantItemIds.length === 0) return;
      setRemoveError(null);
      setRemoveDialog({
        itemIds: selectedWantItemIds,
        target: "wants",
        title:
          selectedWantItemIds.length === 1
            ? "Remove 1 card from Wants?"
            : `Remove ${selectedWantItemIds.length} cards from Wants?`,
        description:
          selectedWantItemIds.length === 1
            ? "This card will be removed from your Wants list."
            : "These cards will be removed from your Wants list.",
      });
      return;
    }

    if (selectedCollectionItemIds.length === 0) return;
    setRemoveError(null);
    setRemoveDialog({
      itemIds: selectedCollectionItemIds,
      target: "collection",
      title:
        selectedCollectionItemIds.length === 1
          ? "Remove 1 card from My Collection?"
          : `Remove ${selectedCollectionItemIds.length} cards from My Collection?`,
      description:
        selectedCollectionItemIds.length === 1
          ? "This card will be deleted from your collection."
          : "These cards will be deleted from your collection.",
    });
  }

  function handleSingleRemove(
    event: React.MouseEvent<HTMLButtonElement>,
    item: CollectionCardViewItem
  ) {
    event.stopPropagation();

    const removableIds = item.collection_item_ids ?? (item.collection_item_id ? [item.collection_item_id] : []);
    if (canRemoveFromWants && item.want_item_id) {
      setRemoveError(null);
      setRemoveDialog({
        itemIds: [item.want_item_id],
        target: "wants",
        title: `Remove ${item.name} from Wants?`,
        description: "This card will be removed from your Wants list.",
      });
      return;
    }

    if (removableIds.length === 0) return;
    setRemoveError(null);
    setRemoveDialog({
      itemIds: removableIds,
      target: "collection",
      title:
        removableIds.length === 1
          ? `Remove ${item.name} from My Collection?`
          : `Remove ${item.name} (${removableIds.length} copies) from My Collection?`,
      description:
        removableIds.length === 1
          ? "This saved card will be deleted from your collection."
          : "These saved copies will be deleted from your collection.",
    });
  }

  function toggleRarity(rarity: string) {
    const current = [
      ...new Set(
        settings.defaultRarities
          .map((value) => normalizeRarityLabel(value))
          .filter((value): value is string => Boolean(value))
      ),
    ];
    const next = current.includes(rarity)
      ? current.filter((value) => value !== rarity)
      : [...current, rarity];

    set("defaultRarities", next);
  }

  function toggleSupertype(supertype: string) {
    const next = settings.defaultSupertypes.includes(supertype)
      ? settings.defaultSupertypes.filter((value) => value !== supertype)
      : [...settings.defaultSupertypes, supertype];

    set("defaultSupertypes", next);
  }

  const hasActiveFilters =
    Boolean(search) ||
    effectiveShowOnlyGraded ||
    appliedRarities.length > 0 ||
    appliedSupertypes.length > 0 ||
    effectiveOnlyPriced;
  const sortSummary = hideSortControls ? "Highest price first" : formatSortSummary(sortBy, sortDir);
  const SORT_OPTIONS: Array<{ value: SortBy; label: string }> = [
    { value: "number", label: "#" },
    { value: "cm_en", label: "CM" },
    { value: "tcp", label: "TCP" },
  ];
  const SIZE_OPTIONS: Array<{ value: CardSize; label: string }> = [
    { value: "large", label: "1" },
    { value: "medium", label: "2" },
    { value: "small", label: "3" },
    { value: "xsmall", label: "4" },
  ];

  useEffect(() => {
    onVisibleItemsChange?.(visibleItems);
  }, [visibleItems, onVisibleItemsChange]);

  function toggleSort(nextSort: SortBy) {
    if (sortLocked) {
      return;
    }

    if (nextSort === "cm_en" || nextSort === "tcp") {
      set("primaryPriceSource", nextSort);
    }

    if (sortBy === nextSort) {
      set("sortDir", sortDir === "asc" ? "desc" : "asc");
      return;
    }

    set("sortBy", nextSort);
    set("sortDir", getDefaultSortDir(nextSort));
  }

  function clearAllFilters() {
    setSearch("");
    setShowOnlyGraded(false);
    set("defaultRarities", []);
    set("defaultSupertypes", []);
    set("showOnlyPriced", false);
  }

  if (items.length === 0) {
    return (
      <div className="glass rounded-2xl px-5 py-7 text-center shadow-md shadow-black/5 sm:rounded-3xl sm:px-8 sm:py-9">
        <p className="mb-1 font-medium text-gray-700 dark:text-gray-300">{emptyTitle}</p>
        <p className="mx-auto max-w-xl text-sm leading-6 text-gray-400">{emptyText}</p>
      </div>
    );
  }

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
    ? displaySettings.cardSize === "xsmall"
      ? "gap-x-1.5 gap-y-2"
      : displaySettings.cardSize === "large"
      ? "gap-x-0 gap-y-3"
      : displaySettings.cardSize === "medium"
        ? "gap-x-2 gap-y-2.5"
        : "gap-x-1.5 gap-y-2"
    : "gap-2.5";
  const eagerImageCount = isMobileViewport
    ? displaySettings.cardSize === "large"
      ? 1
      : displaySettings.cardSize === "medium"
        ? 2
        : displaySettings.cardSize === "small"
          ? 3
          : 8
    : INITIAL_COLLECTION_EAGER_IMAGE_COUNT;
  const showInlineSelectionButton =
    Boolean(sectionTitle) && !showFilters && selectionEnabled && !activeSelectionMode;
  const filtersPanelExpanded = filtersExpanded || persistentFiltersHideEverything;
  const filterBadgeCount =
    appliedRarities.length +
    appliedSupertypes.length +
    (effectiveOnlyPriced ? 1 : 0) +
    (effectiveShowOnlyGraded ? 1 : 0) +
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
      label: "1",
      title: isMobileViewport ? "Show one card per row" : "Largest card tiles",
    },
    {
      value: "medium",
      label: "2",
      title: isMobileViewport ? "Show two cards per row" : "Medium card tiles",
    },
    {
      value: "small",
      label: "3",
      title: isMobileViewport ? "Show three cards per row" : "Small card tiles",
    },
    { value: "xsmall", label: "4", title: isMobileViewport ? "Show four cards per row" : "Densest card tiles" },
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
    ...appliedRarities.map((rarity) => ({
      key: `rarity-${rarity}`,
      label: rarity,
      onRemove: () => toggleRarity(rarity),
    })),
    ...appliedSupertypes.map((supertype) => ({
      key: `supertype-${supertype}`,
      label: supertype,
      onRemove: () => toggleSupertype(supertype),
    })),
    ...(effectiveOnlyPriced
      ? [
          {
            key: "priced-only",
            label: "Priced only",
            onRemove: () => set("showOnlyPriced", false),
          },
        ]
      : []),
    ...(effectiveShowOnlyGraded
      ? [
          {
            key: "graded-only",
            label: "Graded only",
            onRemove: () => setShowOnlyGraded(false),
          },
        ]
      : []),
  ];
  const toolbarQuickFilters: CardBrowserToolbarFilterOption[] = [
    {
      key: "quick-priced-only",
      label: pricedOnlyUnavailable ? "No prices yet" : "Priced only",
      active: settings.showOnlyPriced,
      onToggle: () => set("showOnlyPriced", !settings.showOnlyPriced),
      className: `inline-flex min-h-[var(--ui-chip-min-height)] shrink-0 items-center gap-[var(--ui-chip-gap)] overflow-hidden rounded-full border px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] leading-none transition-colors ${
        settings.showOnlyPriced ? "font-semibold" : "font-medium"
      } ${neutralFilterChip(settings.showOnlyPriced)}`,
    },
    ...(showGradedFilter
      ? [
          {
            key: "quick-graded-only",
            label: "Graded only",
            active: effectiveShowOnlyGraded,
            onToggle: () => setShowOnlyGraded((prev) => !prev),
            className: `inline-flex min-h-[var(--ui-chip-min-height)] shrink-0 items-center gap-[var(--ui-chip-gap)] overflow-hidden rounded-full border px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] leading-none transition-colors ${
              effectiveShowOnlyGraded ? "font-semibold" : "font-medium"
            } ${neutralFilterChip(effectiveShowOnlyGraded)}`,
          } satisfies CardBrowserToolbarFilterOption,
        ]
      : []),
    ...availableSupertypes.map((supertype) => {
      const active = activeSupertypes.includes(supertype.value);

      return {
        key: `quick-type-${supertype.value}`,
        label: supertype.value,
        active,
        count: supertype.count,
        onToggle: () => toggleSupertype(supertype.value),
        className: `inline-flex min-h-[var(--ui-chip-min-height)] shrink-0 items-center gap-[var(--ui-chip-gap)] overflow-hidden rounded-full border px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] leading-none transition-colors ${
          active ? "font-semibold" : "font-medium"
        } ${neutralFilterChip(active)}`,
      };
    }),
  ];
  const toolbarFilterSections: CardBrowserToolbarFilterSection[] = [
    {
      key: "rarity",
      title: "Rarity",
      summary: appliedRarities.length > 0 ? `${appliedRarities.length} selected` : "All",
      className: "xl:min-w-0",
      options: availableRarities.map((rarity) => {
        const active = appliedRarities.includes(rarity.value);

        return {
          key: rarity.value,
          label: rarity.value,
          active,
          count: rarity.count,
          onToggle: () => toggleRarity(rarity.value),
          className: `inline-flex min-h-[var(--ui-chip-min-height)] shrink-0 items-center gap-[var(--ui-chip-gap)] overflow-hidden rounded-full border px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] leading-none transition-colors ${
            active ? "font-semibold" : "font-medium"
          } ${rarityFilterChip(rarity.value, active)}`,
        };
      }),
    },
  ];
  const toolbarWarnings = [
    ...(pricedOnlyUnavailable
      ? [
          "This view has no price data yet, so the priced-only filter stays visible but does not hide cards.",
        ]
      : []),
    ...(persistentFiltersHideEverything
      ? ["Saved filters matched 0 cards here, so this view is shown without them."]
      : []),
  ];
  return (
    <>
      {sectionTitle && (
        <SectionHeader
          title={sectionTitle}
          count={sectionCount ?? items.length}
          compact
          className="mb-2.5"
          actions={
            <div className="flex flex-wrap items-center gap-1.5">
              {showInlineSelectionButton && (
                <button
                  type="button"
                  onClick={toggleSelectionMode}
                  className={selectionToggleTextClass(false)}
                >
                  Select
                </button>
              )}
              {sectionTrailing}
            </div>
          }
        />
      )}

      {showFilters ? (
        <>
          <CardBrowserToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search name, number, set..."
            hideSearch={hideToolbarSearch}
            resultLabel={`${visibleItems.length} / ${items.length}${isFilteringPending ? " ..." : ""}`}
            sortSummary={sortSummary}
            priceSourceLabel={
              hideSortControls ? null : primaryPriceSource === "tcp" ? "TCGPlayer" : "CardMarket"
            }
            viewOptions={[
              { value: "table", label: "Table" },
              { value: "grid", label: "Grid" },
            ]}
            activeView={view}
            onViewChange={(value) => setDisplay("defaultView", value as CollectionView)}
            sortOptions={hideSortControls ? [] : toolbarSortOptions}
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
              selectionEnabled ? (
                <div className="flex flex-wrap items-center gap-2">
                  {activeSelectionMode && (
                    <>
                      <span className="inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full border border-blue-500/25 bg-violet-500/10 px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-violet-700 dark:text-violet-200">
                        {activeSelectedKeys.length} selected
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedKeys(selectableKeys)}
                        disabled={selectableKeys.length === 0 || allSelectableSelected}
                        className="inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full border border-white/8 bg-white/[0.045] px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-white/62 transition-colors hover:border-white/16 hover:bg-white/[0.075] hover:text-white disabled:cursor-not-allowed disabled:bg-white/[0.025] disabled:text-white/32"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedKeys([])}
                        disabled={activeSelectedKeys.length === 0}
                        className="inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full border border-white/8 bg-white/[0.045] px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-white/62 transition-colors hover:border-white/16 hover:bg-white/[0.075] hover:text-white disabled:cursor-not-allowed disabled:bg-white/[0.025] disabled:text-white/32"
                      >
                        Clear
                      </button>
                      {canBulkAddToBinder && (
                        <button
                          type="button"
                          onClick={handleBulkAdd}
                          disabled={selectedCards.length === 0}
                          className="inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full bg-violet-600 px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          Bulk add
                        </button>
                      )}
                      {canRemoveFromCollection && (
                        <button
                          type="button"
                          onClick={handleBulkRemove}
                          disabled={removingItems || selectedCollectionItemIds.length === 0}
                          className="inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full border border-white/8 bg-white/[0.045] px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-white/62 transition-colors hover:border-white/16 hover:bg-white/[0.075] hover:text-white disabled:cursor-not-allowed disabled:bg-white/[0.025] disabled:text-white/32"
                        >
                          Remove
                        </button>
                      )}
                      {canRemoveFromWants && (
                        <button
                          type="button"
                          onClick={handleBulkRemove}
                          disabled={removingItems || selectedWantItemIds.length === 0}
                          className="inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full border border-white/8 bg-white/[0.045] px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-white/62 transition-colors hover:border-white/16 hover:bg-white/[0.075] hover:text-white disabled:cursor-not-allowed disabled:bg-white/[0.025] disabled:text-white/32"
                        >
                          Remove
                        </button>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={toggleSelectionMode}
                    className={`inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full border px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none transition-colors ${
                      activeSelectionMode
                        ? "border-violet-400/40 bg-violet-600 text-white"
                        : "border-white/8 bg-white/[0.045] text-white/60 hover:border-white/16 hover:bg-white/[0.075] hover:text-white"
                    }`}
                  >
                    {activeSelectionMode ? "Done" : "Select"}
                  </button>
                </div>
              ) : null
            }
          />
          {false && (
            <div className="glass mb-4 space-y-2.5 rounded-2xl px-4 py-3 shadow-sm shadow-black/5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex shrink-0 overflow-hidden rounded-lg border border-black/8 dark:border-white/8">
              {(["table", "grid"] as CollectionView[]).map((nextView) => (
                <button
                  key={nextView}
                  type="button"
                  onClick={() => setDisplay("defaultView", nextView)}
                  className={`px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                    view === nextView
                      ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                      : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                  }`}
                >
                  {nextView}
                </button>
              ))}
            </div>

            <div className="h-4 w-px shrink-0 bg-black/10 dark:bg-white/10" />

            <div className="flex shrink-0 items-center gap-1">
              <span className="mr-0.5 text-xs text-gray-400">Sort</span>
              <div className="flex overflow-hidden rounded-lg border border-black/8 dark:border-white/8">
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
                        ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                        : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                    }`}
                  >
                    {option.label}
                    {sortBy === option.value ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-4 w-px shrink-0 bg-black/10 dark:bg-white/10" />

            <div className="flex shrink-0 items-center gap-1">
              <span className="mr-0.5 text-xs text-gray-400">Size</span>
              <div className="flex overflow-hidden rounded-lg border border-black/8 dark:border-white/8">
                {SIZE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDisplay("cardSize", option.value)}
                    className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      displaySettings.cardSize === option.value
                        ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                        : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-w-[180px] flex-1 rounded-lg border border-transparent bg-black/5 px-3 py-1.5 text-xs text-gray-900 outline-none placeholder:text-gray-400 focus:border-black/10 dark:bg-white/5 dark:text-white dark:focus:border-white/10"
            />

            <span className="shrink-0 text-xs tabular-nums text-gray-400">
              {visibleItems.length} / {items.length}
            </span>
            <span className="shrink-0 rounded-full border border-black/8 px-2 py-1 text-[11px] font-medium text-gray-500 dark:border-white/8 dark:text-gray-400">
              {sortSummary}
            </span>

            {selectionEnabled && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {activeSelectionMode && (
                  <>
                    <span className="rounded-full border border-blue-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:text-violet-200">
                      {activeSelectedKeys.length} selected
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedKeys(selectableKeys)}
                      disabled={selectableKeys.length === 0 || allSelectableSelected}
                      className="rounded-full border border-black/8 px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:border-black/18 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/8 dark:text-gray-400 dark:hover:border-white/18 dark:hover:text-white"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedKeys([])}
                      disabled={activeSelectedKeys.length === 0}
                      className="rounded-full border border-black/8 px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:border-black/18 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/8 dark:text-gray-400 dark:hover:border-white/18 dark:hover:text-white"
                    >
                      Clear
                    </button>
                    {canBulkAddToBinder && (
                      <button
                        type="button"
                        onClick={handleBulkAdd}
                        disabled={selectedCards.length === 0}
                        className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Bulk add
                      </button>
                    )}
                    {canRemoveFromCollection && (
                      <button
                        type="button"
                        onClick={handleBulkRemove}
                        disabled={removingItems || selectedCollectionItemIds.length === 0}
                        className="rounded-full border border-black/8 px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:border-black/18 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/8 dark:text-gray-400 dark:hover:border-white/18 dark:hover:text-white"
                      >
                        Remove
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={toggleSelectionMode}
                  className={selectionToggleTextClass(activeSelectionMode)}
                >
                  {activeSelectionMode ? "Done" : "Select"}
                </button>
              </div>
            )}

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setShowOnlyGraded(false);
                  set("defaultRarities", []);
                  set("defaultSupertypes", []);
                  set("showOnlyPriced", false);
                }}
                className="shrink-0 text-xs text-gray-400 transition-colors hover:text-gray-900 dark:hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
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
              <div className="h-3.5 w-px bg-black/10 dark:bg-white/10" />
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
              <div className="h-3.5 w-px bg-black/10 dark:bg-white/10" />
            )}
            <button
              type="button"
              aria-pressed={settings.showOnlyPriced}
              onClick={() => set("showOnlyPriced", !settings.showOnlyPriced)}
              className={`inline-flex min-h-[var(--ui-chip-min-height)] items-center rounded-full border px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] leading-none transition-all ${
                effectiveOnlyPriced ? "font-semibold" : "font-medium"
              } ${neutralFilterChip(effectiveOnlyPriced)}`}
            >
              <span>{pricedOnlyUnavailable ? "No prices yet" : "Priced only"}</span>
            </button>
            {showGradedFilter && (
              <button
                type="button"
                aria-pressed={effectiveShowOnlyGraded}
                onClick={() => setShowOnlyGraded((prev) => !prev)}
                className={`inline-flex min-h-[var(--ui-chip-min-height)] items-center rounded-full border px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] leading-none transition-all ${
                  effectiveShowOnlyGraded ? "font-semibold" : "font-medium"
                } ${neutralFilterChip(effectiveShowOnlyGraded)}`}
              >
                <span>Graded</span>
              </button>
            )}
          </div>

          {pricedOnlyUnavailable && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              This binder has no price data yet, so all cards are shown.
            </p>
          )}

          {persistentFiltersHideEverything && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Saved filters matched 0 cards here, so this binder is shown without them.
            </p>
          )}
            </div>
          )}
        </>
      ) : selectionEnabled && (!sectionTitle || activeSelectionMode) && (
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
          {activeSelectionMode && (
            <>
              <span className="inline-flex min-h-[var(--ui-chip-min-height)] items-center rounded-full border border-black/8 bg-black/[0.03] px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-medium leading-none text-gray-500 dark:border-white/8 dark:bg-white/[0.05] dark:text-white/45">
                {activeSelectedKeys.length} selected
              </span>
              <button
                type="button"
                onClick={() => setSelectedKeys(selectableKeys)}
                disabled={selectableKeys.length === 0 || allSelectableSelected}
                className="inline-flex min-h-[var(--ui-chip-min-height)] items-center rounded-full border border-white/8 bg-white/[0.045] px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-white/62 transition-colors hover:border-white/16 hover:bg-white/[0.075] hover:text-white disabled:cursor-not-allowed disabled:bg-white/[0.025] disabled:text-white/32"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelectedKeys([])}
                disabled={activeSelectedKeys.length === 0}
                className="inline-flex min-h-[var(--ui-chip-min-height)] items-center rounded-full border border-white/8 bg-white/[0.045] px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-white/62 transition-colors hover:border-white/16 hover:bg-white/[0.075] hover:text-white disabled:cursor-not-allowed disabled:bg-white/[0.025] disabled:text-white/32"
              >
                Clear
              </button>
              {canBulkAddToBinder && (
                <button
                  type="button"
                  onClick={handleBulkAdd}
                  disabled={selectedCards.length === 0}
                  className="inline-flex min-h-[var(--ui-chip-min-height)] items-center rounded-full bg-violet-600 px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Bulk add
                </button>
              )}
              {canRemoveFromCollection && (
                <button
                  type="button"
                  onClick={handleBulkRemove}
                  disabled={removingItems || selectedCollectionItemIds.length === 0}
                  className="inline-flex min-h-[var(--ui-chip-min-height)] items-center rounded-full border border-white/8 bg-white/[0.045] px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-white/62 transition-colors hover:border-white/16 hover:bg-white/[0.075] hover:text-white disabled:cursor-not-allowed disabled:bg-white/[0.025] disabled:text-white/32"
                >
                  Remove
                </button>
              )}
              {canRemoveFromWants && (
                <button
                  type="button"
                  onClick={handleBulkRemove}
                  disabled={removingItems || selectedWantItemIds.length === 0}
                  className="inline-flex min-h-[var(--ui-chip-min-height)] items-center rounded-full border border-white/8 bg-white/[0.045] px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-white/62 transition-colors hover:border-white/16 hover:bg-white/[0.075] hover:text-white disabled:cursor-not-allowed disabled:bg-white/[0.025] disabled:text-white/32"
                >
                  Remove
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={toggleSelectionMode}
            className={selectionToggleTextClass(activeSelectionMode)}
          >
            {activeSelectionMode ? "Done" : "Select"}
          </button>
        </div>
      )}

      {visibleItems.length === 0 ? (
        <div className="glass rounded-3xl p-12 text-center shadow-md shadow-black/5">
          <p className="mb-1 font-medium text-gray-700 dark:text-gray-300">
            No cards match your filters
          </p>
          <p className="text-sm text-gray-400">Try adjusting or clearing the filters above.</p>
        </div>
      ) : view === "table" ? (
        <div className={`${splitByGrading ? "space-y-6" : ""} ${isFilteringPending ? "opacity-80" : "opacity-100"} transition-opacity`}>
          {renderedGroupedVisibleEntries.map((group) => (
            <section key={group.key}>
              {group.title && (
                <SectionHeader
                  title={group.title}
                  count={group.totalCount}
                  compact
                  className="mb-2.5"
                />
              )}

              <div className="grid gap-2 md:hidden">
                {group.entries.map(({ item, selectionKey }, index) => {
                  const missing = !item.owned;
                  const selectableInMode = selectionEnabled ? true : !blurMissing || missing;
                  const isSelected = activeSelectionMode && selectedKeySet.has(selectionKey);
                  const displayPrice = getCollectionItemPrice(item, primaryPriceSource);
                  const displayPriceCurrency = getCollectionItemPriceCurrency(
                    item,
                    primaryPriceSource
                  );
                  const costBasis = getCollectionItemCostBasis(item);
                  const costBasisLabel = getCollectionItemCostBasisLabel(item);
                  const pnl =
                    item.current_value != null && costBasis != null
                      ? Number((item.current_value - costBasis).toFixed(2))
                      : null;

                  return (
                    <article
                      key={selectionKey}
                      role="button"
                      tabIndex={0}
                      aria-pressed={activeSelectionMode ? isSelected : undefined}
                      aria-disabled={activeSelectionMode && !selectableInMode}
                      onClick={() => handleTileActivate(item, selectionKey, selectableInMode)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleTileActivate(item, selectionKey, selectableInMode);
                        }
                      }}
                      className={`min-w-0 rounded-2xl border bg-white/[0.045] p-3 shadow-sm shadow-black/20 transition-colors ${
                        isSelected
                          ? "border-blue-400/70 ring-2 ring-blue-400/50"
                          : "border-white/8"
                      } ${activeSelectionMode && !selectableInMode ? "cursor-not-allowed opacity-55" : "cursor-pointer"}`}
                    >
                      <div className="flex gap-3">
                        <div className="relative h-24 w-[4.25rem] shrink-0 bg-transparent drop-shadow-[0_8px_14px_rgba(0,0,0,0.18)]">
                          {item.image_url ? (
                            <Image
                              src={getCachedImageUrl(item.image_url) ?? item.image_url}
                              alt={item.name}
                              fill
                              className={`object-contain ${
                                blurMissing && missing ? "blur-[2px] saturate-[0.72] opacity-55" : ""
                              }`}
                              sizes="68px"
                              loading={index < eagerImageCount ? "eager" : undefined}
                              unoptimized
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-gray-400 dark:text-white/35">
                              {item.name.slice(0, 2)}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-white">
                                {item.name}
                              </p>
                              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-white/50">
                                <span className="shrink-0">
                                  {item.card_number ? `#${item.card_number}` : "--"}
                                </span>
                                <Link
                                  href={getExpansionHref(item.episode_id)}
                                  prefetch={false}
                                  onClick={(event) => event.stopPropagation()}
                                  className="min-w-0 truncate transition-colors hover:text-white hover:underline underline-offset-2"
                                >
                                  {item.episode_name}
                                  {item.episode_code ? (
                                    <span className="ml-1 opacity-60">({item.episode_code})</span>
                                  ) : null}
                                </Link>
                              </div>
                            </div>

                            {!activeSelectionMode &&
                              (item.owned ? (
                                canRemoveFromCollection &&
                                (item.collection_item_id ||
                                  (item.collection_item_ids?.length ?? 0) > 0) ? (
                                  <button
                                    type="button"
                                    onClick={(event) => handleSingleRemove(event, item)}
                                    disabled={removingItems}
                                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/8 bg-black/5 text-gray-900 transition-colors hover:border-black/15 hover:bg-black/8 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:bg-white/12"
                                    aria-label={`Remove ${item.name} from collection`}
                                    title="Remove from collection"
                                  >
                                    <Minus className="h-3.5 w-3.5" />
                                  </button>
                                ) : null
                              ) : (
                                <div className="flex shrink-0 items-center gap-1">
                                  <CollectionAddCardButton
                                    card={{
                                      id: item.card_id,
                                      name: item.name,
                                      image_url: item.image_url,
                                      episode: {
                                        id: item.episode_id,
                                        name: item.episode_name,
                                        code: item.episode_code,
                                      },
                                    }}
                                    initialBinderId={bulkAddBinder?.id ?? null}
                                    lockedBinderName={bulkAddBinder?.name ?? null}
                                    className="h-8 w-8 shrink-0 rounded-lg border-black/8 bg-black/5 text-gray-900 hover:border-black/15 hover:bg-black/8 dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:bg-white/12"
                                  />
                                  {canRemoveFromWants && item.want_item_id ? (
                                    <button
                                      type="button"
                                      onClick={(event) => handleSingleRemove(event, item)}
                                      disabled={removingItems}
                                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/8 bg-black/5 text-gray-900 transition-colors hover:border-black/15 hover:bg-black/8 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:bg-white/12"
                                      aria-label={`Remove ${item.name} from Wants`}
                                      title="Remove from Wants"
                                    >
                                      <Minus className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null}
                                </div>
                              ))}
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-xl border border-black/7 bg-black/[0.025] px-2.5 py-2 dark:border-white/8 dark:bg-white/[0.04]">
                              <p className="font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-white/35">
                                {primaryPriceSource === "tcp" ? "TCGPlayer" : "CardMarket"}
                              </p>
                              <p className="mt-1 truncate font-semibold tabular-nums text-gray-950 dark:text-white">
                                {displayPrice != null
                                  ? formatMarketCurrency(displayPrice, displayPriceCurrency)
                                  : "No price"}
                              </p>
                            </div>
                            <div className="rounded-xl border border-black/7 bg-black/[0.025] px-2.5 py-2 dark:border-white/8 dark:bg-white/[0.04]">
                              <p className="font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-white/35">
                                P&amp;L
                              </p>
                              <p
                                className={`mt-1 truncate font-semibold tabular-nums ${
                                  pnl == null
                                    ? "text-gray-400 dark:text-white/35"
                                    : pnl >= 0
                                      ? "text-emerald-600 dark:text-emerald-300"
                                      : "text-rose-600 dark:text-rose-300"
                                }`}
                              >
                                {pnl != null
                                  ? `${pnl >= 0 ? "+" : ""}${formatCollectionCurrency(pnl)}`
                                  : "--"}
                              </p>
                            </div>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.rarity ? (
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold leading-none ${rarityBadge(item.rarity)}`}
                              >
                                {normalizeRarityLabel(item.rarity) ?? item.rarity}
                              </span>
                            ) : null}
                            {costBasis != null ? (
                              <span className="inline-flex items-center rounded-full border border-black/8 bg-white/70 px-2 py-1 text-[11px] font-medium text-gray-500 dark:border-white/8 dark:bg-white/[0.04] dark:text-white/55">
                                {costBasisLabel}: {formatCollectionCurrency(costBasis)}
                              </span>
                            ) : null}
                            <span className="inline-flex items-center rounded-full border border-black/8 bg-white/70 px-2 py-1 text-[11px] font-medium text-gray-500 dark:border-white/8 dark:bg-white/[0.04] dark:text-white/55">
                              {missing && blurMissing
                                ? "Missing"
                                : item.owned_count && item.owned_count > 1
                                  ? `x${item.owned_count} owned`
                                  : item.owned
                                    ? "Owned"
                                    : item.want_item_id
                                      ? "Wanted"
                                      : "Available"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto rounded-2xl border border-black/8 bg-white/70 shadow-sm shadow-black/5 dark:border-white/8 dark:bg-white/[0.04] md:block">
                <table className="min-w-full text-sm text-gray-900 dark:text-white">
                  <thead className="border-b border-black/8 text-xs uppercase tracking-[0.14em] text-gray-400 dark:border-white/8 dark:text-white/40">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Card</th>
                      <th className="px-4 py-3 text-left font-semibold">Rarity</th>
                      <th className="px-4 py-3 text-left font-semibold">
                        {primaryPriceSource === "tcp" ? "TCGPlayer" : "CardMarket"}
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">Cost Basis</th>
                      <th className="px-4 py-3 text-left font-semibold">P&amp;L</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                      <th className="px-4 py-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.entries.map(({ item, selectionKey }, index) => {
                      const missing = !item.owned;
                      const selectableInMode = selectionEnabled ? true : !blurMissing || missing;
                      const isSelected = activeSelectionMode && selectedKeySet.has(selectionKey);
                      const displayPrice = getCollectionItemPrice(item, primaryPriceSource);
                      const displayPriceCurrency = getCollectionItemPriceCurrency(
                        item,
                        primaryPriceSource
                      );
                      const costBasis = getCollectionItemCostBasis(item);
                      const costBasisLabel = getCollectionItemCostBasisLabel(item);
                      const pnl =
                        item.current_value != null && costBasis != null
                          ? Number((item.current_value - costBasis).toFixed(2))
                          : null;

                      return (
                        <tr
                          key={selectionKey}
                          role="button"
                          tabIndex={0}
                          aria-pressed={activeSelectionMode ? isSelected : undefined}
                          aria-disabled={activeSelectionMode && !selectableInMode}
                          onClick={() => handleTileActivate(item, selectionKey, selectableInMode)}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleTileActivate(item, selectionKey, selectableInMode);
                            }
                          }}
                          className={`border-b border-black/6 transition-colors last:border-b-0 dark:border-white/6 ${
                            isSelected
                              ? "bg-violet-500/10"
                              : missing && blurMissing
                                ? "opacity-70"
                                : "hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                          } ${activeSelectionMode && !selectableInMode ? "cursor-not-allowed" : "cursor-pointer"}`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="relative h-16 w-12 shrink-0 bg-transparent drop-shadow-[0_6px_12px_rgba(0,0,0,0.16)]">
                                {item.image_url ? (
                                  <Image
                                    src={getCachedImageUrl(item.image_url) ?? item.image_url}
                                    alt={item.name}
                                    fill
                                    className={`object-contain ${
                                      blurMissing && missing
                                        ? "blur-[2px] saturate-[0.72] opacity-55"
                                        : ""
                                    }`}
                                    sizes="48px"
                                    loading={index < eagerImageCount ? "eager" : undefined}
                                    unoptimized
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-xs text-gray-400 dark:text-white/35">
                                    {item.name.slice(0, 2)}
                                  </div>
                                )}
                              </div>

                              <div className="min-w-0">
                                <p className="truncate font-semibold">{item.name}</p>
                                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-white/50">
                                  <span>{item.card_number ? `#${item.card_number}` : "--"}</span>
                                  <span>•</span>
                                  <Link
                                    href={getExpansionHref(item.episode_id)}
                                    prefetch={false}
                                    onClick={(event) => event.stopPropagation()}
                                    className="truncate transition-colors hover:text-gray-900 hover:underline underline-offset-2 dark:hover:text-white"
                                  >
                                    {item.episode_name}
                                    {item.episode_code ? (
                                      <span className="ml-1 opacity-60">({item.episode_code})</span>
                                    ) : null}
                                  </Link>
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            {item.rarity ? (
                              <span
                                className={`inline-flex items-center rounded-full px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none ${rarityBadge(item.rarity)}`}
                              >
                                {normalizeRarityLabel(item.rarity) ?? item.rarity}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400 dark:text-white/35">--</span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            {displayPrice != null ? (
                              <div className="space-y-0.5">
                                <p className="font-semibold tabular-nums">
                                  {formatMarketCurrency(displayPrice, displayPriceCurrency)}
                                </p>
                                {item.current_value_label && (
                                  <p className="text-[11px] text-gray-400 dark:text-white/35">
                                    {item.current_value_label}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400 dark:text-white/35">
                                No price
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-white/55">
                            {costBasis != null ? (
                              <div className="space-y-0.5">
                                <p className="tabular-nums">
                                  {formatCollectionCurrency(costBasis)}
                                </p>
                                {item.cost_basis_source === "linked_binder_allocation" && (
                                  <p className="text-[11px] text-gray-400 dark:text-white/35">
                                    {costBasisLabel}
                                  </p>
                                )}
                              </div>
                            ) : (
                              "--"
                            )}
                          </td>

                          <td className="px-4 py-3">
                            {pnl != null ? (
                              <span
                                className={
                                  pnl >= 0
                                    ? "font-semibold text-emerald-600 dark:text-emerald-300"
                                    : "font-semibold text-rose-600 dark:text-rose-300"
                                }
                              >
                                {pnl >= 0 ? "+" : ""}
                                {formatCollectionCurrency(pnl)}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400 dark:text-white/35">--</span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-xs text-gray-500 dark:text-white/55">
                            {missing && blurMissing ? (
                              <span>Missing</span>
                            ) : item.owned_count && item.owned_count > 1 ? (
                              <span>x{item.owned_count} owned</span>
                            ) : item.owned ? (
                              <span>Owned</span>
                            ) : item.want_item_id ? (
                              <span>Wanted</span>
                            ) : (
                              <span>Available</span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1.5">
                              {!activeSelectionMode &&
                                (item.owned ? (
                                  canRemoveFromCollection &&
                                  (item.collection_item_id ||
                                    (item.collection_item_ids?.length ?? 0) > 0) ? (
                                    <button
                                      type="button"
                                      onClick={(event) => handleSingleRemove(event, item)}
                                      disabled={removingItems}
                                      className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-md border border-black/8 bg-black/5 text-gray-900 transition-colors hover:border-black/15 hover:bg-black/8 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:bg-white/12"
                                      aria-label={`Remove ${item.name} from collection`}
                                      title="Remove from collection"
                                    >
                                      <Minus className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null
                                ) : (
                                  <>
                                    <CollectionAddCardButton
                                      card={{
                                        id: item.card_id,
                                        name: item.name,
                                        image_url: item.image_url,
                                        episode: {
                                          id: item.episode_id,
                                          name: item.episode_name,
                                          code: item.episode_code,
                                        },
                                      }}
                                      initialBinderId={bulkAddBinder?.id ?? null}
                                      lockedBinderName={bulkAddBinder?.name ?? null}
                                      className="h-[28px] w-[28px] rounded-md border-black/8 bg-black/5 text-gray-900 hover:border-black/15 hover:bg-black/8 dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:bg-white/12"
                                    />
                                    {canRemoveFromWants && item.want_item_id ? (
                                      <button
                                        type="button"
                                        onClick={(event) => handleSingleRemove(event, item)}
                                        disabled={removingItems}
                                        className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-md border border-black/8 bg-black/5 text-gray-900 transition-colors hover:border-black/15 hover:bg-black/8 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:bg-white/12"
                                        aria-label={`Remove ${item.name} from Wants`}
                                        title="Remove from Wants"
                                      >
                                        <Minus className="h-3.5 w-3.5" />
                                      </button>
                                    ) : null}
                                  </>
                                ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className={`${splitByGrading ? "space-y-6" : ""} ${isFilteringPending ? "opacity-80" : "opacity-100"} transition-opacity`}>
          {renderedGroupedVisibleEntries.map((group) => (
            <section key={group.key}>
              {group.title && (
                <SectionHeader
                  title={group.title}
                  count={group.totalCount}
                  compact
                  className="mb-2.5"
                />
              )}
              <div
                className={`grid ${gridGapClass}`}
                style={{
                  gridTemplateColumns,
                  justifyContent: isMobileViewport ? "stretch" : "start",
                }}
              >
                {group.entries.map(({ item, selectionKey }, index) => {
                  const missing = !item.owned;
                  const selectableInMode = selectionEnabled ? true : !blurMissing || missing;
                  const isSelected = activeSelectionMode && selectedKeySet.has(selectionKey);
                  const gradingCompanyLabel = normalizeGradingCompanyLabel(item.grading_company);
                  const gradingGradeLabel = normalizeGradingGradeLabel(item.grading_grade);
                  const isGradedCard = Boolean(
                    showGradedSlabPreview && item.owned && gradingCompanyLabel && gradingGradeLabel
                  );
                  const previewAspectClass = isGradedCard
                    ? GRADED_SLAB_ASPECT_CLASS
                    : RAW_CARD_ASPECT_CLASS;
                  const baseImageClass = isGradedCard
                    ? "object-contain"
                    : "rounded-[4.75%] object-fill";
                  const croppedImageClass = getCardImageClassName(item.image_url, baseImageClass);
                  const imageClass =
                    blurMissing && missing
                      ? `${croppedImageClass} blur-[2.5px] saturate-[0.72] opacity-55`
                      : croppedImageClass;
                  const displayPrice = getCollectionItemPrice(item, primaryPriceSource);
                  const displayPriceCurrency = getCollectionItemPriceCurrency(
                    item,
                    primaryPriceSource
                  );
                  const costBasis = getCollectionItemCostBasis(item);
                  const trendPercent = getTileTrendPercent(item.current_value, costBasis);
                  const tileAction =
                    !activeSelectionMode && !item.owned ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <CollectionAddCardButton
                          card={{
                            id: item.card_id,
                            name: item.name,
                            image_url: item.image_url,
                            episode: {
                              id: item.episode_id,
                              name: item.episode_name,
                              code: item.episode_code,
                            },
                          }}
                          initialBinderId={bulkAddBinder?.id ?? null}
                          lockedBinderName={bulkAddBinder?.name ?? null}
                          className={collectionTileActionButtonClass(displaySettings.cardSize)}
                          theme="dark"
                        />
                        {canRemoveFromWants && item.want_item_id ? (
                          <button
                            type="button"
                            onClick={(event) => handleSingleRemove(event, item)}
                            disabled={removingItems}
                            className={collectionTileActionButtonClass(displaySettings.cardSize)}
                            aria-label={`Remove ${item.name} from Wants`}
                            title="Remove from Wants"
                          >
                            <Minus
                              className={collectionTileActionIconClass(displaySettings.cardSize)}
                            />
                          </button>
                        ) : null}
                      </div>
                    ) : null;

                  return (
                    <div
                      key={selectionKey}
                      role="button"
                      tabIndex={0}
                      aria-pressed={activeSelectionMode ? isSelected : undefined}
                      aria-disabled={activeSelectionMode && !selectableInMode}
                      onClick={() => handleTileActivate(item, selectionKey, selectableInMode)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleTileActivate(item, selectionKey, selectableInMode);
                        }
                      }}
                      className={`relative flex h-full cursor-pointer flex-col rounded-[14px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] p-1.5 text-left shadow-[0_12px_28px_rgba(0,0,0,0.24)] outline-none transition-colors hover:border-white/14 max-[640px]:rounded-[13px] max-[640px]:p-1 ${
                        isSelected ? "border-blue-400/70 ring-2 ring-blue-400/60" : ""
                      }`}
                      style={{
                        contain: "layout paint style",
                        contentVisibility: "auto",
                        containIntrinsicSize: isMobileViewport ? "250px" : "320px",
                      }}
                    >
                      <div
                        className={`relative ${previewAspectClass} w-full transition-all duration-200 ${
                          isGradedCard
                            ? `overflow-hidden rounded-xl border ${
                                isSelected
                                  ? "border-blue-400/80 shadow-lg shadow-blue-500/25 ring-2 ring-blue-400/80"
                                  : "border-transparent shadow-md shadow-black/20"
                              }`
                            : isSelected
                              ? "overflow-hidden rounded-[4.75%] bg-[#dedbd1] drop-shadow-[0_12px_24px_rgba(59,130,246,0.32)] ring-2 ring-blue-400/80 after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-2 after:ring-inset after:ring-black/8 dark:bg-[#d8d5cc] dark:after:ring-white/12"
                              : "overflow-hidden rounded-[4.75%] bg-[#dedbd1] drop-shadow-[0_10px_18px_rgba(0,0,0,0.22)] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-2 after:ring-inset after:ring-black/8 dark:bg-[#d8d5cc] dark:after:ring-white/12"
                        }`}
                      >
                        {isGradedCard && gradingCompanyLabel && gradingGradeLabel ? (
                          <GradedSlabPreview
                            company={gradingCompanyLabel}
                            grade={gradingGradeLabel}
                            name={item.name}
                            episodeName={item.episode_name}
                            episodeCode={item.episode_code}
                            episodeSeries={item.episode_series}
                            episodeReleaseDate={item.episode_release_date}
                            cardNumber={item.card_number}
                            bgsSubgrades={item.grading_subgrades ?? null}
                            imageUrl={item.image_url}
                            alt={item.name}
                            className="absolute inset-0"
                            imageClassName={imageClass}
                            tileSize={displaySettings.cardSize}
                            sizes={cardTrackWidth}
                            loading={index < eagerImageCount ? "eager" : undefined}
                          />
                        ) : item.image_url ? (
                          <Image
                            src={getCachedImageUrl(item.image_url) ?? item.image_url}
                            alt={item.name}
                            fill
                            className={imageClass}
                            sizes={cardTrackWidth}
                            loading={index < eagerImageCount ? "eager" : undefined}
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-black/6 text-xs text-gray-300 dark:bg-white/6">
                            {item.name.slice(0, 2)}
                          </div>
                        )}

                        {blurMissing && missing && (
                          <div className="pointer-events-none absolute inset-0 bg-black/[0.08] dark:bg-black/[0.18]" />
                        )}

                        {isSelected && <div className="pointer-events-none absolute inset-0 bg-violet-500/10" />}

                        {openingItemKey === getOpeningItemKey(item, selectionKey) && (
                          <CardLoadingOverlay />
                        )}

                        {blurMissing && missing && (
                          <div className="absolute left-2 top-2">
                            <span className={collectionOverlayBadgeClass(displaySettings.cardSize)}>
                              Missing
                            </span>
                          </div>
                        )}

                        {(item.owned_count ?? 0) > 1 && (
                          <span className={`absolute left-2 top-2 ${collectionOverlayBadgeClass(displaySettings.cardSize)}`}>
                            x{item.owned_count}
                          </span>
                        )}
                        {tileAction && (
                          <div
                            className="absolute bottom-1.5 right-1.5 z-10"
                            onClick={(event) => event.stopPropagation()}
                            onPointerDown={(event) => event.stopPropagation()}
                          >
                            {tileAction}
                          </div>
                        )}
              </div>

              <div className={collectionTileInfoClass(displaySettings.cardSize)}>
                <div className="flex min-h-0 flex-1 flex-col gap-1">
                  <div className="min-w-0">
                    <p className={collectionTileTitleClass(displaySettings.cardSize)}>
                      {item.name}
                    </p>
                    <div className={collectionTileMetaLineClass(displaySettings.cardSize)}>
                      <span className="shrink-0 text-white/42">
                        {item.card_number ? `#${item.card_number}` : "--"}
                      </span>
                    </div>
                  </div>

                  <div className={collectionTilePriceRowClass(displaySettings.cardSize, isMobileViewport)}>
                    {displayPrice != null ? (
                      <span
                        title={
                          item.current_value_label
                            ? `Using ${item.current_value_label}`
                            : undefined
                        }
                        className={collectionTilePriceClass(displaySettings.cardSize)}
                      >
                        {formatMarketCurrency(displayPrice, displayPriceCurrency)}
                      </span>
                    ) : (
                      <span className={collectionTileNoPriceClass(displaySettings.cardSize)}>No price</span>
                    )}
                    {trendPercent != null && (
                      <span
                        className={collectionTileTrendClass(
                          displaySettings.cardSize,
                          isMobileViewport,
                          trendPercent >= 0
                        )}
                        title={`P&L ${trendPercent >= 0 ? "+" : ""}${trendPercent}%`}
                      >
                        {trendPercent >= 0 ? (
                          <TrendingUp
                            className={collectionTileTrendIconClass(
                              displaySettings.cardSize,
                              isMobileViewport
                            )}
                          />
                        ) : (
                          <TrendingDown
                            className={collectionTileTrendIconClass(
                              displaySettings.cardSize,
                              isMobileViewport
                            )}
                          />
                        )}
                        <span className="truncate">
                          {trendPercent >= 0 ? "+" : ""}
                          {trendPercent}%
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {hasMoreVisibleEntries && (
        <div
          ref={loadMoreRef}
          className="mt-5 flex h-10 items-center justify-center text-xs font-semibold text-gray-400 dark:text-white/35"
          aria-live="polite"
        >
          Loading more cards ({renderedVisibleEntries.length.toLocaleString("en-US")} /{" "}
          {visibleEntries.length.toLocaleString("en-US")})
        </div>
      )}

      {bulkAddBinder && bulkAddOpen && (
        <CollectionBulkAddCardsModal
          cards={selectedCards}
          initialBinderId={bulkAddBinder.id}
          lockedBinderName={bulkAddBinder.name}
          onClose={() => setBulkAddOpen(false)}
          onAdded={() => {
            setBulkAddOpen(false);
            setSelectionMode(false);
            setSelectedKeys([]);
          }}
        />
      )}

      {removeDialog && (
        <div
          className={`${modalCenteredMobileOverlayClass} z-[360]`}
          onClick={() => {
            if (!removingItems) {
              setRemoveDialog(null);
              setRemoveError(null);
            }
          }}
        >
          <div
            className={`${modalCenteredPanelClass} max-w-md`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={modalCompactHeaderClass}>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38 max-[640px]:text-[9px]">
                  {removeDialog.target === "wants" ? "Remove From Wants" : "Remove From Collection"}
                </p>
                <h2 className="mt-1.5 text-2xl font-bold leading-tight max-[640px]:text-[18px]">
                  {removeDialog.title}
                </h2>
                <p className="mt-2 text-sm text-white/55 max-[640px]:text-[12px]">
                  {removeDialog.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRemoveDialog(null);
                  setRemoveError(null);
                }}
                disabled={removingItems}
                className={modalCloseButtonClass}
                aria-label="Close remove dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 pb-6 pt-5 max-[640px]:px-4 max-[640px]:pb-4 max-[640px]:pt-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white/68 max-[640px]:rounded-xl max-[640px]:text-[12px]">
                {removeDialog.target === "wants"
                  ? "This only removes the card from Wants. Your collection stays unchanged."
                  : "This removes the saved collection entry entirely. It will not be moved to loose singles."}
              </div>

              {removeError && <p className="mt-4 text-sm text-rose-300">{removeError}</p>}

              <div className={modalActionRowClass}>
                <button
                  type="button"
                  onClick={() =>
                    void (removeDialog.target === "wants"
                      ? removeItemsFromWants(removeDialog.itemIds)
                      : removeItemsFromCollection(removeDialog.itemIds))
                  }
                  disabled={removingItems}
                  className={modalDangerButtonClass}
                >
                  {removingItems
                    ? "Removing..."
                    : removeDialog.itemIds.length > 1
                      ? "Remove cards"
                      : "Remove card"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRemoveDialog(null);
                    setRemoveError(null);
                  }}
                  disabled={removingItems}
                  className={modalSecondaryButtonClass}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedCard && (
        <CardModal
          key={selectedCard.id}
          card={selectedCard}
          showGradedSlabPreview={showGradedSlabPreview}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </>
  );
}
