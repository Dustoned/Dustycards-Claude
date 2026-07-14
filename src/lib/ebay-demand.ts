import { db } from "@/lib/db";
import type { EbayDealListing } from "@/lib/ebay";

export type EbayDemandMode = "raw" | "graded";

export interface EbayDemandHistoryPoint {
  date: string;
  activeCount: number;
  newCount: number;
  removedCount: number;
  medianAskEur: number | null;
}

export interface EbayDemandSummary {
  activeCount: number;
  new7d: number;
  removed7d: number;
  removalPressure7d: number;
  baseline30d: number;
  pressureChangePercent: number | null;
  medianAskEur: number | null;
  lowestAskEur: number | null;
  auctionCount: number;
  fixedCount: number;
}

export interface EbayDemandPayload {
  updatedAt: string;
  marketplaceId: string;
  mode: EbayDemandMode;
  sample: {
    observed: number;
    clean: number;
    capped: boolean;
  };
  summary: EbayDemandSummary;
  history: EbayDemandHistoryPoint[];
}

interface DemandSnapshotLike {
  snapshot_date: Date;
  observed_count: number;
  clean_count: number;
  capped: boolean;
  active_count: number;
  new_count: number;
  removed_count: number;
  median_ask_eur: number | null;
  lowest_ask_eur: number | null;
  auction_count: number;
  fixed_count: number;
  updated_at: Date;
}

export interface MissingLifecycleInput {
  capped: boolean;
  missedScanCount: number;
  lastSeenAt: Date;
  lastMissedOn: Date | null;
  scanDay: Date;
}

export interface MissingLifecycleUpdate {
  shouldUpdate: boolean;
  missedScanCount: number;
  removed: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * Observations before this revision can contain auction inventory, while the
 * graded cohort also used the broad raw-safety classifier. Keeping the cutoff
 * in application code avoids a schema migration while ensuring a fresh
 * on-demand scan immediately replaces both invalid cohorts.
 */
export const EBAY_DEMAND_COHORT_REVISION_AT = new Date(
  "2026-07-13T18:40:00.000Z"
);

function cohortRevisionWhere() {
  return { updated_at: { gte: EBAY_DEMAND_COHORT_REVISION_AT } };
}

function listingVisibilityStart(snapshotDate: Date): Date {
  return EBAY_DEMAND_COHORT_REVISION_AT.getTime() > snapshotDate.getTime()
    ? EBAY_DEMAND_COHORT_REVISION_AT
    : snapshotDate;
}

export function toUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, amount: number): Date {
  return new Date(value.getTime() + amount * DAY_MS);
}

function sameUtcDay(a: Date | null | undefined, b: Date): boolean {
  return Boolean(a && toUtcDay(a).getTime() === toUtcDay(b).getTime());
}

function round(value: number, precision = 1): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function finitePositive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function listingType(listing: EbayDealListing): "auction" | "fixed" | "mixed" | "unknown" {
  const options = new Set(listing.buyingOptions.map((option) => option.toUpperCase()));
  const auction = options.has("AUCTION");
  const fixed = options.has("FIXED_PRICE") || options.has("BEST_OFFER");
  if (auction && fixed) return "mixed";
  if (auction) return "auction";
  if (fixed) return "fixed";
  return "unknown";
}

/**
 * Raw demand deliberately uses only explicitly identified English, Near Mint
 * listings. UNKNOWN language, Mint, LP and every other condition are excluded
 * so the demand sample matches DustyCards' canonical NM ENG market price.
 * Graded observations remain a separate sample and never flow into raw demand.
 */
