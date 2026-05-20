"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { COLLECTION_BINDER_ICONS } from "@/lib/collection";
import BinderAccentColorPicker from "@/components/BinderAccentColorPicker";
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
  const [linkToSuggestedEpisode, setLinkToSuggestedEpisode] = useState(false);
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
    setLinkToSuggestedEpisode(false);
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

    const shouldLinkSet = Boolean(
      suggestedEpisode && looksLikeSuggestedEpisode && linkToSuggestedEpisode
    );

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/collection/binders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: shouldLinkSet ? "linked_set" : "custom",
          name: query,
          episodeId: shouldLinkSet ? suggestedEpisode?.id : null,
          linkedQuery: shouldLinkSet ? query : null,
          confirmLinkedSet: shouldLinkSet,
          accentColor,
          iconName: shouldLinkSet ? null : iconName,
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
    <div className="rounded-2xl border border-dashed border-white/10 bg-black/18 p-3 max-[640px]:rounded-xl max-[640px]:p-2.5">
      <div className="flex items-center justify-between gap-2 max-[640px]:gap-1.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white max-[640px]:text-[12px]">New binder</p>
          <p className="truncate text-xs text-white/42 max-[640px]:text-[10px]">
            Create one without leaving this card.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm font-semibold text-white transition-colors hover:border-white/18 hover:bg-white/12 max-[640px]:gap-1.5 max-[640px]:px-2.5 max-[640px]:py-1.5 max-[640px]:text-[12px]"
        >
          <Plus className="h-4 w-4 max-[640px]:h-3.5 max-[640px]:w-3.5" />
          {open ? "Hide" : "New binder"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3 max-[640px]:mt-2.5 max-[640px]:space-y-2.5">
          <label className="block space-y-1.5 text-sm max-[640px]:text-[12px]">
            <span className="text-white/60">Set name or binder name</span>
            <input
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setLinkToSuggestedEpisode(false);
              }}
              className="w-full rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition-colors focus:border-white/18 max-[640px]:rounded-xl max-[640px]:px-2.5 max-[640px]:py-2 max-[640px]:text-[13px]"
              placeholder={suggestedEpisode?.name ?? "Type a set or custom binder name"}
            />
          </label>

          <div
            className={`rounded-2xl px-3 py-2 text-xs max-[640px]:rounded-xl max-[640px]:px-2.5 max-[640px]:py-2 max-[640px]:text-[10px] ${
              looksLikeSuggestedEpisode
                ? "border border-blue-300/35 bg-blue-500/[0.12] text-blue-50 shadow-[0_0_0_1px_rgba(96,165,250,0.12),0_10px_30px_rgba(37,99,235,0.18)]"
                : "border border-white/10 bg-white/[0.04] text-white/55"
            }`}
          >
            {looksLikeSuggestedEpisode ? (
              <label className="flex gap-2.5">
                <input
                  type="checkbox"
                  checked={linkToSuggestedEpisode}
                  onChange={(event) => setLinkToSuggestedEpisode(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500"
                />
                <span className="min-w-0">
                  <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-blue-100/72">
                    Matched set link
                  </span>
                  <span>
                    Link as set binder for {suggestedEpisode?.name}
                    {suggestedEpisode?.code ? ` (${suggestedEpisode.code})` : ""}. Leave unchecked for a custom binder.
                  </span>
                </span>
              </label>
            ) : (
              "This will create a custom binder. Set binders are only linked when you confirm the set."
            )}
          </div>

          <div className="grid gap-3 max-[640px]:gap-2.5 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm max-[640px]:text-[12px]">
              <span className="text-white/60">Overall spend</span>
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

            <label className="space-y-1.5 text-sm max-[640px]:text-[12px]">
              <span className="text-white/60">Notes</span>
              <input
                type="text"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition-colors focus:border-white/18 max-[640px]:rounded-xl max-[640px]:px-2.5 max-[640px]:py-2 max-[640px]:text-[13px]"
                placeholder="Optional notes"
              />
            </label>
          </div>

          <div className="grid gap-3 max-[640px]:gap-2.5 sm:grid-cols-[auto_1fr] sm:items-start">
            {(!looksLikeSuggestedEpisode || !linkToSuggestedEpisode) && (
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
                        className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-colors max-[640px]:h-8 max-[640px]:w-8 ${
                          active
                            ? "border-white bg-white text-gray-900"
                            : "border-white/10 bg-white/8 text-white hover:border-white/18 hover:bg-white/12"
                        }`}
                      >
                        <CollectionBinderIcon iconName={option} className="h-4 w-4 max-[640px]:h-3.5 max-[640px]:w-3.5" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1.5 text-sm max-[640px]:text-[12px]">
              <span className="text-white/60">Accent color</span>
              <BinderAccentColorPicker
                value={accentColor}
                onChange={setAccentColor}
                compact
              />
            </div>
          </div>

          {error && <p className="text-sm text-rose-300">{error}</p>}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={saving}
              className="rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60 max-[640px]:rounded-xl max-[640px]:px-3 max-[640px]:py-2 max-[640px]:text-[12px]"
            >
              {saving ? "Saving..." : "Create binder"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
