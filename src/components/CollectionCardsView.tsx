"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus } from "lucide-react";
import CardModal, { type ModalCardData } from "@/components/CardModal";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";
import CollectionBulkAddCardsModal from "@/components/CollectionBulkAddCardsModal";
import GradedSlabPreview from "@/components/GradedSlabPreview";
import { formatCollectionCurrency } from "@/lib/collection";
import { useSettings } from "@/components/SettingsProvider";
import {
  GRADED_SLAB_ASPECT_CLASS,
  RAW_CARD_ASPECT_CLASS,
  normalizeGradingCompanyLabel,
  normalizeGradingGradeLabel,
} from "@/lib/graded-slabs";
import { KNOWN_RARITY_ORDER, normalizeRarityLabel } from "@/lib/rarity";

export interface CollectionCardViewItem {
  collection_item_id: string | null;
  collection_item_ids?: string[];
  binder_id?: string | null;
  card_id: string;
  name: string;
  image_url: string | null;
  card_number: string | null;
  rarity: string | null;
  supertype: string | null;
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  current_value: number | null;
  current_value_label?: string | null;
  purchase_price: number | null;
  condition: string | null;
  language?: string | null;
  notes?: string | null;
  tags?: string[];
  grading_company: string | null;
  grading_grade: string | null;
  owned: boolean;
  owned_count?: number;
}

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
  showFilters?: boolean;
  onVisibleItemsChange?: (items: CollectionCardViewItem[]) => void;
  splitByGrading?: boolean;
  sectionTitle?: string;
  sectionCount?: number;
  sectionTrailing?: ReactNode;
}

interface RemoveDialogState {
  itemIds: string[];
  title: string;
  description: string;
}

const cardMinWidth = {
  small: { normal: "120px", wide: "160px" },
  medium: { normal: "160px", wide: "220px" },
  large: { normal: "220px", wide: "300px" },
} as const;

const KNOWN_SUPERTYPE_ORDER = ["pokemon", "trainer", "energy"] as const;

interface FilterOption {
  value: string;
  count: number;
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
      const aRank = rankByValue.get(a.toLowerCase());
      const bRank = rankByValue.get(b.toLowerCase());

      if (aRank != null || bRank != null) {
        if (aRank == null) return 1;
        if (bRank == null) return -1;
        if (aRank !== bRank) return aRank - bRank;
      }

      return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
    })
    .map(([value, count]) => ({ value, count }));
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
    return `${palette} border-black/15 dark:border-white/15 opacity-100 ring-2 ring-gray-900/70 ring-offset-1 ring-offset-white shadow-md shadow-black/10 dark:ring-white/80 dark:ring-offset-black dark:shadow-black/25`;
  }

  return `${palette} border-black/8 dark:border-white/8 opacity-75 hover:opacity-100 hover:border-black/20 hover:shadow-sm dark:hover:border-white/20`;
}

function neutralFilterChip(active: boolean): string {
  if (active) {
    return "border-gray-900 bg-gray-900 text-white opacity-100 ring-2 ring-gray-900/70 ring-offset-1 ring-offset-white shadow-md shadow-black/10 dark:border-white dark:bg-white dark:text-gray-900 dark:ring-white/80 dark:ring-offset-black dark:shadow-black/25";
  }

  return "border-black/8 text-gray-500 opacity-80 hover:border-black/20 hover:opacity-100 hover:text-gray-900 hover:shadow-sm dark:border-white/8 dark:text-white/55 dark:hover:border-white/20 dark:hover:text-white";
}

function selectionToggleTextClass(active: boolean): string {
  if (active) {
    return "shrink-0 text-xs font-semibold text-blue-600 transition-colors hover:text-blue-500 dark:text-blue-300 dark:hover:text-blue-200";
  }

  return "shrink-0 text-xs font-medium text-gray-400 transition-colors hover:text-gray-900 dark:text-white/45 dark:hover:text-white/75";
}

