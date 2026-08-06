"use client";

import { ArrowUpRight, CheckCircle2, Loader2, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  modalBodyClass,
  modalCenteredMobileOverlayClass,
  modalCenteredPanelClass,
  modalCloseButtonClass,
  modalCompactHeaderClass,
  modalPrimaryButtonClass,
  modalSecondaryButtonClass,
} from "@/components/modal-glass-styles";
import { formatCurrency } from "@/lib/format";
import type { ModalCardData } from "./types";

type PriceCheck = {
  cardId: string;
  cardName: string;
  currentPriceEur: number | null;
  observedPriceEur: number;
  differenceEur: number | null;
  differencePercent: number | null;
  offerCount: number;
  sourceUrl: string;
  provider: string;
  observedAt: string;
  scrapedName: string | null;
  scrapedSetName: string | null;
  scrapedCardNumber: string | null;
  token: string;
};

type PreviewResponse = { check?: PriceCheck; error?: string };
type ConfirmResponse = { card?: ModalCardData; error?: string };

const previewRequests = new Map<string, Promise<PriceCheck>>();

function requestLiveCheck(cardId: string): Promise<PriceCheck> {
  const existing = previewRequests.get(cardId);
  if (existing) return existing;

  const request = fetch(`/api/cards/${encodeURIComponent(cardId)}/cardmarket-price-check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "preview" }),
    cache: "no-store",
  }).then(async (response) => {
    const payload = (await response.json().catch(() => null)) as PreviewResponse | null;
    if (!response.ok || !payload?.check) {
      throw new Error(payload?.error ?? "CardMarket could not be checked.");
    }
    window.setTimeout(() => previewRequests.delete(cardId), 30_000);
    return payload.check;
  }).catch((error) => {
    previewRequests.delete(cardId);
    throw error;
  });
  previewRequests.set(cardId, request);
  return request;
}

export default function CardMarketPriceCheckDialog({
  card,
  onClose,
  onSaved,
}: {
  card: ModalCardData;
  onClose: () => void;
  onSaved: (card: ModalCardData) => void;
}) {
  const [check, setCheck] = useState<PriceCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"changed" | "unchanged" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void requestLiveCheck(card.id)
      .then((result) => {
        if (active) setCheck(result);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : "CardMarket could not be checked.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt, card.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, saving]);

  async function confirm(decision: "changed" | "unchanged") {
    if (!check || saving) return;
    setSaving(decision);
    setError(null);
    try {
      const response = await fetch(
        `/api/cards/${encodeURIComponent(card.id)}/cardmarket-price-check`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: decision, token: check.token }),
          cache: "no-store",
        }
      );
      const payload = (await response.json().catch(() => null)) as ConfirmResponse | null;
      if (!response.ok || !payload?.card) {
        throw new Error(payload?.error ?? "The price check could not be saved.");
      }
      previewRequests.delete(card.id);
      onSaved(payload.card);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The price check could not be saved.");
    } finally {
      setSaving(null);
    }
  }

  const differenceTone =
    check?.differenceEur == null || Math.abs(check.differenceEur) < 0.005
      ? "text-white/62"
      : check.differenceEur > 0
        ? "text-emerald-200"
        : "text-rose-200";

  return createPortal(
    <div
      className={`${modalCenteredMobileOverlayClass} z-[285] bg-black/55 backdrop-blur-xl`}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !saving) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-cardmarket-check-title"
        className={`${modalCenteredPanelClass} max-w-xl bg-[var(--dc-surface-glass-strong)]`}
      >
        <header className={`${modalCompactHeaderClass} justify-between`}>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-200/52">
              Admin · live market check
            </p>
            <h2 id="live-cardmarket-check-title" className="mt-1 truncate text-xl font-black text-white">
              CardMarket English NM
            </h2>
            <p className="mt-1 truncate text-xs text-white/42">{card.name}</p>
          </div>
          <button type="button" onClick={onClose} disabled={Boolean(saving)} className={modalCloseButtonClass} aria-label="Close live price check">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className={modalBodyClass}>
          {loading ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-violet-200" />
              <div>
                <p className="text-sm font-bold text-white/82">Checking CardMarket now…</p>
                <p className="mt-1 text-xs text-white/38">Reading explicit English Near Mint offers.</p>
              </div>
            </div>
          ) : check ? (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-2xl border border-white/9 bg-white/[0.035] p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/34">Saved price</p>
                  <p className="mt-2 text-2xl font-black tabular-nums text-white/88">
                    {formatCurrency(check.currentPriceEur, "EUR")}
                  </p>
                </div>
                <div className="rounded-2xl border border-violet-300/18 bg-violet-500/[0.075] p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-violet-100/48">Live CardMarket</p>
                  <p className="mt-2 text-2xl font-black tabular-nums text-white">
                    {formatCurrency(check.observedPriceEur, "EUR")}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/18 px-4 py-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/32">Difference</p>
                  <p className={`mt-1 text-lg font-black tabular-nums ${differenceTone}`}>
                    {check.differenceEur == null
                      ? "New observation"
                      : `${check.differenceEur > 0 ? "+" : ""}${formatCurrency(check.differenceEur, "EUR")}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-black tabular-nums ${differenceTone}`}>
                    {check.differencePercent == null
                      ? "—"
                      : `${check.differencePercent > 0 ? "+" : ""}${check.differencePercent}%`}
                  </p>
                  <p className="mt-1 text-[10px] text-white/34">{check.offerCount} matching offer{check.offerCount === 1 ? "" : "s"}</p>
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3 text-xs text-white/44">
                <p className="font-semibold text-white/64">
                  {[check.scrapedName, check.scrapedSetName, check.scrapedCardNumber ? `#${check.scrapedCardNumber}` : null]
                    .filter(Boolean)
                    .join(" · ") || "CardMarket product"}
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span>{check.provider === "scrapedo" ? "Scrape.do" : "Firecrawl"} · checked just now</span>
                  <a href={check.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 font-bold text-violet-200/72 hover:text-white">
                    Open source <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            </>
          ) : null}

          {error ? (
            <div className="mt-3 rounded-2xl border border-rose-300/18 bg-rose-500/[0.075] px-4 py-3 text-sm font-semibold text-rose-100/82">
              {error}
            </div>
          ) : null}

          {!loading && !check ? (
            <button
              type="button"
              onClick={() => {
                previewRequests.delete(card.id);
                setLoading(true);
                setError(null);
                setAttempt((value) => value + 1);
              }}
              className={`${modalPrimaryButtonClass} mt-4 inline-flex w-full items-center justify-center gap-2`}
            >
              <RefreshCw className="h-4 w-4" /> Retry live check
            </button>
          ) : null}

          {check ? (
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void confirm("unchanged")}
                disabled={Boolean(saving)}
                className={`${modalSecondaryButtonClass} inline-flex min-h-12 items-center justify-center gap-2`}
              >
                {saving === "unchanged" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                No price change
              </button>
              <button
                type="button"
                onClick={() => void confirm("changed")}
                disabled={Boolean(saving)}
                className={`${modalPrimaryButtonClass} inline-flex min-h-12 items-center justify-center gap-2`}
              >
                {saving === "changed" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Save live price
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>,
    document.body
  );
}
