import { Suspense } from "react";
import Link from "next/link";
import { ArrowUpRight, BadgeEuro, Layers3, Repeat2 } from "lucide-react";
import CachedImage from "@/components/CachedImage";
import { getCardImageClassName, getCardImageFrameClassName } from "@/lib/card-image-display";
import { formatCurrency } from "@/lib/format";
import { getExpansionHref } from "@/lib/games";
import { requirePageUser } from "@/lib/page-auth";
import { loadReprintOverview, type ReprintOverviewGroup } from "@/lib/reprint-overview";

export const dynamic = "force-dynamic";

function ReprintCard({
  card,
  lowestPrice,
}: {
  card: ReprintOverviewGroup["cards"][number];
  lowestPrice: number | null;
}) {
  const href = `${getExpansionHref(card.episode_id)}?card=${encodeURIComponent(card.id)}`;
  const isLowest = card.price != null && card.price === lowestPrice;

  return (
    <article className="group relative grid min-w-[15.5rem] snap-start grid-cols-[5.1rem_minmax(0,1fr)] gap-3 rounded-2xl border border-black/8 bg-white/55 p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-400/25 hover:shadow-lg dark:border-white/8 dark:bg-white/[0.035] dark:hover:bg-white/[0.05] sm:min-w-0">
      <Link
        href={href}
        prefetch={false}
        className={getCardImageFrameClassName(
          card.image_url,
          "relative aspect-[63/88] w-[5.1rem] overflow-hidden rounded-[7px] bg-black/5 drop-shadow-[0_8px_14px_rgba(0,0,0,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
        )}
        aria-label={`Open ${card.name} from ${card.episode_name}`}
      >
        {card.image_url ? (
          <CachedImage
            sourceUrl={card.image_url}
            alt=""
            fill
            sizes="82px"
            className={getCardImageClassName(card.image_url, "object-fill")}
            unoptimized
          />
        ) : null}
      </Link>

      <div className="flex min-w-0 flex-col py-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`inline-flex min-h-5 items-center rounded-full border px-2 text-[9px] font-black uppercase tracking-[0.08em] ${
            card.is_original
              ? "border-sky-400/20 bg-sky-400/[0.08] text-sky-700 dark:text-sky-200"
              : "border-violet-400/20 bg-violet-400/[0.09] text-violet-700 dark:text-violet-200"
          }`}>
            {card.is_original ? "Original" : "Reprint"}
          </span>
        </div>

        <Link href={href} prefetch={false} className="mt-2 min-w-0">
          <h3 className="truncate text-sm font-black text-gray-950 transition group-hover:text-violet-700 dark:text-white dark:group-hover:text-violet-200">
            {card.episode_name}
          </h3>
          <p className="mt-0.5 truncate text-[11px] font-medium text-gray-500 dark:text-white/42">
            {card.episode_code ? `${card.episode_code} · ` : ""}
            {card.card_number ? `#${card.card_number}` : "Unknown number"}
          </p>
          <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-white/30">
            {card.rarity ?? "Standard printing"}
          </p>
        </Link>

        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div>
            <p className={`text-base font-black tabular-nums ${isLowest ? "text-emerald-700 dark:text-emerald-200" : "text-gray-950 dark:text-white"}`}>
              {formatCurrency(card.price, "EUR")}
            </p>
            <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-white/28">
              English NM
            </p>
          </div>
          <Link
            href={href}
            prefetch={false}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-black/8 bg-white/70 text-gray-500 transition hover:border-violet-400/25 hover:text-violet-700 dark:border-white/8 dark:bg-white/[0.035] dark:text-white/42 dark:hover:text-violet-200"
            aria-label={`View ${card.episode_name} details`}
          >
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function ReprintGroupCard({ group }: { group: ReprintOverviewGroup }) {
  return (
    <section className="binder-panel overflow-hidden rounded-3xl p-3.5 sm:p-4">
      <div className="flex min-w-0 items-start justify-between gap-3 border-b border-black/7 pb-3 dark:border-white/8">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <Repeat2 className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" />
            <h2 className="truncate text-base font-black text-gray-950 dark:text-white">
              {group.name}
            </h2>
          </div>
          <p className="mt-1 truncate text-[11px] font-medium text-gray-500 dark:text-white/40">
            {group.illustrator ? `Illustrated by ${group.illustrator}` : "Verified matching artwork"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-black tabular-nums text-gray-950 dark:text-white">
            {formatCurrency(group.lowest_price, "EUR")}
          </p>
          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-white/30">
            Lowest print
          </p>
        </div>
      </div>

      <div className="-mx-1 mt-3 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:[grid-template-columns:repeat(auto-fit,minmax(15.5rem,1fr))] sm:overflow-visible">
        {group.cards.map((card) => (
          <ReprintCard key={card.id} card={card} lowestPrice={group.lowest_price} />
        ))}
      </div>
    </section>
  );
}

async function ReprintResults() {
  const groups = await loadReprintOverview();
  const printingCount = groups.reduce((total, group) => total + group.cards.length, 0);

  if (groups.length === 0) {
    return (
      <div className="binder-panel rounded-3xl px-5 py-10 text-center">
        <Repeat2 className="mx-auto h-6 w-6 text-violet-500/70" />
        <h2 className="mt-3 text-lg font-black text-gray-950 dark:text-white">No verified reprints yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-white/45">
          Reprints appear here only after both the card data and artwork pass the comparison.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          { label: "Reprint groups", value: groups.length, Icon: Repeat2 },
          { label: "Compared prints", value: printingCount, Icon: Layers3 },
          { label: "Priced groups", value: groups.filter((group) => group.lowest_price != null).length, Icon: BadgeEuro },
        ].map(({ label, value, Icon }) => (
          <div key={label} className="binder-subpanel rounded-2xl px-3.5 py-3 last:col-span-2 sm:last:col-span-1">
            <div className="flex items-center gap-2 text-gray-400 dark:text-white/36">
              <Icon className="h-3.5 w-3.5" />
              <p className="text-[10px] font-bold uppercase tracking-[0.1em]">{label}</p>
            </div>
            <p className="mt-1.5 text-xl font-black tabular-nums text-gray-950 dark:text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 2xl:grid-cols-2">
        {groups.map((group) => <ReprintGroupCard key={group.key} group={group} />)}
      </div>
    </>
  );
}

function ReprintResultsSkeleton() {
  return (
    <div aria-label="Loading verified reprints" className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[0, 1, 2].map((index) => <div key={index} className="h-[4.75rem] animate-pulse rounded-2xl bg-black/5 dark:bg-white/[0.045]" />)}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {[0, 1, 2, 3].map((index) => <div key={index} className="h-[17rem] animate-pulse rounded-3xl bg-black/5 dark:bg-white/[0.045]" />)}
      </div>
    </div>
  );
}

export default async function ReprintsPage() {
  await requirePageUser("/reprints");

  return (
    <main className="page-container binder-bottom-safe mx-auto max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <header className="mb-4 min-w-0 sm:mb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300/80">
          Card library
        </p>
        <h1 className="mt-1 text-[length:var(--ui-page-header-title-size)] font-black tracking-tight text-gray-950 dark:text-white">
          Reprints
        </h1>
        <p className="mt-1 max-w-2xl text-[length:var(--ui-page-header-description-size)] leading-relaxed text-gray-500 dark:text-white/48">
          Compare cards that reuse the same card data and artwork across another set, number or print treatment.
        </p>
      </header>

      <Suspense fallback={<ReprintResultsSkeleton />}>
        <ReprintResults />
      </Suspense>
    </main>
  );
}
