"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Minus, Package } from "lucide-react";
import CollectionAddSealedButton from "@/components/CollectionAddSealedButton";
import { SectionHeader } from "@/components/PageHeader";
import {
  sealedTileActionButtonClass,
  sealedTileActionIconClass,
  sealedTileBubbleClass,
  sealedTileBubbleLabelClass,
  sealedTileBubbleWrapClass,
  sealedTileGridGapClass,
  sealedTileImageClass,
  sealedTileImagePaddingClass,
  sealedTileInfoClass,
  sealedTileMetaLineClass,
  sealedTileNoPriceClass,
  sealedTilePriceClass,
  sealedTileRootClass,
  sealedTileTitleClass,
} from "@/components/sealed-tile-styles";
import { formatCollectionCurrency } from "@/lib/collection";
import { getCachedImageUrl } from "@/lib/image-cache";
import type { CardSize } from "@/lib/user-settings";
import type { CollectionSealedViewItem, RemoveDialogState } from "./types";
import {
  buildCollectionAddProduct,
  getCollectionSealedCurrentTotal,
  getCollectionSealedPaidTotal,
  getCollectionSealedPnl,
  selectionToggleTextClass,
} from "./utils";

function SectionHeaderBar({
  title,
  count,
  trailing,
}: {
  title: string;
  count: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <SectionHeader title={title} count={count} actions={trailing} compact className="mb-2.5" />
  );
}

export function CollectionSealedSectionHeader({
  sectionTitle,
  sectionCount,
  sectionTrailing,
  showInlineSelectionButton,
  onToggleSelectionMode,
}: {
  sectionTitle?: string;
  sectionCount: ReactNode;
  sectionTrailing?: ReactNode;
  showInlineSelectionButton: boolean;
  onToggleSelectionMode: () => void;
}) {
  if (!sectionTitle) {
    return null;
  }

  return (
    <SectionHeaderBar
      title={sectionTitle}
      count={sectionCount}
      trailing={
        <>
          {showInlineSelectionButton && (
            <button
              type="button"
              onClick={onToggleSelectionMode}
              className={selectionToggleTextClass(false)}
            >
              Select
            </button>
          )}
          {sectionTrailing}
        </>
      }
    />
  );
}

export function CollectionSealedEmptyState({
  sectionTitle,
  sectionCount,
  sectionTrailing,
  emptyTitle,
  emptyText,
}: {
  sectionTitle?: string;
  sectionCount: ReactNode;
  sectionTrailing?: ReactNode;
  emptyTitle: string;
  emptyText: string;
}) {
  return (
    <>
      {sectionTitle && (
        <SectionHeaderBar
          title={sectionTitle}
          count={sectionCount}
          trailing={sectionTrailing}
        />
      )}
      <div className="glass rounded-3xl p-12 text-center shadow-md shadow-black/5">
        <p className="mb-1 font-medium text-gray-700 dark:text-gray-300">{emptyTitle}</p>
        <p className="text-sm text-gray-400">{emptyText}</p>
      </div>
    </>
  );
}