function isGradedCollectionCard(item: CollectionCardViewItem): boolean {
  return Boolean(
    item.owned &&
      normalizeGradingCompanyLabel(item.grading_company) &&
      normalizeGradingGradeLabel(item.grading_grade)
  );
}

function collectionMetaBadge(
  tone: "neutral" | "positive" | "negative" = "neutral"
): string {
  if (tone === "positive") {
    return "inline-flex h-[26px] items-center gap-[5px] whitespace-nowrap rounded-full border border-emerald-200/60 bg-emerald-50/90 px-[11px] text-[9px] font-medium leading-none text-emerald-700 shadow-sm shadow-black/5 dark:border-emerald-500/20 dark:bg-emerald-900/25 dark:text-emerald-300 dark:shadow-black/20";
  }

  if (tone === "negative") {
    return "inline-flex h-[26px] items-center gap-[5px] whitespace-nowrap rounded-full border border-rose-200/60 bg-rose-50/90 px-[11px] text-[9px] font-medium leading-none text-rose-700 shadow-sm shadow-black/5 dark:border-rose-500/20 dark:bg-rose-900/25 dark:text-rose-300 dark:shadow-black/20";
  }

  return "inline-flex h-[26px] items-center gap-[5px] whitespace-nowrap rounded-full border border-black/8 bg-black/[0.035] px-[11px] text-[9px] font-medium leading-none text-gray-600 shadow-sm shadow-black/5 dark:border-white/8 dark:bg-white/[0.05] dark:text-white/60 dark:shadow-black/20";
}

function normalizeConditionLabel(condition: string | null | undefined): string | null {
  if (!condition) return null;

  const normalized = condition.trim().toLowerCase();

  if (normalized === "mint") return "Mint";
  if (normalized === "near mint") return "Near Mint";
  if (normalized === "excellent") return "Excellent";
  if (normalized === "good") return "Good";
  if (normalized === "light played") return "Light Played";
  if (normalized === "played") return "Played";
  if (normalized === "poor") return "Poor";

  return condition.trim() || null;
}

function getConditionBadge(condition: string | null | undefined): {
  label: string;
  title: string;
  className: string;
} | null {
  const normalized = normalizeConditionLabel(condition);
  if (!normalized) return null;

  const palette: Record<string, { label: string; className: string }> = {
    Mint: {
      label: "M",
      className:
        "inline-flex h-[26px] min-w-[40px] items-center justify-center whitespace-nowrap rounded-full border border-emerald-200/70 bg-emerald-50/90 px-[11px] text-[9px] font-semibold leading-none text-emerald-700 shadow-sm shadow-black/5 dark:border-emerald-500/20 dark:bg-emerald-900/25 dark:text-emerald-300 dark:shadow-black/20",
    },
    "Near Mint": {
      label: "NM",
      className:
        "inline-flex h-[26px] min-w-[40px] items-center justify-center whitespace-nowrap rounded-full border border-green-200/70 bg-green-50/90 px-[11px] text-[9px] font-semibold leading-none text-green-700 shadow-sm shadow-black/5 dark:border-green-500/20 dark:bg-green-900/25 dark:text-green-300 dark:shadow-black/20",
    },
    Excellent: {
      label: "EX",
      className:
        "inline-flex h-[26px] min-w-[40px] items-center justify-center whitespace-nowrap rounded-full border border-sky-200/70 bg-sky-50/90 px-[11px] text-[9px] font-semibold leading-none text-sky-700 shadow-sm shadow-black/5 dark:border-sky-500/20 dark:bg-sky-900/25 dark:text-sky-300 dark:shadow-black/20",
    },
    Good: {
      label: "GD",
      className:
        "inline-flex h-[26px] min-w-[40px] items-center justify-center whitespace-nowrap rounded-full border border-amber-200/70 bg-amber-50/90 px-[11px] text-[9px] font-semibold leading-none text-amber-700 shadow-sm shadow-black/5 dark:border-amber-500/20 dark:bg-amber-900/25 dark:text-amber-300 dark:shadow-black/20",
    },
    "Light Played": {
      label: "LP",
      className:
        "inline-flex h-[26px] min-w-[40px] items-center justify-center whitespace-nowrap rounded-full border border-orange-200/70 bg-orange-50/90 px-[11px] text-[9px] font-semibold leading-none text-orange-700 shadow-sm shadow-black/5 dark:border-orange-500/20 dark:bg-orange-900/25 dark:text-orange-300 dark:shadow-black/20",
    },
    Played: {
      label: "PL",
      className:
        "inline-flex h-[26px] min-w-[40px] items-center justify-center whitespace-nowrap rounded-full border border-rose-200/70 bg-rose-50/90 px-[11px] text-[9px] font-semibold leading-none text-rose-700 shadow-sm shadow-black/5 dark:border-rose-500/20 dark:bg-rose-900/25 dark:text-rose-300 dark:shadow-black/20",
    },
    Poor: {
      label: "PR",
      className:
        "inline-flex h-[26px] min-w-[40px] items-center justify-center whitespace-nowrap rounded-full border border-red-200/70 bg-red-50/90 px-[11px] text-[9px] font-semibold leading-none text-red-700 shadow-sm shadow-black/5 dark:border-red-500/20 dark:bg-red-900/25 dark:text-red-300 dark:shadow-black/20",
    },
  };

  const match = palette[normalized];

  return {
    label: match?.label ?? normalized.slice(0, 3).toUpperCase(),
    title: normalized,
    className: match?.className ?? collectionMetaBadge(),
  };
}

