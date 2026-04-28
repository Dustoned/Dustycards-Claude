import { NextResponse } from "next/server";
import {
  buildExpansionsOverviewHistoryPayload,
  getExpansionsOverviewHistory,
  type ExpansionsOverviewHistoryPayload,
} from "@/lib/expansions-overview";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 8;

interface CachedOverviewHistory {
  expiresAt: number;
  payload: ExpansionsOverviewHistoryPayload;
}

const overviewHistoryCache = new Map<string, CachedOverviewHistory>();

interface RequestBody {
  episodeIds?: unknown;
}

function parseEpisodeIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter((entry): entry is string => typeof entry === "string"))];
}

function getCacheKey(episodeIds: string[]): string {
  return episodeIds.toSorted((a, b) => a.localeCompare(b, undefined, { numeric: true })).join("|");
}

function rememberCacheEntry(key: string, payload: ExpansionsOverviewHistoryPayload) {
  overviewHistoryCache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  });

  if (overviewHistoryCache.size <= MAX_CACHE_ENTRIES) {
    return;
  }

  const oldestKey = overviewHistoryCache.keys().next().value as string | undefined;
  if (oldestKey) {
    overviewHistoryCache.delete(oldestKey);
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const episodeIds = parseEpisodeIds(body.episodeIds);

  if (episodeIds.length === 0) {
    return NextResponse.json(buildExpansionsOverviewHistoryPayload([]));
  }

  const cacheKey = getCacheKey(episodeIds);
  const cached = overviewHistoryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.payload, {
      headers: {
        "Cache-Control": "private, max-age=600",
        "X-DustyCards-Cache": "HIT",
      },
    });
  }

  const rows = await getExpansionsOverviewHistory(episodeIds);
  const payload = buildExpansionsOverviewHistoryPayload(rows);
  rememberCacheEntry(cacheKey, payload);

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, max-age=600",
      "X-DustyCards-Cache": "MISS",
    },
  });
}
