import { notFound } from "next/navigation";
import { getCardCategoryPageData } from "@/lib/card-categories";
import {
  GAME_SEARCH_PARAM,
  getGameSearchParamValue,
  ONE_PIECE_GAME,
  parseVisibleTradingCardGame,
} from "@/lib/games";
import { requirePageUser } from "@/lib/page-auth";
import { getServerUserSettings } from "@/lib/user-settings-server";
import CategoryDetailClient from "./CategoryDetailClient";

export const dynamic = "force-dynamic";

export default async function CategoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ game?: string }>;
}) {
  const { slug } = await params;
  const { game: gameParam } = await searchParams;
  const user = await requirePageUser(
    gameParam
      ? `/categories/${slug}?${GAME_SEARCH_PARAM}=${encodeURIComponent(gameParam)}`
      : `/categories/${slug}`
  );
  const settings = await getServerUserSettings(user.id);
  const activeGame = parseVisibleTradingCardGame(gameParam, {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
  const gameValue = getGameSearchParamValue(activeGame);
  const gameQuery = gameValue ? `?${GAME_SEARCH_PARAM}=${gameValue}` : "";
  const data = await getCardCategoryPageData(slug, user.id, activeGame);

  if (!data) {
    notFound();
  }

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <CategoryDetailClient
        category={data.category}
        backHref={`/categories${gameQuery}`}
        setsHref={activeGame === ONE_PIECE_GAME ? "/one-piece/expansions" : "/expansions"}
        eyebrow={activeGame === ONE_PIECE_GAME ? "One Piece Category" : "Category"}
        items={data.items}
        priceSnapshots={data.priceSnapshots}
        totalCards={data.totalCards}
        ownedCards={data.ownedCards}
        setCount={data.setCount}
        pricedCards={data.pricedCards}
        estimatedValue={data.estimatedValue}
      />
    </div>
  );
}
