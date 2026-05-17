"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Pencil, Trash2, X } from "lucide-react";
import { COLLECTION_BINDER_ICONS } from "@/lib/collection";
import BinderAccentColorPicker from "@/components/BinderAccentColorPicker";
import CollectionBinderIcon from "@/components/CollectionBinderIcon";
import {
  modalActionRowClass,
  modalBodyClass,
  modalBottomSheetOverlayClass,
  modalBottomSheetPanelClass,
  modalCloseButtonClass,
  modalHeaderClass,
  modalInputClass,
  modalPrimaryButtonClass,
  modalSecondaryButtonClass,
} from "@/components/modal-glass-styles";
import useBodyScrollLock from "@/lib/useBodyScrollLock";

interface BinderRef {
  id: string;
  name: string;
  type: string;
  accent_color: string | null;
  icon_name: string | null;
  base_purchase_price: number | null;
  episode: {
    name: string;
    code: string | null;
    logo_url: string | null;
  } | null;
}

export default function EditBinderButton({ binder }: { binder: BinderRef }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(binder.name);
  const [accentColor, setAccentColor] = useState<string | null>(binder.accent_color);
  const [iconName, setIconName] = useState(binder.icon_name ?? COLLECTION_BINDER_ICONS[0]);
  const [basePurchasePrice, setBasePurchasePrice] = useState(
    binder.base_purchase_price != null ? String(binder.base_purchase_price) : ""
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useBodyScrollLock(open);

  function openModal() {
    setName(binder.name);
    setAccentColor(binder.accent_color);
    setIconName(binder.icon_name ?? COLLECTION_BINDER_ICONS[0]);
    setBasePurchasePrice(
      binder.base_purchase_price != null ? String(binder.base_purchase_price) : ""
    );
    setError(null);
    setConfirmingDelete(false);
    setOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/collection/binders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: binder.id,
          name,
          accentColor,
          iconName,
          basePurchasePrice: basePurchasePrice || null,
        }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Binder opslaan mislukt");
      }

      setOpen(false);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Binder opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmingDelete) {
      setError(null);
      setConfirmingDelete(true);
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const response = await fetch("/api/collection/binders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: binder.id }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Binder verwijderen mislukt");
      }

      setOpen(false);
      if (pathname === `/binders/${binder.id}`) {
        router.push("/?tab=binders");
      } else {
        router.refresh();
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Binder verwijderen mislukt");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-2 rounded-2xl border border-black/8 bg-white/80 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-black/15 hover:bg-white max-[640px]:gap-1.5 max-[640px]:px-3 max-[640px]:py-1.5 max-[640px]:text-[12px] dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/12"
      >
        <Pencil className="h-4 w-4" />
        Edit Binder
      </button>

      {open && (
        <div
          className={`${modalBottomSheetOverlayClass} z-[90]`}
          onClick={() => setOpen(false)}
        >
          <div
            className={`${modalBottomSheetPanelClass} max-w-2xl`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={modalHeaderClass}>
              <div className="min-w-0 flex-1">
                <div className="mx-auto mb-3 hidden h-1 w-12 rounded-full bg-white/18 max-[640px]:block" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38 max-[640px]:text-[9px]">
                  Edit Binder
                </p>
                <h2 className="mt-1.5 text-2xl font-bold leading-tight max-[640px]:text-[18px]">
                  Update binder details
                </h2>
                <p className="mt-1 text-sm text-white/50 max-[640px]:text-[12px]">
                  {binder.type === "linked_set" && binder.episode
                    ? `Linked to ${binder.episode.name}${binder.episode.code ? ` (${binder.episode.code})` : ""}.`
                    : "Change the binder name, color and purchase price."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={modalCloseButtonClass}
                aria-label="Close edit binder"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              className={modalBodyClass}
              onSubmit={handleSubmit}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm max-[640px]:text-[12px] sm:col-span-2">
                  <span className="text-white/60">Binder name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className={modalInputClass}
                    placeholder="Binder name"
                  />
                </label>

                <label className="space-y-1.5 text-sm max-[640px]:text-[12px]">
                  <span className="text-white/60">Binder spend</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={basePurchasePrice}
                    onChange={(event) => setBasePurchasePrice(event.target.value)}
                    className={modalInputClass}
                    placeholder="0.00"
                  />
                </label>

                {binder.type === "custom" ? (
                  <div className="space-y-1.5 text-sm max-[640px]:text-[12px]">
                    <span className="text-white/60">Icon</span>
                    <div className="flex flex-wrap gap-2 max-[640px]:gap-1.5">
                      {COLLECTION_BINDER_ICONS.map((option) => {
                        const active = option === iconName;
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setIconName(option)}
                            className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition-colors max-[640px]:h-9 max-[640px]:w-9 max-[640px]:rounded-xl ${
                              active
                                ? "border-white bg-white text-gray-900"
                                : "border-white/10 bg-white/8 text-white hover:border-white/18 hover:bg-white/10"
                            }`}
                          >
                            <CollectionBinderIcon iconName={option} className="h-5 w-5 max-[640px]:h-4 max-[640px]:w-4" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5 text-sm max-[640px]:text-[12px]">
                    <span className="text-white/60">Linked set</span>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white/70 max-[640px]:rounded-xl max-[640px]:px-2.5 max-[640px]:py-2 max-[640px]:text-[13px]">
                      {binder.episode?.name ?? "Set binder"}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 text-sm max-[640px]:text-[12px] sm:col-span-2">
                  <span className="text-white/60">Accent color</span>
                  <BinderAccentColorPicker value={accentColor} onChange={setAccentColor} />
                </div>
              </div>

              {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

              <div className="mt-5 rounded-2xl border border-rose-400/18 bg-rose-500/8 p-4 max-[640px]:mt-3 max-[640px]:rounded-xl max-[640px]:p-3">
                <div className="flex items-start gap-3 max-[640px]:gap-2.5">
                  <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-rose-200" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-rose-100 max-[640px]:text-[13px]">
                      Delete binder
                    </p>
                    <p className="mt-1 text-xs leading-5 text-rose-100/58 max-[640px]:text-[11px]">
                      Cards stay in your collection and move back to loose singles.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={saving || deleting}
                    className={`shrink-0 rounded-2xl px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 max-[640px]:rounded-xl ${
                      confirmingDelete
                        ? "bg-rose-500 text-white hover:bg-rose-400"
                        : "bg-white/8 text-rose-100 hover:bg-rose-500/18"
                    }`}
                  >
                    {deleting ? "Deleting..." : confirmingDelete ? "Confirm delete" : "Delete"}
                  </button>
                </div>
              </div>

              <div className={modalActionRowClass}>
                <button
                  type="submit"
                  disabled={saving || deleting}
                  className={modalPrimaryButtonClass}
                >
                  {saving ? "Saving..." : "Save binder"}
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
