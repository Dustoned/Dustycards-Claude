"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, MailCheck, MailPlus, Trash2, X } from "lucide-react";
import {
  modalActionRowClass,
  modalBodyClass,
  modalCenteredMobileOverlayClass,
  modalCenteredPanelClass,
  modalCloseButtonClass,
  modalCompactHeaderClass,
  modalInputClass,
  modalPrimaryButtonClass,
  modalSecondaryButtonClass,
} from "@/components/modal-glass-styles";
import { formatCurrency } from "@/lib/format";
import useBodyScrollLock from "@/lib/useBodyScrollLock";
import useModalA11y from "@/lib/useModalA11y";

type AlertKind = "drop" | "target";

interface CardPriceAlertView {
  id: string;
  kind: AlertKind;
  targetPriceEur: number | null;
  baselinePriceEur: number | null;
  enabled: boolean;
}

interface CardPriceAlertResponse {
  alert: CardPriceAlertView | null;
  currentPriceEur: number | null;
  currentPriceAt: string | null;
  mailConfigured: boolean;
  sourceLabel?: string;
  error?: string;
}

function parseTargetPrice(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
}

export default function CardPriceAlertButton({
  cardId,
  cardName,
  endpoint,
  eyebrow = "Card price alert",
  sourceLabel = "CardMarket EN / Near Mint",
  triggerLabel,
  triggerClassName = "",
  lazy = false,
  onOpenChange,
}: {
  cardId: string;
  cardName: string;
  endpoint?: string;
  eyebrow?: string;
  sourceLabel?: string;
  triggerLabel?: string;
  triggerClassName?: string;
  lazy?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const targetInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(!lazy);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<AlertKind>("drop");
  const [targetPrice, setTargetPrice] = useState("");
  const [data, setData] = useState<CardPriceAlertResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alertEndpoint = endpoint ?? `/api/cards/${encodeURIComponent(cardId)}/price-alert`;

  useBodyScrollLock(open);
  useModalA11y({
    dialogRef,
    enabled: open,
    initialFocusRef: kind === "target" ? targetInputRef : undefined,
    onClose: () => closeDialog(),
    restoreFocusDelayFrames: 2,
  });

  const loadAlert = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(alertEndpoint, { cache: "no-store", signal });
      const payload = (await response.json().catch(() => ({}))) as CardPriceAlertResponse;
      if (!response.ok) throw new Error(payload.error ?? "Could not load this price alert");
      setData(payload);
      if (payload.alert) {
        setKind(payload.alert.kind);
        setTargetPrice(
          payload.alert.targetPriceEur == null ? "" : payload.alert.targetPriceEur.toFixed(2)
        );
      } else {
        setKind("drop");
        setTargetPrice("");
      }
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Could not load this price alert");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [alertEndpoint]);

  useEffect(() => {
    if (lazy) return;
    const controller = new AbortController();
    const frame = window.requestAnimationFrame(() => void loadAlert(controller.signal));
    return () => {
      window.cancelAnimationFrame(frame);
      controller.abort();
    };
  }, [lazy, loadAlert]);

  function openDialog() {
    setOpen(true);
    onOpenChange?.(true);
    void loadAlert();
  }

  function closeDialog() {
    setOpen(false);
    onOpenChange?.(false);
    setError(null);
  }

  async function saveAlert() {
    const parsedTarget = kind === "target" ? parseTargetPrice(targetPrice) : null;
    if (kind === "target" && parsedTarget == null) {
      setError("Enter a valid target price above €0.00.");
      targetInputRef.current?.focus();
      return;
    }
    if (
      kind === "target" &&
      parsedTarget != null &&
      data?.currentPriceEur != null &&
      parsedTarget >= data.currentPriceEur
    ) {
      setError(`Choose a target below the current ${formatCurrency(data.currentPriceEur, "EUR")} price.`);
      targetInputRef.current?.focus();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        alertEndpoint,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            ...(parsedTarget == null ? {} : { targetPriceEur: parsedTarget }),
          }),
        }
      );
      const payload = (await response.json().catch(() => ({}))) as CardPriceAlertResponse;
      if (!response.ok) throw new Error(payload.error ?? "Could not save this price alert");
      setData(payload);
      closeDialog();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this price alert");
    } finally {
      setSaving(false);
    }
  }

  async function removeAlert() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(alertEndpoint, { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as CardPriceAlertResponse;
      if (!response.ok) throw new Error(payload.error ?? "Could not turn off this price alert");
      setData(payload);
      closeDialog();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not turn off this price alert");
    } finally {
      setSaving(false);
    }
  }

  const active = Boolean(data?.alert?.enabled);
  const currentPrice = data?.currentPriceEur ?? null;
  const currentPriceDate = data?.currentPriceAt
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(data.currentPriceAt))
    : null;

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={`flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/50 ${
          triggerLabel ? "w-auto px-3" : "w-11"
        } ${
          active
            ? "border-violet-300/32 bg-violet-500/18 text-violet-100"
            : "border-white/10 bg-white/[0.045] text-white/66 hover:border-violet-200/24 hover:bg-violet-500/[0.11] hover:text-white"
        } ${triggerClassName}`}
        aria-label={`${active ? "Edit" : "Set"} price alert for ${cardName}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={active ? "Price alert active" : "Set price alert"}
        data-card-price-alert-trigger
      >
        {loading ? (
          <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden="true" />
        ) : active ? (
          <MailCheck className="h-4.5 w-4.5" aria-hidden="true" />
        ) : (
          <MailPlus className="h-4.5 w-4.5" aria-hidden="true" />
        )}
        {triggerLabel ? <span className="text-xs font-black">{triggerLabel}</span> : null}
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className={`${modalCenteredMobileOverlayClass} z-[360]`}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeDialog();
              }}
              data-card-price-alert-dialog
            >
              <section
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                tabIndex={-1}
                className={`${modalCenteredPanelClass} max-w-lg`}
              >
                <header className={modalCompactHeaderClass}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-violet-300/20 bg-violet-500/12 text-violet-100">
                    <MailPlus className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-200/58">
                      {eyebrow}
                    </p>
                    <h2 id={titleId} className="mt-0.5 truncate text-lg font-black text-white">
                      {cardName}
                    </h2>
                    <p id={descriptionId} className="mt-1 text-xs leading-5 text-white/46">
                      One email when {data?.sourceLabel ?? sourceLabel} meets your rule.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeDialog}
                    className={`${modalCloseButtonClass} !h-11 !w-11`}
                    aria-label="Close price alert"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </header>

                <div className={modalBodyClass}>
                  <div className="rounded-2xl border border-white/9 bg-white/[0.035] p-3.5">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.13em] text-white/38">Current market</p>
                        <p className="mt-1 text-2xl font-black tabular-nums text-white">
                          {loading ? "Loading…" : formatCurrency(currentPrice, "EUR")}
                        </p>
                      </div>
                      <p className="pb-1 text-right text-[11px] font-semibold text-white/38">
                        {data?.sourceLabel ?? sourceLabel}{currentPriceDate ? <><br />{currentPriceDate}</> : null}
                      </p>
                    </div>
                  </div>

                  <fieldset className="mt-4" disabled={loading || saving}>
                    <legend className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-white/45">
                      Notify me when
                    </legend>
                    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Price alert rule">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={kind === "drop"}
                        disabled={currentPrice == null}
                        onClick={() => setKind("drop")}
                        className={`min-h-16 rounded-2xl border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-35 ${
                          kind === "drop"
                            ? "border-violet-300/36 bg-violet-500/15 text-white"
                            : "border-white/9 bg-white/[0.025] text-white/58 hover:border-white/16"
                        }`}
                      >
                        <span className="block text-sm font-black">Price drops</span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-white/42">Below today’s price</span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={kind === "target"}
                        onClick={() => setKind("target")}
                        className={`min-h-16 rounded-2xl border px-3 py-2.5 text-left transition ${
                          kind === "target"
                            ? "border-violet-300/36 bg-violet-500/15 text-white"
                            : "border-white/9 bg-white/[0.025] text-white/58 hover:border-white/16"
                        }`}
                      >
                        <span className="block text-sm font-black">Target price</span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-white/42">At or below your amount</span>
                      </button>
                    </div>
                  </fieldset>

                  {kind === "target" ? (
                    <label className="mt-4 block text-xs font-bold text-white/58">
                      Your target
                      <span className="relative mt-2 block">
                        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-black text-white/44">€</span>
                        <input
                          ref={targetInputRef}
                          type="number"
                          inputMode="decimal"
                          min="0.01"
                          step="0.01"
                          value={targetPrice}
                          onChange={(event) => setTargetPrice(event.target.value)}
                          className={`${modalInputClass} min-h-11 pl-8 font-black tabular-nums`}
                          placeholder={currentPrice == null ? "0.00" : Math.max(0.01, currentPrice * 0.9).toFixed(2)}
                          disabled={saving}
                        />
                      </span>
                    </label>
                  ) : null}

                  {data && !data.mailConfigured ? (
                    <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-400/[0.06] px-3 py-2 text-[11px] leading-4 text-amber-100/68">
                      Email delivery is not configured on this environment yet. Your alert can still be saved.
                    </p>
                  ) : null}
                  {error ? (
                    <p role="alert" className="mt-3 rounded-xl border border-rose-300/18 bg-rose-500/[0.08] px-3 py-2 text-xs font-semibold text-rose-100/78">
                      {error}
                    </p>
                  ) : null}

                  <div className={modalActionRowClass}>
                    {data?.alert ? (
                      <button
                        type="button"
                        onClick={() => void removeAlert()}
                        disabled={saving}
                        className={`${modalSecondaryButtonClass} inline-flex items-center justify-center gap-2 text-rose-100/72`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Turn off
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void saveAlert()}
                      disabled={saving || loading || (kind === "drop" && currentPrice == null)}
                      className={`${modalPrimaryButtonClass} inline-flex items-center justify-center gap-2`}
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MailCheck className="h-4 w-4" aria-hidden="true" />}
                      {data?.alert ? "Save alert" : "Create alert"}
                    </button>
                  </div>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
