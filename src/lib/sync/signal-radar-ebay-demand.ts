import "server-only";

import {
  listingHasExactCardIdentity,
  matchEbayListingToCard,
  type EbayMatchCard,
} from "@/lib/ebay-card-matching";
import { db } from "@/lib/db";
import {
  buildEbayCardDemandSearchQuery,
  getEbayBrowseRateLimitStatus,
  getEbayDemandRuntimeConfig,
  searchEbayDeals,
  type EbayDealReference,
} from "@/lib/ebay";
import {
  EBAY_DEMAND_COHORT_REVISION_AT,
  recordEbayDemandScan,
} from "@/lib/ebay-demand";
import type { ExternalCardSignal } from "@/lib/external-signal-radar";

const DAY_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_CARD_LIMIT = 12;
const UNKNOWN_QUOTA_CARD_LIMIT = 3;
const DEFAULT_QUOTA_RESERVE = 1_000;
const MAX_CONFIGURED_CARD_LIMIT = 20;

// Two 200-item search pages plus at most 300 item-detail checks on a
// marketplace that cannot verify English/NM through search aspects.
export const EBAY_DEMAND_MAX_BROWSE_CALLS_PER_CARD = 302;

export function getEbayDemandBrowseCallBudget(input: {
  marketplaceId: string;
  categoryId: string | null;
}): number {
  return input.categoryId && ["EBAY_US", "EBAY_GB", "EBAY_DE"].includes(input.marketplaceId)
    ? 50
    : EBAY_DEMAND_MAX_BROWSE_CALLS_PER_CARD;
}

export interface SignalRadarEbayDemandCandidate {
  cardId: string;
  game: ExternalCardSignal["game"];
  rank: number;
  externalScore: number;
}

export interface SignalRadarEbayDemandRefreshResult {
  configured: boolean;
  marketplaceId: string;
  candidates: number;
  due: number;
  selected: number;
  attempted: number;
  refreshed: number;
  complete: number;
  capped: number;
  cleanListings: number;
  quotaRemaining: number | null;
  quotaReserve: number;
  estimatedBrowseCallBudget: number;
  stoppedForQuota: boolean;
  errors: Array<{ cardId: string; message: string }>;
}

function readBoundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
}

export function getAllowedEbayDemandCardCount(input: {
  requested: number;
  quotaRemaining: number | null;
  quotaReserve?: number;
  callsPerCard?: number;
}): number {
  const requested = Math.max(0, Math.floor(input.requested));
  if (input.quotaRemaining == null) return Math.min(requested, UNKNOWN_QUOTA_CARD_LIMIT);
  const quotaReserve = Math.max(0, input.quotaReserve ?? DEFAULT_QUOTA_RESERVE);
  const available = Math.max(0, input.quotaRemaining - quotaReserve);
  const callsPerCard = Math.max(1, input.callsPerCard ?? EBAY_DEMAND_MAX_BROWSE_CALLS_PER_CARD);
  return Math.min(requested, Math.floor(available / callsPerCard));
}

export function selectDueEbayDemandCandidates(input: {
  candidates: readonly SignalRadarEbayDemandCandidate[];
  latestUpdatedAt: ReadonlyMap<string, Date>;
  now: Date;
  limit: number;
}): SignalRadarEbayDemandCandidate[] {
  const unique = new Map<string, SignalRadarEbayDemandCandidate>();
  for (const candidate of input.candidates) {
    const existing = unique.get(candidate.cardId);
    if (
      !existing ||
      candidate.externalScore > existing.externalScore ||
      (candidate.externalScore === existing.externalScore && candidate.rank < existing.rank)
    ) {
      unique.set(candidate.cardId, candidate);
    }
  }
  const refreshBefore = input.now.getTime() - DAY_MS;
  const cohortRevisionAt = EBAY_DEMAND_COHORT_REVISION_AT.getTime();
  return [...unique.values()]
    .filter((candidate) => {
      const updatedAt = input.latestUpdatedAt.get(candidate.cardId);
      return (
        !updatedAt ||
        updatedAt.getTime() < cohortRevisionAt ||
        updatedAt.getTime() <= refreshBefore
      );
    })
    .sort((left, right) => {
      const leftUpdated = input.latestUpdatedAt.get(left.cardId)?.getTime() ?? Number.NEGATIVE_INFINITY;
      const rightUpdated = input.latestUpdatedAt.get(right.cardId)?.getTime() ?? Number.NEGATIVE_INFINITY;
      return (
        leftUpdated - rightUpdated ||
        left.rank - right.rank ||
        right.externalScore - left.externalScore ||
        left.cardId.localeCompare(right.cardId)
      );
    })
    .slice(0, Math.max(0, Math.floor(input.limit)));
}

