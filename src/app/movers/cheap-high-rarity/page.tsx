import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Gem, Sparkles, TrendingUp } from "lucide-react";
import MoversBrowser from "@/app/movers/MoversBrowser";
import {
  buildMoversSourceHref,
  getDisplayedCheapHighRarityMovers,
  loadMoversPageData,
} from "@/app/movers/page-data";

export const dynamic = "force-dynamic";

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/8 bg-white/80 px-4 py-3 text-right dark:border-white/10 dark:bg-white/[0.05]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-white/34">
        {label}
      </p>
      <p className="mt-2 text-xl font-bold tracking-tight text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

export default async function CheapHighRarityMoversPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const { source } = await searchParams;
  const { data, activePriceSource } = await loadMoversPageData(source);
  const movers = getDisplayedCheapHighRarityMovers(data);
  const ownedMultipleCount = movers.filter((item) => item.ownedCount >= 2).length;
  const underTenCount = movers.filter((item) => item.currentPrice <= 10).length;

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex w-full flex-col gap-8">
        <section className="relative overflow-hidden rounded-[28px] border border-black/8 bg-black/[0.03] px-5 py-6 shadow-lg shadow-black/5 dark:border-white/8 dark:bg-white/[0.04] sm:px-6 sm:py-7">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.03),transparent_38%,rgba(255,255,255,0.02))]" />

          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-white/50">
                <Link
                  href={buildMoversSourceHref("/movers", activePriceSource)}
                  className="inline-flex items-center gap-2 font-medium transition-colors hover:text-gray-900 dark:hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to movers
                </Link>
                <Link
                  href={buildMoversSourceHref("/movers/discount-watch", activePriceSource)}
                  className="inline-flex items-center gap-2 font-medium transition-colors hover:text-gray-900 dark:hover:text-white"
                >
                  Discount watch
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>

              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-400 dark:text-white/35">
                Secondary Pocket
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
                Cheap movers with strong rarity
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-white/50">
                Een aparte view voor goedkope high-rarity kaarten uit je collectie die al beweging
                laten zien. Je krijgt hier dezelfde zoek-, filter- en sort-tools, maar dan alleen
                op deze pocket.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-white/50">
                <span className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/80 px-3 py-1.5 dark:border-white/10 dark:bg-white/[0.05]">
                  Ranking source: {activePriceSource === "tcp" ? "TCGPlayer first" : "CardMarket first"}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[34rem]">
              <StatPill label="Cards" value={movers.length.toLocaleString()} />
              <StatPill label="Under 10" value={underTenCount.toLocaleString()} />
              <StatPill label="Owned x2+" value={ownedMultipleCount.toLocaleString()} />
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-3 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/[0.08] px-3 py-1.5 text-amber-700 dark:text-amber-200">
            <Sparkles className="h-4 w-4" />
            High rarity focus
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-1.5 text-emerald-700 dark:text-emerald-200">
            <TrendingUp className="h-4 w-4" />
            Positive movers first
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/[0.08] px-3 py-1.5 text-sky-700 dark:text-sky-200">
            <Gem className="h-4 w-4" />
            Cheap price bands
          </span>
        </div>

        <MoversBrowser
          movers={movers}
          activePriceSource={activePriceSource}
          eyebrow="Secondary Pocket"
          title="Cheap movers with strong rarity"
          description="Gebruik deze page om alleen de goedkope high-rarity movers te zoeken, filteren en sorteren."
          emptyTitle="Nog geen cheap high-rarity movers"
          emptyDescription="Er zijn op dit moment geen kaarten in deze pocket die aan de voorwaarden voldoen."
        />
      </div>
    </div>
  );
}
