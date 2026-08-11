import "server-only";

import { db } from "@/lib/db";
import { UPCOMING_PRICE_SOURCE_STATUS } from "@/lib/price-source-status";
import { utcDateKey } from "@/lib/upcoming-release-policy";

export interface UpcomingPriceSourceCardIds {
  matched: Set<string>;
  unreleased: Set<string>;
  released: Set<string>;
  conflicts: Set<string>;
}

const METADATA_CACHE_MS = 60_000;
let cachedCardIds: { expiresAt: number; value: UpcomingPriceSourceCardIds } | null = null;

function releaseDayKey(value: string | null): string | null {
  if (!value) return null;
  const exact = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:\b|T)/);
  if (exact) {
    const key = `${exact[1]}-${exact[2]}-${exact[3]}`;
    const parsed = new Date(`${key}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== key
      ? null
      : key;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

/**
 * Resolve exact library matches from stored Upcoming metadata. Hidden UI
 * galleries remain part of this safety check: hiding a retired gallery must
 * never make a genuinely unreleased card eligible for a paid price scrape.
 */
export function classifyUpcomingPriceSourceCardIds(
  metadataRows: Array<string | null>,
  now = new Date()
): UpcomingPriceSourceCardIds {
  const today = utcDateKey(now);
  const matched = new Set<string>();
  const unreleased = new Set<string>();
  const observedReleased = new Set<string>();

  for (const metadataJson of metadataRows) {
    let values: unknown[] = [];
    try {
      const parsed = metadataJson ? JSON.parse(metadataJson) as Record<string, unknown> : null;
      values = Array.isArray(parsed?.upcomingReveals) ? parsed.upcomingReveals : [];
    } catch {
      continue;
    }
    for (const value of values) {
      if (!value || typeof value !== "object") continue;
      const reveal = value as Record<string, unknown>;
      const match = reveal.libraryMatch && typeof reveal.libraryMatch === "object"
        ? reveal.libraryMatch as Record<string, unknown>
        : null;
      const cardId = typeof match?.cardId === "string" ? match.cardId.trim() : "";
      const method = match?.method;
      const releaseDay = releaseDayKey(
        typeof reveal.releaseDate === "string" ? reveal.releaseDate : null
      );
      if (
        !cardId ||
        (method !== "set-number" && method !== "artwork") ||
        !releaseDay
      ) continue;
      matched.add(cardId);
      if (releaseDay > today) unreleased.add(cardId);
      else observedReleased.add(cardId);
    }
  }

  return {
    matched,
    unreleased,
    released: new Set([...matched].filter((cardId) => !unreleased.has(cardId))),
    conflicts: new Set([...unreleased].filter((cardId) => observedReleased.has(cardId))),
  };
}

async function loadUpcomingPriceSourceCardIds(
  now = new Date(),
  options: { fresh?: boolean } = {}
): Promise<UpcomingPriceSourceCardIds> {
  if (!options.fresh && cachedCardIds && cachedCardIds.expiresAt > now.getTime()) {
    return cachedCardIds.value;
  }
  const sources = await db.externalCatalystSource.findMany({
    where: {
      game: "pokemon",
      metadata_json: { contains: '"upcomingReveals"' },
    },
    select: { metadata_json: true },
  });
  const value = classifyUpcomingPriceSourceCardIds(
    sources.map((source) => source.metadata_json),
    now
  );
  cachedCardIds = { expiresAt: now.getTime() + METADATA_CACHE_MS, value };
  return value;
}

export function invalidateUpcomingPriceSourceStatusCache(): void {
  cachedCardIds = null;
}

export async function loadUnreleasedUpcomingCardIds(
  now = new Date(),
  options: { fresh?: boolean } = {}
): Promise<Set<string>> {
  return (await loadUpcomingPriceSourceCardIds(now, options)).unreleased;
}

/**
 * Repair mutable source statuses from the authoritative per-card Upcoming
 * release dates. Any stale Pokémon `upcoming` status outside the exact future
 * set is cleared so removed metadata and release-day transitions cannot leave
 * a card blocked forever.
 */
export async function reconcileUpcomingPriceSourceStatuses(
  now = new Date()
): Promise<{ protectedCards: number; markedUpcoming: number; releasedCards: number }> {
  const cardIds = await loadUpcomingPriceSourceCardIds(now, { fresh: true });
  const unreleased = [...cardIds.unreleased];
  const { markedUpcoming, releasedCards } = await db.$transaction(async (tx) => {
    const marked = unreleased.length > 0
      ? await tx.card.updateMany({
          where: {
            game: "pokemon",
            id: { in: unreleased },
            OR: [
              { price_source_status: null },
              { price_source_status: { not: UPCOMING_PRICE_SOURCE_STATUS } },
            ],
          },
          data: { price_source_status: UPCOMING_PRICE_SOURCE_STATUS },
        })
      : { count: 0 };
    const released = await tx.card.updateMany({
      where: {
        game: "pokemon",
        price_source_status: UPCOMING_PRICE_SOURCE_STATUS,
        ...(unreleased.length > 0 ? { id: { notIn: unreleased } } : {}),
      },
      data: {
        price_source_status: null,
        price_source_checked_at: null,
      },
    });
    return { markedUpcoming: marked, releasedCards: released };
  });

  return {
    protectedCards: unreleased.length,
    markedUpcoming: markedUpcoming.count,
    releasedCards: releasedCards.count,
  };
}
