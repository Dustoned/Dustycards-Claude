import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { getAppFeatures } from "@/lib/app-settings";
import { db } from "@/lib/db";
import { isHiddenExpansion, isRedundantSubsetExpansion } from "@/lib/episodes";
import { ONE_PIECE_GAME, POKEMON_GAME } from "@/lib/games";

export async function GET() {
  try {
    await requireUser();
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }

  const features = await getAppFeatures();
  const games = features.onePieceLibraryEnabled
    ? [POKEMON_GAME, ONE_PIECE_GAME]
    : [POKEMON_GAME];
  const episodes = await db.episode.findMany({
    where: { game: { in: games } },
    orderBy: [{ release_date: "desc" }, { name: "asc" }],
    select: { id: true, name: true, code: true },
    take: 600,
  });

  const visibleEpisodes = episodes.filter(
    (episode) =>
      !isRedundantSubsetExpansion(episode.name) &&
      !isHiddenExpansion({
        id: episode.id,
        code: episode.code,
        name: episode.name,
      })
  );

  return NextResponse.json({ episodes: visibleEpisodes });
}