export function CollectionSealedSelectionToolbar({
  visible,
  selectionMode,
  activeSelectedCount,
  selectableCount,
  allSelectableSelected,
  removingItems,
  onSelectAll,
  onClear,
  onRemove,
  onToggleSelectionMode,
}: {
  visible: boolean;
  selectionMode: boolean;
  activeSelectedCount: number;
  selectableCount: number;
  allSelectableSelected: boolean;
  removingItems: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onRemove: () => void;
  onToggleSelectionMode: () => void;
}) {
  if (!visible) {
    return null;
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
      {selectionMode && (
        <>
          <span className="inline-flex min-h-[var(--ui-chip-min-height)] items-center rounded-full border border-black/8 bg-black/[0.03] px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-medium leading-none text-gray-500 dark:border-white/8 dark:bg-white/[0.05] dark:text-white/45">
            {activeSelectedCount} selected
          </span>
          <button
            type="button"
            onClick={onSelectAll}
            disabled={selectableCount === 0 || allSelectableSelected}
            className="inline-flex min-h-[var(--ui-chip-min-height)] items-center rounded-full border border-black/8 bg-white/70 px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-gray-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/8 dark:text-white/75 dark:hover:bg-white/12"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={activeSelectedCount === 0}
            className="inline-flex min-h-[var(--ui-chip-min-height)] items-center rounded-full border border-black/8 bg-white/70 px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-gray-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/8 dark:text-white/75 dark:hover:bg-white/12"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={removingItems || activeSelectedCount === 0}
            className="inline-flex min-h-[var(--ui-chip-min-height)] items-center rounded-full border border-black/8 bg-white/70 px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-semibold leading-none text-gray-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/8 dark:text-white/75 dark:hover:bg-white/12"
          >
            Remove
          </button>
        </>
      )}

      <button
        type="button"
        onClick={onToggleSelectionMode}
        className={selectionToggleTextClass(selectionMode)}
      >
        {selectionMode ? "Done" : "Select"}
      </button>
    </div>
  );
}

