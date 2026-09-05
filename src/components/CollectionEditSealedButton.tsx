"use client";

import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { useRef, useState } from "react";
import {
  modalActionRowClass,
  modalBodyClass,
  modalCenteredMobileOverlayClass,
  modalCenteredPanelClass,
  modalCloseButtonClass,
  modalCompactHeaderClass,
  modalInputClass,
  modalPrimaryButtonClass,
  modalSecondaryButtonClass,
} from "@/components/modal-glass-styles";
import useModalA11y from "@/lib/useModalA11y";
import useBodyScrollLock from "@/lib/useBodyScrollLock";

interface CollectionSealedRef {
  id: string;
  name: string;
  image_url: string | null;
  episode?: {
    id: string;
    name: string;
    code: string | null;
  } | null;
}

interface CollectionSealedItemRef {
  id: string;
  quantity: number;
  purchase_price_per_item: number | null;
  notes: string | null;
  tags: string[];
}

interface Props {
  product: CollectionSealedRef;
  item: CollectionSealedItemRef;
  mode?: "icon" | "button";
  theme?: "light" | "dark";
  label?: string;
  className?: string;
  stopPropagation?: boolean;
  onSaved?: () => void | Promise<void>;
}

function buttonClasses(mode: "icon" | "button", theme: "light" | "dark", className?: string) {
  const base =
    mode === "icon"
      ? "inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-all"
      : "inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition-all";
  const palette =
    theme === "dark"
      ? "border-white/12 bg-white/8 text-white hover:border-white/20 hover:bg-white/12"
      : "border-white/12 bg-white/8 text-white hover:border-white/20 hover:bg-white/12";

  return [base, palette, className].filter(Boolean).join(" ");
}

export default function CollectionEditSealedButton({
  product,
  item,
  mode = "icon",
  theme = "light",
  label = "Edit sealed copy",
  className,
  stopPropagation = true,
  onSaved,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [purchasePricePerItem, setPurchasePricePerItem] = useState(
    item.purchase_price_per_item != null ? String(item.purchase_price_per_item) : ""
  );
  const [tags, setTags] = useState(item.tags.join(", "));
  const [notes, setNotes] = useState(item.notes ?? "");

  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y({ dialogRef, enabled: open, initialFocus: "dialog", onClose: () => setOpen(false) });
  useBodyScrollLock(open);

  function openModal(event: React.MouseEvent<HTMLButtonElement>) {
    if (stopPropagation) event.stopPropagation();
    setQuantity(String(item.quantity));
    setPurchasePricePerItem(
      item.purchase_price_per_item != null ? String(item.purchase_price_per_item) : ""
    );
    setTags(item.tags.join(", "));
    setNotes(item.notes ?? "");
    setSaveError(null);
    setOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(`/api/collection/sealed/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity,
          purchasePricePerItem: purchasePricePerItem || null,
          tags,
          notes,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not update this sealed copy");
      }

      setOpen(false);
      await onSaved?.();
      router.refresh();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not update this sealed copy"
      );
    } finally {
      setSaving(false);
    }
  }

  const editModal =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            className={`${modalCenteredMobileOverlayClass} z-[360]`}
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
            }}
          >
            <div
              ref={dialogRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label={`Edit ${product.name} in collection`}
              className={`${modalCenteredPanelClass} max-w-lg`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={modalCompactHeaderClass}>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/38 max-[640px]:text-[9px]">
                    Edit saved copy
                  </p>
                  <h2 className="mt-1.5 line-clamp-2 text-2xl font-bold leading-tight max-[640px]:text-[18px]">
                    {product.name}
                  </h2>
                  {product.episode ? (
                    <p className="mt-1 truncate text-sm text-white/48 max-[640px]:text-[12px]">
                      {product.episode.name}
                      {product.episode.code ? ` (${product.episode.code})` : ""}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className={modalCloseButtonClass}
                  aria-label="Close edit sealed copy"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form className={`${modalBodyClass} space-y-4`} onSubmit={handleSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm">
                    <span className="text-white/60">Quantity</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                      className={modalInputClass}
                    />
                  </label>

                  <label className="space-y-1.5 text-sm">
                    <span className="text-white/60">Price per item</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={purchasePricePerItem}
                      onChange={(event) => setPurchasePricePerItem(event.target.value)}
                      className={modalInputClass}
                      placeholder="0.00"
                    />
                  </label>
                </div>

                <label className="block space-y-1.5 text-sm">
                  <span className="text-white/60">Tags</span>
                  <input
                    type="text"
                    value={tags}
                    onChange={(event) => setTags(event.target.value)}
                    className={modalInputClass}
                    placeholder="sealed, booster box, display"
                  />
                </label>

                <label className="block space-y-1.5 text-sm">
                  <span className="text-white/60">Notes</span>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className={`${modalInputClass} resize-none`}
                    placeholder="Optional notes"
                  />
                </label>

                {saveError ? <p className="text-sm text-rose-300">{saveError}</p> : null}

                <div className={modalActionRowClass}>
                  <button type="submit" disabled={saving} className={modalPrimaryButtonClass}>
                    {saving ? "Saving..." : "Save changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className={modalSecondaryButtonClass}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={buttonClasses(mode, theme, className)}
        aria-label={`Edit saved copy of ${product.name}`}
      >
        <Pencil className="h-4 w-4" />
        {mode === "button" ? <span>{label}</span> : null}
      </button>
      {editModal}
    </>
  );
}
