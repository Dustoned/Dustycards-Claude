import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isHiddenExpansion, isRedundantSubsetExpansion } from "@/lib/episodes";

export async function GET() {
  try {
    await requireUser();
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }

  const episodes = await db.episode.findMany({
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
