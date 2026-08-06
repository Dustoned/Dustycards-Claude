"use client";

import { Check, Link2, Loader2, Maximize2, RefreshCw, Unlink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import CachedImage from "@/components/CachedImage";
import UpcomingCardImageViewer from "@/components/UpcomingCardImageViewer";

type ReviewCard = {
  id: string;
  name: string;
  card_number: string | null;
  image_url: string | null;
  episode: { name: string };
};

type ReviewItem = {
  source: ReviewCard;
  target: ReviewCard;
  matchMethod: string;
  imageSimilarity: number;
};

function ReviewCardView({
  card,
  onPreview,
  label,
}: {
  card: ReviewCard;
  onPreview: (card: ReviewCard) => void;
  label: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <span className="mb-2 text-[9px] font-black uppercase tracking-[0.12em] text-white/32">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onPreview(card)}
        disabled={!card.image_url}
        aria-label={`Open quick view for ${card.name}`}
        className="group relative aspect-[63/88] w-full max-w-72 overflow-hidden rounded-xl border border-white/10 bg-black/24 shadow-[0_18px_45px_rgba(0,0,0,0.3)] transition hover:border-violet-300/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 disabled:cursor-default"
      >
        {card.image_url ? (
          <>
            <CachedImage
              sourceUrl={card.image_url}
              alt=""
              fill
              sizes="(max-width: 639px) 44vw, 288px"
              className="object-contain transition-transform group-hover:scale-[1.025]"
              unoptimized
            />
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100 group-focus-visible:bg-black/35 group-focus-visible:opacity-100">
              <Maximize2 className="h-7 w-7" />
            </span>
          </>
        ) : null}
      </button>
      <span className="mt-3 min-w-0 max-w-full text-center">
        <strong className="block truncate text-sm text-white/88">{card.name}</strong>
        <span className="mt-1 block truncate text-[10px] text-white/40">{card.episode.name} {card.card_number ? `#${card.card_number}` : ""}</span>
      </span>
    </div>
  );
}

export default function ReprintReviewSection() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewCard, setPreviewCard] = useState<ReviewCard | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/reprint-review", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; items?: ReviewItem[] };
      if (!response.ok) throw new Error(payload.error ?? "Could not load review queue");
      setItems(payload.items ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load review queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function decide(item: ReviewItem, decision: "include" | "exclude") {
    const key = `${item.source.id}:${item.target.id}`;
    setBusyKey(key);
    setError(null);
    try {
      const response = await fetch("/api/admin/reprint-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceCardId: item.source.id, targetCardId: item.target.id, decision }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not save review");
      setItems((current) => current.filter((candidate) => candidate !== item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save review");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="rounded-3xl border border-violet-300/12 bg-violet-500/[0.035] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.13em] text-violet-200/58">Admin only</p>
          <h2 className="mt-1 text-lg font-black text-white">Reprint review</h2>
          <p className="mt-1 text-xs leading-5 text-white/42">Review only direct visual candidates. Text and match chains can no longer create a pair by themselves.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="flex h-9 items-center gap-1.5 rounded-xl border border-white/9 px-2.5 text-[10px] font-black text-white/58">
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {error ? <p className="mt-3 rounded-xl border border-rose-300/14 bg-rose-500/[0.07] px-3 py-2 text-xs text-rose-100">{error}</p> : null}
      {loading ? <div className="flex items-center gap-2 py-8 text-sm text-white/42"><Loader2 className="h-4 w-4 animate-spin" /> Loading review queue...</div> : items.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-300/12 bg-emerald-500/[0.05] px-3 py-4 text-sm font-semibold text-emerald-100/72"><Check className="h-4 w-4" /> No uncertain pairs waiting.</div>
      ) : (
        <div className="mt-4 grid gap-3">
          {items.map((item) => {
            const key = `${item.source.id}:${item.target.id}`;
            const busy = busyKey === key;
            return (
              <article key={key} className="rounded-2xl border border-white/8 bg-black/16 p-3 sm:p-5">
                <div className="relative mx-auto grid w-full max-w-3xl grid-cols-2 items-start gap-3 sm:gap-10">
                  <ReviewCardView card={item.source} onPreview={setPreviewCard} label="Source card" />
                  <span className="absolute left-1/2 top-1/2 z-10 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-violet-300/16 bg-zinc-950/90 text-violet-200/55 shadow-lg">
                    <Link2 className="h-3.5 w-3.5" />
                  </span>
                  <ReviewCardView card={item.target} onPreview={setPreviewCard} label="Candidate" />
                </div>
                <div className="mt-4 border-t border-white/7 pt-4">
                  <p className="text-center text-[9px] font-bold uppercase tracking-[0.09em] text-white/30">
                    Visual candidate · {Math.round(item.imageSimilarity * 100)}% colour and artwork agreement
                  </p>
                  <div className="mx-auto mt-3 grid w-full max-w-xl grid-cols-2 gap-2">
                    <button type="button" onClick={() => void decide(item, "exclude")} disabled={busy} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-rose-300/14 bg-rose-500/[0.06] px-3 text-[11px] font-black text-rose-100 transition hover:bg-rose-500/[0.11]"><Unlink className="h-3.5 w-3.5" /> Not a reprint</button>
                    <button type="button" onClick={() => void decide(item, "include")} disabled={busy} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-emerald-300/14 bg-emerald-500/[0.07] px-3 text-[11px] font-black text-emerald-100 transition hover:bg-emerald-500/[0.12]"><Link2 className="h-3.5 w-3.5" /> Same card</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {previewCard?.image_url ? (
        <UpcomingCardImageViewer
          item={{
            id: `reprint-review:${previewCard.id}`,
            name: previewCard.name,
            imageUrl: previewCard.image_url,
            cardNumber: previewCard.card_number,
            rarity: null,
            episodeId: null,
            episodeName: previewCard.episode.name,
            episodeCode: null,
          }}
          onClose={() => setPreviewCard(null)}
        />
      ) : null}
    </section>
  );
}
