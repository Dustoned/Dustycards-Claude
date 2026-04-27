import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Gem, Sparkles, TrendingUp } from "lucide-react";
import {
  HeaderAction,
  HeaderPill,
  PageHeroHeader,
  type HeaderStat,
} from "@/components/PageHeader";
import MoversBrowser from "@/app/movers/MoversBrowser";
import {
  buildMoversSourceHref,
  getDisplayedCheapHighRarityMovers,
  loadMoversPageData,
} from "@/app/movers/page-data";

export const dynamic = "force-dynamic";

export default async function CheapHighRarityMoversPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; scope?: string }>;
}) {
  const { source, scope } = await searchParams;
  const { data, activePriceSource, activeScope } = await loadMoversPageData(source, scope);
  const movers = getDisplayedCheapHighRarityMovers(data);
  const isAllScope = activeScope === "all";
  const scopeLabel = isAllScope ? "All Cards" : "Collection";
  const ownedMultipleCount = movers.filter((item) => item.ownedCount >= 2).length;
  const underTenCount = movers.filter((item) => item.currentPrice <= 10).length;
  const headerStats = [
    { label: "Cards", value: movers.length.toLocaleString(), Icon: Sparkles, tone: "amber" },
    { label: "Under 10", value: underTenCount.toLocaleString(), Icon: Gem, tone: "sky" },
    { label: "Owned x2+", value: ownedMultipleCount.toLocaleString(), Icon: TrendingUp, tone: "emerald" },
  ] satisfies HeaderStat[];

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex w-full flex-col gap-8">
        <PageHeroHeader
          eyebrow="Secondary Pocket"
          title="Cheap movers with strong rarity"
          description={
            isAllScope
              ? "Een aparte view voor goedkope high-rarity kaarten uit alle tracked kaarten die al beweging laten zien. Je krijgt hier dezelfde zoek-, filter- en sort-tools, maar dan alleen op deze pocket."
              : "Een aparte view voor goedkope high-rarity kaarten uit je collectie die al beweging laten zien. Je krijgt hier dezelfde zoek-, filter- en sort-tools, maar dan alleen op deze pocket."
          }
          stats={headerStats}
          backLinks={
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-white/50">
                <Link
                  href={buildMoversSourceHref("/movers", activePriceSource, activeScope)}
                  prefetch={false}
                  className="inline-flex items-center gap-2 font-medium transition-colors hover:text-gray-900 dark:hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to movers
                </Link>
                <Link
                  href={buildMoversSourceHref(
                    "/movers/discount-watch",
                    activePriceSource,
                    activeScope
                  )}
                  prefetch={false}
                  className="inline-flex items-center gap-2 font-medium transition-colors hover:text-gray-900 dark:hover:text-white"
                >
                  Discount watch
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
          activeScope={activeScope}
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
