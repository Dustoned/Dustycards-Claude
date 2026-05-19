"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  COLLECTION_CONDITIONS,
  COLLECTION_GRADING_COMPANIES,
  COLLECTION_LANGUAGES,
} from "@/lib/collection";
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
  modalInputClass,
  modalOptionClass as modalOptionClasses,
  modalPrimaryButtonClass,
  modalSecondaryButtonClass,
  modalSelectClass as modalSelectClasses,
} from "@/components/modal-glass-styles";

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
  cards: CollectionCardRef[];
  onClose: () => void;
  onAdded?: () => void;
  initialBinderId?: string | null;
  lockedBinderName?: string | null;
}

export default function CollectionBulkAddCardsModal({
  cards,
  onClose,
  onAdded,
  initialBinderId = null,
  lockedBinderName = null,
}: Props) {
  const router = useRouter();
  const [binders, setBinders] = useState<BinderOption[]>([]);
  const [bindersLoading, setBindersLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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
  }, []);

  const sharedEpisode = useMemo(() => {
    if (cards.length === 0) return null;

    const first = cards[0].episode;
    const allSameEpisode = cards.every((card) => card.episode.id === first.id);
    return allSameEpisode ? first : null;
  }, [cards]);

  const availableBinders = useMemo(
    () =>
      binders.filter(
        (binder) => binder.type === "custom" || (sharedEpisode && binder.episode_id === sharedEpisode.id)
      ),
    [binders, sharedEpisode]
  );
  const selectedBinder = useMemo(
    () => binders.find((binder) => binder.id === binderId) ?? null,
    [binders, binderId]
  );
  const purchasePriceLabel =
    selectedBinder?.type === "linked_set" || binderLocked
      ? "Card paid (adds to overall spend)"
      : "Purchase price per card";

  const previewNames = useMemo(() => {
    const names = cards.slice(0, 3).map((card) => card.name);
    if (cards.length > 3) {
      names.push(`+${cards.length - 3} more`);
    }
    return names.join(", ");
  }, [cards]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/collection/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardIds: cards.map((card) => card.id),
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

      router.refresh();
      onAdded?.();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleBinderCreated(binder: BinderOption) {
    setBinders((prev) => [binder, ...prev.filter((item) => item.id !== binder.id)]);
    setBindersLoading(false);

    if (binder.type === "custom" || (sharedEpisode && binder.episode_id === sharedEpisode.id)) {
      setBinderId(binder.id);
      setSaveError(null);
      return;
    }

    setSaveError("Binder created, but it does not match the selected cards.");
  }

  if (cards.length === 0) return null;

  return (
    <div
      className={`${modalCenteredMobileOverlayClass} z-[360]`}
      onClick={onClose}
    >
      <div
        className={`${modalCenteredPanelClass} max-w-xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={modalCompactHeaderClass}>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38 max-[640px]:text-[9px]">
              Bulk Add Cards
            </p>
            <h2 className="mt-1.5 text-2xl font-bold leading-tight max-[640px]:text-[18px]">
              {cards.length} {cards.length === 1 ? "card" : "cards"}
            </h2>
            <p className="mt-1 truncate text-sm text-white/48 max-[640px]:text-[12px]">
              {sharedEpisode
                ? `${sharedEpisode.name}${sharedEpisode.code ? ` (${sharedEpisode.code})` : ""}`
                : "Mixed selections"}
            </p>
            <p className="mt-3 rounded-2xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white/65 max-[640px]:rounded-xl max-[640px]:text-[12px]">
              {previewNames}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={modalCloseButtonClass}
            aria-label="Close bulk add"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form className={`${modalBodyClass} space-y-4`} onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            {binderLocked ? (
              <div className="space-y-1.5 text-sm">
                <span className="text-white/60">Save to</span>
                <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
                  <p className="font-medium text-white">{lockedBinderName}</p>
                  <p className="mt-1 text-xs text-white/45">
                    Selected cards will be added straight to this binder.
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
                className={modalInputClass}
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
                className={modalInputClass}
                placeholder="10 / 9.5 / Pristine"
              />
            </label>
          </div>

          {!binderLocked && (
            <CollectionInlineBinderCreator
              suggestedEpisode={sharedEpisode}
              onCreated={handleBinderCreated}
            />
          )}

          <label className="block space-y-1.5 text-sm">
            <span className="text-white/60">Tags</span>
            <input
              type="text"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              className={modalInputClass}
              placeholder="favorite, binder hit, want graded"
            />
          </label>

          <label className="block space-y-1.5 text-sm">
            <span className="text-white/60">Notes</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={`${modalInputClass} resize-none`}
              placeholder="Optional notes"
            />
          </label>

          {saveError && <p className="text-sm text-rose-300">{saveError}</p>}

          <div className={modalActionRowClass}>
            <button
              type="submit"
              disabled={saving}
              className={modalPrimaryButtonClass}
            >
              {saving ? "Saving..." : `Save ${cards.length} card${cards.length === 1 ? "" : "s"}`}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={modalSecondaryButtonClass}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
