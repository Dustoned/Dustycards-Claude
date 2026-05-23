"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
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

interface Props {
  product: CollectionSealedRef;
  mode?: "icon" | "button";
  theme?: "light" | "dark";
  label?: string;
  className?: string;
  stopPropagation?: boolean;
  onAdded?: () => void;
}

function buttonClasses(mode: "icon" | "button", theme: "light" | "dark", className?: string) {
  const base =
    mode === "icon"
      ? "inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-all"
      : "inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition-all";

  const palette =
    theme === "dark"
      ? "border-violet-300/28 bg-violet-600/24 text-violet-50 hover:border-violet-200/45 hover:bg-violet-500/34"
      : "border-violet-300/24 bg-violet-600/20 text-violet-50 hover:border-violet-200/40 hover:bg-violet-500/30";

  return [base, palette, className].filter(Boolean).join(" ");
}

export default function CollectionAddSealedButton({
  product,
  mode = "icon",
  theme = "light",
  label = "Add",
  className,
  stopPropagation = true,
  onAdded,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [flashAdded, setFlashAdded] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [purchasePricePerItem, setPurchasePricePerItem] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");

  useEffect(() => {
    if (!flashAdded) return;
    const timer = window.setTimeout(() => setFlashAdded(false), 1800);
    return () => window.clearTimeout(timer);
  }, [flashAdded]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/collection/sealed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          quantity,
          purchasePricePerItem: purchasePricePerItem || null,
          notes,
          tags,
        }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Save failed");
      }

      setOpen(false);
      setFlashAdded(true);
      router.refresh();
      onAdded?.();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function openModal(event: React.MouseEvent<HTMLButtonElement>) {
    if (stopPropagation) {
      event.stopPropagation();
    }
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={buttonClasses(mode, theme, className)}
        aria-label={`Add ${product.name} to collection`}
      >
        <Plus
          className={
            mode === "icon"
              ? "h-4 w-4 stroke-[2.25] max-[640px]:h-3.5 max-[640px]:w-3.5"
              : "h-4 w-4"
          }
        />
        {mode === "button" && <span>{flashAdded ? "Added" : label}</span>}
      </button>

      {open && (
        <div
          className={`${modalCenteredMobileOverlayClass} z-[360]`}
          onClick={(event) => {
            event.stopPropagation();
            setOpen(false);
          }}
        >
          <div
            className={`${modalCenteredPanelClass} max-w-lg`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={modalCompactHeaderClass}>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38 max-[640px]:text-[9px]">
                  Add Sealed
                </p>
                <h2 className="mt-1.5 line-clamp-2 text-2xl font-bold leading-tight max-[640px]:text-[18px]">
                  {product.name}
                </h2>
                {product.episode && (
                  <p className="mt-1 truncate text-sm text-white/48 max-[640px]:text-[12px]">
                    {product.episode.name}
                    {product.episode.code ? ` (${product.episode.code})` : ""}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={modalCloseButtonClass}
                aria-label="Close add sealed"
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

              {saveError && <p className="text-sm text-rose-300">{saveError}</p>}

              <div className={modalActionRowClass}>
                <button
                  type="submit"
                  disabled={saving}
                  className={modalPrimaryButtonClass}
                >
                  {saving ? "Saving..." : "Save to collection"}
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
        </div>
      )}
    </>
  );
}
