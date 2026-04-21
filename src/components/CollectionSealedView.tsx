"use client";

import { type ReactNode, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Package } from "lucide-react";
import SealedProductModal, {
  type SealedModalProductData,
} from "@/components/SealedProductModal";
import CollectionAddSealedButton from "@/components/CollectionAddSealedButton";
import { formatCollectionCurrency } from "@/lib/collection";
import { useSettings } from "@/components/SettingsProvider";

export interface CollectionSealedViewItem {
  id: string;
  product_id: string;
  name: string;
  image_url: string | null;
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  cardmarket_url: string | null;
  quantity: number;
  purchase_price_per_item: number | null;
  current_value_per_item: number | null;
}

interface Props {
  items: CollectionSealedViewItem[];
  emptyTitle: string;
  emptyText: string;
  sectionTitle?: string;
  sectionCount?: ReactNode;
  sectionTrailing?: ReactNode;
}

interface RemoveDialogState {
  itemIds: string[];
  title: string;
  description: string;
}

const tileMinWidth = {
  small: { normal: "150px", wide: "190px" },
  medium: { normal: "220px", wide: "280px" },
  large: { normal: "280px", wide: "340px" },
} as const;

function selectionToggleTextClass(active: boolean): string {
  if (active) {
    return "shrink-0 text-xs font-semibold text-blue-600 transition-colors hover:text-blue-500 dark:text-blue-300 dark:hover:text-blue-200";
  }

  return "shrink-0 text-xs font-medium text-gray-400 transition-colors hover:text-gray-900 dark:text-white/45 dark:hover:text-white/75";
}

function buildModalProduct(item: CollectionSealedViewItem): SealedModalProductData {
  return {
    id: item.product_id,
    name: item.name,
    image_url: item.image_url,
    cardmarket_url: item.cardmarket_url,
    episode: {
      id: item.episode_id,
      name: item.episode_name,
      code: item.episode_code,
    },
    price: {
      cm_lowest: item.current_value_per_item,
      cm_lowest_eu: null,
      cm_lowest_de: null,
      cm_lowest_fr: null,
      cm_lowest_es: null,
      cm_lowest_it: null,
      cm_avg_7d: null,
      cm_avg_30d: null,
    },
  };
}

