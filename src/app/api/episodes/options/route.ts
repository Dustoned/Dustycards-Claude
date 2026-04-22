import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isHiddenExpansion } from "@/lib/episodes";

export async function GET() {
  const episodes = await db.episode.findMany({
    orderBy: [{ release_date: "desc" }, { name: "asc" }],
    select: { id: true, name: true, code: true },
    take: 600,
  });

  const visibleEpisodes = episodes.filter(
    (episode) =>
      !isHiddenExpansion({
        id: episode.id,
        code: episode.code,
        name: episode.name,
      })
  );

  return NextResponse.json({ episodes: visibleEpisodes });
}