async function loadDemandCard(cardId: string) {
  return db.card.findUnique({
    where: { id: cardId },
    select: {
      id: true,
      game: true,
      name: true,
      card_number: true,
      printed_card_number: true,
      rarity: true,
      image_url: true,
      episode: { select: { id: true, name: true, code: true } },
      prices: {
        where: { cm_en_lowest_nm: { gt: 0, not: 9001 } },
        orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
        take: 1,
        select: { cm_en_lowest_nm: true },
      },
    },
  });
}

export async function scanSignalRadarCardEbayDemand(input: {
  cardId: string;
  observedAt?: Date;
}): Promise<{ capped: boolean; cleanListings: number; observedCount: number }> {
  const card = await loadDemandCard(input.cardId);
  if (!card) throw new Error("Card not found");

  const config = getEbayDemandRuntimeConfig();
  if (!config.configured) throw new Error("eBay API keys are not configured");

  const cardNumber = card.printed_card_number ?? card.card_number;
  const matchCard: EbayMatchCard = {
    id: card.id,
    name: card.name,
    card_number: cardNumber,
    rarity: card.rarity,
    image_url: card.image_url,
    episode: card.episode,
  };
  const reference: EbayDealReference = {
    label: "CardMarket NM English",
    valueEur: card.prices[0]?.cm_en_lowest_nm ?? null,
    source: card.prices[0]?.cm_en_lowest_nm != null ? "cardmarket" : "none",
  };
  const query = buildEbayCardDemandSearchQuery({
    name: card.name,
    game: card.game === "one-piece" ? "one-piece" : "pokemon",
    cardNumber,
  });
  const result = await searchEbayDeals({
    query,
    reference,
    limit: 50,
    // Active auctions do not provide a stable ask price and an auction ending
    // is not reliable evidence that the card sold. Demand therefore tracks
    // fixed-price / best-offer inventory only.
    buyingMode: "fixed",
    config,
    strictEnglish: true,
    strictNearMint: true,
    excludeGraded: true,
    listingKind: "card",
  });
  const exactListings = result.listings.filter((listing) => {
    const match = matchEbayListingToCard({
      title: listing.title,
      condition: listing.condition,
      candidates: [matchCard],
      requestedMode: "raw",
    });
    return (
      match.status === "matched" &&
      match.card?.id === card.id &&
      listingHasExactCardIdentity({
        title: listing.title,
        condition: listing.condition,
        card: matchCard,
      })
    );
  });
  const capped = result.scan?.capped ?? true;
  const observedCount = result.scan?.fetchedCount ?? result.listings.length;
  await recordEbayDemandScan({
    cardId: card.id,
    marketplaceId: result.marketplaceId,
    mode: "raw",
    listings: exactListings,
    observedCount,
    capped,
    observedAt: input.observedAt,
  });

  return { capped, cleanListings: exactListings.length, observedCount };
}

function isQuotaError(message: string): boolean {
  return /quota|rate.?limit|daily request limit|browse api limit/i.test(message);
}

