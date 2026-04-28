import Link from "next/link";
import { ArrowLeft, ArrowUpRight, BadgePercent, TrendingDown, TriangleAlert } from "lucide-react";
import {
  HeaderAction,
  HeaderPill,
  PageHeroHeader,
  type HeaderStat,
} from "@/components/PageHeader";
import MoversBrowser from "@/app/movers/MoversBrowser";
import { buildMoversSourceHref, loadMoversPageData } from "@/app/movers/page-data";

export const dynamic = "force-dynamic";

export default async function DiscountWatchPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; scope?: string; view?: string }>;
}) {
  const { source, scope, view } = await searchParams;
  const { data, activePriceSource, activeScope, activeItemScope } =
    await loadMoversPageData(source, scope, view);
  const movers = data.discountedHighRarity;
  const isAllScope = activeItemScope === "all";
  const scopeLabel = isAllScope ? "All Cards" : "Collection";
  const deepDiscountCount = movers.filter((item) => (item.gapToPeakPct ?? 0) <= -50).length;
  const negativeMomentumCount = movers.filter((item) => item.moverScore < 0).length;
  const headerStats = [
    { label: "Cards", value: movers.length.toLocaleString("nl-NL"), Icon: BadgePercent, tone: "amber" },
    { label: "Peak -50%", value: deepDiscountCount.toLocaleString("nl-NL"), Icon: TrendingDown, tone: "rose" },
    { label: "Negative Move", value: negativeMomentumCount.toLocaleString("nl-NL"), Icon: TriangleAlert, tone: "sky" },
  ] satisfies HeaderStat[];

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex w-full flex-col gap-8">
        <PageHeroHeader
          eyebrow="Discount Watch"
          title="High rarity cards that fell hard"
          description={
            isAllScope
              ? "Een aparte view voor high-rarity kaarten uit alle tracked kaarten die flink onder hun oude piek staan. Handig om kaarten te spotten die nu goedkoop lijken ten opzichte van hun eerdere top."
              : "Een aparte view voor high-rarity kaarten die flink onder hun oude piek staan. Handig om kaarten te spotten die nu goedkoop lijken ten opzichte van hun eerdere top."
          }
          stats={headerStats}
          backLinks={
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-white/50">
                <Link
                  href={buildMoversSourceHref(
                    "/movers",
                    activePriceSource,
                    activeScope,
                    activeItemScope
                  )}
                  prefetch={false}
                  className="inline-flex items-center gap-2 font-medium transition-colors hover:text-gray-900 dark:hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to movers
                </Link>
                <Link
                  href={buildMoversSourceHref(
                    "/movers/cheap-high-rarity",
                    activePriceSource,
                    activeScope,
                    activeItemScope
                  )}
                  prefetch={false}
                  className="inline-flex items-center gap-2 font-medium transition-colors hover:text-gray-900 dark:hover:text-white"
                >
                  Cheap movers
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
            </div>
          }
          actions={
            <HeaderAction>
              <HeaderPill tone={isAllScope ? "sky" : "emerald"}>Scope: {scopeLabel}</HeaderPill>
              <HeaderPill>
                Ranking source: {activePriceSource === "tcp" ? "TCGPlayer first" : "CardMarket first"}
              </HeaderPill>
            </HeaderAction>
          }
        />

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
          activeScope={activeScope}
          activeItemScope={activeItemScope}
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
