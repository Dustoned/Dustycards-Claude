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
import { requirePageUser } from "@/lib/page-auth";
import type { CollectionMoversData } from "@/lib/movers";

export const dynamic = "force-dynamic";

export default async function CheapHighRarityMoversPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; scope?: string; view?: string }>;
}) {
  const { source, scope, view } = await searchParams;
  const nextParams = new URLSearchParams();
  if (source) nextParams.set("source", source);
  if (scope) nextParams.set("scope", scope);
  if (view) nextParams.set("view", view);
  const nextQuery = nextParams.toString();
  const user = await requirePageUser(`/movers/cheap-high-rarity${nextQuery ? `?${nextQuery}` : ""}`);
  const { data, activePriceSource, activeScope, activeItemScope } =
    await loadMoversPageData(
      source,
      scope === "sealed" ? "collection" : scope ?? "collection",
      view,
      user.id
    );
  const cardScope = activeScope === "value" ? "collection" : activeScope;
  const cardData = data as CollectionMoversData;
  const movers = getDisplayedCheapHighRarityMovers(cardData);
  const isAllScope = activeItemScope === "all";
  const scopeLabel = isAllScope ? "All Cards" : "Collection";
  const ownedMultipleCount = movers.filter((item) => item.ownedCount >= 2).length;
  const underTenCount = movers.filter((item) => item.currentPrice <= 10).length;
  const headerStats = [
    { label: "Cards", value: movers.length.toLocaleString("en-US"), Icon: Sparkles, tone: "amber" },
    { label: "Under 10", value: underTenCount.toLocaleString("en-US"), Icon: Gem, tone: "sky" },
    { label: "Owned x2+", value: ownedMultipleCount.toLocaleString("en-US"), Icon: TrendingUp, tone: "emerald" },
  ] satisfies HeaderStat[];

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex w-full flex-col gap-8">
        <PageHeroHeader
          eyebrow="Secondary Pocket"
          title="Cheap movers with strong rarity"
          description={
            isAllScope
              ? "A focused view for affordable high-rarity cards across all tracked cards that already show price movement."
              : "A focused view for affordable high-rarity cards in your collection that already show price movement."
          }
          stats={headerStats}
          backLinks={
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-white/50">
                <Link
                  href={buildMoversSourceHref(
                    "/movers",
                    activePriceSource,
                    cardScope,
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
                    "/movers/discount-watch",
                    activePriceSource,
                    cardScope,
                    activeItemScope
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
          activeScope={cardScope}
          activeItemScope={activeItemScope}
          eyebrow="Secondary Pocket"
          title="Cheap movers with strong rarity"
          description="Search, filter, and sort only the affordable high-rarity movers in this pocket."
          emptyTitle="No cheap high-rarity movers yet"
          emptyDescription="No cards currently meet the conditions for this pocket."
        />
      </div>
    </div>
  );
}
