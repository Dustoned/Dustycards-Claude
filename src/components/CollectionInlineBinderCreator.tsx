"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  COLLECTION_BINDER_COLORS,
  COLLECTION_BINDER_ICONS,
} from "@/lib/collection";
import CollectionBinderIcon from "@/components/CollectionBinderIcon";

export interface InlineBinderOption {
  id: string;
  name: string;
  type: string;
  episode_id: string | null;
  accent_color?: string | null;
  icon_name?: string | null;
  base_purchase_price?: number | null;
  episode?: {
    id: string;
    name: string;
    code: string | null;
    logo_url?: string | null;
  } | null;
}

interface EpisodeHint {
  id: string;
  name: string;
  code: string | null;
}

interface Props {
  suggestedEpisode?: EpisodeHint | null;
  onCreated: (binder: InlineBinderOption) => void;
}

export default function CollectionInlineBinderCreator({
  suggestedEpisode = null,
  onCreated,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [accentColor, setAccentColor] = useState<string | null>(null);
  const [iconName, setIconName] = useState<(typeof COLLECTION_BINDER_ICONS)[number]>(
    COLLECTION_BINDER_ICONS[0]
  );
  const [basePurchasePrice, setBasePurchasePrice] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const looksLikeSuggestedEpisode = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!suggestedEpisode || !normalized) return false;

    return (
      normalized === suggestedEpisode.name.toLowerCase() ||
      normalized === suggestedEpisode.code?.toLowerCase()
    );
  }, [query, suggestedEpisode]);

  function handleOpen() {
    setOpen((prev) => {
      const next = !prev;
      if (next && !query && suggestedEpisode) {
        setQuery(suggestedEpisode.name);
      }
      return next;
    });
    setError(null);
  }

  async function handleCreate() {
    if (!query.trim()) {
      setError("Type a set name or binder name first");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/collection/binders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "auto",
          name: query,
          linkedQuery: query,
          accentColor,
          iconName,
          basePurchasePrice: basePurchasePrice || null,
          notes: notes || null,
        }),
      });

      const data = (await response.json()) as { error?: string; binder?: InlineBinderOption };
      if (!response.ok || !data.binder) {
        throw new Error(data.error ?? "Binder opslaan mislukt");
      }

      onCreated(data.binder);
      setOpen(false);
      setError(null);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Binder opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">Need a new binder?</p>
          <p className="text-xs text-white/45">
            Type a set name for an automatic set binder, or any other name for a custom binder.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm font-semibold text-white transition-colors hover:border-white/18 hover:bg-white/12"
        >
          <Plus className="h-4 w-4" />
          {open ? "Hide" : "Add new binder"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <label className="block space-y-1.5 text-sm">
            <span className="text-white/60">Set name or binder name</span>
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition-colors focus:border-white/18"
              placeholder={suggestedEpisode?.name ?? "Type a set or custom binder name"}
            />
          </label>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/55">
            {looksLikeSuggestedEpisode
              ? `This will create a set binder for ${suggestedEpisode?.name}${suggestedEpisode?.code ? ` (${suggestedEpisode.code})` : ""}.`
              : "If this matches an expansion, the binder gets the full set layout automatically. Otherwise it becomes a custom binder."}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="text-white/60">Binder base cost</span>
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

            <label className="space-y-1.5 text-sm">
              <span className="text-white/60">Notes</span>
              <input
                type="text"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition-colors focus:border-white/18"
                placeholder="Optional notes"
              />
            </label>
          </div>

          {!looksLikeSuggestedEpisode && (
            <>
              <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-start">
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
                          className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
                            active
                              ? "border-white bg-white text-gray-900"
                              : "border-white/10 bg-white/8 text-white hover:border-white/18 hover:bg-white/12"
                          }`}
                        >
                          <CollectionBinderIcon iconName={option} className="h-4 w-4" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5 text-sm">
                  <span className="text-white/60">Accent color</span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setAccentColor(null)}
                      className={`relative inline-flex h-8 w-8 items-center justify-center rounded-full border-2 bg-white/[0.06] transition-all ${
                        accentColor == null
                          ? "scale-110 border-white"
                          : "border-white/14 hover:border-white/26"
                      }`}
                      aria-label="No accent color"
                      title="No accent color"
                    >
                      <span className="absolute inset-[6px] rounded-full border border-white/25" />
                      <span className="absolute h-px w-4 rotate-45 rounded-full bg-white/70" />
                    </button>
                    {COLLECTION_BINDER_COLORS.map((option) => {
                      const active = option === accentColor;
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setAccentColor(option)}
                          className={`h-8 w-8 rounded-full border-2 transition-transform ${
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
            </>
          )}

          {error && <p className="text-sm text-rose-300">{error}</p>}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={saving}
              className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Create binder"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
