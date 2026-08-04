import Image from "next/image";
import Link from "next/link";
import { Crosshair, Sparkles, TrendingUp } from "lucide-react";
import type { BinderNextBuyRecommendation } from "@/lib/binder-next-buy";
import { formatCollectionCurrency } from "@/lib/collection";
import { getExpansionHref } from "@/lib/games";
import { getCachedImageUrl } from "@/lib/image-cache";

export default function WantsBuyNowPanel({
  items,
  eyebrow = "Signal-assisted next buy",
  title = "Best to buy now",
}: {
  items: BinderNextBuyRecommendation[];
  eyebrow?: string;
  title?: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-violet-300/12 bg-[radial-gradient(circle_at_8%_0%,rgba(124,92,255,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.052),rgba(255,255,255,0.018))] p-3 shadow-[0_18px_46px_rgba(0,0,0,0.24)] sm:p-4" aria-labelledby="wants-buy-now-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-violet-200/64"><Crosshair className="h-3.5 w-3.5" />{eyebrow}</p>
          <h2 id="wants-buy-now-title" className="mt-1 text-lg font-black text-white">{title}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-white/42">Signal momentum, set-relative chase priority and binder progress combined. Easy sub-€5 pickups are intentionally delayed.</p>
        </div>
        <span className="hidden rounded-full border border-violet-300/14 bg-violet-500/[0.09] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-violet-100/64 sm:inline-flex">Live ranking</span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {items.map((item, index) => (
          <Link
            key={item.cardId}
            href={`${getExpansionHref(item.episodeId)}?card=${encodeURIComponent(item.cardId)}`}
            className="group flex min-w-0 items-center gap-3 rounded-2xl border border-white/8 bg-black/16 p-2.5 transition hover:border-violet-300/22 hover:bg-violet-500/[0.07]"
          >
            <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-black/22 shadow-lg shadow-black/25">
              {item.imageUrl ? <Image src={getCachedImageUrl(item.imageUrl) ?? item.imageUrl} alt="" fill sizes="56px" className="object-contain" unoptimized /> : null}
              <span className="absolute left-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-white/15 bg-black/76 px-1 text-[9px] font-black text-white">{index + 1}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-white group-hover:text-violet-100">{item.name}</p>
                  <p className="mt-0.5 truncate text-[10px] font-semibold text-white/36">{item.cardNumber ? `#${item.cardNumber} · ` : ""}{item.rarity ?? item.episodeName}</p>
                </div>
                <p className="shrink-0 text-xs font-black tabular-nums text-emerald-100">{formatCollectionCurrency(item.currentPriceEur)}</p>
              </div>
              <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-white/48">{item.reason}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-violet-300/14 bg-violet-500/[0.09] px-2 py-1 text-[9px] font-black text-violet-100"><Sparkles className="h-3 w-3" />{item.buyNowScore}/100</span>
                {item.chaseScore != null && item.chaseScore >= 85 ? <span className="rounded-full border border-amber-300/18 bg-amber-400/[0.09] px-2 py-1 text-[9px] font-black text-amber-100">Chase</span> : null}
                {item.signalScore != null ? <span className="rounded-full border border-white/8 bg-white/[0.045] px-2 py-1 text-[9px] font-bold text-white/46">Signal {item.signalScore}</span> : null}
                {item.completionAfterPercent != null ? <span className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-white/[0.045] px-2 py-1 text-[9px] font-bold text-white/46"><TrendingUp className="h-3 w-3" />{item.completionAfterPercent}% after</span> : null}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
