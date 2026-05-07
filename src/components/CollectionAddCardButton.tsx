"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import {
  COLLECTION_CONDITIONS,
  COLLECTION_GRADING_COMPANIES,
  COLLECTION_LANGUAGES,
} from "@/lib/collection";
import CollectionInlineBinderCreator, {
  type InlineBinderOption,
} from "@/components/CollectionInlineBinderCreator";
import useBodyScrollLock from "@/lib/useBodyScrollLock";

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
  "w-full rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition-colors focus:border-white/18 max-[640px]:rounded-xl max-[640px]:px-2.5 max-[640px]:py-2.5 max-[640px]:text-[16px]";
const modalInputClasses =
  "w-full rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition-colors placeholder:text-white/28 focus:border-white/18 max-[640px]:rounded-xl max-[640px]:px-2.5 max-[640px]:py-2.5 max-[640px]:text-[16px]";
const modalLabelClasses = "space-y-1.5 text-sm max-[640px]:text-[12px]";
const modalOptionClasses = "bg-white text-gray-900";
type CardKind = "raw" | "graded";

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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [binderId, setBinderId] = useState(initialBinderId ?? "");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [condition, setCondition] = useState("Near Mint");
  const [language, setLanguage] = useState("English");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [cardKind, setCardKind] = useState<CardKind>("raw");
  const [gradingCompany, setGradingCompany] = useState("");
  const [gradingGrade, setGradingGrade] = useState("");
  const binderLocked = Boolean(initialBinderId && lockedBinderName);

  useBodyScrollLock(open);

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
          gradingCompany: cardKind === "graded" ? gradingCompany || null : null,
          gradingGrade: cardKind === "graded" ? gradingGrade || null : null,
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
    setShowAdvanced(false);
    setCardKind("raw");
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

  const addCardModal =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/72 p-4 backdrop-blur-xl max-[640px]:items-center max-[640px]:p-3"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Add ${card.name} to DustyCards`}
              data-collection-add-modal="true"
              className="glass relative flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white/12 bg-[#0d0d10]/92 text-white shadow-2xl shadow-black/45 max-[640px]:max-h-[calc(100dvh-1.5rem)] max-[640px]:max-w-[min(26rem,100%)] max-[640px]:rounded-[24px]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start gap-3 border-b border-white/10 px-6 py-5 max-[640px]:px-4 max-[640px]:py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/38 max-[640px]:text-[9px]">
                    Add Card
                  </p>
                  <h2 className="mt-1.5 line-clamp-2 text-2xl font-bold leading-tight max-[640px]:text-[18px]">
                    {card.name}
                  </h2>
                  <p className="mt-1 truncate text-sm text-white/48 max-[640px]:text-[12px]">
                    {card.episode.name}
                    {card.episode.code ? ` (${card.episode.code})` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/8 text-white/60 transition-colors hover:bg-white/12 hover:text-white max-[640px]:h-8 max-[640px]:w-8"
                  aria-label="Close add card"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form
                className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 py-5 max-[640px]:px-4 max-[640px]:py-2.5"
                onSubmit={handleSubmit}
              >
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {binderLocked ? (
                    <div className={`${modalLabelClasses} col-span-2`}>
                      <span className="text-white/60">Save to</span>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5 max-[640px]:rounded-xl max-[640px]:px-2.5 max-[640px]:py-2">
                        <p className="font-medium text-white max-[640px]:text-[13px]">
                          {lockedBinderName}
                        </p>
                        <p className="mt-1 text-xs text-white/45 max-[640px]:text-[11px]">
                          This card will be added straight to this binder.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <label className={`${modalLabelClasses} col-span-2`}>
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

                  <label className="space-y-1.5 text-sm max-[640px]:col-span-2 max-[640px]:text-[12px]">
                    <span className="text-white/60">{purchasePriceLabel}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={purchasePrice}
                      onChange={(event) => setPurchasePrice(event.target.value)}
                      className={modalInputClasses}
                      placeholder="0.00"
                    />
                  </label>

                  <label className="space-y-1.5 text-sm max-[640px]:col-span-2 max-[640px]:text-[12px]">
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

                  <label className="space-y-1.5 text-sm max-[640px]:col-span-2 max-[640px]:text-[12px]">
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
                </div>

                <div className="mt-3 space-y-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3 max-[640px]:rounded-xl max-[640px]:p-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white max-[640px]:text-[12px]">
                        Card type
                      </p>
                      <p className="text-xs text-white/42 max-[640px]:text-[10px]">
                        Use graded only when this copy is slabbed.
                      </p>
                    </div>
                    <div className="inline-flex shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/20 p-1">
                      {[
                        { key: "raw" as const, label: "Raw" },
                        { key: "graded" as const, label: "Graded" },
                      ].map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => {
                            setCardKind(option.key);
                            if (option.key === "raw") {
                              setGradingCompany("");
                              setGradingGrade("");
                            }
                          }}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors max-[640px]:px-2.5 ${
                            cardKind === option.key
                              ? "bg-white text-gray-950"
                              : "text-white/54 hover:text-white"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {cardKind === "graded" && (
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                      <label className="space-y-1.5 text-sm max-[640px]:col-span-2 max-[640px]:text-[12px]">
                        <span className="text-white/60">Grading company</span>
                        <select
                          value={gradingCompany}
                          onChange={(event) => setGradingCompany(event.target.value)}
                          className={modalSelectClasses}
                        >
                          <option value="" className={modalOptionClasses}>Select company</option>
                          {COLLECTION_GRADING_COMPANIES.map((option) => (
                            <option key={option} value={option} className={modalOptionClasses}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1.5 text-sm max-[640px]:col-span-2 max-[640px]:text-[12px]">
                        <span className="text-white/60">Grade</span>
                        <input
                          type="text"
                          value={gradingGrade}
                          onChange={(event) => setGradingGrade(event.target.value)}
                          className={modalInputClasses}
                          placeholder="10 / 9.5"
                        />
                      </label>
                    </div>
                  )}
                </div>

                {!binderLocked && (
                  <div className="mt-3">
                    <CollectionInlineBinderCreator
                      suggestedEpisode={card.episode}
                      onCreated={handleBinderCreated}
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowAdvanced((value) => !value)}
                  className="mt-3 inline-flex w-fit items-center rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.1] hover:text-white max-[640px]:px-2.5 max-[640px]:py-1.5 max-[640px]:text-[11px]"
                >
                  {showAdvanced ? "Hide notes" : "Tags & notes"}
                </button>

                {showAdvanced && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className={`${modalLabelClasses} sm:col-span-2`}>
                      <span className="text-white/60">Tags</span>
                      <input
                        type="text"
                        value={tags}
                        onChange={(event) => setTags(event.target.value)}
                        className={modalInputClasses}
                        placeholder="favorite, alt art"
                      />
                    </label>

                    <label className={`${modalLabelClasses} sm:col-span-2`}>
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

                {saveError && <p className="mt-3 text-sm text-rose-300">{saveError}</p>}

                <div className="sticky bottom-0 -mx-6 -mb-5 mt-5 flex gap-3 border-t border-white/10 bg-[#0d0d10]/95 px-6 py-4 backdrop-blur-xl max-[640px]:-mx-4 max-[640px]:-mb-2.5 max-[640px]:mt-3 max-[640px]:gap-2 max-[640px]:px-4 max-[640px]:py-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 max-[640px]:rounded-xl max-[640px]:py-2.5 max-[640px]:text-[13px]"
                  >
                    {saving ? "Saving..." : "Save"}
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
        className={buttonClasses(mode, theme, className)}
        aria-label={`Add ${card.name} to collection`}
      >
        <Plus className={mode === "icon" ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {mode === "button" && <span>{flashAdded ? "Added" : label}</span>}
      </button>

      {addCardModal}
    </>
  );
}
