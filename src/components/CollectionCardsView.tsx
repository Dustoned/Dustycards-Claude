"use client";

import { type ReactNode, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeEuro, CheckCircle2, Minus, Pencil, RotateCcw, TrendingDown, TrendingUp, X } from "lucide-react";
import CardBrowserToolbar, {
  type CardBrowserToolbarActiveFilter,
  type CardBrowserToolbarFilterOption,
  type CardBrowserToolbarFilterSection,
  type CardBrowserToolbarOption,
} from "@/components/CardBrowserToolbar";
import { cardMatchesSearchQuery } from "@/lib/card-search";
import { CardLoadingOverlay } from "@/components/CardLoadingOverlay";
import CachedImage from "@/components/CachedImage";
import {
  CardListTile,
  CardListTileBody,
  CardListTileFooter,
  CardListTileMedia,
  CardListTileMetrics,
  CardListTilePrice,
} from "@/components/CardListTile";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";
import CollectionCardQuickActions from "@/components/CollectionCardQuickActions";
import CardPriceAlertButton from "@/components/card-detail/CardPriceAlertButton";
import EmptyState from "@/components/EmptyState";
import { SectionHeader } from "@/components/PageHeader";
import VendorBuyEstimate from "@/components/VendorBuyEstimate";
import { formatCollectionCurrency } from "@/lib/collection";
import { getCardImageClassName, getCardImageFrameClassName } from "@/lib/card-image-display";
import { getCardGridImageSizes, getCardGridTemplateColumns } from "@/lib/display-scale";
import { getExpansionHref } from "@/lib/games";
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
import type { CardQuickActionData } from "@/lib/card-quick-actions";
import {
  modalActionRowClass,
  modalBodyClass,
  modalCenteredMobileOverlayClass,
  modalCenteredPanelClass,
  modalCloseButtonClass,
  modalCompactHeaderClass,
  modalDangerButtonClass,
  modalInputClass,
  modalPrimaryButtonClass,
  modalSecondaryButtonClass,
} from "@/components/modal-glass-styles";
import {
  KNOWN_SUPERTYPE_ORDER,
  buildFilterOptions,
  collectionOverlayBadgeClass,
  collectionSoldOverlayBadgeClass,
  collectionTileActionButtonClass,
  collectionTileInfoClass,
  collectionTileMetaLineClass,
  collectionTileNoPriceClass,
  collectionTilePriceClass,
  collectionTilePriceRowClass,
  collectionTileTitleClass,
  collectionTileTrendClass,
  collectionTileTrendIconClass,
  compareCollectionCardItems,
  filterSellingInventoryItems,
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
  omitOptimisticallyMovedCollectionItems,
  rarityFilterChip,
  selectionToggleTextClass,
  type PreparedCollectionEntry,
} from "@/components/collection-cards-view-helpers";
import type { CollectionCardSavedDetail } from "@/lib/collection-client-events";

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
  emptyActionHref?: string | null;
  emptyActionLabel?: string;
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
  collectionRemovalLabel?: string;
  collectionRemovalWarning?: string;
  allowSoldMarking?: boolean;
  allowSaleListing?: boolean;
  readOnlyCollectionItems?: boolean;
  salesLedger?: boolean;
  allowSaleRecordEditing?: boolean;
}

interface RemoveDialogState {
  itemIds: string[];
  target: "collection" | "wants";
  title: string;
  description: string;
}

interface SoldDialogItem {
  itemId: string;
  item: CollectionCardViewItem;
}

interface SoldDialogState {
  items: SoldDialogItem[];
  mode: "per-card" | "stack";
  prices: Record<string, string>;
  totalPrice: string;
  feeTotal: string;
  platform: string;
  error: string | null;
}

interface SellQuoteDialogState {
  items: SoldDialogItem[];
}

interface SaleListingDialogState {
  items: SoldDialogItem[];
  mode: "stack" | "per-card";
  totalPaid: string;
  prices: Record<string, string>;
  error: string | null;
}

type CollectionView = Exclude<CardView, "binder">;

const INITIAL_COLLECTION_RENDER_COUNT = 36;
const COLLECTION_RENDER_BATCH_SIZE = 48;
const INITIAL_COLLECTION_EAGER_IMAGE_COUNT = 4;
const LONG_PRESS_SELECT_MS = 450;
const LONG_PRESS_MOVE_TOLERANCE_PX = 12;

function getTileTrendPercent(currentValue: number | null | undefined, costBasis: number | null): number | null {
  if (currentValue == null || costBasis == null || costBasis <= 0) return null;
  return Number((((currentValue - costBasis) / costBasis) * 100).toFixed(1));
}