export default function CollectionSealedView({
  items,
  emptyTitle,
  emptyText,
  sectionTitle,
  sectionCount,
  sectionTrailing,
}: Props) {
  const router = useRouter();
  const { settings } = useSettings();
  const [selectedSealed, setSelectedSealed] = useState<SealedModalProductData | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [removingItems, setRemovingItems] = useState(false);
  const [removeDialog, setRemoveDialog] = useState<RemoveDialogState | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const selectableIds = useMemo(() => items.map((item) => item.id), [items]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const activeSelectedIds = useMemo(
    () => selectedIds.filter((id) => selectableIds.includes(id)),
    [selectedIds, selectableIds]
  );
  const allSelectableSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIdSet.has(id));
  const showInlineSelectionButton = Boolean(sectionTitle) && !selectionMode && items.length > 0;

  function openProduct(item: CollectionSealedViewItem) {
    setSelectedSealed(buildModalProduct(item));
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
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

  if (items.length === 0) {
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
          </div>
        )}
        <div className="glass rounded-3xl p-12 text-center shadow-md shadow-black/5">
          <p className="mb-1 font-medium text-gray-700 dark:text-gray-300">{emptyTitle}</p>
          <p className="text-sm text-gray-400">{emptyText}</p>
        </div>
      </>
    );
  }

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

      {(selectionMode || !sectionTitle) && (
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
          {selectionMode && (
            <>
              <span className="rounded-full border border-black/8 bg-black/[0.03] px-3 py-1 text-xs font-medium text-gray-500 dark:border-white/8 dark:bg-white/[0.05] dark:text-white/45">
                {activeSelectedIds.length} selected
              </span>
              <button
                type="button"
                onClick={() => setSelectedIds(selectableIds)}
                disabled={selectableIds.length === 0 || allSelectableSelected}
                className="rounded-full border border-black/8 bg-white/70 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/8 dark:text-white/75 dark:hover:bg-white/12"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                disabled={activeSelectedIds.length === 0}
                className="rounded-full border border-black/8 bg-white/70 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/8 dark:text-white/75 dark:hover:bg-white/12"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleBulkRemove}
                disabled={removingItems || activeSelectedIds.length === 0}
                className="rounded-full border border-black/8 bg-white/70 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/8 dark:text-white/75 dark:hover:bg-white/12"
              >
                Remove
              </button>
            </>
          )}

          <button
            type="button"
            onClick={toggleSelectionMode}
            className={selectionToggleTextClass(selectionMode)}
          >
            {selectionMode ? "Done" : "Select"}
          </button>
        </div>
      )}

      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${
            tileMinWidth[settings.cardSize][settings.widescreen ? "wide" : "normal"]
          }, 1fr))`,
        }}
      >
        {items.map((item, index) => {
          const isSelected = selectionMode && selectedIdSet.has(item.id);
          const currentTotal =
            item.current_value_per_item != null
              ? Number((item.current_value_per_item * item.quantity).toFixed(2))
              : null;
          const paidTotal =
            item.purchase_price_per_item != null
              ? Number((item.purchase_price_per_item * item.quantity).toFixed(2))
              : null;
          const pnl =
            currentTotal != null && paidTotal != null
              ? Number((currentTotal - paidTotal).toFixed(2))
              : null;

          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              aria-pressed={selectionMode ? isSelected : undefined}
              onClick={() => handleTileActivate(item)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleTileActivate(item);
                }
              }}
              className="group flex cursor-pointer flex-col gap-1.5 text-left outline-none"
            >
              <div
                className={`relative aspect-[1.08/1] overflow-hidden rounded-2xl border bg-black/4 shadow-lg shadow-black/20 transition-all duration-200 dark:bg-white/4 ${
                  isSelected
                    ? "border-blue-400/80 shadow-blue-500/25 ring-2 ring-blue-400/80"
                    : "border-transparent group-hover:scale-[1.02] group-hover:shadow-xl group-hover:shadow-black/30"
                }`}
              >
                {item.image_url ? (
                  <Image
                    src={item.image_url}
                    alt={item.name}
                    fill
                    className="object-contain p-4"
                    sizes="280px"
                    loading={index < 16 ? "eager" : undefined}
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Package className="h-10 w-10 text-gray-300 dark:text-gray-600" />
                  </div>
                )}

                {isSelected && <div className="pointer-events-none absolute inset-0 bg-blue-500/10" />}

                {item.quantity > 1 && (
                  <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/80 backdrop-blur">
                    x{item.quantity}
                  </span>
                )}
              </div>

              <div className="mt-2 px-0.5">
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-gray-900 dark:text-white">
                      {item.name}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium">
                      <Link
                        href={`/expansions/${item.episode_id}?tab=sealed`}
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

                  <div className="flex shrink-0 items-center gap-1.5">
                    {currentTotal != null ? (
                      <span className="text-[15px] font-semibold tabular-nums text-gray-900 dark:text-white">
                        {formatCollectionCurrency(currentTotal)}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">No price</span>
                    )}

                    {!selectionMode && (
                      <>
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

                        <CollectionAddSealedButton
                          product={{
                            id: item.product_id,
                            name: item.name,
                            image_url: item.image_url,
                            episode: {
                              id: item.episode_id,
                              name: item.episode_name,
                              code: item.episode_code,
                            },
                          }}
                          className="h-[22px] w-[22px] shrink-0 rounded-md border-black/8 bg-black/5 text-gray-900 hover:border-black/15 hover:bg-black/8 dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:bg-white/12"
                        />
                      </>
                    )}
                  </div>
                </div>

                {(paidTotal != null || pnl != null) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                    {paidTotal != null && (
                      <span className="rounded-full bg-black/5 px-2 py-1 text-gray-500 dark:bg-white/8 dark:text-white/55">
                        Paid {formatCollectionCurrency(paidTotal)}
                      </span>
                    )}
                    {pnl != null && (
                      <span
                        className={`rounded-full px-2 py-1 ${
                          pnl >= 0
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                            : "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                        }`}
                      >
                        {pnl >= 0 ? "+" : ""}
                        {formatCollectionCurrency(pnl)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

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
              This removes the saved sealed entry entirely, including its quantity.
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
                    ? "Remove products"
                    : "Remove product"}
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

      {selectedSealed && (
        <SealedProductModal product={selectedSealed} onClose={() => setSelectedSealed(null)} />
      )}
    </>
  );
}
