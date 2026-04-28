import { NextResponse } from "next/server";
import {
  buildExpansionsOverviewHistoryPayload,
  getExpansionsOverviewHistory,
} from "@/lib/expansions-overview";

export const dynamic = "force-dynamic";

interface RequestBody {
  episodeIds?: unknown;
}

function parseEpisodeIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter((entry): entry is string => typeof entry === "string"))];
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const episodeIds = parseEpisodeIds(body.episodeIds);

  if (episodeIds.length === 0) {
    return NextResponse.json(buildExpansionsOverviewHistoryPayload([]));
  }

  const rows = await getExpansionsOverviewHistory(episodeIds);

  return NextResponse.json(buildExpansionsOverviewHistoryPayload(rows));
}
