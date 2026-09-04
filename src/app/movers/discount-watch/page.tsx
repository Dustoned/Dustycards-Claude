import Link from "next/link";
import { ArrowLeft, ArrowUpRight, BadgePercent, TrendingDown, TriangleAlert } from "lucide-react";
import {
  HeaderAction,
  HeaderPill,
  PageHeroHeader,
  type HeaderStat,
} from "@/components/PageHeader";
import BackNavigationLink from "@/components/BackNavigationLink";
import MoversBrowser from "@/app/movers/MoversBrowser";
import { buildMoversSourceHref, loadMoversPageData } from "@/app/movers/page-data";
import { GAME_SEARCH_PARAM, getGameFilterSearchParamValue, parseVisibleGameFilter } from "@/lib/games";
import { requirePageUser } from "@/lib/page-auth";
import { getServerUserSettings } from "@/lib/user-settings-server";
import type { CollectionMoversData } from "@/lib/movers";
import { getCardQuickActionMap } from "@/lib/card-quick-actions-server";

export const dynamic = "force-dynamic";

export default async function DiscountWatchPage({
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
  const user = await requirePageUser(`/movers/discount-watch${nextQuery ? `?${nextQuery}` : ""}`);
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
  const movers = cardData.discountedHighRarity;
  const cardQuickActions = await getCardQuickActionMap(
    user.id,
    movers.map((item) => item.cardId)
  );
  const isAllScope = activeItemScope === "all";
  const scopeLabel = isAllScope ? "All Cards" : "Collection";
  const deepDiscountCount = movers.filter((item) => (item.gapToPeakPct ?? 0) <= -50).length;
  const negativeMomentumCount = movers.filter((item) => item.moverScore < 0).length;
  const headerStats = [
    { label: "Cards", value: movers.length.toLocaleString("en-US"), Icon: BadgePercent, tone: "amber" },
    { label: "Peak -50%", value: deepDiscountCount.toLocaleString("en-US"), Icon: TrendingDown, tone: "rose" },
    { label: "Negative Move", value: negativeMomentumCount.toLocaleString("en-US"), Icon: TriangleAlert, tone: "sky" },
  ] satisfies HeaderStat[];
  const gameValue = getGameFilterSearchParamValue(activeGame);
  const withGame = (href: string) =>
    gameValue ? `${href}${href.includes("?") ? "&" : "?"}${GAME_SEARCH_PARAM}=${gameValue}` : href;

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex w-full flex-col gap-5">
        <PageHeroHeader
          title="Discount Watch"
          description={
            isAllScope
              ? "High-rarity cards below their previous peak."
              : "High-rarity cards in your collection below their previous peak."
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
                    "/movers/cheap-high-rarity",
                    activePriceSource,
                    cardScope,
                    activeItemScope
                  ))}
                  prefetch={false}
                  className="inline-flex items-center gap-2 font-medium transition-colors hover:text-gray-900 dark:hover:text-white"
                >
                  Cheap rarity
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
          eyebrow="Discount Watch"
          title="High rarity cards that fell hard"
          description="Review high-rarity cards that are well below peak and look weaker recently."
          emptyTitle="No cards in Discount Watch yet"
          emptyDescription="No high-rarity cards have fallen far enough for this list right now."
        />
      </div>
    </div>
  );
}
