"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  COLLECTION_CONDITIONS,
  COLLECTION_GRADING_COMPANIES,
  COLLECTION_LANGUAGES,
} from "@/lib/collection";
import CollectionInlineBinderCreator, {
  type InlineBinderOption,
} from "@/components/CollectionInlineBinderCreator";

type BinderOption = InlineBinderOption;

interface CollectionCardRef {
  id: string;
  name: string;
  image_url: string | null;
  episode: {
    id: string;
    name: string;
    code: string | null;
  };
}

interface Props {
  card: CollectionCardRef;
  mode?: "icon" | "button";
  theme?: "light" | "dark";
  label?: string;
  className?: string;
  stopPropagation?: boolean;
  onAdded?: () => void;
  initialBinderId?: string | null;
  lockedBinderName?: string | null;
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

const modalSelectClasses =
  "w-full rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition-colors focus:border-white/18";
const modalOptionClasses = "bg-white text-gray-900";

export default function CollectionAddCardButton({
  card,
  mode = "icon",
  theme = "light",
  label = "Add",
  className,
  stopPropagation = true,
  onAdded,
  initialBinderId = null,
  lockedBinderName = null,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [binders, setBinders] = useState<BinderOption[]>([]);
  const [bindersLoading, setBindersLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [flashAdded, setFlashAdded] = useState(false);
  const [binderId, setBinderId] = useState(initialBinderId ?? "");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [condition, setCondition] = useState("Near Mint");
  const [language, setLanguage] = useState("English");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [gradingCompany, setGradingCompany] = useState("");
  const [gradingGrade, setGradingGrade] = useState("");
  const binderLocked = Boolean(initialBinderId && lockedBinderName);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch("/api/collection/binders", {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Could not load binders");
        }

        const data = (await response.json()) as { binders?: BinderOption[] };
        setBinders(Array.isArray(data.binders) ? data.binders : []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setBinders([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setBindersLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!flashAdded) return;
    const timer = window.setTimeout(() => setFlashAdded(false), 1800);
    return () => window.clearTimeout(timer);
  }, [flashAdded]);

  const availableBinders = useMemo(
    () =>
      binders.filter(
        (binder) => binder.type === "custom" || binder.episode_id === card.episode.id
      ),
    [binders, card.episode.id]
  );
  const selectedBinder = useMemo(
    () => binders.find((binder) => binder.id === binderId) ?? null,
    [binders, binderId]
  );
  const purchasePriceLabel =
    selectedBinder?.type === "linked_set" || binderLocked
      ? "Card paid (adds to set spend)"
      : "Purchase price";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/collection/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: card.id,
          binderId: binderId || null,
          purchasePrice: purchasePrice || null,
          condition,
          language,
          notes,
          tags,
          gradingCompany: gradingCompany || null,
          gradingGrade: gradingGrade || null,
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
    setBindersLoading(true);
    setSaveError(null);
    setOpen(true);
  }

  function handleBinderCreated(binder: BinderOption) {
    setBinders((prev) => [binder, ...prev.filter((item) => item.id !== binder.id)]);
    setBindersLoading(false);

    if (binder.type === "custom" || binder.episode_id === card.episode.id) {
      setBinderId(binder.id);
      setSaveError(null);
      return;
    }

    setSaveError("Binder created, but it belongs to another set and cannot be used for this card.");
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={buttonClasses(mode, theme, className)}
        aria-label={`Add ${card.name} to collection`}
      >
        <Plus className={mode === "icon" ? "h-3.5 w-3.5" : "h-4 w-4"} />
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
                Add Card
              </p>
              <h2 className="mt-2 text-2xl font-bold leading-tight">{card.name}</h2>
              <p className="mt-1 text-sm text-white/48">
                {card.episode.name}
                {card.episode.code ? ` (${card.episode.code})` : ""}
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                {binderLocked ? (
                  <div className="space-y-1.5 text-sm">
                    <span className="text-white/60">Save to</span>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
                      <p className="font-medium text-white">{lockedBinderName}</p>
                      <p className="mt-1 text-xs text-white/45">
                        This card will be added straight to this binder.
                      </p>
                    </div>
                  </div>
                ) : (
                  <label className="space-y-1.5 text-sm">
                    <span className="text-white/60">Save to</span>
                    <select
                      value={binderId}
                      onChange={(event) => setBinderId(event.target.value)}
                      className={modalSelectClasses}
                    >
                      <option value="" className={modalOptionClasses}>Singles</option>
                      {availableBinders.map((binder) => (
                        <option key={binder.id} value={binder.id} className={modalOptionClasses}>
                          {binder.name}
                          {binder.type === "linked_set" ? " - Set binder" : ""}
                        </option>
                      ))}
                    </select>
                    {bindersLoading && <p className="text-xs text-white/35">Loading binders...</p>}
                  </label>
                )}

                <label className="space-y-1.5 text-sm">
                  <span className="text-white/60">{purchasePriceLabel}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={purchasePrice}
                    onChange={(event) => setPurchasePrice(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition-colors focus:border-white/18"
                    placeholder="0.00"
                  />
                </label>

                <label className="space-y-1.5 text-sm">
                  <span className="text-white/60">Condition</span>
                  <select
                    value={condition}
                    onChange={(event) => setCondition(event.target.value)}
                    className={modalSelectClasses}
                  >
                    {COLLECTION_CONDITIONS.map((option) => (
                      <option key={option} value={option} className={modalOptionClasses}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5 text-sm">
                  <span className="text-white/60">Language</span>
                  <select
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                    className={modalSelectClasses}
                  >
                    {COLLECTION_LANGUAGES.map((option) => (
                      <option key={option} value={option} className={modalOptionClasses}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5 text-sm">
                  <span className="text-white/60">Grading company</span>
                  <select
                    value={gradingCompany}
                    onChange={(event) => setGradingCompany(event.target.value)}
                    className={modalSelectClasses}
                  >
                    <option value="" className={modalOptionClasses}>Not graded</option>
                    {COLLECTION_GRADING_COMPANIES.map((option) => (
                      <option key={option} value={option} className={modalOptionClasses}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5 text-sm">
                  <span className="text-white/60">Grade</span>
                  <input
                    type="text"
                    value={gradingGrade}
                    onChange={(event) => setGradingGrade(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition-colors focus:border-white/18"
                    placeholder="10 / 9.5 / Pristine"
                  />
                </label>
              </div>

              {!binderLocked && (
                <CollectionInlineBinderCreator
                  suggestedEpisode={card.episode}
                  onCreated={handleBinderCreated}
                />
              )}

              <label className="block space-y-1.5 text-sm">
                <span className="text-white/60">Tags</span>
                <input
                  type="text"
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition-colors focus:border-white/18"
                  placeholder="favorite, alt art, binder hit"
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
