import { Clock3, Gem, Sparkles, TrendingUp } from "lucide-react";
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

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function MoversPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; scope?: string }>;
}) {
  const { source, scope } = await searchParams;
  const { activePriceSource, activeScope, data } = await loadMoversPageData(source, scope);
  const displayedCheapHighRarity = getDisplayedCheapHighRarityMovers(data);
  const isAllScope = activeScope === "all";
  const scopeLabel = isAllScope ? "All Cards" : "Collection";
  const headerStats = [
    {
      label: isAllScope ? "History Cards" : "Tracked",
      value: data.trackedCards.toLocaleString(),
      hint: isAllScope
        ? "Local cards with imported price history checked for movement."
        : "Collection cards checked for recent movement.",
      Icon: Gem,
      tone: "amber",
    },
    {
      label: "Movers",
      value: data.eligibleCards.toLocaleString(),
      hint: "Cards with enough recent history and a meaningful move.",
      Icon: TrendingUp,
      tone: "emerald",
    },
    {
      label: "Cheap Rare",
      value: data.cheapestHighRarityMovers.length.toLocaleString(),
      hint: "Cheap high-rarity movers under roughly the lower-price bands.",
      Icon: Sparkles,
      tone: "violet",
    },
    {
      label: "Updated",
      value: data.movers[0]?.latestFetchedAt ? formatShortDate(data.movers[0].latestFetchedAt) : "--",
      hint: data.movers[0]?.latestFetchedAt
        ? formatDateTime(data.movers[0].latestFetchedAt)
        : "No recent mover snapshot yet.",
      Icon: Clock3,
      tone: "sky",
    },
  ] satisfies HeaderStat[];

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex w-full flex-col gap-8">
        <PageHeroHeader
          eyebrow="DustyCards Collection"
          title="Movers"
          description={
            isAllScope
              ? "All cards with imported price history that are moving quickly, with extra weight for high rarity and lower current prices. New history-backed cards appear here automatically."
              : "Cards from your own collection that are moving up quickly, with extra weight for high rarity and lower current prices."
          }
          stats={headerStats}
          actions={
            <HeaderAction>
              <HeaderPill tone={isAllScope ? "sky" : "emerald"}>Scope: {scopeLabel}</HeaderPill>
              <HeaderPill>
                Ranking source: {activePriceSource === "tcp" ? "TCGPlayer first" : "CardMarket first"}
              </HeaderPill>
            </HeaderAction>
          }
        />

        <MoversBrowser
          movers={data.movers}
          activePriceSource={activePriceSource}
          activeScope={activeScope}
          emptyTitle="Nog geen movers gevonden"
          emptyDescription={
            isAllScope
              ? "Er zijn nog niet genoeg kaarten met recente history en een duidelijke move. Zodra meer history binnenkomt, vult deze tab zich automatisch."
              : "Er zijn nog niet genoeg collection-kaarten met recente history en een duidelijke move. Zodra meer history binnenkomt, vult deze pagina zich automatisch."
          }
          spotlights={[
            { title: "Strongest 7D Move", item: data.strongest7d, windowKey: "7d" },
            { title: "Strongest 30D Move", item: data.strongest30d, windowKey: "30d" },
          ]}
          previewCards={[
            {
              eyebrow: "Secondary Pocket",
              title: "Cheap movers with strong rarity",
              description: isAllScope
                ? "Goedkope high-rarity kaarten uit alle tracked kaarten die al duidelijke kracht laten zien."
                : "Goedkope high-rarity kaarten uit je collectie die al duidelijke kracht laten zien.",
              href: buildMoversSourceHref(
                "/movers/cheap-high-rarity",
                activePriceSource,
                activeScope
              ),
              hrefLabel: "Open page",
              items: displayedCheapHighRarity,
            },
            {
              eyebrow: "Discount Watch",
              title: "High rarity cards that fell hard",
              description: isAllScope
                ? "High-rarity kaarten uit alle tracked kaarten die ver onder hun piek staan."
                : "High-rarity kaarten die nu ver onder hun piek staan en daardoor relatief goedkoop ogen.",
              href: buildMoversSourceHref(
                "/movers/discount-watch",
                activePriceSource,
                activeScope
              ),
              hrefLabel: "Open page",
              items: data.discountedHighRarity,
            },
          ]}
        />
      </div>
    </div>
  );
}
