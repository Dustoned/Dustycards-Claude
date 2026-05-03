"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

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
      ? "border-white/12 bg-white/8 text-white hover:border-white/20 hover:bg-white/12"
      : "border-black/8 bg-white/80 text-gray-900 hover:border-black/15 hover:bg-white";

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
              ? "h-[calc(var(--ui-chip-font-size)+0.25rem)] w-[calc(var(--ui-chip-font-size)+0.25rem)]"
              : "h-4 w-4"
          }
        />
        {mode === "button" && <span>{flashAdded ? "Added" : label}</span>}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)" }}
          onClick={(event) => {
            event.stopPropagation();
            setOpen(false);
          }}
        >
          <div
            className="glass w-full max-w-lg rounded-3xl border border-white/12 bg-[#0d0d10]/90 p-6 text-white shadow-2xl shadow-black/45"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">
                Add Sealed
              </p>
              <h2 className="mt-2 text-2xl font-bold leading-tight">{product.name}</h2>
              {product.episode && (
                <p className="mt-1 text-sm text-white/48">
                  {product.episode.name}
                  {product.episode.code ? ` (${product.episode.code})` : ""}
                </p>
              )}
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
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
                    className="w-full rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition-colors focus:border-white/18"
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
                    className="w-full rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition-colors focus:border-white/18"
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
                  className="w-full rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition-colors focus:border-white/18"
                  placeholder="sealed, booster box, display"
                />
              </label>

              <label className="block space-y-1.5 text-sm">
                <span className="text-white/60">Notes</span>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition-colors focus:border-white/18"
                  placeholder="Optional notes"
                />
              </label>

              {saveError && <p className="text-sm text-rose-300">{saveError}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save to collection"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-2xl bg-white/8 px-4 py-3 font-semibold text-white/72 transition-colors hover:bg-white/12 hover:text-white"
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
