"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { COLLECTION_BINDER_ICONS } from "@/lib/collection";
import BinderAccentColorPicker from "@/components/BinderAccentColorPicker";
import CollectionBinderIcon from "@/components/CollectionBinderIcon";
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
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(binder.name);
  const [accentColor, setAccentColor] = useState<string | null>(binder.accent_color);
  const [iconName, setIconName] = useState(binder.icon_name ?? COLLECTION_BINDER_ICONS[0]);
  const [basePurchasePrice, setBasePurchasePrice] = useState(
    binder.base_purchase_price != null ? String(binder.base_purchase_price) : ""
  );
  const [saving, setSaving] = useState(false);
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
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 max-[640px]:items-end max-[640px]:p-0"
          style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="glass flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/12 bg-[#0d0d10]/92 text-white shadow-2xl shadow-black/45 max-[640px]:max-h-[calc(100dvh-0.75rem)] max-[640px]:rounded-b-none max-[640px]:rounded-t-[26px] max-[640px]:border-x-0 max-[640px]:border-b-0"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3 border-b border-white/10 px-6 py-5 max-[640px]:px-4 max-[640px]:py-3.5">
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
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/8 text-white/60 transition-colors hover:bg-white/12 hover:text-white max-[640px]:h-8 max-[640px]:w-8"
                aria-label="Close edit binder"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 py-5 max-[640px]:px-4 max-[640px]:py-2.5"
              onSubmit={handleSubmit}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm max-[640px]:text-[12px] sm:col-span-2">
                  <span className="text-white/60">Binder name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition-colors focus:border-white/18 max-[640px]:rounded-xl max-[640px]:px-2.5 max-[640px]:py-2 max-[640px]:text-[13px]"
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
                    className="w-full rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition-colors focus:border-white/18 max-[640px]:rounded-xl max-[640px]:px-2.5 max-[640px]:py-2 max-[640px]:text-[13px]"
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

              <div className="sticky bottom-0 -mx-6 -mb-5 mt-5 flex gap-3 border-t border-white/10 bg-[#0d0d10]/95 px-6 py-4 backdrop-blur-xl max-[640px]:-mx-4 max-[640px]:-mb-2.5 max-[640px]:mt-3 max-[640px]:gap-2 max-[640px]:px-4 max-[640px]:py-2.5">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 max-[640px]:rounded-xl max-[640px]:py-2.5 max-[640px]:text-[13px]"
                >
                  {saving ? "Saving..." : "Save binder"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-2xl bg-white/8 px-4 py-3 font-semibold text-white/72 transition-colors hover:bg-white/12 hover:text-white max-[640px]:rounded-xl max-[640px]:px-3 max-[640px]:py-2.5 max-[640px]:text-[13px]"
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
