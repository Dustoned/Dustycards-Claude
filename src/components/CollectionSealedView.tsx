"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSettings } from "@/components/SettingsProvider";
import {
  CollectionSealedEmptyState,
  CollectionSealedGrid,
  CollectionSealedRemoveDialog,
  CollectionSealedSectionHeader,
  CollectionSealedSelectionToolbar,
} from "./collection-sealed/CollectionSealedSections";
import type {
  CollectionSealedViewItem,
  CollectionSealedViewProps,
  RemoveDialogState,
} from "./collection-sealed/types";
import {
  buildModalProduct,
  compareCollectionSealedItems,
} from "./collection-sealed/utils";
import {
  getSealedProductGridTemplateColumns,
  getSealedProductImageSizes,
} from "@/lib/display-scale";
import type { SealedModalProductData } from "@/components/sealed-modal/types";

const SealedProductModal = dynamic(() => import("@/components/SealedProductModal"), {
  ssr: false,
  loading: () => null,
});

export type { CollectionSealedViewItem } from "./collection-sealed/types";

export default function CollectionSealedView({
  items,
  emptyTitle,
  emptyText,
  sectionTitle,
  sectionCount,
  sectionTrailing,
}: CollectionSealedViewProps) {
  const router = useRouter();
  const { displaySettings, isMobileViewport } = useSettings();
  const [selectedSealed, setSelectedSealed] = useState<SealedModalProductData | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [removingItems, setRemovingItems] = useState(false);
  const [removeDialog, setRemoveDialog] = useState<RemoveDialogState | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const sortedItems = useMemo(() => [...items].sort(compareCollectionSealedItems), [items]);
  const selectableIds = useMemo(() => sortedItems.map((item) => item.id), [sortedItems]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const activeSelectedIds = useMemo(
    () => selectedIds.filter((id) => selectableIds.includes(id)),
    [selectedIds, selectableIds]
  );
  const allSelectableSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIdSet.has(id));
  const showInlineSelectionButton =
    Boolean(sectionTitle) && !selectionMode && sortedItems.length > 0;
  const tileImageSizes = getSealedProductImageSizes(
    displaySettings.cardSize,
    displaySettings.widescreen,
    isMobileViewport
  );
  const gridTemplateColumns = getSealedProductGridTemplateColumns(
    displaySettings.cardSize,
    displaySettings.widescreen,
    isMobileViewport
  );

  function openProduct(item: CollectionSealedViewItem) {
    setSelectedSealed(buildModalProduct(item));
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
    );
  }

  function handleTileActivate(item: CollectionSealedViewItem) {
    if (selectionMode) {
      toggleSelected(item.id);
      return;
    }

    openProduct(item);
  }

  function toggleSelectionMode() {
    setSelectionMode((prev) => {
      if (prev) {
        setSelectedIds([]);
      }
      return !prev;
    });
  }

  function handleBulkRemove() {
    if (activeSelectedIds.length === 0) return;

    setRemoveError(null);
    setRemoveDialog({
      itemIds: activeSelectedIds,
      title:
        activeSelectedIds.length === 1
          ? "Remove 1 sealed product from My Collection?"
          : `Remove ${activeSelectedIds.length} sealed products from My Collection?`,
      description:
        activeSelectedIds.length === 1
          ? "This sealed entry will be deleted from your collection."
          : "These sealed entries will be deleted from your collection.",
    });
  }

  function handleSingleRemove(
    event: React.MouseEvent<HTMLButtonElement>,
    item: CollectionSealedViewItem
  ) {
    event.stopPropagation();
    setRemoveError(null);
    setRemoveDialog({
      itemIds: [item.id],
      title: `Remove ${item.name} from My Collection?`,
      description:
        item.quantity > 1
          ? `This sealed entry including quantity x${item.quantity} will be deleted from your collection.`
          : "This sealed entry will be deleted from your collection.",
    });
  }

  async function removeItemsFromCollection(itemIds: string[]) {
    if (itemIds.length === 0) return;

    setRemovingItems(true);
    setRemoveError(null);

    try {
      const response = await fetch("/api/collection/sealed", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not remove sealed product from collection");
      }

      setSelectionMode(false);
      setSelectedIds([]);
      setRemoveDialog(null);
      router.refresh();
    } catch (error) {
      setRemoveError(
        error instanceof Error
          ? error.message
          : "Could not remove sealed product from collection"
      );
    } finally {
      setRemovingItems(false);
    }
  }

  const resolvedSectionCount = sectionCount ?? sortedItems.length;

  if (sortedItems.length === 0) {
    return (
      <CollectionSealedEmptyState
        sectionTitle={sectionTitle}
        sectionCount={resolvedSectionCount}
        sectionTrailing={sectionTrailing}
        emptyTitle={emptyTitle}
        emptyText={emptyText}
      />
    );
  }

  return (
    <>
      <CollectionSealedSectionHeader
        sectionTitle={sectionTitle}
        sectionCount={resolvedSectionCount}
        sectionTrailing={sectionTrailing}
        showInlineSelectionButton={showInlineSelectionButton}
        onToggleSelectionMode={toggleSelectionMode}
      />

      <CollectionSealedSelectionToolbar
        visible={selectionMode || !sectionTitle}
        selectionMode={selectionMode}
        activeSelectedCount={activeSelectedIds.length}
        selectableCount={selectableIds.length}
        allSelectableSelected={allSelectableSelected}
        removingItems={removingItems}
        onSelectAll={() => setSelectedIds(selectableIds)}
        onClear={() => setSelectedIds([])}
        onRemove={handleBulkRemove}
        onToggleSelectionMode={toggleSelectionMode}
      />

      <CollectionSealedGrid
        items={sortedItems}
        imageSizes={tileImageSizes}
        gridTemplateColumns={gridTemplateColumns}
        cardSize={displaySettings.cardSize}
        selectionMode={selectionMode}
        selectedIdSet={selectedIdSet}
        removingItems={removingItems}
        onActivate={handleTileActivate}
        onRemove={handleSingleRemove}
      />

      <CollectionSealedRemoveDialog
        removeDialog={removeDialog}
        removingItems={removingItems}
        removeError={removeError}
        onConfirm={(itemIds) => void removeItemsFromCollection(itemIds)}
        onClose={() => {
          setRemoveDialog(null);
          setRemoveError(null);
        }}
      />

      {selectedSealed && (
        <SealedProductModal product={selectedSealed} onClose={() => setSelectedSealed(null)} />
      )}
    </>
  );
}