export function isCleanEbayDemandListing(
  listing: EbayDealListing,
  mode: EbayDemandMode
): boolean {
  const buyingOptions = new Set(listing.buyingOptions.map((option) => option.toUpperCase()));
  if (buyingOptions.has("AUCTION")) return false;
  if (!buyingOptions.has("FIXED_PRICE") && !buyingOptions.has("BEST_OFFER")) return false;

  if (mode === "graded") {
    return (
      listing.isConfirmedGradedListing === true &&
      listing.language.code === "ENG" &&
      listing.language.confidence === "explicit"
    );
  }

  return (
    !listing.isGradedListing &&
    listing.language.code === "ENG" &&
    listing.language.confidence === "explicit" &&
    listing.cardCondition.code === "near_mint" &&
    listing.demandVerification?.english === true &&
    listing.demandVerification.nearMint === true
  );
}

export function cleanEbayDemandListings(
  listings: EbayDealListing[],
  mode: EbayDemandMode
): EbayDealListing[] {
  const byItemId = new Map<string, EbayDealListing>();
  for (const listing of listings) {
    if (!isCleanEbayDemandListing(listing, mode)) continue;
    if (!byItemId.has(listing.itemId)) byItemId.set(listing.itemId, listing);
  }
  return [...byItemId.values()];
}

