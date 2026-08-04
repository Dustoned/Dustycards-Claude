"use client";

import { createPortal } from "react-dom";
import { useId, useRef, useState } from "react";
import { Check, Copy, Link2, Loader2, RotateCw, Trash2, X } from "lucide-react";
import {
  modalActionRowClass,
  modalBodyClass,
  modalCenteredMobileOverlayClass,
  modalCenteredPanelClass,
  modalCloseButtonClass,
  modalCompactHeaderClass,
  modalPrimaryButtonClass,
  modalSecondaryButtonClass,
} from "@/components/modal-glass-styles";
import useBodyScrollLock from "@/lib/useBodyScrollLock";
import useModalA11y from "@/lib/useModalA11y";

interface ShareState {
  share: { url: string; createdAt: string; updatedAt: string } | null;
  error?: string;
}

export default function ShareBinderButton({
  binderId,
  binderName,
}: {
  binderId: string;
  binderName: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useBodyScrollLock(open);
  useModalA11y({
    dialogRef,
    enabled: open,
    onClose: () => setOpen(false),
  });

  const endpoint = `/api/collection/binders/${encodeURIComponent(binderId)}/share`;

  async function loadShare() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as ShareState;
      if (!response.ok) throw new Error(payload.error ?? "Could not load this share link");
      setShareUrl(payload.share?.url ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load this share link");
    } finally {
      setLoading(false);
    }
  }

  function openDialog() {
    setOpen(true);
    setCopied(false);
    void loadShare();
  }

  async function createShare() {
    setSaving(true);
    setError(null);
    setCopied(false);
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as ShareState;
      if (!response.ok || !payload.share?.url) {
        throw new Error(payload.error ?? "Could not create this share link");
      }
      setShareUrl(payload.share.url);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not create this share link");
    } finally {
      setSaving(false);
    }
  }

  async function revokeShare() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as ShareState;
      if (!response.ok) throw new Error(payload.error ?? "Could not revoke this share link");
      setShareUrl(null);
      setCopied(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not revoke this share link");
    } finally {
      setSaving(false);
    }
  }

  async function copyShare() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Copy failed. Select the link and copy it manually.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-xs font-black text-white/68 transition hover:border-violet-300/28 hover:bg-violet-500/[0.11] hover:text-white"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Link2 className="h-4 w-4" aria-hidden="true" />
        Share
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className={`${modalCenteredMobileOverlayClass} z-[360]`}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setOpen(false);
              }}
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
                    <Link2 className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-200/58">Read-only binder link</p>
                    <h2 id={titleId} className="mt-0.5 truncate text-lg font-black text-white">{binderName}</h2>
                    <p id={descriptionId} className="mt-1 text-xs leading-5 text-white/46">
                      Anyone with the link can view cards and current values, without an account.
                    </p>
                  </div>
                  <button type="button" onClick={() => setOpen(false)} className={`${modalCloseButtonClass} !h-11 !w-11`} aria-label="Close share link">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </header>

                <div className={modalBodyClass}>
                  {loading ? (
                    <div className="flex min-h-28 items-center justify-center text-white/48"><Loader2 className="h-5 w-5 animate-spin" /></div>
                  ) : shareUrl ? (
                    <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.055] p-3.5">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100/58">Link active</p>
                      <div className="mt-2 flex items-center gap-2">
                        <input readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/18 px-3 text-xs text-white/72 outline-none" aria-label="Public binder link" />
                        <button type="button" onClick={() => void copyShare()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-300/18 bg-emerald-400/10 text-emerald-100 transition hover:bg-emerald-400/18" aria-label="Copy public binder link">
                          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                      <p className="mt-2 text-[11px] leading-4 text-white/38">Purchase prices, notes and private collection data stay hidden.</p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-white/9 bg-white/[0.035] p-4 text-sm leading-6 text-white/54">
                      Create a revocable public view of this binder. The link shows only collection cards and live market values.
                    </div>
                  )}

                  {error ? <p role="alert" className="mt-3 rounded-xl border border-rose-300/18 bg-rose-500/[0.08] px-3 py-2 text-xs font-semibold text-rose-100/78">{error}</p> : null}

                  <div className={modalActionRowClass}>
                    {shareUrl ? (
                      <button type="button" onClick={() => void revokeShare()} disabled={saving} className={`${modalSecondaryButtonClass} inline-flex items-center justify-center gap-2 text-rose-100/72`}>
                        <Trash2 className="h-4 w-4" /> Revoke
                      </button>
                    ) : null}
                    <button type="button" onClick={() => void createShare()} disabled={saving || loading} className={`${modalPrimaryButtonClass} inline-flex items-center justify-center gap-2`}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : shareUrl ? <RotateCw className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                      {shareUrl ? "Create new link" : "Create link"}
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
