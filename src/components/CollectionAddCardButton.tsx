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
import {
  BGS_SUBGRADE_KEYS,
  formatBgsSubgradeName,
  type BgsSubgradeKey,
  type BgsSubgrades,
} from "@/lib/graded-slabs";
import CollectionInlineBinderCreator, {
  type InlineBinderOption,
} from "@/components/CollectionInlineBinderCreator";
import {
  modalActionRowClass,
  modalBodyClass,
  modalCenteredMobileOverlayClass,
  modalCenteredPanelClass,
  modalCloseButtonClass,
  modalCompactHeaderClass,
  modalInputClass as modalInputClasses,
  modalLabelClass as modalLabelClasses,
  modalOptionClass as modalOptionClasses,
  modalPrimaryButtonClass,
  modalSecondaryButtonClass,
  modalSelectClass as modalSelectClasses,
} from "@/components/modal-glass-styles";
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
  onAdded?: () => void | Promise<void>;
  initialBinderId?: string | null;
  lockedBinderName?: string | null;
  defaultCondition?: string | null;
  defaultPurchasePrice?: number | null;
}

function buttonClasses(mode: "icon" | "button", theme: "light" | "dark", className?: string) {
  const base =
    mode === "icon"
      ? "inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-all"
      : "inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition-all";

  const palette =
    theme === "dark"
      ? "border-white/12 bg-white/8 text-white hover:border-white/20 hover:bg-white/12"
      : "border-white/12 bg-white/8 text-white hover:border-white/20 hover:bg-white/12";

  return [base, palette, className].filter(Boolean).join(" ");
}

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
  defaultCondition = null,
  defaultPurchasePrice = null,
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
  const [purchasePrice, setPurchasePrice] = useState(
    defaultPurchasePrice != null ? String(defaultPurchasePrice) : ""
  );
  const [condition, setCondition] = useState(defaultCondition || "Near Mint");
  const [language, setLanguage] = useState("English");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [cardKind, setCardKind] = useState<CardKind>("raw");
  const [gradingCompany, setGradingCompany] = useState("");
  const [gradingGrade, setGradingGrade] = useState("");
  const [bgsSubgrades, setBgsSubgrades] = useState<BgsSubgrades>({});
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
      ? "Card paid (adds to overall spend)"
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
          gradingSubgrades:
            cardKind === "graded" && gradingCompany === "BGS" ? bgsSubgrades : null,
        }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Save failed");
      }

      setOpen(false);
      setFlashAdded(true);
      await onAdded?.();
      router.refresh();
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
    setBgsSubgrades({});
    setCondition(defaultCondition || "Near Mint");
    setPurchasePrice(defaultPurchasePrice != null ? String(defaultPurchasePrice) : "");
    setOpen(true);
  }

  function updateBgsSubgrade(key: BgsSubgradeKey, value: string) {
    setBgsSubgrades((prev) => ({
      ...prev,
      [key]: value,
    }));
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
            className={`${modalCenteredMobileOverlayClass} z-[360]`}
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
              className={`${modalCenteredPanelClass} max-w-xl`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={modalCompactHeaderClass}>
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
                  className={modalCloseButtonClass}
                  aria-label="Close add card"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form
                className={modalBodyClass}
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
                        Graded copies still keep the selected raw condition.
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
                              setBgsSubgrades({});
                            }
                          }}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors max-[640px]:px-2.5 ${
                            cardKind === option.key
                              ? "border border-violet-400/40 bg-violet-600 text-white"
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
                          onChange={(event) => {
                            const nextCompany = event.target.value;
                            setGradingCompany(nextCompany);
                            if (nextCompany !== "BGS") {
                              setBgsSubgrades({});
                            }
                          }}
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

                      {gradingCompany === "BGS" && (
                        <div className="col-span-2 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-3 max-[640px]:rounded-xl max-[640px]:p-2.5">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-100/65 max-[640px]:text-[10px]">
                            BGS subgrades
                          </p>
                          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {BGS_SUBGRADE_KEYS.map((key) => (
                              <label key={key} className="space-y-1 text-xs text-white/55">
                                <span>{formatBgsSubgradeName(key)}</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="10"
                                  step="0.5"
                                  inputMode="decimal"
                                  value={bgsSubgrades[key] ?? ""}
                                  onChange={(event) => updateBgsSubgrade(key, event.target.value)}
                                  className={`${modalInputClasses} py-2 text-center font-semibold tabular-nums`}
                                  placeholder="9.5"
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
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

                <div className={modalActionRowClass}>
                  <button
                    type="submit"
                    disabled={saving}
                    className={modalPrimaryButtonClass}
                  >
                    {saving ? "Saving..." : "Save"}
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
        title={`Add ${card.name} to collection`}
      >
        <Plus className={mode === "icon" ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {mode === "button" && <span>{flashAdded ? "Added" : label}</span>}
      </button>

      {addCardModal}
    </>
  );
}