function CollectionSealedTile({
  item,
  index,
  imageSizes,
  cardSize,
  selectionMode,
  isSelected,
  removingItems,
  onActivate,
  onRemove,
}: {
  item: CollectionSealedViewItem;
  index: number;
  imageSizes: string;
  cardSize: CardSize;
  selectionMode: boolean;
  isSelected: boolean;
  removingItems: boolean;
  onActivate: (item: CollectionSealedViewItem) => void;
  onRemove: (event: MouseEvent<HTMLButtonElement>, item: CollectionSealedViewItem) => void;
}) {
  const currentTotal = getCollectionSealedCurrentTotal(item);
  const paidTotal = getCollectionSealedPaidTotal(item);
  const pnl = getCollectionSealedPnl(item);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate(item);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selectionMode ? isSelected : undefined}
      onClick={() => onActivate(item)}
      onKeyDown={handleKeyDown}
      className={sealedTileRootClass()}
    >
      <div className={sealedTileImageClass(cardSize, isSelected)}>
        {item.image_url ? (
          <Image
            src={getCachedImageUrl(item.image_url) ?? item.image_url}
            alt={item.name}
            fill
            className={`object-contain ${sealedTileImagePaddingClass(cardSize)}`}
            sizes={imageSizes}
            loading={index < 16 ? "eager" : undefined}
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Package className="h-10 w-10 text-gray-300 dark:text-gray-600" />
          </div>
        )}

        {isSelected && <div className="pointer-events-none absolute inset-0 bg-blue-500/10" />}
      </div>

      <div className={sealedTileInfoClass(cardSize)}>
        <div className="grid gap-1.5 sm:flex sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0 flex-1">
            <p className={sealedTileTitleClass(cardSize)}>{item.name}</p>
            <div className={sealedTileMetaLineClass(cardSize)}>
              <Link
                href={`/expansions/${item.episode_id}?tab=sealed`}
                prefetch={false}
                onClick={(event) => event.stopPropagation()}
                className="min-w-0 truncate text-gray-400 transition-colors hover:text-gray-600 hover:underline underline-offset-2 dark:text-gray-500 dark:hover:text-gray-300"
              >
                {item.episode_name}
                {item.episode_code ? (
                  <span className="ml-1 opacity-60">({item.episode_code})</span>
                ) : null}
              </Link>
            </div>
          </div>

          <div className="flex min-w-0 items-center justify-between gap-1.5 sm:shrink sm:justify-end">
            {currentTotal != null ? (
              <span className={sealedTilePriceClass(cardSize)}>
                {formatCollectionCurrency(currentTotal)}
              </span>
            ) : (
              <span className={sealedTileNoPriceClass(cardSize)}>No price</span>
            )}

            {!selectionMode && (
              <>
                <button
                  type="button"
                  onClick={(event) => onRemove(event, item)}
                  disabled={removingItems}
                  className={sealedTileActionButtonClass()}
                  aria-label={`Remove ${item.name} from collection`}
                  title="Remove from collection"
                >
                  <Minus className={sealedTileActionIconClass()} />
                </button>

                <CollectionAddSealedButton
                  product={buildCollectionAddProduct(item)}
                  className={sealedTileActionButtonClass()}
                />
              </>
            )}
          </div>
        </div>

        {(currentTotal != null || paidTotal != null || pnl != null || item.quantity > 1) && (
          <div className={sealedTileBubbleWrapClass(cardSize)}>
            {currentTotal != null && (
              <span className={sealedTileBubbleClass("market")}>
                <span className={sealedTileBubbleLabelClass()}>CardMarket</span>
                <span className="tabular-nums">{formatCollectionCurrency(currentTotal)}</span>
              </span>
            )}
            {paidTotal != null && (
              <span className={sealedTileBubbleClass()}>
                <span className={sealedTileBubbleLabelClass()}>Paid</span>
                <span className="tabular-nums">{formatCollectionCurrency(paidTotal)}</span>
              </span>
            )}
            {pnl != null && (
              <span className={sealedTileBubbleClass(pnl >= 0 ? "positive" : "negative")}>
                <span className={sealedTileBubbleLabelClass()}>P&amp;L</span>
                <span className="tabular-nums">
                  {pnl >= 0 ? "+" : ""}
                  {formatCollectionCurrency(pnl)}
                </span>
              </span>
            )}
            {item.quantity > 1 && (
              <span className={sealedTileBubbleClass("quantity")}>
                <span className={sealedTileBubbleLabelClass()}>Qty</span>
                <span className="tabular-nums">x{item.quantity}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CollectionSealedGrid({
  items,
  imageSizes,
  gridTemplateColumns,
  cardSize,
  isMobileViewport,
  selectionMode,
  selectedIdSet,
  removingItems,
  onActivate,
  onRemove,
}: {
  items: CollectionSealedViewItem[];
  imageSizes: string;
  gridTemplateColumns: string;
  cardSize: CardSize;
  isMobileViewport: boolean;
  selectionMode: boolean;
  selectedIdSet: Set<string>;
  removingItems: boolean;
  onActivate: (item: CollectionSealedViewItem) => void;
  onRemove: (event: MouseEvent<HTMLButtonElement>, item: CollectionSealedViewItem) => void;
}) {
  return (
    <div
      className={`grid ${sealedTileGridGapClass(cardSize)}`}
      style={{
        gridTemplateColumns,
        justifyContent: isMobileViewport ? "stretch" : "start",
      }}
    >
      {items.map((item, index) => (
        <CollectionSealedTile
          key={item.id}
          item={item}
          index={index}
          imageSizes={imageSizes}
          cardSize={cardSize}
          selectionMode={selectionMode}
          isSelected={selectionMode && selectedIdSet.has(item.id)}
          removingItems={removingItems}
          onActivate={onActivate}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

export function CollectionSealedRemoveDialog({
  removeDialog,
  removingItems,
  removeError,
  onConfirm,
  onClose,
}: {
  removeDialog: RemoveDialogState | null;
  removingItems: boolean;
  removeError: string | null;
  onConfirm: (itemIds: string[]) => void;
  onClose: () => void;
}) {
  if (!removeDialog) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[73] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)" }}
      onClick={() => {
        if (!removingItems) {
          onClose();
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
          This removes the saved sealed entry entirely, including its quantity.
        </div>

        {removeError && <p className="mt-4 text-sm text-rose-300">{removeError}</p>}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => onConfirm(removeDialog.itemIds)}
            disabled={removingItems}
            className="flex-1 rounded-2xl bg-rose-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {removingItems
              ? "Removing..."
              : removeDialog.itemIds.length > 1
                ? "Remove products"
                : "Remove product"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={removingItems}
            className="rounded-2xl bg-white/8 px-4 py-3 font-semibold text-white/72 transition-colors hover:bg-white/12 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
