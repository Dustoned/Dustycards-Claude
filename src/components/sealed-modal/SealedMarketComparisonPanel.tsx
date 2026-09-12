import { formatCurrency } from "@/lib/format";
import type { SealedMarketComparison, SealedMarketOffer } from "@/lib/sealed-cardmarket-offers";

export default function SealedMarketComparisonPanel({ markets, offers }: { markets: SealedMarketComparison[]; offers: SealedMarketOffer[] }) {
  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2">
      {markets.map(({ label, savedPriceEur, offer }) => {
        const difference = offer && savedPriceEur != null ? offer.priceEur - savedPriceEur : null;
        const percent = difference != null && savedPriceEur != null && savedPriceEur > 0 ? difference / savedPriceEur * 100 : null;
        return <section key={label} className="rounded-2xl border border-violet-300/18 bg-violet-500/[0.075] p-4">
          <h3 className="font-black text-white">{label}</h3>
          <p className="mt-1 text-xs text-white/45">{label === "Market" ? "English · all seller locations" : "English · EU seller locations only"}</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-2"><dt className="text-white/45">Saved</dt><dd>{formatCurrency(savedPriceEur, "EUR")}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-white/65">Live offer</dt><dd className="font-black text-white">{offer ? formatCurrency(offer.priceEur, "EUR") : "Not observed"}</dd></div>
            {difference != null ? <div className="flex justify-between gap-2"><dt className="text-white/45">Difference</dt><dd className={difference < 0 ? "text-rose-200" : difference > 0 ? "text-emerald-200" : "text-white/60"}>{difference > 0 ? "+" : ""}{formatCurrency(difference, "EUR")}{percent != null ? ` (${percent > 0 ? "+" : ""}${percent.toFixed(1)}%)` : ""}</dd></div> : null}
          </dl>
          {offer ? <div className="mt-3 border-t border-white/10 pt-3 text-xs">
            <a href={offer.sellerUrl} target="_blank" rel="noopener noreferrer" className="break-all font-bold text-violet-200 underline underline-offset-4">{offer.seller}</a>
            <p className="mt-1 text-white/55">{offer.country ?? "Location unknown"} · {offer.professional ? "Professional" : "Private seller"}</p>
          </div> : <p className="mt-3 text-xs text-amber-100/70">No verified EU offer in the returned listings. The saved EU price will be kept.</p>}
        </section>;
      })}
    </div>
    <details className="rounded-2xl border border-white/10 p-3 text-xs">
      <summary className="cursor-pointer font-bold text-white/70">Compare sellers · {offers.length} lowest observed offers</summary>
      <div className="mt-3 max-h-44 space-y-2 overflow-y-auto">
        {offers.map((offer) => <div key={offer.articleId} className="flex items-start justify-between gap-3 border-t border-white/5 pt-2">
          <div className="min-w-0"><a href={offer.sellerUrl} target="_blank" rel="noopener noreferrer" className="break-all text-violet-200">{offer.seller}</a><p className="text-white/45">{offer.country ?? "Location unknown"} · {offer.isEu ? "EU" : offer.country ? "Outside EU" : "EU unverified"}</p></div>
          <span className="shrink-0 font-bold text-white/80">{formatCurrency(offer.priceEur, "EUR")}</span>
        </div>)}
      </div>
    </details>
    <p className="text-xs leading-relaxed text-white/45">Lowest observed English product offers, excluding shipping and import charges. UK, Switzerland and Norway are not included in EU Market. Saved prices have no recorded seller; sellers above belong to this live check.</p>
  </div>;
}
