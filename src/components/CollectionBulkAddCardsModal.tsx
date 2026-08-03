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
import CachedImage from "@/components/CachedImage";
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
  number?: string | null;
  image_url: string | null;
  episode: {
    id: string;
    name: string;
    code: string | null;
  };
}

type PurchasePriceMode = "total" | "per-card";

function parseCurrencyInput(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
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
  const [forSale, setForSale] = useState(false);
  const [binderId, setBinderId] = useState(initialBinderId ?? "");
  const [purchasePriceMode, setPurchasePriceMode] = useState<PurchasePriceMode>("total");
  const [totalPurchasePrice, setTotalPurchasePrice] = useState("");
  const [purchasePrices, setPurchasePrices] = useState<Record<string, string>>({});
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
  const parsedTotalPurchasePrice = useMemo(
    () => parseCurrencyInput(totalPurchasePrice),
    [totalPurchasePrice]
  );

  const previewNames = useMemo(() => {
    const names = cards.slice(0, 3).map((card) => card.name);
    if (cards.length > 3) {
      names.push(`+${cards.length - 3} more`);
    }
    return names.join(", ");
  }, [cards]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);

    let totalPurchasePricePayload: number | null = null;
    const purchasePricesPayload: Record<string, number> = {};

    if (purchasePriceMode === "total") {
      const rawTotal = totalPurchasePrice.trim();
      totalPurchasePricePayload = rawTotal ? parseCurrencyInput(rawTotal) : null;
      if (rawTotal && totalPurchasePricePayload == null) {
        setSaveError("Enter a valid total purchase price, or leave it empty.");
        return;
      }
    } else {
      for (const card of cards) {
        const rawPrice = (purchasePrices[card.id] ?? "").trim();
        if (!rawPrice) continue;
        const price = parseCurrencyInput(rawPrice);
        if (price == null) {
          setSaveError("Enter valid purchase prices, or leave individual cards empty.");
          return;
        }
        purchasePricesPayload[card.id] = price;
      }
    }

    setSaving(true);

    try {
      const response = await fetch("/api/collection/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardIds: cards.map((card) => card.id),
          binderId: forSale ? null : binderId || null,
          forSale,
          ...(totalPurchasePricePayload != null
            ? { totalPurchasePrice: totalPurchasePricePayload }
            : {}),
          ...(Object.keys(purchasePricesPayload).length > 0
            ? { purchasePrices: purchasePricesPayload }
            : {}),
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
      setForSale(false);
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
        className={`${modalCenteredPanelClass} max-w-2xl`}
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
                  value={forSale ? "__for_sale__" : binderId}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (nextValue === "__for_sale__") {
                      setForSale(true);
                      setBinderId("");
                      return;
                    }

                    setForSale(false);
                    setBinderId(nextValue);
                  }}
                  className={modalSelectClasses}
                >
                  <option value="__for_sale__" className={modalOptionClasses}>For sale</option>
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

            <div className="space-y-1.5 text-sm">
              <span className="text-white/60">Purchase price</span>
              {cards.length > 1 ? (
                <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/10 bg-white/[0.045] p-1.5">
                  {[
                    { mode: "total" as const, label: "Total for selection" },
                    { mode: "per-card" as const, label: "Per card" },
                  ].map((option) => (
                    <button
                      key={option.mode}
                      type="button"
                      onClick={() => {
                        setPurchasePriceMode(option.mode);
                        setSaveError(null);
                      }}
                      disabled={saving}
                      aria-pressed={purchasePriceMode === option.mode}
                      className={`rounded-xl px-2.5 py-2 text-xs font-semibold transition-colors ${
                        purchasePriceMode === option.mode
                          ? "bg-violet-600 text-white"
                          : "text-white/54 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2.5 text-sm font-medium text-white/62">
                  Single card
                </div>
              )}
            </div>

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

          {purchasePriceMode === "total" ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3 max-[640px]:rounded-xl">
              <label
                htmlFor="bulk-add-total-purchase-price"
                className="text-[10px] font-black uppercase tracking-[0.14em] text-white/38"
              >
                {cards.length === 1
                  ? "Purchase Price (Optional)"
                  : "Total Paid For All Selected Cards (Optional)"}
              </label>
              <div className="relative mt-1.5">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-white/36">
                  EUR
                </span>
                <input
                  id="bulk-add-total-purchase-price"
                  type="text"
                  inputMode="decimal"
                  value={totalPurchasePrice}
                  onChange={(event) => {
                    setTotalPurchasePrice(event.target.value);
                    setSaveError(null);
                  }}
                  disabled={saving}
                  placeholder="0.00"
                  className={`${modalInputClass} pl-12 tabular-nums`}
                />
              </div>
              <p className="mt-1.5 text-[11px] font-semibold text-white/42">
                {cards.length === 1
                  ? "Saved as this card's cost basis."
                  : parsedTotalPurchasePrice != null
                    ? `About EUR ${(parsedTotalPurchasePrice / cards.length).toFixed(2)} per card; cents are distributed exactly.`
                    : "The combined amount is divided across the selected cards."}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 max-[640px]:rounded-xl">
              <div className="mb-2.5">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/38">
                  Purchase Price Per Card
                </p>
                <p className="mt-1 text-[11px] font-semibold text-white/42">
                  Optional; leave a card empty when no purchase price is known.
                </p>
              </div>
              <div className="max-h-[36vh] space-y-2 overflow-y-auto pr-1 max-[640px]:max-h-[30vh]">
                {cards.map((card) => (
                  <div
                    key={card.id}
                    className="grid grid-cols-[minmax(0,1fr)_8.5rem] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-2.5 max-[640px]:grid-cols-[minmax(0,1fr)_7.5rem] max-[640px]:rounded-xl"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-[4.75%] bg-black/20">
                        {card.image_url ? (
                          <CachedImage
                            sourceUrl={card.image_url}
                            alt=""
                            fill
                            sizes="40px"
                            className="object-contain"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">{card.name}</p>
                        <p className="mt-0.5 truncate text-xs font-semibold text-white/42">
                          {[card.number ? `#${card.number}` : null, card.episode.code]
                            .filter(Boolean)
                            .join(" / ") || card.episode.name}
                        </p>
                      </div>
                    </div>
                    <span className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-white/36">
                        EUR
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={purchasePrices[card.id] ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          setPurchasePrices((current) => ({ ...current, [card.id]: value }));
                          setSaveError(null);
                        }}
                        disabled={saving}
                        placeholder="0.00"
                        aria-label={`Purchase price for ${card.name}`}
                        className={`${modalInputClass} pl-11 text-right tabular-nums`}
                      />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!binderLocked && !forSale && (
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