export default function CollectionCardsView({
  items,
  blurMissing = false,
  emptyTitle,
  emptyText,
  bulkAddBinder = null,
  allowCollectionRemoval = false,
  showFilters = false,
  onVisibleItemsChange,
  splitByGrading = false,
  sectionTitle,
  sectionCount,
  sectionTrailing,
}: Props) {
  const router = useRouter();
  const { settings, set } = useSettings();
  const [search, setSearch] = useState("");
  const [showOnlyGraded, setShowOnlyGraded] = useState(false);
  const [selectedCard, setSelectedCard] = useState<ModalCardData | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [removingItems, setRemovingItems] = useState(false);
  const [removeDialog, setRemoveDialog] = useState<RemoveDialogState | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const selectionEnabled = Boolean(bulkAddBinder) || allowCollectionRemoval;
  const canBulkAddToBinder = Boolean(bulkAddBinder) && blurMissing;
  const canRemoveFromCollection = Boolean(bulkAddBinder) || allowCollectionRemoval;
  const compactMode = Boolean(bulkAddBinder);
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
  const hasAnyPricedCards = useMemo(
    () => items.some((item) => item.current_value != null),
    [items]
  );
  const hasAnyGradedCards = useMemo(
    () => items.some((item) => isGradedCollectionCard(item)),
    [items]
  );
  const hasAnyRawCards = useMemo(
    () => items.some((item) => !isGradedCollectionCard(item)),
    [items]
  );
  const showGradedFilter = hasAnyGradedCards && hasAnyRawCards;
  const effectiveShowOnlyGraded = showOnlyGraded && showGradedFilter;
  const effectiveOnlyPriced = settings.showOnlyPriced && hasAnyPricedCards;
  const pricedOnlyUnavailable = settings.showOnlyPriced && !hasAnyPricedCards;
  const validSelectionKeys = useMemo(
    () => new Set(items.map((item, index) => `${item.card_id}-${index}`)),
    [items]
  );
  const activeSelectedKeys = useMemo(
    () => selectedKeys.filter((key) => validSelectionKeys.has(key)),
    [selectedKeys, validSelectionKeys]
  );
  const selectedKeySet = useMemo(() => new Set(activeSelectedKeys), [activeSelectedKeys]);
  const activeSelectionMode = selectionEnabled && selectionMode;
  const filteredEntries = useMemo(() => {
    return items.flatMap((item, index) => {
      if (normalizedSearch) {
        const haystack = [
          item.name,
          item.card_number ?? "",
          item.episode_name,
          item.episode_code ?? "",
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(normalizedSearch)) return [];
      }

      if (
        activeRarities.length > 0 &&
        !activeRarities.includes(normalizeRarityLabel(item.rarity) ?? "")
      ) {
        return [];
      }

      if (activeSupertypes.length > 0 && !activeSupertypes.includes(item.supertype ?? "")) {
        return [];
      }

      if (effectiveOnlyPriced && item.current_value == null) {
        return [];
      }

      if (effectiveShowOnlyGraded && !isGradedCollectionCard(item)) {
        return [];
      }

      return [{ item, index, selectionKey: `${item.card_id}-${index}` }];
    });
  }, [
    items,
    normalizedSearch,
    activeRarities,
    activeSupertypes,
    effectiveOnlyPriced,
    effectiveShowOnlyGraded,
  ]);
  const persistentFiltersHideEverything =
    showFilters &&
    !normalizedSearch &&
    !effectiveShowOnlyGraded &&
    items.length > 0 &&
    filteredEntries.length === 0 &&
    (activeRarities.length > 0 || activeSupertypes.length > 0 || effectiveOnlyPriced);
  const visibleEntries = useMemo(
    () =>
      persistentFiltersHideEverything
        ? items.map((item, index) => ({
            item,
            index,
            selectionKey: `${item.card_id}-${index}`,
          }))
        : filteredEntries,
    [items, persistentFiltersHideEverything, filteredEntries]
  );
  const visibleItems = useMemo(
    () => visibleEntries.map((entry) => entry.item),
    [visibleEntries]
  );
    const groupedVisibleEntries = useMemo(() => {
    if (!splitByGrading) {
      return [{ key: "all", title: null, entries: visibleEntries }];
    }

    const gradedEntries = visibleEntries.filter(({ item }) => isGradedCollectionCard(item));
    const rawEntries = visibleEntries.filter(
      ({ item }) => !isGradedCollectionCard(item)
    );

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
  const selectableKeys = useMemo(
    () => visibleEntries.map(({ selectionKey }) => selectionKey),
    [visibleEntries]
  );
  const allSelectableSelected =
    selectableKeys.length > 0 && selectableKeys.every((key) => selectedKeySet.has(key));
  const selectedCards = useMemo(
    () =>
      items.flatMap((item, index) =>
        selectedKeySet.has(`${item.card_id}-${index}`) && !item.owned
          ? [
              {
                id: item.card_id,
                name: item.name,
                image_url: item.image_url,
                episode: {
                  id: item.episode_id,
                  name: item.episode_name,
                  code: item.episode_code,
                },
              },
            ]
          : []
      ),
    [items, selectedKeySet]
  );
  const selectedCollectionItemIds = useMemo(
    () => {
      const ids = new Set<string>();

      for (const [index, item] of items.entries()) {
        if (!selectedKeySet.has(`${item.card_id}-${index}`)) continue;

        const itemIds = item.collection_item_ids ?? (item.collection_item_id ? [item.collection_item_id] : []);
        for (const itemId of itemIds) {
          ids.add(itemId);
        }
      }

      return [...ids];
    },
    [items, selectedKeySet]
  );

  async function openCard(item: CollectionCardViewItem) {
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
                purchase_price: item.purchase_price,
                condition: item.condition,
                language: item.language ?? null,
                notes: item.notes ?? null,
                tags: item.tags ?? [],
                grading_company: item.grading_company,
                grading_grade: item.grading_grade,
              }
            : null,
      });
    } catch {
      // ignore
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

    void openCard(item);
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

  function handleBulkAdd() {
    setBulkAddOpen(true);
  }

  function handleBulkRemove() {
    if (selectedCollectionItemIds.length === 0) return;
    setRemoveError(null);
    setRemoveDialog({
      itemIds: selectedCollectionItemIds,
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
    if (removableIds.length === 0) return;
    setRemoveError(null);
    setRemoveDialog({
      itemIds: removableIds,
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
    activeRarities.length > 0 ||
    activeSupertypes.length > 0 ||
    settings.showOnlyPriced;

  useEffect(() => {
    onVisibleItemsChange?.(visibleItems);
  }, [visibleItems, onVisibleItemsChange]);

  if (items.length === 0) {
    return (
      <div className="glass rounded-3xl p-12 text-center shadow-md shadow-black/5">
        <p className="mb-1 font-medium text-gray-700 dark:text-gray-300">{emptyTitle}</p>
        <p className="text-sm text-gray-400">{emptyText}</p>
      </div>
    );
  }

  const cardTrackWidth =
    cardMinWidth[settings.cardSize][settings.widescreen ? "wide" : "normal"];
  const gridTemplateColumns = `repeat(auto-fill, minmax(${cardTrackWidth}, ${cardTrackWidth}))`;
  const showInlineSelectionButton =
    Boolean(sectionTitle) && !showFilters && selectionEnabled && !activeSelectionMode;

  return (
    <>
      {sectionTitle && (
        <div className="mb-2.5 flex items-center gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-white/40">
            {sectionTitle}
          </h2>
          <span className="rounded-full bg-black/6 px-2 py-0.5 text-xs text-gray-400 dark:bg-white/6 dark:text-white/40">
            {sectionCount ?? items.length}
          </span>
          <div className="h-px flex-1 bg-black/8 dark:bg-white/10" />
          {sectionTrailing}
          {showInlineSelectionButton && (
            <button
              type="button"
              onClick={toggleSelectionMode}
              className={selectionToggleTextClass(false)}
            >
              Select
            </button>
          )}
        </div>
      )}

      {showFilters ? (
        <div className="glass mb-4 space-y-2.5 rounded-2xl px-4 py-3 shadow-sm shadow-black/5">
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

            {selectionEnabled && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {activeSelectionMode && (
                  <>
                    <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
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
                        className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-45"
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
                  className={`rounded-full border px-2.5 py-1 text-xs leading-none transition-all ${
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
                  className={`rounded-full border px-2.5 py-1 text-xs leading-none transition-all ${
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
              className={`rounded-full border px-2.5 py-1 text-xs leading-none transition-all ${
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
                className={`rounded-full border px-2.5 py-1 text-xs leading-none transition-all ${
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
      ) : selectionEnabled && (!sectionTitle || activeSelectionMode) && (
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
          {activeSelectionMode && (
            <>
              <span className="rounded-full border border-black/8 bg-black/[0.03] px-3 py-1 text-xs font-medium text-gray-500 dark:border-white/8 dark:bg-white/[0.05] dark:text-white/45">
                {activeSelectedKeys.length} selected
              </span>
              <button
                type="button"
                onClick={() => setSelectedKeys(selectableKeys)}
                disabled={selectableKeys.length === 0 || allSelectableSelected}
                className="rounded-full border border-black/8 bg-white/70 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/8 dark:text-white/75 dark:hover:bg-white/12"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelectedKeys([])}
                disabled={activeSelectedKeys.length === 0}
                className="rounded-full border border-black/8 bg-white/70 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/8 dark:text-white/75 dark:hover:bg-white/12"
              >
                Clear
              </button>
              {canBulkAddToBinder && (
                <button
                  type="button"
                  onClick={handleBulkAdd}
                  disabled={selectedCards.length === 0}
                  className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Bulk add
                </button>
              )}
              {canRemoveFromCollection && (
                <button
                  type="button"
                  onClick={handleBulkRemove}
                  disabled={removingItems || selectedCollectionItemIds.length === 0}
                  className="rounded-full border border-black/8 bg-white/70 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/8 dark:text-white/75 dark:hover:bg-white/12"
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
      ) : (
        <div className={splitByGrading ? "space-y-6" : ""}>
          {groupedVisibleEntries.map((group) => (
            <section key={group.key}>
              {group.title && (
                <div className="mb-2.5 flex items-center gap-3">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-white/40">
                    {group.title}
                  </h2>
                  <span className="rounded-full bg-black/6 px-2 py-0.5 text-xs text-gray-400 dark:bg-white/6 dark:text-white/40">
                    {group.entries.length}
                  </span>
                  <div className="h-px flex-1 bg-black/8 dark:bg-white/10" />
                </div>
              )}
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns,
                  justifyContent: "start",
                }}
              >
                {group.entries.map(({ item, selectionKey }, index) => {
                  const missing = !item.owned;
                  const selectableInMode = selectionEnabled ? true : !blurMissing || missing;
                  const isSelected = activeSelectionMode && selectedKeySet.has(selectionKey);
                  const conditionBadge = getConditionBadge(item.condition);
                  const gradingCompanyLabel = normalizeGradingCompanyLabel(item.grading_company);
                  const gradingGradeLabel = normalizeGradingGradeLabel(item.grading_grade);
                  const isGradedCard = Boolean(item.owned && gradingCompanyLabel && gradingGradeLabel);
                  const previewAspectClass = isGradedCard
                    ? GRADED_SLAB_ASPECT_CLASS
                    : RAW_CARD_ASPECT_CLASS;
                  const baseImageClass = "object-contain";
                  const imageClass =
                    blurMissing && missing
                      ? `${baseImageClass} blur-[2.5px] saturate-[0.72] opacity-55`
                      : baseImageClass;
                  const pnl =
                    item.current_value != null && item.purchase_price != null
                      ? Number((item.current_value - item.purchase_price).toFixed(2))
                      : null;

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
                      className="group flex cursor-pointer flex-col gap-1.5 text-left outline-none"
                    >
                      <div
                        className={`relative ${previewAspectClass} w-full overflow-hidden rounded-xl border transition-all duration-200 ${
                          isSelected
                            ? "border-blue-400/80 shadow-lg shadow-blue-500/25 ring-2 ring-blue-400/80"
                            : "border-transparent shadow-md shadow-black/20 group-hover:scale-[1.02] group-hover:shadow-xl group-hover:shadow-black/30"
                        }`}
                      >
                        {isGradedCard && gradingCompanyLabel && gradingGradeLabel ? (
                          <GradedSlabPreview
                            company={gradingCompanyLabel}
                            grade={gradingGradeLabel}
                            name={item.name}
                            episodeName={item.episode_name}
                            episodeCode={item.episode_code}
                            cardNumber={item.card_number}
                            imageUrl={item.image_url}
                            alt={item.name}
                            className="absolute inset-0"
                            imageClassName={imageClass}
                            sizes="220px"
                            loading={index < 18 ? "eager" : undefined}
                          />
                        ) : item.image_url ? (
                          <Image
                            src={item.image_url}
                            alt={item.name}
                            fill
                            className={imageClass}
                            sizes="180px"
                            loading={index < 18 ? "eager" : undefined}
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

                        {isSelected && <div className="pointer-events-none absolute inset-0 bg-blue-500/10" />}

                        {blurMissing && missing && (
                          <div className="absolute left-2 top-2">
                            <span className="rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/80 backdrop-blur">
                              Missing
                            </span>
                          </div>
                        )}

                {item.owned_count && item.owned_count > 1 && (
                  <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/80 backdrop-blur">
                    x{item.owned_count}
                  </span>
                )}
              </div>

              <div className="mt-2 px-0.5">
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold leading-snug text-gray-900 dark:text-white">
                      {item.name}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium">
                      <span className="shrink-0 text-gray-500 dark:text-gray-400">
                        {item.card_number ? `#${item.card_number}` : "--"}
                      </span>
                      <span className="text-gray-300 dark:text-white/20">•</span>
                      <Link
                        href={`/expansions/${item.episode_id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="min-w-0 truncate text-gray-400 transition-colors hover:text-gray-600 hover:underline underline-offset-2 dark:text-gray-500 dark:hover:text-gray-300"
                      >
                        {item.episode_name}
                        {item.episode_code ? <span className="ml-1 opacity-60">({item.episode_code})</span> : null}
                      </Link>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {item.current_value != null ? (
                      <span
                        title={
                          item.current_value_label
                            ? `Using ${item.current_value_label} graded price`
                            : undefined
                        }
                        className="text-[15px] font-semibold tabular-nums text-gray-900 dark:text-white"
                      >
                        {formatCollectionCurrency(item.current_value)}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">No price</span>
                    )}

                    {!activeSelectionMode &&
                      (item.owned ? (
                        canRemoveFromCollection &&
                        (item.collection_item_id || (item.collection_item_ids?.length ?? 0) > 0) ? (
                          <button
                            type="button"
                            onClick={(event) => handleSingleRemove(event, item)}
                            disabled={removingItems}
                            className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border border-black/8 bg-black/5 text-gray-900 transition-colors hover:border-black/15 hover:bg-black/8 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:bg-white/12"
                            aria-label={`Remove ${item.name} from collection`}
                            title="Remove from collection"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                        ) : null
                      ) : (
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
                          className="h-[22px] w-[22px] shrink-0 rounded-md border-black/8 bg-black/5 text-gray-900 hover:border-black/15 hover:bg-black/8 dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:bg-white/12"
                        />
                      ))}
                  </div>
                </div>

                {item.owned && !compactMode ? (
                  <div className="mt-2 flex min-h-[54px] flex-wrap content-start items-center gap-[5px]">
                    {item.purchase_price != null && (
                      <span className={collectionMetaBadge()}>
                        <span className="text-[8px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-white/35">
                          Paid
                        </span>
                        <span className="tabular-nums text-gray-700 dark:text-white/80">
                          {formatCollectionCurrency(item.purchase_price)}
                        </span>
                      </span>
                    )}
                    {pnl != null && (
                      <span className={collectionMetaBadge(pnl >= 0 ? "positive" : "negative")}>
                        <span className="text-[8px] font-semibold uppercase tracking-[0.12em] opacity-70">
                          P&amp;L
                        </span>
                        <span className="tabular-nums">
                          {pnl >= 0 ? "+" : ""}
                          {formatCollectionCurrency(pnl)}
                        </span>
                      </span>
                    )}
                    {conditionBadge && (
                      <span title={conditionBadge.title} className={conditionBadge.className}>
                        {conditionBadge.label}
                      </span>
                    )}
                  </div>
                ) : !item.owned && !compactMode ? (
                  <div className="mt-2 flex min-h-[56px] items-center">
                    <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500">
                      Not in your collection yet
                    </p>
                  </div>
                ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
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
          className="fixed inset-0 z-[73] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)" }}
          onClick={() => {
            if (!removingItems) {
              setRemoveDialog(null);
              setRemoveError(null);
            }
          }}
        >
          <div
            className="glass w-full max-w-md rounded-3xl border border-white/12 bg-[#0d0d10]/90 p-6 text-white shadow-2xl shadow-black/45"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">
                Remove From Collection
              </p>
              <h2 className="mt-2 text-2xl font-bold leading-tight">{removeDialog.title}</h2>
              <p className="mt-2 text-sm text-white/55">{removeDialog.description}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white/68">
              This removes the saved collection entry entirely. It will not be moved to loose singles.
            </div>

            {removeError && <p className="mt-4 text-sm text-rose-300">{removeError}</p>}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => void removeItemsFromCollection(removeDialog.itemIds)}
                disabled={removingItems}
                className="flex-1 rounded-2xl bg-rose-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
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
                className="rounded-2xl bg-white/8 px-4 py-3 font-semibold text-white/72 transition-colors hover:bg-white/12 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedCard && (
        <CardModal key={selectedCard.id} card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}
    </>
  );
}