export async function refreshSignalRadarEbayDemand(
  signals: readonly ExternalCardSignal[],
  now = new Date()
): Promise<SignalRadarEbayDemandRefreshResult> {
  const config = getEbayDemandRuntimeConfig();
  const quotaReserve = readBoundedInteger(
    process.env.EBAY_DEMAND_RADAR_QUOTA_RESERVE,
    DEFAULT_QUOTA_RESERVE,
    0,
    4_500
  );
  const requestedLimit = readBoundedInteger(
    process.env.EBAY_DEMAND_RADAR_CARD_LIMIT,
    DEFAULT_CARD_LIMIT,
    1,
    MAX_CONFIGURED_CARD_LIMIT
  );
  const candidates: SignalRadarEbayDemandCandidate[] = signals.map((signal) => ({
    cardId: signal.cardId,
    game: signal.game,
    rank: signal.rank,
    externalScore: signal.externalScore,
  }));
  const baseResult: SignalRadarEbayDemandRefreshResult = {
    configured: config.configured,
    marketplaceId: config.marketplaceId,
    candidates: new Set(candidates.map((candidate) => candidate.cardId)).size,
    due: 0,
    selected: 0,
    attempted: 0,
    refreshed: 0,
    complete: 0,
    capped: 0,
    cleanListings: 0,
    quotaRemaining: null,
    quotaReserve,
    estimatedBrowseCallBudget: 0,
    stoppedForQuota: false,
    errors: [],
  };
  if (!config.configured || candidates.length === 0) return baseResult;

  let quotaRemaining: number | null = null;
  try {
    quotaRemaining = (await getEbayBrowseRateLimitStatus(config)).summary?.remaining ?? null;
  } catch (error) {
    baseResult.errors.push({
      cardId: "quota",
      message: error instanceof Error ? error.message : String(error),
    });
  }
  baseResult.quotaRemaining = quotaRemaining;

  const latestRows = await db.cardEbayDemandSnapshot.findMany({
    where: {
      card_id: { in: candidates.map((candidate) => candidate.cardId) },
      marketplace_id: config.marketplaceId,
      mode: "raw",
      updated_at: { gte: EBAY_DEMAND_COHORT_REVISION_AT },
    },
    orderBy: [{ updated_at: "desc" }, { id: "desc" }],
    select: { card_id: true, updated_at: true },
  });
  const latestUpdatedAt = new Map<string, Date>();
  for (const row of latestRows) {
    if (!latestUpdatedAt.has(row.card_id)) latestUpdatedAt.set(row.card_id, row.updated_at);
  }
  const due = selectDueEbayDemandCandidates({
    candidates,
    latestUpdatedAt,
    now,
    limit: candidates.length,
  });
  baseResult.due = due.length;
  const allowed = getAllowedEbayDemandCardCount({
    requested: requestedLimit,
    quotaRemaining,
    quotaReserve,
    callsPerCard: getEbayDemandBrowseCallBudget({
      marketplaceId: config.marketplaceId,
      categoryId: config.categoryId,
    }),
  });
  const selected = due.slice(0, allowed);
  baseResult.selected = selected.length;
  baseResult.estimatedBrowseCallBudget =
    selected.length * getEbayDemandBrowseCallBudget({
      marketplaceId: config.marketplaceId,
      categoryId: config.categoryId,
    });

  for (const candidate of selected) {
    baseResult.attempted += 1;
    try {
      const scan = await scanSignalRadarCardEbayDemand({
        cardId: candidate.cardId,
        observedAt: now,
      });
      baseResult.refreshed += 1;
      baseResult.cleanListings += scan.cleanListings;
      if (scan.capped) baseResult.capped += 1;
      else baseResult.complete += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      baseResult.errors.push({ cardId: candidate.cardId, message });
      if (isQuotaError(message)) {
        baseResult.stoppedForQuota = true;
        break;
      }
    }
  }

  return baseResult;
}
