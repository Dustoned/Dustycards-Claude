import nextDynamic from "next/dynamic";
import Link from "next/link";
import { BadgeEuro, CheckCircle2, Heart, Layers3, Search } from "lucide-react";
import { HeaderAction, PageHeroHeader, type HeaderStat } from "@/components/PageHeader";
import { formatCollectionCurrency } from "@/lib/collection";
import { getWantsPageData } from "@/lib/collection-data";
import { requirePageUser } from "@/lib/page-auth";

const CollectionCardsView = nextDynamic(() => import("@/components/CollectionCardsView"));

export const dynamic = "force-dynamic";

export default async function WantsPage() {
  const user = await requirePageUser("/wants");
  const data = await getWantsPageData(user.id);
  const unpricedCards = Math.max(data.totalCards - data.pricedCards, 0);
  const stats = [
    {
      label: "Wanted",
      value: data.totalCards.toLocaleString(),
      hint: "Cards outside your collection totals.",
      Icon: Heart,
      tone: "rose",
    },
    {
      label: "Estimated Cost",
      value: formatCollectionCurrency(data.estimatedValue),
      hint: "Current CardMarket total.",
      Icon: BadgeEuro,
      tone: "emerald",
    },
    {
      label: "Priced",
      value: `${data.pricedCards.toLocaleString()} / ${data.totalCards.toLocaleString()}`,
      hint: unpricedCards > 0 ? `${unpricedCards.toLocaleString()} without price data.` : "All wants have prices.",
      Icon: CheckCircle2,
      tone: "sky",
    },
    {
      label: "Sets",
      value: data.totalSets.toLocaleString(),
      hint:
        data.averageValue == null
          ? "Add wants to build a target list."
          : `${formatCollectionCurrency(data.averageValue)} average.`,
      Icon: Layers3,
      tone: "violet",
    },
  ] satisfies HeaderStat[];

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="flex w-full flex-col gap-5 sm:gap-6">
        <PageHeroHeader
          eyebrow="DustyCards"
          title="Wants"
          description="Cards you want to pick up later. Prices are tracked here, but they do not count toward collection value, spent or card totals."
          className="max-[640px]:[--ui-page-header-padding:0.85rem] max-[640px]:[--ui-page-header-title-size:1.65rem] max-[640px]:[--ui-page-header-description-size:0.78rem]"
          actions={
            <HeaderAction>
              <Link
                href="/expansions"
                prefetch={false}
                className="inline-flex items-center gap-2 rounded-2xl border border-black/8 bg-white/80 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-black/15 hover:bg-white dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/12"
              >
                <Search className="h-4 w-4" />
                Browse Cards
              </Link>
            </HeaderAction>
          }
          stats={stats}
          statsClassName="sm:grid-cols-2 xl:grid-cols-4"
        />

        <CollectionCardsView
          items={data.items}
          allowWantRemoval
          emptyTitle="No wants yet"
          emptyText="Use Want on a card detail to keep it here."
          sectionTitle="Wanted cards"
          sectionCount={data.totalCards.toLocaleString()}
          showFilters
          forcedSortBy="cm_en"
          forcedSortDir="desc"
          hideSortControls
        />
      </div>
    </div>
  );
}
