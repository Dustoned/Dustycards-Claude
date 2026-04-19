"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  COLLECTION_BINDER_COLORS,
  COLLECTION_BINDER_ICONS,
} from "@/lib/collection";
import CollectionBinderIcon from "@/components/CollectionBinderIcon";

interface EpisodeOption {
  id: string;
  name: string;
  code: string | null;
}

interface Props {
  episodes: EpisodeOption[];
}

export default function CreateBinderButton({ episodes }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"linked_set" | "custom">("linked_set");
  const [name, setName] = useState("");
  const [linkedQuery, setLinkedQuery] = useState("");
  const [accentColor, setAccentColor] = useState<(typeof COLLECTION_BINDER_COLORS)[number]>(
    COLLECTION_BINDER_COLORS[0]
  );
  const [iconName, setIconName] = useState<(typeof COLLECTION_BINDER_ICONS)[number]>(
    COLLECTION_BINDER_ICONS[0]
  );
  const [basePurchasePrice, setBasePurchasePrice] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matchedEpisode = useMemo(() => {
    const normalized = linkedQuery.trim().toLowerCase();
    if (!normalized) return null;

    return (
      episodes.find((episode) => episode.name.toLowerCase() === normalized) ??
      episodes.find((episode) => episode.code?.toLowerCase() === normalized) ??
      episodes.find((episode) => episode.name.toLowerCase().includes(normalized)) ??
      null
    );
  }, [episodes, linkedQuery]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/collection/binders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          name: name || null,
          episodeId: type === "linked_set" ? matchedEpisode?.id ?? null : null,
          linkedQuery: type === "linked_set" ? linkedQuery : null,
          accentColor: type === "custom" ? accentColor : null,
          iconName: type === "custom" ? iconName : null,
          basePurchasePrice: basePurchasePrice || null,
          notes: notes || null,
        }),
      });

      const data = (await response.json()) as { error?: string; binder?: { id: string } };
      if (!response.ok || !data.binder) {
        throw new Error(data.error ?? "Binder opslaan mislukt");
      }

      setOpen(false);
      router.refresh();
      router.push(`/binders/${data.binder.id}`);
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
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-2xl border border-black/8 bg-white/80 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-black/15 hover:bg-white dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/12"
      >
        <Plus className="h-4 w-4" />
        New Binder
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
                Create Binder
              </p>
              <h2 className="mt-2 text-2xl font-bold">New collection binder</h2>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="inline-flex rounded-2xl border border-white/10 bg-white/6 p-1">
                <button
                  type="button"
                  onClick={() => setType("linked_set")}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                    type === "linked_set" ? "bg-white text-gray-900" : "text-white/70 hover:text-white"
                  }`}
                >
                  Linked set
                </button>
                <button
                  type="button"
                  onClick={() => setType("custom")}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                    type === "custom" ? "bg-white text-gray-900" : "text-white/70 hover:text-white"
                  }`}
                >
                  Custom binder
                </button>
              </div>

              {type === "linked_set" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm sm:col-span-2">
                    <span className="text-white/60">Expansion</span>
                    <input
                      list="collection-expansion-options"
                      value={linkedQuery}
                      onChange={(event) => setLinkedQuery(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition-colors focus:border-white/18"
                      placeholder="Type a set name"
                    />
                    <datalist id="collection-expansion-options">
                      {episodes.map((episode) => (
                        <option
                          key={episode.id}
                          value={episode.name}
                        >{`${episode.name}${episode.code ? ` (${episode.code})` : ""}`}</option>
                      ))}
                    </datalist>
                    {matchedEpisode && (
                      <p className="text-xs text-emerald-300">
                        Linked to {matchedEpisode.name}
                        {matchedEpisode.code ? ` (${matchedEpisode.code})` : ""}
                      </p>
                    )}
                  </label>

                  <label className="space-y-1.5 text-sm">
                    <span className="text-white/60">Binder name</span>
                    <input
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition-colors focus:border-white/18"
                      placeholder={matchedEpisode?.name ?? "Uses set name by default"}
                    />
                  </label>

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
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm sm:col-span-2">
                    <span className="text-white/60">Binder name</span>
                    <input
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition-colors focus:border-white/18"
                      placeholder="Favorites, Random binder, Chase cards..."
                    />
                  </label>

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

                  <div className="space-y-1.5 text-sm sm:col-span-2">
                    <span className="text-white/60">Accent color</span>
                    <div className="flex flex-wrap gap-2">
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
              )}

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

              {error && <p className="text-sm text-rose-300">{error}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Create binder"}
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