/** Missing observations only advance once per UTC day and only on complete scans. */
export function getMissingLifecycleUpdate(input: MissingLifecycleInput): MissingLifecycleUpdate {
  if (
    input.capped ||
    input.lastSeenAt.getTime() >= input.scanDay.getTime() ||
    sameUtcDay(input.lastMissedOn, input.scanDay)
  ) {
    return {
      shouldUpdate: false,
      missedScanCount: input.missedScanCount,
      removed: false,
    };
  }

  const missedScanCount = input.missedScanCount + 1;
  return {
    shouldUpdate: true,
    missedScanCount,
    removed: missedScanCount >= 2,
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function removalPressure(snapshots: DemandSnapshotLike[]): number {
  if (snapshots.length === 0) return 0;
  const removed = snapshots.reduce((sum, snapshot) => sum + snapshot.removed_count, 0);
  const averageActive =
    snapshots.reduce((sum, snapshot) => sum + snapshot.active_count, 0) / snapshots.length;
  const denominator = removed + averageActive;
  return denominator > 0 ? round((removed / denominator) * 100) : 0;
}

export function buildEbayDemandPayload(input: {
  marketplaceId: string;
  mode: EbayDemandMode;
  snapshots: DemandSnapshotLike[];
}): EbayDemandPayload | null {
  const snapshots = [...input.snapshots].sort(
    (a, b) => a.snapshot_date.getTime() - b.snapshot_date.getTime()
  );
  const latest = snapshots.at(-1);
  if (!latest) return null;

  const latestDay = toUtcDay(latest.snapshot_date);
  const sevenDayStart = addUtcDays(latestDay, -6).getTime();
  const thirtyDayStart = addUtcDays(latestDay, -29).getTime();
  const last7d = snapshots.filter((snapshot) => snapshot.snapshot_date.getTime() >= sevenDayStart);
  const last30d = snapshots.filter(
    (snapshot) => snapshot.snapshot_date.getTime() >= thirtyDayStart
  );
  const removalPressure7d = removalPressure(last7d);
  const baseline30d = removalPressure(last30d);
  const pressureChangePercent =
    baseline30d > 0
      ? round(((removalPressure7d - baseline30d) / baseline30d) * 100)
      : removalPressure7d === 0
        ? 0
        : null;

  return {
    updatedAt: latest.updated_at.toISOString(),
    marketplaceId: input.marketplaceId,
    mode: input.mode,
    sample: {
      observed: latest.observed_count,
      clean: latest.clean_count,
      capped: latest.capped,
    },
    summary: {
      activeCount: latest.active_count,
      new7d: last7d.reduce((sum, snapshot) => sum + snapshot.new_count, 0),
      removed7d: last7d.reduce((sum, snapshot) => sum + snapshot.removed_count, 0),
      removalPressure7d,
      baseline30d,
      pressureChangePercent,
      medianAskEur: latest.median_ask_eur,
      lowestAskEur: latest.lowest_ask_eur,
      auctionCount: latest.auction_count,
      fixedCount: latest.fixed_count,
    },
    history: last30d.map((snapshot) => ({
      date: snapshot.snapshot_date.toISOString().slice(0, 10),
      activeCount: snapshot.active_count,
      newCount: snapshot.new_count,
      removedCount: snapshot.removed_count,
      medianAskEur: snapshot.median_ask_eur,
    })),
  };
}

export async function getEbayDemandPayload(input: {
  cardId: string;
  marketplaceId?: string | null;
  mode: EbayDemandMode;
}): Promise<EbayDemandPayload | null> {
  const marketplaceId = input.marketplaceId?.trim() || "EBAY_NL";
  const newest = await db.cardEbayDemandSnapshot.findFirst({
    where: {
      card_id: input.cardId,
      marketplace_id: marketplaceId,
      mode: input.mode,
      ...cohortRevisionWhere(),
    },
    orderBy: [{ snapshot_date: "desc" }, { updated_at: "desc" }],
    select: { snapshot_date: true },
  });
  if (!newest) return null;

  const snapshots = await db.cardEbayDemandSnapshot.findMany({
    where: {
      card_id: input.cardId,
      marketplace_id: marketplaceId,
      mode: input.mode,
      snapshot_date: { gte: addUtcDays(toUtcDay(newest.snapshot_date), -29) },
      ...cohortRevisionWhere(),
    },
    orderBy: { snapshot_date: "asc" },
  });

  return buildEbayDemandPayload({ marketplaceId, mode: input.mode, snapshots });
}

export async function getLatestEbayDemandListings(input: {
  cardId: string;
  marketplaceId?: string | null;
  mode: EbayDemandMode;
  limit?: number;
  offset?: number;
}) {
  const marketplaceId = input.marketplaceId?.trim() || "EBAY_NL";
  const latestSnapshot = await db.cardEbayDemandSnapshot.findFirst({
    where: {
      card_id: input.cardId,
      marketplace_id: marketplaceId,
      mode: input.mode,
      ...cohortRevisionWhere(),
    },
    orderBy: [{ snapshot_date: "desc" }, { updated_at: "desc" }],
    select: { snapshot_date: true },
  });
  if (!latestSnapshot) return [];
  const visibleSince = listingVisibilityStart(latestSnapshot.snapshot_date);

  const limit = Math.min(Math.max(input.limit ?? 12, 1), 100);
  const offset = Math.max(0, Math.floor(input.offset ?? 0));

  const rows = await db.cardEbayDemandListing.findMany({
    where: {
      card_id: input.cardId,
      marketplace_id: marketplaceId,
      mode: input.mode,
      listing_type: "fixed",
      removed_at: null,
      last_seen_at: { gte: visibleSince },
    },
    orderBy: [{ total_eur: "asc" }, { last_seen_at: "desc" }],
    skip: offset,
    take: limit,
  });

  return rows.map((row) => ({
    itemId: row.item_id,
    title: row.title,
    imageUrl: row.image_url,
    itemWebUrl: row.item_web_url,
    listingType: row.listing_type,
    priceEur: row.price_eur,
    shippingEur: row.shipping_eur,
    totalEur: row.total_eur,
    condition: row.condition,
    language: input.mode === "raw"
      ? { code: "ENG", label: "ENG", confidence: "explicit" }
      : null,
    cardCondition: input.mode === "raw"
      ? { code: "near_mint", label: "NM" }
      : null,
    sellerUsername: row.seller_username,
    itemCreationDate: row.item_creation_date?.toISOString() ?? null,
    itemEndDate: row.item_end_date?.toISOString() ?? null,
    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
  }));
}

export async function getLatestEbayDemandListingPage(input: {
  cardId: string;
  marketplaceId?: string | null;
  mode: EbayDemandMode;
  limit?: number;
  offset?: number;
}) {
  const marketplaceId = input.marketplaceId?.trim() || "EBAY_NL";
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 100);
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  const latestSnapshot = await db.cardEbayDemandSnapshot.findFirst({
    where: {
      card_id: input.cardId,
      marketplace_id: marketplaceId,
      mode: input.mode,
      ...cohortRevisionWhere(),
    },
    orderBy: [{ snapshot_date: "desc" }, { updated_at: "desc" }],
    select: { snapshot_date: true },
  });

  if (!latestSnapshot) {
    return { listings: [], total: 0, offset, limit, hasMore: false };
  }
  const visibleSince = listingVisibilityStart(latestSnapshot.snapshot_date);

  const where = {
    card_id: input.cardId,
    marketplace_id: marketplaceId,
    mode: input.mode,
    listing_type: "fixed",
    removed_at: null,
    last_seen_at: { gte: visibleSince },
  };
  const [listings, total] = await Promise.all([
    getLatestEbayDemandListings({ ...input, marketplaceId, limit, offset }),
    db.cardEbayDemandListing.count({ where }),
  ]);

  return {
    listings,
    total,
    offset,
    limit,
    hasMore: offset + listings.length < total,
  };
}

export async function recordEbayDemandScan(input: {
  cardId: string;
  marketplaceId: string;
  mode: EbayDemandMode;
  listings: EbayDealListing[];
  observedCount?: number;
  capped: boolean;
  observedAt?: Date;
}): Promise<EbayDemandPayload> {
  const observedAt = input.observedAt ?? new Date();
  const scanDay = toUtcDay(observedAt);
  const cleanListings = cleanEbayDemandListings(input.listings, input.mode);
  const seenItemIds = new Set(cleanListings.map((listing) => listing.itemId));
  const trackedBefore = await db.cardEbayDemandListing.findMany({
    where: {
      card_id: input.cardId,
      marketplace_id: input.marketplaceId,
      mode: input.mode,
      listing_type: "fixed",
      removed_at: null,
      last_seen_at: { gte: EBAY_DEMAND_COHORT_REVISION_AT },
    },
  });
  for (const listing of cleanListings) {
    const type = listingType(listing);
    await db.cardEbayDemandListing.upsert({
      where: {
        card_id_marketplace_id_mode_item_id: {
          card_id: input.cardId,
          marketplace_id: input.marketplaceId,
          mode: input.mode,
          item_id: listing.itemId,
        },
      },
      create: {
        card_id: input.cardId,
        marketplace_id: input.marketplaceId,
        mode: input.mode,
        item_id: listing.itemId,
        title: listing.title,
        image_url: listing.imageUrl,
        item_web_url: listing.itemWebUrl,
        listing_type: type,
        buying_options_json: JSON.stringify(listing.buyingOptions),
        price_eur: finitePositive(listing.price.valueEur),
        shipping_eur: finitePositive(listing.shipping.valueEur),
        total_eur: finitePositive(listing.total.valueEur),
        currency: listing.price.currency,
        condition: input.mode === "raw" ? "Near Mint" : listing.condition,
        seller_username: listing.seller.username,
        item_creation_date: safeDate(listing.itemCreationDate),
        item_end_date: safeDate(listing.itemEndDate),
        first_seen_at: observedAt,
        last_seen_at: observedAt,
      },
      update: {
        title: listing.title,
        image_url: listing.imageUrl,
        item_web_url: listing.itemWebUrl,
        listing_type: type,
        buying_options_json: JSON.stringify(listing.buyingOptions),
        price_eur: finitePositive(listing.price.valueEur),
        shipping_eur: finitePositive(listing.shipping.valueEur),
        total_eur: finitePositive(listing.total.valueEur),
        currency: listing.price.currency,
        condition: input.mode === "raw" ? "Near Mint" : listing.condition,
        seller_username: listing.seller.username,
        item_creation_date: safeDate(listing.itemCreationDate),
        item_end_date: safeDate(listing.itemEndDate),
        last_seen_at: observedAt,
        missed_scan_count: 0,
        last_missed_on: null,
        removed_at: null,
      },
    });
  }

  if (!input.capped) {
    for (const tracked of trackedBefore) {
      if (seenItemIds.has(tracked.item_id)) continue;
      const lifecycle = getMissingLifecycleUpdate({
        capped: input.capped,
        missedScanCount: tracked.missed_scan_count,
        lastSeenAt: tracked.last_seen_at,
        lastMissedOn: tracked.last_missed_on,
        scanDay,
      });
      if (!lifecycle.shouldUpdate) continue;

      await db.cardEbayDemandListing.update({
        where: { id: tracked.id },
        data: {
          missed_scan_count: lifecycle.missedScanCount,
          last_missed_on: scanDay,
          removed_at: lifecycle.removed ? observedAt : null,
        },
      });
    }
  }

  // Count eBay-confirmed creations cumulatively for the UTC day. Falling out
  // of a later scan must not reduce that day's new-listing metric. When eBay
  // omits itemCreationDate we deliberately leave it out instead of labelling
  // an old first-seen backfill as new.
  const nextDay = addUtcDays(scanDay, 1);
  const trackedCreatedToday = await db.cardEbayDemandListing.findMany({
    where: {
      card_id: input.cardId,
      marketplace_id: input.marketplaceId,
      mode: input.mode,
      listing_type: "fixed",
      last_seen_at: { gte: EBAY_DEMAND_COHORT_REVISION_AT },
      item_creation_date: { gte: scanDay, lt: nextDay },
    },
    select: { item_id: true },
  });
  const newCount = trackedCreatedToday.length;
  const removedCount = await db.cardEbayDemandListing.count({
    where: {
      card_id: input.cardId,
      marketplace_id: input.marketplaceId,
      mode: input.mode,
      listing_type: "fixed",
      last_seen_at: { gte: EBAY_DEMAND_COHORT_REVISION_AT },
      removed_at: { gte: scanDay, lt: nextDay },
    },
  });
  const asks = cleanListings
    .map((listing) => finitePositive(listing.total.valueEur))
    .filter((value): value is number => value != null);
  const auctionCount = cleanListings.filter((listing) => {
    const type = listingType(listing);
    return type === "auction" || type === "mixed";
  }).length;
  const fixedCount = cleanListings.filter((listing) => {
    const type = listingType(listing);
    return type === "fixed" || type === "mixed";
  }).length;

  await db.cardEbayDemandSnapshot.upsert({
    where: {
      card_id_marketplace_id_mode_snapshot_date: {
        card_id: input.cardId,
        marketplace_id: input.marketplaceId,
        mode: input.mode,
        snapshot_date: scanDay,
      },
    },
    create: {
      card_id: input.cardId,
      marketplace_id: input.marketplaceId,
      mode: input.mode,
      snapshot_date: scanDay,
      observed_count: Math.max(input.observedCount ?? input.listings.length, cleanListings.length),
      clean_count: cleanListings.length,
      capped: input.capped,
      active_count: cleanListings.length,
      new_count: newCount,
      removed_count: removedCount,
      median_ask_eur: median(asks),
      lowest_ask_eur: asks.length > 0 ? Math.min(...asks) : null,
      highest_ask_eur: asks.length > 0 ? Math.max(...asks) : null,
      auction_count: auctionCount,
      fixed_count: fixedCount,
    },
    update: {
      observed_count: Math.max(input.observedCount ?? input.listings.length, cleanListings.length),
      clean_count: cleanListings.length,
      capped: input.capped,
      active_count: cleanListings.length,
      new_count: newCount,
      removed_count: removedCount,
      median_ask_eur: median(asks),
      lowest_ask_eur: asks.length > 0 ? Math.min(...asks) : null,
      highest_ask_eur: asks.length > 0 ? Math.max(...asks) : null,
      auction_count: auctionCount,
      fixed_count: fixedCount,
    },
  });

  const payload = await getEbayDemandPayload({
    cardId: input.cardId,
    marketplaceId: input.marketplaceId,
    mode: input.mode,
  });
  if (!payload) throw new Error("eBay demand snapshot was not persisted");
  return payload;
}
