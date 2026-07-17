import "server-only";

import { loadLatestSafeEnglishNmPrices } from "@/lib/card-market-history";
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
const NON_FOCUS_REFRESH_MS = 7 * DAY_MS;

// Readiness needs seven complete daily scans, so daily capacity concentrates on
// a small focus set instead of starving the whole cohort. Enter/leave ranks are
// hysteretic so a card is not rotated out before it can reach seven scans.
export const EBAY_DEMAND_FOCUS_SET_SIZE = 36;
export const EBAY_DEMAND_FOCUS_ENTER_RANK = 30;
export const EBAY_DEMAND_FOCUS_LEAVE_RANK = 45;

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
  focusSize?: number;
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

function dedupeCandidatesByCardId(
  candidates: readonly SignalRadarEbayDemandCandidate[]
): Map<string, SignalRadarEbayDemandCandidate> {
  const unique = new Map<string, SignalRadarEbayDemandCandidate>();
  for (const candidate of candidates) {
    const existing = unique.get(candidate.cardId);
    if (
      !existing ||
      candidate.externalScore > existing.externalScore ||
      (candidate.externalScore === existing.externalScore && candidate.rank < existing.rank)
    ) {
      unique.set(candidate.cardId, candidate);
    }
  }
  return unique;
}

/**
 * Keeps the daily scan capacity on the current top of the Radar. Previous focus
 * members stay in until they fall below the leave rank, and new cards only join
 * from the tighter enter rank, so membership does not churn mid-learning.
 */
export function selectEbayDemandFocusCardIds(input: {
  candidates: readonly SignalRadarEbayDemandCandidate[];
  previousFocusCardIds: ReadonlySet<string>;
}): Set<string> {
  // Effective rank comes from the current score ordering; the incoming rank
  // field is 0 for event/structural seeds and only breaks ties.
  const ranked = [...dedupeCandidatesByCardId(input.candidates).values()]
    .sort(
      (left, right) =>
        right.externalScore - left.externalScore ||
        left.rank - right.rank ||
        left.cardId.localeCompare(right.cardId)
    )
    .map((candidate, index) => ({ cardId: candidate.cardId, effectiveRank: index + 1 }));
  const focus = new Set<string>();
  for (const { cardId, effectiveRank } of ranked) {
    if (focus.size >= EBAY_DEMAND_FOCUS_SET_SIZE) break;
    if (
      input.previousFocusCardIds.has(cardId) &&
      effectiveRank <= EBAY_DEMAND_FOCUS_LEAVE_RANK
    ) {
      focus.add(cardId);
    }
  }
  for (const { cardId, effectiveRank } of ranked) {
    if (focus.size >= EBAY_DEMAND_FOCUS_SET_SIZE) break;
    if (effectiveRank <= EBAY_DEMAND_FOCUS_ENTER_RANK) focus.add(cardId);
  }
  return focus;
}

export function selectDueEbayDemandCandidates(input: {
  candidates: readonly SignalRadarEbayDemandCandidate[];
  latestUpdatedAt: ReadonlyMap<string, Date>;
  now: Date;
  limit: number;
  focusCardIds?: ReadonlySet<string>;
}): SignalRadarEbayDemandCandidate[] {
  const unique = dedupeCandidatesByCardId(input.candidates);
  const refreshBefore = input.now.getTime() - DAY_MS;
  const nonFocusRefreshBefore = input.now.getTime() - NON_FOCUS_REFRESH_MS;
  const cohortRevisionAt = EBAY_DEMAND_COHORT_REVISION_AT.getTime();
  return [...unique.values()]
    .filter((candidate) => {
      const updatedAt = input.latestUpdatedAt.get(candidate.cardId);
      if (!updatedAt || updatedAt.getTime() < cohortRevisionAt) return true;
      // Non-focus cards only get a weekly refresh from leftover slots so the
      // focus set can accumulate its seven complete daily scans.
      const dueBefore =
        input.focusCardIds && !input.focusCardIds.has(candidate.cardId)
          ? nonFocusRefreshBefore
          : refreshBefore;
      return updatedAt.getTime() <= dueBefore;
    })
    .sort((left, right) => {
      const focusDelta = input.focusCardIds
        ? Number(input.focusCardIds.has(right.cardId)) -
          Number(input.focusCardIds.has(left.cardId))
        : 0;
      const leftUpdated = input.latestUpdatedAt.get(left.cardId)?.getTime() ?? Number.NEGATIVE_INFINITY;
      const rightUpdated = input.latestUpdatedAt.get(right.cardId)?.getTime() ?? Number.NEGATIVE_INFINITY;
      return (
        focusDelta ||
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
      episode_id: true,
      name: true,
      card_number: true,
      printed_card_number: true,
      rarity: true,
      image_url: true,
      cardmarket_id: true,
      cardmarket_url: true,
      episode: { select: { id: true, name: true, code: true } },
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
  const latestSafePrice = (
    await loadLatestSafeEnglishNmPrices([
      {
        id: card.id,
        game: card.game,
        episodeId: card.episode_id,
        name: card.name,
        cardNumber: card.card_number,
        printedCardNumber: card.printed_card_number,
        cardmarketId: card.cardmarket_id,
        cardmarketUrl: card.cardmarket_url,
      },
    ])
  ).get(card.id);
  const reference: EbayDealReference = {
    label: "CardMarket NM English",
    valueEur: latestSafePrice?.value ?? null,
    source: latestSafePrice?.value != null ? "cardmarket" : "none",
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

// Focus membership only has to survive between job runs in the same server
// process; after a restart the set is rebuilt from the current top ranks.
const focusCardIdsByMarketplace = new Map<string, Set<string>>();

export function resetEbayDemandFocusStateForTests(): void {
  focusCardIdsByMarketplace.clear();
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
    focusSize: 0,
    quotaRemaining: null,
    quotaReserve,
    estimatedBrowseCallBudget: 0,
    stoppedForQuota: false,
    errors: [],
  };
  if (!config.configured || candidates.length === 0) return baseResult;

  const focusCardIds = selectEbayDemandFocusCardIds({
    candidates,
    previousFocusCardIds:
      focusCardIdsByMarketplace.get(config.marketplaceId) ?? new Set<string>(),
  });
  focusCardIdsByMarketplace.set(config.marketplaceId, focusCardIds);
  baseResult.focusSize = focusCardIds.size;

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
    focusCardIds,
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
