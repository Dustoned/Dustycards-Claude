import Link from "next/link";
import { ArrowLeft, ArrowUpRight, BadgePercent, TrendingDown, TriangleAlert } from "lucide-react";
import MoversBrowser from "@/app/movers/MoversBrowser";
import { buildMoversSourceHref, loadMoversPageData } from "@/app/movers/page-data";

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

export default async function DiscountWatchPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const { source } = await searchParams;
  const { data, activePriceSource } = await loadMoversPageData(source);
  const movers = data.discountedHighRarity;
  const deepDiscountCount = movers.filter((item) => (item.gapToPeakPct ?? 0) <= -50).length;
  const negativeMomentumCount = movers.filter((item) => item.moverScore < 0).length;

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
                  href={buildMoversSourceHref("/movers/cheap-high-rarity", activePriceSource)}
                  className="inline-flex items-center gap-2 font-medium transition-colors hover:text-gray-900 dark:hover:text-white"
                >
                  Cheap movers
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>

              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-400 dark:text-white/35">
                Discount Watch
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
                High rarity cards that fell hard
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-white/50">
                Een aparte view voor high-rarity kaarten die flink onder hun oude piek staan. Handig
                om kaarten te spotten die nu goedkoop lijken ten opzichte van hun eerdere top.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-white/50">
                <span className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/80 px-3 py-1.5 dark:border-white/10 dark:bg-white/[0.05]">
                  Ranking source: {activePriceSource === "tcp" ? "TCGPlayer first" : "CardMarket first"}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[34rem]">
              <StatPill label="Cards" value={movers.length.toLocaleString()} />
              <StatPill label="Peak -50%" value={deepDiscountCount.toLocaleString()} />
              <StatPill label="Negative Move" value={negativeMomentumCount.toLocaleString()} />
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-3 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full border border-rose-400/20 bg-rose-400/[0.08] px-3 py-1.5 text-rose-700 dark:text-rose-200">
            <TrendingDown className="h-4 w-4" />
            Deep pullbacks
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/[0.08] px-3 py-1.5 text-amber-700 dark:text-amber-200">
            <BadgePercent className="h-4 w-4" />
            Peak gap focus
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/[0.08] px-3 py-1.5 text-sky-700 dark:text-sky-200">
            <TriangleAlert className="h-4 w-4" />
            Weak recent momentum
          </span>
        </div>

        <MoversBrowser
          movers={movers}
          activePriceSource={activePriceSource}
          eyebrow="Discount Watch"
          title="High rarity cards that fell hard"
          description="Gebruik deze page om alleen high-rarity kaarten te bekijken die ver onder hun piek staan en recent zwakker ogen."
          emptyTitle="Nog geen kaarten in Discount Watch"
          emptyDescription="Er zijn op dit moment geen high-rarity kaarten die hard genoeg zijn teruggevallen voor deze lijst."
        />
      </div>
    </div>
  );
}
