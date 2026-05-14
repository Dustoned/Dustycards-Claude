"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { COLLECTION_BINDER_ICONS } from "@/lib/collection";
import BinderAccentColorPicker from "@/components/BinderAccentColorPicker";
import CollectionBinderIcon from "@/components/CollectionBinderIcon";
import useBodyScrollLock from "@/lib/useBodyScrollLock";

interface EpisodeOption {
  id: string;
  name: string;
  code: string | null;
}

export default function CreateBinderButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [query, setQuery] = useState("");
  const [accentColor, setAccentColor] = useState<string | null>(null);
  const [iconName, setIconName] = useState<(typeof COLLECTION_BINDER_ICONS)[number]>(
    COLLECTION_BINDER_ICONS[0]
  );
  const [basePurchasePrice, setBasePurchasePrice] = useState("");
  const [notes, setNotes] = useState("");
  const [linkMatchedEpisode, setLinkMatchedEpisode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeOption[]>([]);
  const [episodesLoaded, setEpisodesLoaded] = useState(false);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open || episodesLoaded) {
      return;
    }

    let cancelled = false;

    async function loadEpisodes() {
      try {
        const response = await fetch("/api/episodes/options", {
          cache: "force-cache",
        });
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { episodes?: EpisodeOption[] };
        if (!cancelled) {
          setEpisodes(Array.isArray(data.episodes) ? data.episodes : []);
          setEpisodesLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setEpisodesLoaded(true);
        }
      }
    }

    void loadEpisodes();

    return () => {
      cancelled = true;
    };
  }, [open, episodesLoaded]);

  const matchedEpisode = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return null;

    return (
      episodes.find((episode) => episode.name.toLowerCase() === normalized) ??
      episodes.find((episode) => episode.code?.toLowerCase() === normalized) ??
      episodes.find((episode) => episode.name.toLowerCase().includes(normalized)) ??
      null
    );
  }, [episodes, query]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const shouldLinkSet = Boolean(matchedEpisode && linkMatchedEpisode);

    try {
      const response = await fetch("/api/collection/binders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: shouldLinkSet ? "linked_set" : "custom",
          name: query || null,
          episodeId: shouldLinkSet ? matchedEpisode?.id : null,
          linkedQuery: shouldLinkSet ? query || null : null,
          confirmLinkedSet: shouldLinkSet,
          accentColor,
          iconName: shouldLinkSet ? null : iconName,
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

  function openModal() {
    setError(null);
    setShowCustomize(false);
    setLinkMatchedEpisode(false);
    setOpen(true);
  }

  const modalInputClasses =
    "w-full rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition-colors placeholder:text-white/28 focus:border-white/18 max-[640px]:rounded-xl max-[640px]:px-2.5 max-[640px]:py-2 max-[640px]:text-[13px]";
  const binderModal =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/72 p-4 backdrop-blur-xl max-[640px]:items-end max-[640px]:p-0"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Create binder"
              data-create-binder-modal="true"
              className="glass relative flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/12 bg-[#0d0d10]/92 text-white shadow-2xl shadow-black/45 max-[640px]:max-h-[calc(100dvh-0.75rem)] max-[640px]:rounded-b-none max-[640px]:rounded-t-[26px] max-[640px]:border-x-0 max-[640px]:border-b-0"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start gap-3 border-b border-white/10 px-6 py-5 max-[640px]:px-4 max-[640px]:py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="mx-auto mb-3 hidden h-1 w-12 rounded-full bg-white/18 max-[640px]:block" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38 max-[640px]:text-[9px]">
                    Create Binder
                  </p>
                  <h2 className="mt-1.5 text-2xl font-bold leading-tight max-[640px]:text-[18px]">
                    New collection binder
                  </h2>
                  <p className="mt-1 text-sm text-white/50 max-[640px]:hidden">
                    Create a custom binder, or confirm a set link when a matching expansion appears.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/8 text-white/60 transition-colors hover:bg-white/12 hover:text-white max-[640px]:h-8 max-[640px]:w-8"
                  aria-label="Close create binder"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form
                className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 py-5 max-[640px]:px-4 max-[640px]:py-2.5"
                onSubmit={handleSubmit}
              >
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <label className="col-span-2 space-y-1.5 text-sm max-[640px]:text-[12px]">
                    <span className="text-white/60">Set name or binder name</span>
                    <input
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setLinkMatchedEpisode(false);
                      }}
                      className={modalInputClasses}
                      placeholder="Type a set name or custom binder name"
                    />
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/55 max-[640px]:rounded-xl max-[640px]:px-2.5 max-[640px]:py-1.5 max-[640px]:text-[10px]">
                      {matchedEpisode ? (
                        <label className="flex gap-2">
                          <input
                            type="checkbox"
                            checked={linkMatchedEpisode}
                            onChange={(event) => setLinkMatchedEpisode(event.target.checked)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500"
                          />
                          <span>
                            Link as set binder for {matchedEpisode.name}
                            {matchedEpisode.code ? ` (${matchedEpisode.code})` : ""}. Leave unchecked for a custom binder.
                          </span>
                        </label>
                      ) : !episodesLoaded ? (
                        "Checking set matches..."
                      ) : (
                        "This will create a custom binder. Set binders are only linked when you confirm the set."
                      )}
                    </div>
                  </label>

                  <label className="col-span-2 space-y-1.5 text-sm max-[640px]:text-[12px]">
                    <span className="text-white/60">Binder spend</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={basePurchasePrice}
                      onChange={(event) => setBasePurchasePrice(event.target.value)}
                      className={modalInputClasses}
                      placeholder="0.00"
                    />
                  </label>

                </div>

                <button
                  type="button"
                  onClick={() => setShowCustomize((value) => !value)}
                  className="mt-3 inline-flex w-fit items-center rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.1] hover:text-white max-[640px]:px-2.5 max-[640px]:py-1.5 max-[640px]:text-[11px]"
                >
                  {showCustomize ? "Hide customization" : "Customize binder"}
                </button>

                {showCustomize && (
                  <div className="mt-3 space-y-3">
                    {(!matchedEpisode || !linkMatchedEpisode) && (
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
                    )}

                    <div className="space-y-1.5 text-sm max-[640px]:text-[12px]">
                      <span className="text-white/60">Accent color</span>
                      <BinderAccentColorPicker value={accentColor} onChange={setAccentColor} />
                    </div>

                    <label className="block space-y-1.5 text-sm max-[640px]:text-[12px]">
                      <span className="text-white/60">Notes</span>
                      <textarea
                        rows={2}
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        className={`${modalInputClasses} resize-none`}
                        placeholder="Optional notes"
                      />
                    </label>
                  </div>
                )}

                {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

                <div className="sticky bottom-0 -mx-6 -mb-5 mt-5 flex gap-3 border-t border-white/10 bg-[#0d0d10]/95 px-6 py-4 backdrop-blur-xl max-[640px]:-mx-4 max-[640px]:-mb-2.5 max-[640px]:mt-3 max-[640px]:gap-2 max-[640px]:px-4 max-[640px]:py-2.5">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 max-[640px]:rounded-xl max-[640px]:py-2.5 max-[640px]:text-[13px]"
                  >
                    {saving ? "Saving..." : "Create binder"}
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
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-2 rounded-2xl border border-black/8 bg-white/80 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-black/15 hover:bg-white max-[640px]:gap-1.5 max-[640px]:px-3 max-[640px]:py-1.5 max-[640px]:text-[12px] dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/12"
      >
        <Plus className="h-4 w-4 max-[640px]:h-3.5 max-[640px]:w-3.5" />
        Add Binder
      </button>

      {binderModal}
    </>
  );
}
