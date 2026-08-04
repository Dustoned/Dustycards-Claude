import Image from "next/image";
import { Eye, Layers3, LockKeyhole, WalletCards } from "lucide-react";
import CollectionBinderIcon from "@/components/CollectionBinderIcon";
import { HeaderStatCard, PageHeroHeader } from "@/components/PageHeader";
import type { SharedBinderPageData } from "@/lib/binder-sharing";
import { formatCollectionCurrency } from "@/lib/collection";
import { getCachedImageUrl } from "@/lib/image-cache";

export default function SharedBinderClient({ data }: { data: SharedBinderPageData }) {
  const totalCardsLabel = data.metrics.totalCards == null
    ? data.metrics.ownedCount.toLocaleString("en-US")
    : `${data.metrics.ownedCount} / ${data.metrics.totalCards}`;

  return (
    <>
      <PageHeroHeader
        className="mb-5 sm:mb-6"
        title={data.binder.name}
        description={data.binder.episode ? `${data.binder.episode.series ?? "Set"} / ${data.binder.episode.name}` : "Shared custom binder"}
        eyebrow="Shared read-only binder"
        gridClassName="xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-stretch"
        leadingVisual={
          <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-[var(--ui-page-header-radius)] border border-white/10 bg-white/[0.06] p-2 text-white/70 sm:flex lg:h-16 lg:w-16" style={data.binder.accentColor ? { color: data.binder.accentColor } : undefined}>
            {data.binder.episode?.logoUrl ? (
              <div className="relative h-full w-full"><Image src={getCachedImageUrl(data.binder.episode.logoUrl) ?? data.binder.episode.logoUrl} alt="" fill className="object-contain" unoptimized /></div>
            ) : (
              <CollectionBinderIcon iconName={data.binder.iconName} className="h-[45%] w-[45%]" />
            )}
          </div>
        }
        sideContent={
          <>
            <HeaderStatCard label="Cards" value={totalCardsLabel} hint="Shared collection" Icon={Layers3} tone="sky" />
            <HeaderStatCard label="Market Value" value={formatCollectionCurrency(data.metrics.currentValue)} hint={`${data.metrics.pricedCards} priced cards`} Icon={WalletCards} tone="emerald" />
            <HeaderStatCard label="Access" value="Read only" hint="No account needed" Icon={Eye} tone="violet" />
            <HeaderStatCard label="Private Data" value="Hidden" hint="No spend or notes" Icon={LockKeyhole} tone="amber" />
          </>
        }
        sideClassName="grid min-w-0 auto-rows-fr grid-cols-2 gap-2 sm:gap-3 xl:grid-rows-2 xl:gap-3"
      />

      <section aria-labelledby="shared-binder-cards">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-200/55">Public collection view</p>
            <h2 id="shared-binder-cards" className="mt-1 text-lg font-black text-white">Binder cards</h2>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs font-bold text-white/52">{data.items.length} cards</span>
        </div>

        {data.items.length > 0 ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {data.items.map((item, index) => (
              <article key={`${item.cardId}:${item.gradingCompany ?? "raw"}:${item.gradingGrade ?? ""}:${index}`} className="min-w-0 rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] p-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.24)]">
                <div className="relative aspect-[2.5/3.5] overflow-hidden rounded-[10px] bg-black/16">
                  {item.imageUrl ? <Image src={getCachedImageUrl(item.imageUrl) ?? item.imageUrl} alt={item.name} fill sizes="(max-width: 640px) 46vw, 16vw" className="object-contain" unoptimized /> : <div className="flex h-full items-center justify-center text-xs font-bold text-white/28">No image</div>}
                  {item.ownedCount > 1 ? <span className="absolute right-1.5 top-1.5 rounded-full border border-white/15 bg-black/68 px-2 py-1 text-[10px] font-black text-white">×{item.ownedCount}</span> : null}
                </div>
                <div className="px-1.5 pb-1 pt-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-2 min-w-0 text-xs font-black leading-4 text-white">{item.name}</h3>
                    <span className="shrink-0 text-xs font-black tabular-nums text-emerald-100">{item.currentValue == null ? "--" : formatCollectionCurrency(item.currentValue)}</span>
                  </div>
                  <p className="mt-1 truncate text-[10px] font-semibold text-white/38">{item.cardNumber ? `#${item.cardNumber} · ` : ""}{item.rarity ?? item.episodeCode ?? item.episodeName}</p>
                  {item.gradingCompany && item.gradingGrade ? <p className="mt-1 text-[10px] font-black uppercase tracking-[0.1em] text-violet-200/64">{item.gradingCompany} {item.gradingGrade}</p> : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-white/8 bg-white/[0.025] px-5 py-14 text-center text-sm text-white/42">This binder does not contain shared cards yet.</div>
        )}
      </section>
    </>
  );
}