function parseCurrencyInput(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatPricePlaceholder(value: number | null | undefined): string {
  return value == null ? "0.00" : value.toFixed(2);
}

interface SaleRecordDialogState {
  item: CollectionCardViewItem;
  salePrice: string;
  feeTotal: string;
  platform: string;
  error: string | null;
}

function getNetSalePrice(item: CollectionCardViewItem): number | null {
  if (item.sale_price == null) return null;
  return Number((item.sale_price - (item.sale_fee_eur ?? 0)).toFixed(2));
}

function getSalePnl(item: CollectionCardViewItem, costBasis: number | null): number | null {
  const netSalePrice = getNetSalePrice(item);
  if (netSalePrice == null || costBasis == null) return null;
  return Number((netSalePrice - costBasis).toFixed(2));
}

function formatSoldDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getReleaseYear(value: string | null | undefined): string | null {
  const match = value?.match(/^(\d{4})/);
  return match?.[1] ?? null;
}

function getCollectionCardQuickActionData(item: CollectionCardViewItem): CardQuickActionData {
  return {
    card: {
      id: item.card_id,
      name: item.name,
      image_url: item.image_url,
      episode: {
        id: item.episode_id,
        name: item.episode_name,
        code: item.episode_code,
      },
    },
    owned: item.owned,
    wantItem: item.want_item_id
      ? {
          id: item.want_item_id,
          created_at: "",
        }
      : null,
  };
}

export default function CollectionCardsView({
  items,
  blurMissing = false,
  emptyTitle,
  emptyText,
  emptyActionHref = "/search",
  emptyActionLabel = "Find cards",
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
  collectionRemovalLabel = "My Collection",
  collectionRemovalWarning = "This removes the saved collection entry entirely. It will not be moved to loose singles.",
  allowSoldMarking = false,
  allowSaleListing = false,
  readOnlyCollectionItems = false,
  salesLedger = false,
  allowSaleRecordEditing = false,
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
  const [selectedReleaseYears, setSelectedReleaseYears] = useState<string[]>([]);
  const [selectedCard, setSelectedCard] = useState<ModalCardData | null>(null);
  const [openingItemKey, setOpeningItemKey] = useState<string | null>(null);
  const [openCardError, setOpenCardError] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [removingItems, setRemovingItems] = useState(false);
  const [removeDialog, setRemoveDialog] = useState<RemoveDialogState | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [sellQuoteDialog, setSellQuoteDialog] = useState<SellQuoteDialogState | null>(null);
  const [soldDialog, setSoldDialog] = useState<SoldDialogState | null>(null);
  const [savingSold, setSavingSold] = useState(false);
  const [saleListingDialog, setSaleListingDialog] = useState<SaleListingDialogState | null>(null);
  const [savingSaleListing, setSavingSaleListing] = useState(false);
  const [saleRecordDialog, setSaleRecordDialog] = useState<SaleRecordDialogState | null>(null);
  const [savingSaleRecord, setSavingSaleRecord] = useState(false);
  const [optimisticallyMovedItemIds, setOptimisticallyMovedItemIds] = useState<string[]>([]);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectionEnabled =
    Boolean(bulkAddBinder) ||
    allowCollectionRemoval ||
    allowWantRemoval ||
    allowSoldMarking ||
    allowSaleListing;
  const canBulkAddToBinder = Boolean(bulkAddBinder) && blurMissing;
  const canRemoveFromCollection = Boolean(bulkAddBinder) || allowCollectionRemoval;
  const canRemoveFromWants = allowWantRemoval;
  const canMarkSold = allowSoldMarking;
  const canSendToSale = allowSaleListing;
  const optimisticallyMovedItemIdSet = useMemo(
    () => new Set(optimisticallyMovedItemIds),
    [optimisticallyMovedItemIds]
  );
  const visibleSourceItems = useMemo(() => {
    const currentItems = omitOptimisticallyMovedCollectionItems(items, optimisticallyMovedItemIdSet);

    // Keep the two selling modes strictly separated on the client as well as
    // in the database query. This also prevents a reused grid from briefly
    // retaining active inventory after switching to the Sold ledger.
    return filterSellingInventoryItems(
      currentItems,
      salesLedger ? "sold" : allowSoldMarking ? "active" : "all"
    );
  }, [allowSoldMarking, items, optimisticallyMovedItemIdSet, salesLedger]);

  useEffect(() => {
    const currentItemIds = new Set(
      items.flatMap((item) =>
        item.collection_item_ids?.length
          ? item.collection_item_ids
          : item.collection_item_id
            ? [item.collection_item_id]
            : []
      )
    );
    setOptimisticallyMovedItemIds((current) => {
      const next = current.filter((id) => currentItemIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [items]);

  function handleCollectionItemSaved(detail: CollectionCardSavedDetail) {
    const sourceItem = items.find((item) => {
      const itemIds = item.collection_item_ids?.length
        ? item.collection_item_ids
        : item.collection_item_id
          ? [item.collection_item_id]
          : [];
      return itemIds.includes(detail.itemId);
    });

    if (!sourceItem || Boolean(sourceItem.for_sale) === detail.forSale) return;

    setOptimisticallyMovedItemIds((current) =>
      current.includes(detail.itemId) ? current : [...current, detail.itemId]
    );
  }

  const availableRarities = useMemo(
    () =>
      buildFilterOptions(
        visibleSourceItems.map((item) => item.rarity),
        KNOWN_RARITY_ORDER,
        normalizeRarityLabel
      ),
    [visibleSourceItems]
  );
  const availableSupertypes = useMemo(
    () => buildFilterOptions(visibleSourceItems.map((item) => item.supertype), KNOWN_SUPERTYPE_ORDER),
    [visibleSourceItems]
  );
  const availableReleaseYears = useMemo(
    () =>
      buildFilterOptions(
        visibleSourceItems.map((item) => getReleaseYear(item.episode_release_date)),
        []
      ).sort((left, right) => right.value.localeCompare(left.value)),
    [visibleSourceItems]
  );
  const availableReleaseYearValues = useMemo(
    () => new Set(availableReleaseYears.map((option) => option.value)),
    [availableReleaseYears]
  );
  const activeReleaseYears = useMemo(
    () => selectedReleaseYears.filter((year) => availableReleaseYearValues.has(year)),
    [availableReleaseYearValues, selectedReleaseYears]
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
      visibleSourceItems.map((item, index) => ({
        item,
        selectionKey: item.collection_item_id ?? `${item.card_id}-${index}`,
        normalizedRarity: normalizeRarityLabel(item.rarity),
        isPriced: hasAnyVisiblePrice(item),
        isGraded: isGradedCollectionCard(item),
      })),
    [visibleSourceItems]
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
  const deferredReleaseYears = useDeferredValue(activeReleaseYears);
  const deferredEffectiveShowOnlyGraded = useDeferredValue(effectiveShowOnlyGraded);
  const deferredEffectiveOnlyPriced = useDeferredValue(effectiveOnlyPriced);
  const isFilteringPending =
    normalizedSearch !== deferredNormalizedSearch ||
    appliedRarities !== deferredAppliedRarities ||
    appliedSupertypes !== deferredAppliedSupertypes ||
    activeReleaseYears !== deferredReleaseYears ||
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

      if (
        deferredReleaseYears.length > 0 &&
        !deferredReleaseYears.includes(getReleaseYear(entry.item.episode_release_date) ?? "")
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
    deferredReleaseYears,
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
    deferredReleaseYears.length === 0 &&
    visibleSourceItems.length > 0 &&
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
  const initialRenderCount = isMobileViewport ? 18 : INITIAL_COLLECTION_RENDER_COUNT;
  const renderBatchSize = isMobileViewport ? 24 : COLLECTION_RENDER_BATCH_SIZE;
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
      { rootMargin: isMobileViewport ? "160px 0px" : "400px 0px" }
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
                number: entry.item.card_number,
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
  const selectedSoldItems = useMemo(() => {
    const itemsById = new Map<string, CollectionCardViewItem>();

    for (const entry of preparedEntries) {
      if (!selectedKeySet.has(entry.selectionKey) || !entry.item.for_sale || entry.item.sold_at) {
        continue;
      }

      const itemIds =
        entry.item.collection_item_ids ??
        (entry.item.collection_item_id ? [entry.item.collection_item_id] : []);
      for (const itemId of itemIds) {
        itemsById.set(itemId, {
          ...entry.item,
          collection_item_id: itemId,
          collection_item_ids: [itemId],
        });
      }
    }

    return [...itemsById.entries()].map(([itemId, item]) => ({ itemId, item }));
  }, [preparedEntries, selectedKeySet]);
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
  const selectedSaleListingItems = useMemo(() => {
    const itemsById = new Map<string, CollectionCardViewItem>();

    for (const entry of preparedEntries) {
      if (!selectedKeySet.has(entry.selectionKey) || entry.item.for_sale || entry.item.sold_at) {
        continue;
      }

      const itemIds =
        entry.item.collection_item_ids ??
        (entry.item.collection_item_id ? [entry.item.collection_item_id] : []);
      for (const itemId of itemIds) {
        itemsById.set(itemId, {
          ...entry.item,
          collection_item_id: itemId,
          collection_item_ids: [itemId],
        });
      }
    }

    return [...itemsById.entries()].map(([itemId, item]) => ({ itemId, item }));
  }, [preparedEntries, selectedKeySet]);

  function getOpeningItemKey(item: CollectionCardViewItem, selectionKey: string): string {
    return item.collection_item_id ?? item.want_item_id ?? selectionKey;
  }

  async function openCard(item: CollectionCardViewItem, selectionKey: string) {
    const openingKey = getOpeningItemKey(item, selectionKey);
    if (openingItemKey === openingKey) return;
    setOpeningItemKey(openingKey);
    setOpenCardError(null);
    try {
      const response = await fetch(`/api/cards/${encodeURIComponent(item.card_id)}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        setOpenCardError(`Could not open ${item.name}. Try again.`);
        return;
      }
      const data: ModalCardData = await response.json();
      const shouldAttachCollectionItem =
        item.owned && (Boolean(item.collection_item_id) || readOnlyCollectionItems);
      setSelectedCard({
        ...data,
        collection_item:
          shouldAttachCollectionItem
            ? {
                ...data.collection_item,
                id: item.collection_item_id ?? `readonly-${item.card_id}`,
                binder_id: item.binder_id ?? null,
                for_sale: item.for_sale ?? false,
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
                read_only: readOnlyCollectionItems,
              }
            : null,
      });
    } catch {
      setOpenCardError(`Could not open ${item.name}. Try again.`);
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
    // A long-press that just started selection mode must not also open the
    // card (or immediately toggle it back off) via the trailing click event.
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }

    if (activeSelectionMode) {
      if (!selectableInMode) return;
      toggleSelected(selectionKey);
      return;
    }

    void openCard(item, selectionKey);
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }

  // Touch or primary mouse hold: turn selection mode on and select immediately.
  function getTileLongPressHandlers(selectionKey: string) {
    if (!selectionEnabled) return {};

    return {
      onPointerDown: (event: React.PointerEvent) => {
        const isSupportedPointer = event.pointerType === "touch" || event.pointerType === "mouse";
        const interactiveTarget = (event.target as Element).closest(
          "button, a, input, select, textarea"
        );
        if (
          !event.isPrimary ||
          event.button !== 0 ||
          !isSupportedPointer ||
          activeSelectionMode ||
          (interactiveTarget && interactiveTarget !== event.currentTarget)
        ) {
          return;
        }
        clearLongPressTimer();
        longPressFiredRef.current = false;
        longPressStartRef.current = { x: event.clientX, y: event.clientY };
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTimerRef.current = null;
          longPressFiredRef.current = true;
          setSelectionMode(true);
          setSelectedKeys([selectionKey]);
        }, LONG_PRESS_SELECT_MS);
      },
      onPointerMove: (event: React.PointerEvent) => {
        const start = longPressStartRef.current;
        if (!start || longPressTimerRef.current == null) return;
        const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
        if (distance > LONG_PRESS_MOVE_TOLERANCE_PX) {
          clearLongPressTimer();
        }
      },
      onPointerUp: () => {
        clearLongPressTimer();
        // A stationary hold produces a click immediately after pointerup, which
        // consumes this flag. A drag may not, so clear it on the next task to
        // avoid swallowing the user's next deliberate click.
        if (longPressFiredRef.current) {
          window.setTimeout(() => {
            longPressFiredRef.current = false;
          }, 0);
        }
      },
      onPointerLeave: () => clearLongPressTimer(),
      onPointerCancel: () => {
        clearLongPressTimer();
        longPressFiredRef.current = false;
      },
      onContextMenu: (event: React.MouseEvent) => {
        // Card tiles use long-press for selection. Native image actions remain
        // available only inside the card-detail experience.
        event.preventDefault();
      },
    };
  }

  function toggleSelectionMode() {
    setBulkAddOpen(false);
    setSellQuoteDialog(null);
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
    setSellQuoteDialog(null);
    setBulkAddOpen(true);
  }

  function handleBulkRemove() {
    setSellQuoteDialog(null);
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
          ? `Remove 1 card from ${collectionRemovalLabel}?`
          : `Remove ${selectedCollectionItemIds.length} cards from ${collectionRemovalLabel}?`,
      description:
        selectedCollectionItemIds.length === 1
          ? `This card will be deleted from ${collectionRemovalLabel}.`
          : `These cards will be deleted from ${collectionRemovalLabel}.`,
    });
  }

  function handleBulkMarkSold() {
    if (selectedSoldItems.length === 0) return;

    setBulkAddOpen(false);
    setRemoveDialog(null);
    setRemoveError(null);
    setSoldDialog(null);
    setSaleListingDialog(null);
    setSellQuoteDialog({
      items: selectedSoldItems,
    });
  }

  function handleBulkSendToSale() {
    if (selectedSaleListingItems.length === 0) return;

    setBulkAddOpen(false);
    setRemoveDialog(null);
    setRemoveError(null);
    setSoldDialog(null);
    setSellQuoteDialog(null);
    setSaleListingDialog({
      items: selectedSaleListingItems,
      mode: "stack",
      totalPaid: "",
      // Prefill with what each card already has on record, so existing paid
      // amounts are visible and carried over untouched.
      prices: Object.fromEntries(
        selectedSaleListingItems.map(({ itemId, item }) => [
          itemId,
          item.purchase_price != null ? String(item.purchase_price) : "",
        ])
      ),
      error: null,
    });
  }

  function updateSaleListingMode(mode: SaleListingDialogState["mode"]) {
    setSaleListingDialog((current) => (current ? { ...current, mode, error: null } : current));
  }

  function updateSaleListingPrice(itemId: string, value: string) {
    setSaleListingDialog((current) =>
      current
        ? {
            ...current,
            error: null,
            prices: { ...current.prices, [itemId]: value },
          }
        : current
    );
  }

  async function sendItemsToSale() {
    if (!saleListingDialog || saleListingDialog.items.length === 0) return;

    let totalPaid: number | null = null;
    const purchasePrices: Record<string, number> = {};

    if (saleListingDialog.mode === "per-card") {
      // Per-card amounts stay optional: rows left empty keep whatever the
      // card already had as its paid amount.
      for (const { itemId } of saleListingDialog.items) {
        const raw = (saleListingDialog.prices[itemId] ?? "").trim();
        if (!raw) continue;
        const price = parseCurrencyInput(raw);
        if (price == null) {
          setSaleListingDialog((current) =>
            current
              ? { ...current, error: "Fill in valid paid amounts, or leave rows empty." }
              : current
          );
          return;
        }
        purchasePrices[itemId] = price;
      }
    } else {
      const rawTotalPaid = saleListingDialog.totalPaid.trim();
      totalPaid = rawTotalPaid ? parseCurrencyInput(rawTotalPaid) : null;
      if (rawTotalPaid && totalPaid == null) {
        setSaleListingDialog((current) =>
          current
            ? { ...current, error: "Fill in a valid total paid amount, or leave it empty." }
            : current
        );
        return;
      }
    }

    setSavingSaleListing(true);
    setSaleListingDialog((current) => (current ? { ...current, error: null } : current));

    try {
      const response = await fetch("/api/collection/cards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemIds: saleListingDialog.items.map((item) => item.itemId),
          forSale: true,
          ...(totalPaid != null ? { totalPurchasePrice: totalPaid } : {}),
          ...(Object.keys(purchasePrices).length > 0 ? { purchasePrices } : {}),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not move cards to For Sale");
      }

      setSaleListingDialog(null);
      setSelectionMode(false);
      setSelectedKeys([]);
      router.refresh();
    } catch (error) {
      setSaleListingDialog((current) =>
        current
          ? {
              ...current,
              error:
                error instanceof Error ? error.message : "Could not move cards to For Sale",
            }
          : current
      );
    } finally {
      setSavingSaleListing(false);
    }
  }

  function openSoldPriceDialog(items: SoldDialogItem[]) {
    if (items.length === 0) return;

    setSoldDialog({
      items,
      mode: "per-card",
      prices: Object.fromEntries(items.map(({ itemId }) => [itemId, ""])),
      totalPrice: "",
      feeTotal: "",
      platform: "",
      error: null,
    });
    setSellQuoteDialog(null);
  }

  function updateSoldPrice(itemId: string, value: string) {
    setSoldDialog((current) =>
      current
        ? {
            ...current,
            error: null,
            prices: { ...current.prices, [itemId]: value },
          }
        : current
    );
  }

  function updateSoldMode(mode: SoldDialogState["mode"]) {
    setSoldDialog((current) => (current ? { ...current, mode, error: null } : current));
  }

  async function markSoldItems() {
    if (!soldDialog || soldDialog.items.length === 0) return;

    const itemIds = soldDialog.items.map((item) => item.itemId);
    let payload: { itemIds: string[]; prices?: Record<string, number>; totalPrice?: number; feeTotal?: number; platform?: string };

    if (soldDialog.mode === "per-card") {
      const prices: Record<string, number> = {};
      for (const item of soldDialog.items) {
        const price = parseCurrencyInput(soldDialog.prices[item.itemId] ?? "");
        if (price == null) {
          setSoldDialog((current) =>
            current ? { ...current, error: "Fill in a sold price for every card." } : current
          );
          return;
        }
        prices[item.itemId] = price;
      }
      payload = { itemIds, prices };
    } else {
      const totalPrice = parseCurrencyInput(soldDialog.totalPrice);
      if (totalPrice == null) {
        setSoldDialog((current) =>
          current ? { ...current, error: "Fill in a valid stack sold price." } : current
        );
        return;
      }
      payload = { itemIds, totalPrice };
    }
    const feeTotal = soldDialog.feeTotal.trim() ? parseCurrencyInput(soldDialog.feeTotal) : 0;
    if (feeTotal == null) {
      setSoldDialog((current) => current ? { ...current, error: "Fill in a valid fee amount." } : current);
      return;
    }
    payload.feeTotal = feeTotal;
    payload.platform = soldDialog.platform.trim();

    setSavingSold(true);
    setSoldDialog((current) => (current ? { ...current, error: null } : current));

    try {
      const response = await fetch("/api/collection/cards/sold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not mark cards sold");
      }

      setSellQuoteDialog(null);
      setSoldDialog(null);
      setSelectionMode(false);
      setSelectedKeys([]);
      router.refresh();
    } catch (error) {
      setSoldDialog((current) =>
        current
          ? {
              ...current,
              error: error instanceof Error ? error.message : "Could not mark cards sold",
            }
          : current
      );
    } finally {
      setSavingSold(false);
    }
  }

  function openSaleRecordDialog(event: React.MouseEvent, item: CollectionCardViewItem) {
    event.preventDefault();
    event.stopPropagation();
    if (!item.collection_item_id) return;
    setSaleRecordDialog({
      item,
      salePrice: item.sale_price?.toFixed(2) ?? "",
      feeTotal: item.sale_fee_eur?.toFixed(2) ?? "",
      platform: item.sale_platform ?? "",
      error: null,
    });
  }

  async function saveSaleRecord() {
    if (!saleRecordDialog?.item.collection_item_id) return;
    const salePrice = parseCurrencyInput(saleRecordDialog.salePrice);
    const feeTotal = saleRecordDialog.feeTotal.trim()
      ? parseCurrencyInput(saleRecordDialog.feeTotal)
      : 0;
    if (salePrice == null || feeTotal == null) {
      setSaleRecordDialog((current) => current ? { ...current, error: "Fill in valid EUR amounts." } : current);
      return;
    }

    setSavingSaleRecord(true);
    try {
      const response = await fetch("/api/collection/cards/sold", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: saleRecordDialog.item.collection_item_id,
          salePrice,
          feeTotal,
          platform: saleRecordDialog.platform,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not update this sale");
      setSaleRecordDialog(null);
      router.refresh();
    } catch (error) {
      setSaleRecordDialog((current) => current ? {
        ...current,
        error: error instanceof Error ? error.message : "Could not update this sale",
      } : current);
    } finally {
      setSavingSaleRecord(false);
    }
  }

  async function restoreSaleRecord() {
    if (!saleRecordDialog?.item.collection_item_id) return;
    setSavingSaleRecord(true);
    try {
      const response = await fetch("/api/collection/cards/sold", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: [saleRecordDialog.item.collection_item_id] }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not restore this card");
      setSaleRecordDialog(null);
      router.refresh();
    } catch (error) {
      setSaleRecordDialog((current) => current ? {
        ...current,
        error: error instanceof Error ? error.message : "Could not restore this card",
      } : current);
    } finally {
      setSavingSaleRecord(false);
    }
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
          ? `Remove ${item.name} from ${collectionRemovalLabel}?`
          : `Remove ${item.name} (${removableIds.length} copies) from ${collectionRemovalLabel}?`,
      description:
        removableIds.length === 1
          ? `This saved card will be deleted from ${collectionRemovalLabel}.`
          : `These saved copies will be deleted from ${collectionRemovalLabel}.`,
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

  function toggleReleaseYear(year: string) {
    setSelectedReleaseYears((current) =>
      current.includes(year)
        ? current.filter((value) => value !== year)
        : [...current, year]
    );
  }

  const hasActiveFilters =
    Boolean(search) ||
    effectiveShowOnlyGraded ||
    appliedRarities.length > 0 ||
    appliedSupertypes.length > 0 ||
    activeReleaseYears.length > 0 ||
    effectiveOnlyPriced;
  const sortSummary = hideSortControls ? "Highest price first" : formatSortSummary(sortBy, sortDir);
  const soldStackTotal =
    soldDialog?.mode === "stack" ? parseCurrencyInput(soldDialog.totalPrice) : null;
  const soldStackPerCard =
    soldDialog && soldStackTotal != null && soldDialog.items.length > 0
      ? soldStackTotal / soldDialog.items.length
      : null;
  const sellQuoteTotal =
    sellQuoteDialog?.items.reduce((total, { item }) => total + (item.current_value ?? 0), 0) ?? 0;
  const sellQuotePricedCards =
    sellQuoteDialog?.items.filter(({ item }) => item.current_value != null).length ?? 0;
  const sellQuotePaidTotal =
    sellQuoteDialog?.items.reduce((total, { item }) => {
      const costBasis = getCollectionItemCostBasis(item);
      return total + (costBasis ?? 0);
    }, 0) ?? 0;
  const sellQuotePnl = Number((sellQuoteTotal - sellQuotePaidTotal).toFixed(2));
  const saleListingTotal =
    saleListingDialog?.items.reduce((total, { item }) => total + (item.current_value ?? 0), 0) ??
    0;
  const saleListingPricedCards =
    saleListingDialog?.items.filter(({ item }) => item.current_value != null).length ?? 0;
  const SORT_OPTIONS: Array<{ value: SortBy; label: string }> = [
    { value: "number", label: "#" },
    { value: "release", label: "Date" },
    { value: "cm_en", label: "CM" },
    { value: "tcp", label: "TCP" },
  ];
  const SIZE_OPTIONS: Array<{ value: CardSize; label: string }> = [
    { value: "large", label: "L" },
    { value: "medium", label: "M" },
    { value: "small", label: "S" },
    { value: "xsmall", label: "XS" },
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
    setSelectedReleaseYears([]);
    set("defaultRarities", []);
    set("defaultSupertypes", []);
    set("showOnlyPriced", false);
  }

  if (visibleSourceItems.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyText}
        actionHref={emptyActionHref}
        actionLabel={emptyActionLabel}
      />
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
    activeReleaseYears.length +
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
      value: "release",
      label: "Date",
      title: "Sort by card release date",
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
      label: "L",
      title: isMobileViewport ? "Largest phone card tiles" : "Largest card tiles",
    },
    {
      value: "medium",
      label: "M",
      title: isMobileViewport ? "Medium phone card tiles" : "Medium card tiles",
    },
    {
      value: "small",
      label: "S",
      title: isMobileViewport ? "Small phone card tiles" : "Small card tiles",
    },
    {
      value: "xsmall",
      label: "XS",
      title: isMobileViewport ? "Compact phone card tiles" : "Densest card tiles",
    },
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
    ...activeReleaseYears.map((year) => ({
      key: `release-year-${year}`,
      label: year,
      onRemove: () => toggleReleaseYear(year),
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
    ...(availableReleaseYears.length > 1
      ? [
          {
            key: "release-year",
            title: "Release year",
            summary: activeReleaseYears.length > 0 ? `${activeReleaseYears.length} selected` : "All",
            className: "xl:min-w-0",
            options: availableReleaseYears.map((year) => {
              const active = activeReleaseYears.includes(year.value);
              return {
                key: year.value,
                label: year.value,
                active,
                count: year.count,
                onToggle: () => toggleReleaseYear(year.value),
                className: `inline-flex min-h-[var(--ui-chip-min-height)] shrink-0 items-center gap-[var(--ui-chip-gap)] overflow-hidden rounded-full border px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] leading-none transition-colors ${
                  active ? "font-semibold" : "font-medium"
                } ${neutralFilterChip(active)}`,
              };
            }),
          } satisfies CardBrowserToolbarFilterSection,
        ]
      : []),
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
      {openCardError && (
        <div className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-rose-400/40 bg-zinc-900/95 px-4 py-2 text-sm text-rose-300 shadow-lg">
          <span>{openCardError}</span>
          <button
            type="button"
            onClick={() => setOpenCardError(null)}
            className="text-xs uppercase tracking-wide text-rose-200/80 hover:text-rose-100"
          >
            Dismiss
          </button>
        </div>
      )}
      {sectionTitle && (
        <SectionHeader
          title={sectionTitle}
          count={sectionCount ?? visibleSourceItems.length}
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
            resultLabel={`${visibleItems.length} / ${visibleSourceItems.length}${isFilteringPending ? " ..." : ""}`}
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
                          className="inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full bg-violet-600 px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-white/[0.045] disabled:text-white/28 disabled:shadow-none"
                        >
                          Bulk add
                        </button>
                      )}
                      {canSendToSale && (
                        <button
                          type="button"
                          onClick={handleBulkSendToSale}
                          disabled={savingSaleListing || selectedSaleListingItems.length === 0}
                          title="Move to For Sale"
                          aria-label="Move to For Sale"
                          className="inline-flex min-h-[var(--ui-chip-min-height)] items-center rounded-full border border-amber-400/28 bg-amber-400/[0.09] px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] leading-none text-amber-300 transition-colors hover:border-amber-300/45 hover:bg-amber-400/[0.16] hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <BadgeEuro className="h-4 w-4" />
                        </button>
                      )}
                      {canMarkSold && (
                        <button
                          type="button"
                          onClick={handleBulkMarkSold}
                          disabled={savingSold || selectedSoldItems.length === 0}
                          className="inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full bg-emerald-600 px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Sell
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
              {visibleItems.length} / {visibleSourceItems.length}
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
                        className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-white/[0.045] disabled:text-white/28 disabled:shadow-none"
                      >
                        Bulk add
                      </button>
                    )}
                    {canSendToSale && (
                      <button
                        type="button"
                        onClick={handleBulkSendToSale}
                        disabled={savingSaleListing || selectedSaleListingItems.length === 0}
                        title="Move to For Sale"
                        aria-label="Move to For Sale"
                        className="inline-flex items-center rounded-full border border-amber-400/28 bg-amber-400/[0.09] px-2.5 py-1.5 text-amber-500 transition-colors hover:border-amber-300/45 hover:bg-amber-400/[0.16] dark:text-amber-300 dark:hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <BadgeEuro className="h-4 w-4" />
                      </button>
                    )}
                    {canMarkSold && (
                      <button
                        type="button"
                        onClick={handleBulkMarkSold}
                        disabled={savingSold || selectedSoldItems.length === 0}
                        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Sell
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
                  className="inline-flex min-h-[var(--ui-chip-min-height)] items-center rounded-full bg-violet-600 px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-white/[0.045] disabled:text-white/28 disabled:shadow-none"
                >
                  Bulk add
                </button>
              )}
              {canSendToSale && (
                <button
                  type="button"
                  onClick={handleBulkSendToSale}
                  disabled={savingSaleListing || selectedSaleListingItems.length === 0}
                  title="Move to For Sale"
                  aria-label="Move to For Sale"
                  className="inline-flex min-h-[var(--ui-chip-min-height)] items-center rounded-full border border-amber-400/28 bg-amber-400/[0.09] px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] leading-none text-amber-300 transition-colors hover:border-amber-300/45 hover:bg-amber-400/[0.16] hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <BadgeEuro className="h-4 w-4" />
                </button>
              )}
              {canMarkSold && (
                <button
                  type="button"
                  onClick={handleBulkMarkSold}
                  disabled={savingSold || selectedSoldItems.length === 0}
                  className="inline-flex min-h-[var(--ui-chip-min-height)] items-center gap-[var(--ui-chip-gap)] rounded-full bg-emerald-600 px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Sell
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
                  const displayPrice = salesLedger
                    ? item.sale_price
                    : getCollectionItemPrice(item, primaryPriceSource);
                  const displayPriceCurrency = salesLedger
                    ? "EUR"
                    : getCollectionItemPriceCurrency(item, primaryPriceSource);
                  const costBasis = getCollectionItemCostBasis(item);
                  const costBasisLabel = getCollectionItemCostBasisLabel(item);
                  const pnl = salesLedger
                    ? getSalePnl(item, costBasis)
                    : item.current_value != null && costBasis != null
                      ? Number((item.current_value - costBasis).toFixed(2))
                      : null;

                  return (
                    <CardListTile
                      key={selectionKey}
                      role="button"
                      tabIndex={0}
                      accent="collection"
                      interactive
                      state={isSelected ? "selected" : "default"}
                      aria-pressed={activeSelectionMode ? isSelected : undefined}
                      aria-disabled={activeSelectionMode && !selectableInMode}
                      onClick={() => handleTileActivate(item, selectionKey, selectableInMode)}
                      {...getTileLongPressHandlers(selectionKey)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleTileActivate(item, selectionKey, selectableInMode);
                        }
                      }}
                      className={activeSelectionMode && !selectableInMode ? "cursor-not-allowed opacity-55" : undefined}
                    >
                      <CardListTileMedia
                        imageUrl={item.image_url}
                        emptyLabel={item.name}
                        className="border-transparent bg-transparent drop-shadow-[0_8px_14px_rgba(0,0,0,0.18)]"
                      >
                        {item.image_url ? (
                            <CachedImage
                              sourceUrl={item.image_url}
                              alt={item.name}
                              fill
                              className={`object-contain ${
                                blurMissing && missing ? "blur-[2px] saturate-[0.72] opacity-55" : ""
                              }`}
                              sizes="(max-width: 359px) 88px, (max-width: 767px) 104px, 92px"
                              loading={index < eagerImageCount ? "eager" : undefined}
                              fetchPriority={index < 4 ? "high" : "auto"}
                            />
                          ) : undefined}
                      </CardListTileMedia>

                      <CardListTileBody>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">
                              {item.name}
                            </p>
                            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-white/50">
                              <span className="shrink-0">
                                {item.card_number ? `#${item.card_number}` : "--"}
                              </span>
                              {item.version ? (
                                <span className="min-w-0 truncate rounded-md border border-amber-300/30 bg-amber-400/12 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-amber-200">
                                  {item.version}
                                </span>
                              ) : null}
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
                          <CardListTilePrice
                            label={
                              salesLedger
                                ? "Sold"
                                : primaryPriceSource === "tcp"
                                  ? "TCGPlayer"
                                  : "CardMarket"
                            }
                            value={
                              displayPrice != null
                                ? formatMarketCurrency(displayPrice, displayPriceCurrency)
                                : "—"
                            }
                          />
                        </div>

                        <div className="mt-1.5 flex max-h-6 flex-wrap items-start gap-1.5 overflow-hidden">
                          {item.rarity ? (
                            <span
                              className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-semibold leading-none ${rarityBadge(item.rarity)}`}
                            >
                              {normalizeRarityLabel(item.rarity) ?? item.rarity}
                            </span>
                          ) : null}
                          <span className="inline-flex items-center rounded-md border border-[rgb(var(--dc-border-rgb)/0.74)] bg-[rgb(var(--dc-surface-hover-rgb)/0.42)] px-2 py-1 text-[10px] font-medium leading-none text-white/52">
                            {salesLedger
                              ? ["Sold", item.sale_platform, formatSoldDate(item.sold_at)]
                                  .filter(Boolean)
                                  .join(" · ")
                              : missing && blurMissing
                                ? "Missing"
                              : item.owned_count && item.owned_count > 1
                                ? `${item.owned_count}× owned`
                                : item.owned
                                  ? "Owned"
                                  : item.want_item_id
                                    ? "Wanted"
                                    : "Available"}
                          </span>
                        </div>

                        <CardListTileMetrics className="text-xs sm:!grid-cols-2">
                          <div className="min-w-0">
                            <p className="truncate text-[9.5px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-white/35">
                              {costBasisLabel}
                            </p>
                            <p className="mt-0.5 whitespace-nowrap text-[13px] font-semibold tabular-nums text-gray-950 dark:text-white">
                              {costBasis != null ? formatCollectionCurrency(costBasis) : "—"}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[9.5px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-white/35">
                              {salesLedger ? "Net P&L" : "P&L"}
                            </p>
                            <p
                              className={`mt-0.5 whitespace-nowrap text-[13px] font-semibold tabular-nums ${
                                pnl == null
                                  ? "text-gray-400 dark:text-white/35"
                                  : pnl >= 0
                                    ? "text-emerald-600 dark:text-emerald-300"
                                    : "text-rose-600 dark:text-rose-300"
                              }`}
                            >
                              {pnl != null
                                ? `${pnl >= 0 ? "+" : ""}${formatCollectionCurrency(pnl)}`
                                : "—"}
                            </p>
                          </div>
                        </CardListTileMetrics>

                        {salesLedger && allowSaleRecordEditing ? (
                          <CardListTileFooter className="justify-end">
                            <button
                              type="button"
                              onClick={(event) => openSaleRecordDialog(event, item)}
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/9 bg-white/[0.04] px-2.5 text-[10px] font-bold text-white/58 transition-colors hover:bg-white/[0.08] hover:text-white"
                            >
                              <Pencil className="h-3 w-3" aria-hidden="true" /> Edit sale
                            </button>
                          </CardListTileFooter>
                        ) : null}

                        {!activeSelectionMode &&
                        (!item.owned ||
                          (canRemoveFromCollection &&
                            Boolean(
                              item.collection_item_id ||
                                (item.collection_item_ids?.length ?? 0) > 0
                            ))) ? (
                          <CardListTileFooter className="justify-end">
                            <div
                              className="flex shrink-0 items-center gap-1.5"
                              onClick={(event) => event.stopPropagation()}
                              onPointerDown={(event) => event.stopPropagation()}
                              onKeyDown={(event) => event.stopPropagation()}
                            >
                              {item.owned ? (
                                <button
                                  type="button"
                                  onClick={(event) => handleSingleRemove(event, item)}
                                  disabled={removingItems}
                                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-black/8 bg-black/5 text-gray-900 transition-colors hover:border-black/15 hover:bg-black/8 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:bg-white/12 md:h-9 md:w-9"
                                  aria-label={`Remove ${item.name} from ${collectionRemovalLabel}`}
                                  title={`Remove from ${collectionRemovalLabel}`}
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                              ) : allowWantRemoval ? (
                                <>
                                  <CardPriceAlertButton
                                    cardId={item.card_id}
                                    cardName={item.name}
                                    lazy
                                    triggerClassName="!h-11 !w-11 !rounded-lg md:!h-9 md:!w-9"
                                  />
                                  <CollectionAddCardButton
                                    card={getCollectionCardQuickActionData(item).card}
                                    initialBinderId={bulkAddBinder?.id ?? null}
                                    lockedBinderName={bulkAddBinder?.name ?? null}
                                    className="h-11 w-11 shrink-0 rounded-lg border-violet-300/24 bg-violet-600/22 text-violet-50 hover:border-violet-200/42 hover:bg-violet-500/32 md:h-9 md:w-9"
                                  />
                                </>
                              ) : (
                                <CollectionCardQuickActions
                                  data={getCollectionCardQuickActionData(item)}
                                  initialBinderId={bulkAddBinder?.id ?? null}
                                  lockedBinderName={bulkAddBinder?.name ?? null}
                                />
                              )}
                            </div>
                          </CardListTileFooter>
                        ) : null}
                      </CardListTileBody>
                    </CardListTile>
                  );
                })}
              </div>

              <div className="dc-wide-table-zone hidden overflow-x-auto rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.9)] bg-[rgb(var(--dc-surface-primary-rgb)/0.86)] shadow-[0_16px_42px_var(--dc-shadow-color),inset_0_1px_0_var(--dc-sheen)] md:block">
                <table className="min-w-full text-sm text-[var(--dc-text-primary)]">
                  <thead className="border-b border-[rgb(var(--dc-border-rgb)/0.82)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.5)] text-xs uppercase tracking-[0.14em] text-[var(--dc-text-muted)]">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Card</th>
                      <th className="px-4 py-3 text-left font-semibold">Rarity</th>
                      <th className="px-4 py-3 text-left font-semibold">
                        {salesLedger
                          ? "Sold"
                          : primaryPriceSource === "tcp"
                            ? "TCGPlayer"
                            : "CardMarket"}
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
                      const displayPrice = salesLedger
                        ? item.sale_price
                        : getCollectionItemPrice(item, primaryPriceSource);
                      const displayPriceCurrency = salesLedger
                        ? "EUR"
                        : getCollectionItemPriceCurrency(item, primaryPriceSource);
                      const costBasis = getCollectionItemCostBasis(item);
                      const costBasisLabel = getCollectionItemCostBasisLabel(item);
                      const pnl = salesLedger
                        ? getSalePnl(item, costBasis)
                        : item.current_value != null && costBasis != null
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
                          {...getTileLongPressHandlers(selectionKey)}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleTileActivate(item, selectionKey, selectableInMode);
                            }
                          }}
                          className={`border-b border-[rgb(var(--dc-border-rgb)/0.7)] transition-colors last:border-b-0 ${
                            isSelected
                              ? "bg-[rgb(var(--dc-primary-rgb)/0.09)]"
                              : missing && blurMissing
                                ? "opacity-70"
                                : "hover:bg-[rgb(var(--dc-surface-hover-rgb)/0.46)]"
                          } ${activeSelectionMode && !selectableInMode ? "cursor-not-allowed" : "cursor-pointer"}`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="relative h-16 w-12 shrink-0 bg-transparent drop-shadow-[0_6px_12px_rgba(0,0,0,0.16)]">
                                {item.image_url ? (
                                  <CachedImage
                                    sourceUrl={item.image_url}
                                    alt={item.name}
                                    fill
                                    className={`object-contain ${
                                      blurMissing && missing
                                        ? "blur-[2px] saturate-[0.72] opacity-55"
                                        : ""
                                    }`}
                                    sizes="48px"
                                    loading={index < eagerImageCount ? "eager" : undefined}
                                    fetchPriority={index < 4 ? "high" : "auto"}
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-xs text-[var(--dc-text-muted)]">
                                    {item.name.slice(0, 2)}
                                  </div>
                                )}
                              </div>

                              <div className="min-w-0">
                                <p className="truncate font-semibold">{item.name}</p>
                                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--dc-text-muted)]">
                                  <span>{item.card_number ? `#${item.card_number}` : "--"}</span>
                                  <span>•</span>
                                  <Link
                                    href={getExpansionHref(item.episode_id)}
                                    prefetch={false}
                                    onClick={(event) => event.stopPropagation()}
                                    className="truncate transition-colors hover:text-[var(--dc-text-primary)] hover:underline underline-offset-2"
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
                              <span className="text-xs text-[var(--dc-text-muted)]">--</span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            {displayPrice != null ? (
                              <div className="space-y-0.5">
                                <p className="font-semibold tabular-nums">
                                  {formatMarketCurrency(displayPrice, displayPriceCurrency)}
                                </p>
                                {salesLedger && (item.sale_fee_eur ?? 0) > 0 ? (
                                  <p className="text-[11px] text-[var(--dc-text-muted)]">
                                    Net {formatCollectionCurrency(getNetSalePrice(item) ?? 0)} after fees
                                  </p>
                                ) : item.current_value_label ? (
                                  <p className="text-[11px] text-[var(--dc-text-muted)]">
                                    {item.current_value_label}
                                  </p>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-xs text-[var(--dc-text-muted)]">
                                No price
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-sm text-[var(--dc-text-secondary)]">
                            {costBasis != null ? (
                              <div className="space-y-0.5">
                                <p className="tabular-nums">
                                  {formatCollectionCurrency(costBasis)}
                                </p>
                                {item.cost_basis_source === "linked_binder_allocation" && (
                                  <p className="text-[11px] text-[var(--dc-text-muted)]">
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
                                    ? "font-semibold text-[var(--dc-success)]"
                                    : "font-semibold text-[var(--dc-negative)]"
                                }
                              >
                                {pnl >= 0 ? "+" : ""}
                                {formatCollectionCurrency(pnl)}
                              </span>
                            ) : (
                              <span className="text-xs text-[var(--dc-text-muted)]">--</span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-xs text-[var(--dc-text-secondary)]">
                            {salesLedger ? (
                              <span>
                                {[item.sale_platform, formatSoldDate(item.sold_at)]
                                  .filter(Boolean)
                                  .join(" · ") || "Sold"}
                              </span>
                            ) : missing && blurMissing ? (
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
                              {salesLedger && allowSaleRecordEditing ? (
                                <button
                                  type="button"
                                  onClick={(event) => openSaleRecordDialog(event, item)}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/9 bg-white/[0.04] px-2.5 text-[10px] font-bold text-white/58 transition-colors hover:bg-white/[0.08] hover:text-white"
                                >
                                  <Pencil className="h-3 w-3" aria-hidden="true" /> Edit sale
                                </button>
                              ) : null}
                              {!activeSelectionMode &&
                                (item.owned ? (
                                  canRemoveFromCollection &&
                                  (item.collection_item_id ||
                                    (item.collection_item_ids?.length ?? 0) > 0) ? (
                                    <button
                                      type="button"
                                      onClick={(event) => handleSingleRemove(event, item)}
                                      disabled={removingItems}
                                      className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-md border border-[rgb(var(--dc-border-rgb)/0.92)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.78)] text-[var(--dc-text-secondary)] shadow-[inset_0_1px_0_var(--dc-sheen)] transition-colors hover:border-[rgb(var(--dc-negative-rgb)/0.28)] hover:bg-[rgb(var(--dc-negative-rgb)/0.08)] hover:text-[var(--dc-negative)] disabled:cursor-not-allowed disabled:opacity-50"
                                      aria-label={`Remove ${item.name} from ${collectionRemovalLabel}`}
                                      title={`Remove from ${collectionRemovalLabel}`}
                                    >
                                      <Minus className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null
                                ) : (
                                  allowWantRemoval ? (
                                    <>
                                      <CardPriceAlertButton
                                        cardId={item.card_id}
                                        cardName={item.name}
                                        lazy
                                        triggerClassName="!h-[28px] !w-[28px] !rounded-md"
                                      />
                                      <CollectionAddCardButton
                                        card={getCollectionCardQuickActionData(item).card}
                                        initialBinderId={bulkAddBinder?.id ?? null}
                                        lockedBinderName={bulkAddBinder?.name ?? null}
                                        className="h-[28px] w-[28px] rounded-md border-violet-300/24 bg-violet-600/22 text-violet-50 hover:border-violet-200/42 hover:bg-violet-500/32"
                                      />
                                    </>
                                  ) : (
                                    <CollectionCardQuickActions
                                      data={getCollectionCardQuickActionData(item)}
                                      initialBinderId={bulkAddBinder?.id ?? null}
                                      lockedBinderName={bulkAddBinder?.name ?? null}
                                    />
                                  )
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
                className={`dc-wide-grid-zone grid ${gridGapClass}`}
                style={{
                  gridTemplateColumns,
                  justifyContent: "stretch",
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
                  const displayPrice = salesLedger
                    ? item.sale_price
                    : getCollectionItemPrice(item, primaryPriceSource);
                  const displayPriceCurrency = salesLedger
                    ? "EUR"
                    : getCollectionItemPriceCurrency(item, primaryPriceSource);
                  const costBasis = getCollectionItemCostBasis(item);
                  const trendPercent = getTileTrendPercent(
                    salesLedger ? getNetSalePrice(item) : item.current_value,
                    costBasis
                  );
                  const tileAction =
                    !activeSelectionMode && !item.owned ? (
                      allowWantRemoval ? (
                        <span className="flex items-center gap-1">
                          <CardPriceAlertButton
                            cardId={item.card_id}
                            cardName={item.name}
                            lazy
                            triggerClassName="!h-8 !w-8 !rounded-lg"
                          />
                          <CollectionAddCardButton
                            card={getCollectionCardQuickActionData(item).card}
                            initialBinderId={bulkAddBinder?.id ?? null}
                            lockedBinderName={bulkAddBinder?.name ?? null}
                            className={collectionTileActionButtonClass(displaySettings.cardSize)}
                            theme="dark"
                          />
                        </span>
                      ) : (
                        <CollectionCardQuickActions
                          data={getCollectionCardQuickActionData(item)}
                          initialBinderId={bulkAddBinder?.id ?? null}
                          lockedBinderName={bulkAddBinder?.name ?? null}
                        />
                      )
                    ) : null;
                  const showWantPriceRowAction = allowWantRemoval && Boolean(tileAction);

                  return (
                    <div
                      key={selectionKey}
                      role="button"
                      tabIndex={0}
                      aria-pressed={activeSelectionMode ? isSelected : undefined}
                      aria-disabled={activeSelectionMode && !selectableInMode}
                      onClick={() => handleTileActivate(item, selectionKey, selectableInMode)}
                      {...getTileLongPressHandlers(selectionKey)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleTileActivate(item, selectionKey, selectableInMode);
                        }
                      }}
                      className={`relative flex h-full cursor-pointer flex-col rounded-[14px] border border-[rgb(var(--dc-border-rgb)/0.82)] bg-[linear-gradient(180deg,rgb(var(--dc-surface-elevated-rgb)/0.94),rgb(var(--dc-surface-primary-rgb)/0.9))] p-1.5 text-left shadow-[0_12px_28px_var(--dc-shadow-color)] outline-none transition-colors hover:border-[rgb(var(--dc-primary-rgb)/0.28)] max-[640px]:rounded-[13px] max-[640px]:p-1 ${
                        isSelected ? "border-blue-400/70 ring-2 ring-blue-400/60" : ""
                      }`}
                      style={{
                        contain: "layout paint style",
                        contentVisibility: "auto",
                        containIntrinsicSize: isMobileViewport ? "250px" : "320px",
                      }}
                    >
                      <div
                        className={`relative isolate ${previewAspectClass} w-full transition-all duration-200 ${
                          isGradedCard
                            ? `overflow-hidden rounded-xl border ${
                                isSelected
                                  ? "border-blue-400/80 shadow-lg shadow-blue-500/25 ring-2 ring-blue-400/80"
                                  : "border-transparent shadow-md shadow-black/20"
                              }`
                            : isSelected
                              ? getCardImageFrameClassName(
                                  item.image_url,
                                  "overflow-hidden rounded-[4.75%] bg-transparent drop-shadow-[0_12px_24px_rgba(56,189,248,0.24)] ring-2 ring-blue-400/80"
                                )
                              : getCardImageFrameClassName(
                                  item.image_url,
                                  "overflow-hidden rounded-[4.75%] bg-transparent drop-shadow-[0_10px_18px_rgba(0,0,0,0.22)]"
                                )
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
                          <CachedImage
                            sourceUrl={item.image_url}
                            alt={item.name}
                            fill
                            className={imageClass}
                            sizes={cardTrackWidth}
                            loading={index < eagerImageCount ? "eager" : undefined}
                            fetchPriority={index < 4 ? "high" : "auto"}
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

                        {salesLedger && item.sold_at ? (
                          <span
                            data-sale-status="sold"
                            className={`absolute right-2 top-2 ${collectionSoldOverlayBadgeClass(displaySettings.cardSize)}`}
                          >
                            Sold
                          </span>
                        ) : (item.owned_count ?? 0) > 1 && (
                          <span className={`absolute left-2 top-2 ${collectionOverlayBadgeClass(displaySettings.cardSize)}`}>
                            x{item.owned_count}
                          </span>
                        )}
                        {salesLedger && allowSaleRecordEditing ? (
                          <button
                            type="button"
                            onClick={(event) => openSaleRecordDialog(event, item)}
                            className="absolute bottom-2 left-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-black/62 text-white/72 shadow-lg backdrop-blur-md transition-colors hover:bg-violet-500/70 hover:text-white"
                            aria-label={`Edit sale for ${item.name}`}
                            title="Edit sold record"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        ) : null}
                        {tileAction && !showWantPriceRowAction && (
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
                      <span className="shrink-0 text-[var(--dc-text-muted)]">
                        {item.card_number ? `#${item.card_number}` : "--"}
                      </span>
                      {item.version ? (
                        <span className="min-w-0 truncate rounded-md border border-amber-300/30 bg-amber-400/12 px-1 py-px text-[8px] font-bold uppercase tracking-wide text-amber-200">
                          {item.version}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className={collectionTilePriceRowClass(displaySettings.cardSize)}>
                    {displayPrice != null ? (
                      <span
                        title={
                          salesLedger
                            ? [item.sale_platform, formatSoldDate(item.sold_at)]
                                .filter(Boolean)
                                .join(" · ") || "Sold"
                            : item.current_value_label
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
                          trendPercent >= 0
                        )}
                        title={`P&L ${trendPercent >= 0 ? "+" : ""}${trendPercent}%`}
                      >
                        {trendPercent >= 0 ? (
                          <TrendingUp
                            className={collectionTileTrendIconClass(
                              displaySettings.cardSize
                            )}
                          />
                        ) : (
                          <TrendingDown
                            className={collectionTileTrendIconClass(
                              displaySettings.cardSize
                            )}
                          />
                        )}
                        <span className="whitespace-nowrap">
                          {trendPercent >= 0 ? "+" : ""}
                          {trendPercent}%
                        </span>
                      </span>
                    )}
                    {showWantPriceRowAction ? (
                      <span
                        className="ml-auto shrink-0"
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        {tileAction}
                      </span>
                    ) : null}
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
                  {removeDialog.target === "wants"
                    ? "Remove From Wants"
                    : `Remove From ${collectionRemovalLabel}`}
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
                  : collectionRemovalWarning}
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

      {sellQuoteDialog && (
        <div
          className={`${modalCenteredMobileOverlayClass} z-[360]`}
          onClick={() => setSellQuoteDialog(null)}
        >
          <div
            className={`${modalCenteredPanelClass} max-w-3xl`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={modalCompactHeaderClass}>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38 max-[640px]:text-[9px]">
                  Sell Selection
                </p>
                <h2 className="mt-1.5 text-2xl font-bold leading-tight max-[640px]:text-[18px]">
                  {sellQuoteDialog.items.length === 1
                    ? "1 selected card"
                    : `${sellQuoteDialog.items.length} selected cards`}
                </h2>
                <p className="mt-2 text-sm text-white/55 max-[640px]:text-[12px]">
                  Selected market value and vendor estimate before marking cards sold.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSellQuoteDialog(null)}
                className={modalCloseButtonClass}
                aria-label="Close sell selection"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className={modalBodyClass}>
              <div className="grid gap-2.5 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3 max-[640px]:rounded-xl">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">
                    Market Total
                  </p>
                  <p className="mt-1 text-2xl font-black tabular-nums text-white max-[640px]:text-xl">
                    {formatCollectionCurrency(sellQuoteTotal)}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-white/42">
                    {sellQuotePricedCards} / {sellQuoteDialog.items.length} priced
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3 max-[640px]:rounded-xl">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">
                    Paid
                  </p>
                  <p className="mt-1 text-2xl font-black tabular-nums text-white max-[640px]:text-xl">
                    {formatCollectionCurrency(sellQuotePaidTotal)}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-white/42">Cost basis</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3 max-[640px]:rounded-xl">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">
                    P&amp;L
                  </p>
                  <p
                    className={`mt-1 text-2xl font-black tabular-nums max-[640px]:text-xl ${
                      sellQuotePnl >= 0 ? "text-emerald-300" : "text-rose-300"
                    }`}
                  >
                    {sellQuotePnl >= 0 ? "+" : ""}
                    {formatCollectionCurrency(sellQuotePnl)}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-white/42">Market minus paid</p>
                </div>
              </div>

              <VendorBuyEstimate estimatedValue={sellQuoteTotal} className="mt-3" />

              <div className="mt-4 max-h-[36vh] space-y-2 overflow-y-auto pr-1 max-[640px]:max-h-[32vh]">
                {sellQuoteDialog.items.map(({ itemId, item }) => (
                  <div
                    key={itemId}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3 max-[640px]:rounded-xl"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{item.name}</p>
                      <p className="mt-0.5 truncate text-xs font-semibold text-white/42">
                        {item.card_number ? `#${item.card_number}` : item.episode_name}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-black tabular-nums text-white">
                      {item.current_value != null
                        ? formatCollectionCurrency(item.current_value)
                        : "No price"}
                    </p>
                  </div>
                ))}
              </div>

              <div className={modalActionRowClass}>
                <button
                  type="button"
                  onClick={() => openSoldPriceDialog(sellQuoteDialog.items)}
                  className={modalPrimaryButtonClass}
                >
                  Mark sold
                </button>
                <button
                  type="button"
                  onClick={() => setSellQuoteDialog(null)}
                  className={modalSecondaryButtonClass}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {saleListingDialog && (
        <div
          className={`${modalCenteredMobileOverlayClass} z-[360]`}
          onClick={() => (savingSaleListing ? null : setSaleListingDialog(null))}
        >
          <div
            className={`${modalCenteredPanelClass} max-w-2xl`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={modalCompactHeaderClass}>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38 max-[640px]:text-[9px]">
                  Move To For Sale
                </p>
                <h2 className="mt-1.5 text-2xl font-bold leading-tight max-[640px]:text-[18px]">
                  {saleListingDialog.items.length === 1
                    ? "Put 1 card up for sale?"
                    : `Put ${saleListingDialog.items.length} cards up for sale?`}
                </h2>
                <p className="mt-2 text-sm text-white/55 max-[640px]:text-[12px]">
                  They leave this view and appear in your Selling tab with sale tracking.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSaleListingDialog(null)}
                disabled={savingSaleListing}
                className={modalCloseButtonClass}
                aria-label="Close for sale dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className={modalBodyClass}>
              <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3 max-[640px]:rounded-xl">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">
                  Market Total
                </p>
                <p className="mt-1 text-2xl font-black tabular-nums text-white max-[640px]:text-xl">
                  {formatCollectionCurrency(saleListingTotal)}
                </p>
                <p className="mt-1 text-[11px] font-semibold text-white/42">
                  {saleListingPricedCards} / {saleListingDialog.items.length} priced
                </p>
              </div>

              {saleListingDialog.items.length > 1 && (
                <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.045] p-1.5 max-[640px]:rounded-xl">
                  {[
                    { mode: "stack" as const, label: "Paid total" },
                    { mode: "per-card" as const, label: "Paid per card" },
                  ].map((option) => (
                    <button
                      key={option.mode}
                      type="button"
                      onClick={() => updateSaleListingMode(option.mode)}
                      disabled={savingSaleListing}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors max-[640px]:text-[12px] ${
                        saleListingDialog.mode === option.mode
                          ? "bg-amber-600 text-white"
                          : "text-white/56 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}

              {saleListingDialog.mode === "stack" ? (
                <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3 max-[640px]:rounded-xl">
                  <label
                    htmlFor="sale-listing-total-paid"
                    className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35"
                  >
                    Paid For These Cards (Optional)
                  </label>
                  <div className="relative mt-1.5">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-white/36">
                      EUR
                    </span>
                    <input
                      id="sale-listing-total-paid"
                      type="text"
                      inputMode="decimal"
                      value={saleListingDialog.totalPaid}
                      onChange={(event) =>
                        setSaleListingDialog((current) =>
                          current
                            ? { ...current, totalPaid: event.target.value, error: null }
                            : current
                        )
                      }
                      disabled={savingSaleListing}
                      placeholder="0.00"
                      className={`${modalInputClass} pl-12 tabular-nums`}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] font-semibold text-white/42">
                    Total for the whole stack; spread evenly per card for P&amp;L.
                  </p>
                </div>
              ) : null}

              <div className="mt-4 max-h-[32vh] space-y-2 overflow-y-auto pr-1 max-[640px]:max-h-[28vh]">
                {saleListingDialog.items.map(({ itemId, item }) => (
                  <div
                    key={itemId}
                    className={`gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3 max-[640px]:rounded-xl ${
                      saleListingDialog.mode === "per-card"
                        ? "grid sm:grid-cols-[minmax(0,1fr)_auto_9rem] sm:items-center"
                        : "grid grid-cols-[minmax(0,1fr)_auto] items-center"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{item.name}</p>
                      <p className="mt-0.5 truncate text-xs font-semibold text-white/42">
                        {item.card_number ? `#${item.card_number}` : item.episode_name}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-black tabular-nums text-white">
                      {item.current_value != null
                        ? formatCollectionCurrency(item.current_value)
                        : "No price"}
                    </p>
                    {saleListingDialog.mode === "per-card" ? (
                      <span className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-white/36">
                          EUR
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={saleListingDialog.prices[itemId] ?? ""}
                          onChange={(event) => updateSaleListingPrice(itemId, event.target.value)}
                          disabled={savingSaleListing}
                          placeholder="0.00"
                          aria-label={`Paid for ${item.name}`}
                          className={`${modalInputClass} pl-11 text-right tabular-nums`}
                        />
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>

              {saleListingDialog.mode === "per-card" ? (
                <p className="mt-2 text-[11px] font-semibold text-white/42">
                  Optional per card; rows left empty keep their current paid amount.
                </p>
              ) : null}

              {saleListingDialog.error && (
                <p className="mt-4 text-sm text-rose-300">{saleListingDialog.error}</p>
              )}

              <div className={modalActionRowClass}>
                <button
                  type="button"
                  onClick={() => void sendItemsToSale()}
                  disabled={savingSaleListing}
                  className={modalPrimaryButtonClass}
                >
                  {savingSaleListing
                    ? "Moving..."
                    : saleListingDialog.items.length === 1
                      ? "Move to For Sale"
                      : `Move ${saleListingDialog.items.length} cards to For Sale`}
                </button>
                <button
                  type="button"
                  onClick={() => setSaleListingDialog(null)}
                  disabled={savingSaleListing}
                  className={modalSecondaryButtonClass}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {soldDialog && (
        <div
          className={`${modalCenteredMobileOverlayClass} z-[365]`}
          onClick={() => {
            if (!savingSold) {
              setSoldDialog(null);
            }
          }}
        >
          <div
            className={`${modalCenteredPanelClass} max-w-2xl`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={modalCompactHeaderClass}>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38 max-[640px]:text-[9px]">
                  Mark Sold
                </p>
                <h2 className="mt-1.5 text-2xl font-bold leading-tight max-[640px]:text-[18px]">
                  {soldDialog.items.length === 1
                    ? "Sold price"
                    : `${soldDialog.items.length} cards sold`}
                </h2>
                <p className="mt-2 text-sm text-white/55 max-[640px]:text-[12px]">
                  Save the final EUR amount for your sold cards.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSoldDialog(null)}
                disabled={savingSold}
                className={modalCloseButtonClass}
                aria-label="Close sold dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto px-6 pb-6 pt-5 max-[640px]:px-4 max-[640px]:pb-4 max-[640px]:pt-3">
              {soldDialog.items.length > 1 && (
                <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.045] p-1.5 max-[640px]:rounded-xl">
                  {[
                    { mode: "per-card" as const, label: "Different price per card" },
                    { mode: "stack" as const, label: "One total for the complete sale" },
                  ].map((option) => (
                    <button
                      key={option.mode}
                      type="button"
                      onClick={() => updateSoldMode(option.mode)}
                      disabled={savingSold}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors max-[640px]:text-[12px] ${
                        soldDialog.mode === option.mode
                          ? "bg-emerald-600 text-white"
                          : "text-white/56 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}

              {soldDialog.mode === "stack" ? (
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-white/70 max-[640px]:text-[12px]">
                    Total received for all {soldDialog.items.length} cards
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-white/36">
                      EUR
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={soldDialog.totalPrice}
                      onChange={(event) =>
                        setSoldDialog((current) =>
                          current
                            ? { ...current, totalPrice: event.target.value, error: null }
                            : current
                        )
                      }
                      disabled={savingSold}
                      placeholder="0.00"
                      className={`${modalInputClass} pl-12 tabular-nums`}
                    />
                  </div>
                  {soldStackPerCard != null && (
                    <div className="rounded-xl border border-amber-300/18 bg-amber-500/[0.06] px-3 py-2.5">
                      <p className="text-xs font-bold text-amber-100/80">
                        {formatCollectionCurrency(soldStackTotal ?? 0)} total ÷ {soldDialog.items.length} cards = {formatCollectionCurrency(soldStackPerCard)} saved per card
                      </p>
                      <p className="mt-1 text-[10px] leading-4 text-white/38">
                        Choose “Different price per card” when this is not one combined transaction.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1 max-[640px]:max-h-[38vh]">
                  {soldDialog.items.map(({ itemId, item }) => (
                    <label
                      key={itemId}
                      className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.045] p-3 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-center max-[640px]:rounded-xl"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-white">
                          {item.name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs font-semibold text-white/42">
                          {item.card_number ? `#${item.card_number}` : item.episode_name}
                        </span>
                      </span>
                      <span className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-white/36">
                          EUR
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={soldDialog.prices[itemId] ?? ""}
                          onChange={(event) => updateSoldPrice(itemId, event.target.value)}
                          disabled={savingSold}
                          placeholder={formatPricePlaceholder(item.current_value)}
                          className={`${modalInputClass} pl-11 text-right tabular-nums`}
                        />
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <label className="text-[10px] font-black uppercase tracking-[0.12em] text-white/35">
                  Platform
                  <input
                    type="text"
                    value={soldDialog.platform}
                    onChange={(event) => setSoldDialog((current) => current ? { ...current, platform: event.target.value, error: null } : current)}
                    placeholder="CardMarket, eBay, local..."
                    disabled={savingSold}
                    className={`${modalInputClass} mt-1.5 normal-case tracking-normal`}
                  />
                </label>
                <label className="text-[10px] font-black uppercase tracking-[0.12em] text-white/35">
                  Total fees
                  <span className="relative mt-1.5 block">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-white/36">EUR</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={soldDialog.feeTotal}
                      onChange={(event) => setSoldDialog((current) => current ? { ...current, feeTotal: event.target.value, error: null } : current)}
                      placeholder="0.00"
                      disabled={savingSold}
                      className={`${modalInputClass} pl-11 tabular-nums normal-case tracking-normal`}
                    />
                  </span>
                </label>
              </div>

              {soldDialog.error && (
                <p className="mt-4 text-sm font-semibold text-rose-300">{soldDialog.error}</p>
              )}

              <div className={modalActionRowClass}>
                <button
                  type="button"
                  onClick={() => void markSoldItems()}
                  disabled={savingSold}
                  className={modalPrimaryButtonClass}
                >
                  {savingSold ? "Saving..." : "Mark sold"}
                </button>
                <button
                  type="button"
                  onClick={() => setSoldDialog(null)}
                  disabled={savingSold}
                  className={modalSecondaryButtonClass}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {saleRecordDialog && (
        <div
          className={`${modalCenteredMobileOverlayClass} z-[365]`}
          onClick={() => (savingSaleRecord ? null : setSaleRecordDialog(null))}
        >
          <div
            className={`${modalCenteredPanelClass} max-w-lg`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={modalCompactHeaderClass}>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-200/52">Sold ledger</p>
                <h2 className="mt-1.5 truncate text-xl font-black text-white">{saleRecordDialog.item.name}</h2>
                <p className="mt-1 text-xs leading-5 text-white/42">
                  Correct the saved transaction, or move a card that was not actually sold back to For Sale.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSaleRecordDialog(null)}
                disabled={savingSaleRecord}
                className={modalCloseButtonClass}
                aria-label="Close sale editor"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className={modalBodyClass}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-[10px] font-black uppercase tracking-[0.12em] text-white/35">
                  Actual sold price
                  <span className="relative mt-1.5 block">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-white/36">EUR</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={saleRecordDialog.salePrice}
                      onChange={(event) => setSaleRecordDialog((current) => current ? { ...current, salePrice: event.target.value, error: null } : current)}
                      disabled={savingSaleRecord}
                      className={`${modalInputClass} pl-11 tabular-nums normal-case tracking-normal`}
                    />
                  </span>
                </label>
                <label className="text-[10px] font-black uppercase tracking-[0.12em] text-white/35">
                  Fees
                  <span className="relative mt-1.5 block">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-white/36">EUR</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={saleRecordDialog.feeTotal}
                      onChange={(event) => setSaleRecordDialog((current) => current ? { ...current, feeTotal: event.target.value, error: null } : current)}
                      disabled={savingSaleRecord}
                      className={`${modalInputClass} pl-11 tabular-nums normal-case tracking-normal`}
                    />
                  </span>
                </label>
              </div>
              <label className="mt-3 block text-[10px] font-black uppercase tracking-[0.12em] text-white/35">
                Platform
                <input
                  type="text"
                  value={saleRecordDialog.platform}
                  onChange={(event) => setSaleRecordDialog((current) => current ? { ...current, platform: event.target.value, error: null } : current)}
                  placeholder="CardMarket, eBay, local..."
                  disabled={savingSaleRecord}
                  className={`${modalInputClass} mt-1.5 normal-case tracking-normal`}
                />
              </label>

              {saleRecordDialog.error ? (
                <p className="mt-3 text-sm font-semibold text-rose-300">{saleRecordDialog.error}</p>
              ) : null}

              <div className="mt-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <button
                  type="button"
                  onClick={() => void saveSaleRecord()}
                  disabled={savingSaleRecord}
                  className={modalPrimaryButtonClass}
                >
                  {savingSaleRecord ? "Saving..." : "Save sold record"}
                </button>
                <button
                  type="button"
                  onClick={() => void restoreSaleRecord()}
                  disabled={savingSaleRecord}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-300/16 bg-amber-500/[0.06] px-4 text-sm font-bold text-amber-100/76 transition-colors hover:bg-amber-500/[0.12] disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" /> Back to For Sale
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
          backLabel="Back to Collection"
          showGradedSlabPreview={showGradedSlabPreview}
          onClose={() => setSelectedCard(null)}
          onCollectionItemSaved={handleCollectionItemSaved}
        />
      )}
    </>
  );
}
