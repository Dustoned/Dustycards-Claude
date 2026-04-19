"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  COLLECTION_BINDER_COLORS,
  COLLECTION_BINDER_ICONS,
} from "@/lib/collection";
import CollectionBinderIcon from "@/components/CollectionBinderIcon";

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
        className="inline-flex items-center gap-2 rounded-2xl border border-black/8 bg-white/80 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-black/15 hover:bg-white dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/12"
      >
        <Pencil className="h-4 w-4" />
        Edit Binder
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="glass w-full max-w-2xl rounded-3xl border border-white/12 bg-[#0d0d10]/90 p-6 text-white shadow-2xl shadow-black/45"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">
                Edit Binder
              </p>
              <h2 className="mt-2 text-2xl font-bold">Update binder details</h2>
              <p className="mt-2 text-sm text-white/50">
                {binder.type === "linked_set" && binder.episode
                  ? `Still linked to ${binder.episode.name}${binder.episode.code ? ` (${binder.episode.code})` : ""}.`
                  : "Change the binder name, color and purchase price."}
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm sm:col-span-2">
                  <span className="text-white/60">Binder name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition-colors focus:border-white/18"
                    placeholder="Binder name"
                  />
                </label>

                <label className="space-y-1.5 text-sm">
                  <span className="text-white/60">Binder paid</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={basePurchasePrice}
                    onChange={(event) => setBasePurchasePrice(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition-colors focus:border-white/18"
                    placeholder="0.00"
                  />
                </label>

                {binder.type === "custom" ? (
                  <div className="space-y-1.5 text-sm">
                    <span className="text-white/60">Icon</span>
                    <div className="flex flex-wrap gap-2">
                      {COLLECTION_BINDER_ICONS.map((option) => {
                        const active = option === iconName;
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setIconName(option)}
                            className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition-colors ${
                              active
                                ? "border-white bg-white text-gray-900"
                                : "border-white/10 bg-white/8 text-white hover:border-white/18 hover:bg-white/10"
                            }`}
                          >
                            <CollectionBinderIcon iconName={option} className="h-5 w-5" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5 text-sm">
                    <span className="text-white/60">Linked set</span>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white/70">
                      {binder.episode?.name ?? "Set binder"}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 text-sm sm:col-span-2">
                  <span className="text-white/60">Accent color</span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setAccentColor(null)}
                      className={`relative inline-flex h-9 w-9 items-center justify-center rounded-full border-2 bg-white/[0.06] transition-all ${
                        accentColor == null
                          ? "scale-110 border-white"
                          : "border-white/14 hover:border-white/26"
                      }`}
                      aria-label="No accent color"
                      title="No accent color"
                    >
                      <span className="absolute inset-[7px] rounded-full border border-white/25" />
                      <span className="absolute h-px w-5 rotate-45 rounded-full bg-white/70" />
                    </button>
                    {COLLECTION_BINDER_COLORS.map((option) => {
                      const active = option === accentColor;
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setAccentColor(option)}
                          className={`h-9 w-9 rounded-full border-2 transition-transform ${
                            active ? "scale-110 border-white" : "border-transparent"
                          }`}
                          style={{ backgroundColor: option }}
                          aria-label={`Choose ${option}`}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              {error && <p className="text-sm text-rose-300">{error}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save binder"}
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
