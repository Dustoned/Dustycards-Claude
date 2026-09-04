import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Gem, Sparkles, TrendingUp } from "lucide-react";
import {
  HeaderAction,
  HeaderPill,
  PageHeroHeader,
  type HeaderStat,
} from "@/components/PageHeader";
import BackNavigationLink from "@/components/BackNavigationLink";
import MoversBrowser from "@/app/movers/MoversBrowser";
import {
  buildMoversSourceHref,
  getDisplayedCheapHighRarityMovers,
  loadMoversPageData,
} from "@/app/movers/page-data";
import { GAME_SEARCH_PARAM, getGameFilterSearchParamValue, parseVisibleGameFilter } from "@/lib/games";
import { requirePageUser } from "@/lib/page-auth";
import { getServerUserSettings } from "@/lib/user-settings-server";
import type { CollectionMoversData } from "@/lib/movers";
import { getCardQuickActionMap } from "@/lib/card-quick-actions-server";

export const dynamic = "force-dynamic";

export default async function CheapHighRarityMoversPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; scope?: string; view?: string; game?: string }>;
}) {
  const { source, scope, view, game } = await searchParams;
  const nextParams = new URLSearchParams();
  if (source) nextParams.set("source", source);
  if (scope) nextParams.set("scope", scope);
  if (view) nextParams.set("view", view);
  if (game) nextParams.set(GAME_SEARCH_PARAM, game);
  const nextQuery = nextParams.toString();
  const user = await requirePageUser(`/movers/cheap-high-rarity${nextQuery ? `?${nextQuery}` : ""}`);
  const settings = await getServerUserSettings(user.id);
  const activeGame = parseVisibleGameFilter(game, {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
  const { data, activePriceSource, activeScope, activeItemScope } =
    await loadMoversPageData(
      source,
      scope === "sealed" ? "collection" : scope ?? "collection",
      view,
      user.id,
      activeGame
    );
  const cardScope = activeScope === "value" ? "collection" : activeScope;
  const cardData = data as CollectionMoversData;
  const movers = getDisplayedCheapHighRarityMovers(cardData);
  const cardQuickActions = await getCardQuickActionMap(
    user.id,
    movers.map((item) => item.cardId)
  );
  const isAllScope = activeItemScope === "all";
  const scopeLabel = isAllScope ? "All Cards" : "Collection";
  const ownedMultipleCount = movers.filter((item) => item.ownedCount >= 2).length;
  const underTenCount = movers.filter((item) => item.currentPrice <= 10).length;
  const headerStats = [
    { label: "Cards", value: movers.length.toLocaleString("en-US"), Icon: Sparkles, tone: "amber" },
    { label: "Under 10", value: underTenCount.toLocaleString("en-US"), Icon: Gem, tone: "sky" },
    { label: "Owned x2+", value: ownedMultipleCount.toLocaleString("en-US"), Icon: TrendingUp, tone: "emerald" },
  ] satisfies HeaderStat[];
  const gameValue = getGameFilterSearchParamValue(activeGame);
  const withGame = (href: string) =>
    gameValue ? `${href}${href.includes("?") ? "&" : "?"}${GAME_SEARCH_PARAM}=${gameValue}` : href;

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex w-full flex-col gap-5">
        <PageHeroHeader
          title="Cheap Rarity"
          description={
            isAllScope
              ? "Affordable high-rarity cards with recent price movement."
              : "Affordable high-rarity cards in your collection with recent price movement."
          }
          stats={headerStats}
          backLinks={
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-white/50">
                <BackNavigationLink
                  href={withGame(buildMoversSourceHref(
                    "/movers",
                    activePriceSource,
                    cardScope,
                    activeItemScope
                  ))}
                  className="inline-flex items-center gap-2 font-medium transition-colors hover:text-gray-900 dark:hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to market
                </BackNavigationLink>
                <Link
                  href={withGame(buildMoversSourceHref(
                    "/movers/discount-watch",
                    activePriceSource,
                    cardScope,
                    activeItemScope
                  ))}
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

        <MoversBrowser
          hideHeading
          movers={movers}
          cardQuickActions={cardQuickActions}
          activeScope={cardScope}
          activeItemScope={activeItemScope}
          eyebrow="Secondary Pocket"
          title="Cheap rarity market"
          description="Search, filter, and sort only the affordable high-rarity cards in this pocket."
          emptyTitle="No cheap high-rarity cards yet"
          emptyDescription="No cards currently meet the conditions for this pocket."
        />
      </div>
    </div>
  );
}
