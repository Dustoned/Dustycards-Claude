import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import {
  extractUsefulEbayTitleTokens,
  listingHasExactCardIdentity,
  matchEbayListingToCard,
  type EbayCardMatch,
  type EbayMatchCard,
} from "@/lib/ebay-card-matching";
import {
  COLLECTION_GRADING_COMPANIES,
  getCollectionMatchedGradedPrice,
} from "@/lib/collection";
import { hydrateLatestCardMarketFields } from "@/lib/current-card-prices";
import { db } from "@/lib/db";
import {
  buildEbayCardDemandSearchQuery,
  buildEbayCardSearchQuery,
  buildEbayManualSearchQuery,
  buildEbayMarketplaceSearchUrl,
  buildEbaySealedManualSearchQuery,
  buildEbaySealedSearchQuery,
  compareListingToReference,
  getEbayDemandRuntimeConfig,
  getEbayRuntimeConfig,
  searchEbayDeals,
  type EbayBuyingMode,
  type EbayDealListing,
  type EbayDealReference,
} from "@/lib/ebay";
import { convertUsdToEur, getUsdToEurRate } from "@/lib/exchange-rates";
import { recordEbayDemandScan, type EbayDemandPayload } from "@/lib/ebay-demand";
import { getCardMarketValue } from "@/lib/price-history";
import { getSealedProductPrice } from "@/lib/sealed-products";
import type { Prisma } from "@/generated/prisma";

export const runtime = "nodejs";

type DealMode = "raw" | "graded" | "sealed";
type GradingListingFilter = {
  company: string | null;
  grade: string | null;
  explicit: boolean;
};

const SELECTABLE_GRADING_GRADES = new Set(
  Array.from({ length: 19 }, (_, index) => String(10 - index * 0.5))
);

function parseDealMode(value: string | null): DealMode | null {
  return value === "raw" || value === "graded" || value === "sealed" ? value : null;
}

function parseBuyingMode(value: string | null): EbayBuyingMode | null {
  return value === "fixed" || value === "auction" || value === "all" ? value : null;
}

function normalizeGradingCompany(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase().replace(/[^A-Z]/g, "") ?? "";
  if (!normalized) return null;
  if (normalized === "BECKETT") return "BGS";
  return normalized;
}

function parseGradingCompanyFilter(value: string | null): string | null {
  const normalized = normalizeGradingCompany(value);
  return COLLECTION_GRADING_COMPANIES.find((company) => company === normalized) ?? null;
}

function normalizeGradingGrade(value: string | null | undefined): string | null {
  const parsed = Number(value?.trim());
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 10 || !Number.isInteger(parsed * 2)) {
    return null;
  }
  return String(parsed);
}

function parseGradingGradeFilter(value: string | null): string | null {
  const normalized = normalizeGradingGrade(value);
  return normalized && SELECTABLE_GRADING_GRADES.has(normalized) ? normalized : null;
}

function getGradingSearchContext(filter: GradingListingFilter): string {
  if (filter.company && filter.grade) return `${filter.company} ${filter.grade}`;
  if (filter.company) return filter.company;
  if (filter.grade) return `graded ${filter.grade}`;
  return "graded";
}

function listingMatchesGradingFilter(
  listing: EnrichedEbayDealListing,
  filter: GradingListingFilter
): boolean {
  if (!filter.explicit) return true;

  const listingCompany = normalizeGradingCompany(listing.cardMatch.gradingCompany);
  const listingGrade = normalizeGradingGrade(listing.cardMatch.gradingGrade);
  if (filter.company && listingCompany !== filter.company) return false;
  if (filter.grade && listingGrade !== filter.grade) return false;
  return true;
}

function hasGradedQueryContext(value: string): boolean {
  return /\b(psa|bgs|cgc|sgc|ace|tag|beckett|graded|slab|gem\s*mint|black\s*label|pristine)\b/i.test(
    value
  );
}

function parseLimit(value: string | null): number {
  if (!value?.trim()) return 50;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), 1), 50) : 50;
}

function normalizeGradeToken(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase().replace(/\s+/g, " ");
  return normalized || null;
}

function gradedLabelMatches(input: {
  label: string;
  company?: string | null;
  grade?: string | null;
  targetCompany?: string | null;
  targetGrade?: string | null;
}): boolean {
  const targetCompany = normalizeGradeToken(input.targetCompany);
  const targetGrade = normalizeGradeToken(input.targetGrade);
  if (!targetCompany || !targetGrade) return false;

  const label = normalizeGradeToken(input.label) ?? "";
  const company = normalizeGradeToken(input.company);
  const grade = normalizeGradeToken(input.grade);

  return (
    (company === targetCompany && grade === targetGrade) ||
    (label.includes(targetCompany) && label.includes(targetGrade))
  );
}

async function getCardDealContext(cardId: string, userId: string) {
  const card = await db.card.findUnique({
    where: { id: cardId },
    select: {
      id: true,
      game: true,
      name: true,
      card_number: true,
      printed_card_number: true,
      rarity: true,
      image_url: true,
      episode: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      prices: {
        where: {
          OR: [
            { cm_en_lowest_nm: { gt: 0, not: 9001 } },
            { tcp_market: { gt: 0, not: 9001 } },
          ],
        },
        orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          cm_en_lowest_nm: true,
          cm_de_lowest_nm: true,
          cm_fr_lowest_nm: true,
          cm_es_lowest_nm: true,
          cm_it_lowest_nm: true,
          tcp_market: true,
        },
      },
      gradedPrices: {
        orderBy: [{ price: "desc" }, { label: "asc" }],
        select: {
          label: true,
          price: true,
        },
      },
      ebaySoldGradedPrices: {
        orderBy: [{ median_price: "desc" }, { label: "asc" }],
        select: {
          source: true,
          label: true,
          company: true,
          grade: true,
          median_price: true,
          currency: true,
          sample_size: true,
        },
      },
      collectionItems: {
        where: { user_id: userId, for_sale: false, sold_at: null },
        orderBy: { updated_at: "desc" },
        take: 1,
        select: {
          grading_company: true,
          grading_grade: true,
        },
      },
    },
  });

  if (!card) return null;

  const [hydratedCard] = await hydrateLatestCardMarketFields([card]);
  const latestPrice = hydratedCard.prices[0] ?? null;
  const collectionItem = card.collectionItems[0] ?? null;
  const hasSavedGrade = Boolean(collectionItem?.grading_company && collectionItem.grading_grade);

  return {
    ...hydratedCard,
    latestPrice,
    collectionItem,
    hasSavedGrade,
  };
}

type CardDealContext = NonNullable<Awaited<ReturnType<typeof getCardDealContext>>>;
type SealedDealContext = NonNullable<Awaited<ReturnType<typeof getSealedDealContext>>>;

function getCardSearchNumber(card: CardDealContext): string | null {
  return card.printed_card_number?.trim() || card.card_number?.trim() || null;
}

type EnrichedEbayDealListing = EbayDealListing & {
  reference: EbayDealReference;
  cardMatch: EbayCardMatch;
};

const NO_MATCH_REFERENCE: EbayDealReference = {
  label: "No matched DustyCards card",
  valueEur: null,
  source: "none",
};

const GRADE_AGNOSTIC_DEMAND_REFERENCE: EbayDealReference = {
  label: "All graded listings",
  valueEur: null,
  source: "none",
};

function getNoCardMatchForListing(listing: EbayDealListing, reason: string): EbayCardMatch {
  return {
    status: "unmatched",
    confidence: 0,
    reason,
    source: "auto",
    card: null,
    candidates: [],
    isGradedListing: listing.isGradedListing,
    gradingCompany: null,
    gradingGrade: null,
  };
}

async function getSealedDealContext(productId: string) {
  const product = await db.sealedProduct.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      image_url: true,
      cm_lowest: true,
      cm_lowest_eu: true,
      cm_lowest_de: true,
      cm_lowest_fr: true,
      cm_lowest_es: true,
      cm_lowest_it: true,
      episode: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  });

  if (!product) return null;

  return {
    ...product,
    referenceValue: getSealedProductPrice({
      price: {
        cm_lowest: product.cm_lowest,
        cm_lowest_eu: product.cm_lowest_eu,
        cm_lowest_de: product.cm_lowest_de,
        cm_lowest_fr: product.cm_lowest_fr,
        cm_lowest_es: product.cm_lowest_es,
        cm_lowest_it: product.cm_lowest_it,
      },
    }),
  };
}

function toMatchCard(card: CardDealContext): EbayMatchCard {
  return {
    id: card.id,
    name: card.name,
    card_number: getCardSearchNumber(card),
    rarity: card.rarity,
    image_url: card.image_url,
    episode: card.episode,
  };
}

function listingHasPinnedCardHint(listing: EbayDealListing, card: CardDealContext): boolean {
  return listingHasExactCardIdentity({
    title: listing.title,
    condition: listing.condition,
    card: toMatchCard(card),
  });
}

function getPinnedReviewMatch(input: {
  card: CardDealContext;
  match: EbayCardMatch;
}): EbayCardMatch {
  const card = toMatchCard(input.card);
  const confidence = Math.max(input.match.confidence, 30);

  return {
    ...input.match,
    status: "review",
    confidence,
    reason:
      input.match.reason === "No DustyCards card match"
        ? "Exact card search; review listing"
        : input.match.reason,
    card,
    candidates:
      input.match.candidates.length > 0
        ? input.match.candidates
        : [{ card, confidence, reason: "Exact card search" }],
  };
}

function getCandidateNumbers(value: string): string[] {
  const seen = new Set<string>();
  const numbers: string[] = [];
  for (const match of value.matchAll(/\b\d{1,3}[a-z]?\b/gi)) {
    const normalized = match[0].replace(/^0+/, "") || match[0];
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    numbers.push(normalized);
  }
  return numbers;
}

function uniqueDealQueries(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const queries: string[] = [];

  for (const value of values) {
    const query = value?.trim();
    if (!query) continue;

    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push(query);
  }

  return queries;
}

function buildLooseCardDealQuery(input: {
  card: CardDealContext;
  mode: Exclude<DealMode, "sealed">;
  includeNumber?: boolean;
  includeSetCode?: boolean;
  gradingFilter?: GradingListingFilter;
}): string {
  const parts = [
    input.card.name,
    input.includeNumber ? getCardSearchNumber(input.card) : null,
    input.includeSetCode ? input.card.episode.code : null,
    input.mode === "graded"
      ? getGradingSearchContext(
          input.gradingFilter ?? { company: null, grade: null, explicit: false }
        )
      : null,
    "Pokemon",
  ];

  return buildEbayManualSearchQuery(parts.filter(Boolean).join(" "));
}

function buildCardDealSearchQueries(input: {
  card: CardDealContext;
  mode: Exclude<DealMode, "sealed">;
  primaryQuery: string;
  gradingFilter: GradingListingFilter;
}): string[] {
  return uniqueDealQueries([
    input.primaryQuery,
    buildLooseCardDealQuery({
      card: input.card,
      mode: input.mode,
      includeNumber: true,
      includeSetCode: true,
      gradingFilter: input.gradingFilter.explicit ? input.gradingFilter : undefined,
    }),
    buildLooseCardDealQuery({
      card: input.card,
      mode: input.mode,
      includeNumber: true,
      gradingFilter: input.gradingFilter.explicit ? input.gradingFilter : undefined,
    }),
    buildLooseCardDealQuery({
      card: input.card,
      mode: input.mode,
      gradingFilter: input.gradingFilter.explicit ? input.gradingFilter : undefined,
    }),
  ]);
}

function buildCandidateCardWhere(query: string, listings: EbayDealListing[]): Prisma.CardWhereInput | null {
  const combinedText = [query, ...listings.map((listing) => listing.title)].join(" ");
  const tokens = [...new Set(extractUsefulEbayTitleTokens(combinedText))].slice(0, 18);
  const numbers = getCandidateNumbers(combinedText).slice(0, 18);
  const conditions: Prisma.CardWhereInput[] = [
    ...tokens.map((token) => ({
      OR: [
        { name: { contains: token } },
        { episode: { name: { contains: token } } },
        { episode: { code: { contains: token.toUpperCase() } } },
      ],
    })),
    ...numbers.map((number) => ({
      OR: [
        { card_number: { contains: number } },
        { printed_card_number: { contains: number } },
      ],
    })),
  ];

  if (conditions.length === 0) return null;
  return { OR: conditions };
}

function buildFocusedCandidateCardWhere(query: string): Prisma.CardWhereInput | null {
  const tokens = [...new Set(extractUsefulEbayTitleTokens(query))].slice(0, 4);
  const numbers = getCandidateNumbers(query).slice(0, 4);
  if (tokens.length === 0 || numbers.length === 0) return null;

  return {
    AND: [
      {
        OR: tokens.map((token) => ({ name: { contains: token } })),
      },
      {
        OR: numbers.flatMap((number) => [
          { card_number: { contains: number } },
          { printed_card_number: { contains: number } },
        ]),
      },
    ],
  };
}

function buildNameFocusedCandidateCardWhere(query: string): Prisma.CardWhereInput | null {
  const tokens = [...new Set(extractUsefulEbayTitleTokens(query))]
    .filter((token) => token.length >= 4)
    .filter((token) => !["graded", "slab", "gem", "mint", "black", "label", "pristine"].includes(token))
    .slice(0, 4);

  if (tokens.length === 0) return null;

  return {
    OR: tokens.map((token) => ({ name: { contains: token } })),
  };
}

async function getCandidateCardContexts(input: {
  query: string;
  listings: EbayDealListing[];
  userId: string;
  pinnedCard: CardDealContext | null;
}): Promise<CardDealContext[]> {
  if (input.pinnedCard) return [input.pinnedCard];

  const focusedWhere = buildFocusedCandidateCardWhere(input.query);
  const focusedCardIds = focusedWhere
    ? (
        await db.card.findMany({
          where: focusedWhere,
          take: 80,
          orderBy: [{ episode: { release_date: "desc" } }, { name: "asc" }, { card_number: "asc" }],
          select: { id: true },
        })
      ).map((card) => card.id)
    : [];
  const focusedContexts = (
    await Promise.all(focusedCardIds.map((id) => getCardDealContext(id, input.userId)))
  ).filter((card): card is CardDealContext => Boolean(card));

  const nameFocusedWhere = buildNameFocusedCandidateCardWhere(input.query);
  const nameFocusedCardIds = nameFocusedWhere
    ? (
        await db.card.findMany({
          where: nameFocusedWhere,
          take: 160,
          orderBy: [{ episode: { release_date: "desc" } }, { name: "asc" }, { card_number: "asc" }],
          select: { id: true },
        })
      ).map((card) => card.id)
    : [];
  const nameFocusedContexts = (
    await Promise.all(nameFocusedCardIds.map((id) => getCardDealContext(id, input.userId)))
  ).filter((card): card is CardDealContext => Boolean(card));

  const where = buildCandidateCardWhere(input.query, input.listings);
  if (!where) {
    const byId = new Map<string, CardDealContext>();
    for (const card of [...focusedContexts, ...nameFocusedContexts]) {
      byId.set(card.id, card);
    }
    return [...byId.values()];
  }

  const cards = await db.card.findMany({
    where,
    take: 420,
    orderBy: [{ episode: { release_date: "desc" } }, { name: "asc" }, { card_number: "asc" }],
    select: {
      id: true,
      game: true,
      name: true,
      card_number: true,
      printed_card_number: true,
      rarity: true,
      image_url: true,
      episode: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      prices: {
        where: {
          OR: [
            { cm_en_lowest_nm: { gt: 0, not: 9001 } },
            { tcp_market: { gt: 0, not: 9001 } },
          ],
        },
        orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          cm_en_lowest_nm: true,
          cm_de_lowest_nm: true,
          cm_fr_lowest_nm: true,
          cm_es_lowest_nm: true,
          cm_it_lowest_nm: true,
          tcp_market: true,
        },
      },
      gradedPrices: {
        orderBy: [{ price: "desc" }, { label: "asc" }],
        select: {
          label: true,
          price: true,
        },
      },
      ebaySoldGradedPrices: {
        orderBy: [{ median_price: "desc" }, { label: "asc" }],
        select: {
          source: true,
          label: true,
          company: true,
          grade: true,
          median_price: true,
          currency: true,
          sample_size: true,
        },
      },
      collectionItems: {
        where: { user_id: input.userId, for_sale: false, sold_at: null },
        orderBy: { updated_at: "desc" },
        take: 1,
        select: {
          grading_company: true,
          grading_grade: true,
        },
      },
    },
  });

  const hydratedCards = await hydrateLatestCardMarketFields(cards);
  const broadContexts = hydratedCards.map((card) => {
    const latestPrice = card.prices[0] ?? null;
    const collectionItem = card.collectionItems[0] ?? null;
    const hasSavedGrade = Boolean(collectionItem?.grading_company && collectionItem.grading_grade);

    return {
      ...card,
      latestPrice,
      collectionItem,
      hasSavedGrade,
    };
  });
  const byId = new Map<string, CardDealContext>();
  for (const card of [...focusedContexts, ...nameFocusedContexts, ...broadContexts]) {
    byId.set(card.id, card);
  }

  return [...byId.values()];
}

async function getListingOverrides(input: {
  itemIds: string[];
  marketplaceId: string;
  userId: string;
}): Promise<Map<string, { status: "confirmed" | "ignored"; card: EbayMatchCard | null }>> {
  if (input.itemIds.length === 0) return new Map<string, { status: "confirmed" | "ignored"; card: EbayMatchCard | null }>();

  const overrides = await db.ebayListingCardOverride.findMany({
    where: {
      user_id: input.userId,
      marketplace_id: input.marketplaceId,
      item_id: { in: input.itemIds },
    },
    select: {
      item_id: true,
      status: true,
      card: {
        select: {
          id: true,
          name: true,
          card_number: true,
          rarity: true,
          image_url: true,
          episode: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
    },
  });

  return new Map(
    overrides.map((override) => {
      const status: "confirmed" | "ignored" =
        override.status === "ignored" ? "ignored" : "confirmed";
      return [
        override.item_id,
        {
          status,
          card: override.card,
        },
      ];
    })
  );
}

function compareEnrichedListings(
  a: EnrichedEbayDealListing,
  b: EnrichedEbayDealListing
): number {
  const statusRank = {
    matched: 0,
    review: 1,
    unmatched: 2,
  } satisfies Record<
    EnrichedEbayDealListing["cardMatch"]["status"],
    number
  >;
  const statusDiff =
    statusRank[a.cardMatch.status] - statusRank[b.cardMatch.status];

  if (statusDiff !== 0) return statusDiff;

  const aScore = a.dealScore ?? Number.NEGATIVE_INFINITY;
  const bScore = b.dealScore ?? Number.NEGATIVE_INFINITY;

  if (aScore !== bScore) return bScore - aScore;

  if (a.cardMatch.confidence !== b.cardMatch.confidence) {
    return b.cardMatch.confidence - a.cardMatch.confidence;
  }

  const aTotal = a.total.valueEur ?? a.total.value;
  const bTotal = b.total.valueEur ?? b.total.value;

  if (aTotal !== bTotal) return aTotal - bTotal;

  return a.title.localeCompare(b.title, "nl", { sensitivity: "base" });
}

async function enrichListingsWithCardMatches(input: {
  listings: EbayDealListing[];
  query: string;
  userId: string;
  mode: Exclude<DealMode, "sealed">;
  marketplaceId: string;
  pinnedCard: CardDealContext | null;
  gradingFilter: GradingListingFilter;
}): Promise<EnrichedEbayDealListing[]> {
  const candidateContexts = await getCandidateCardContexts({
    query: input.query,
    listings: input.listings,
    userId: input.userId,
    pinnedCard: input.pinnedCard,
  });
  const cardContextById = new Map(candidateContexts.map((card) => [card.id, card]));
  const matchCandidates = candidateContexts.map(toMatchCard);
  const overrides = await getListingOverrides({
    itemIds: input.listings.map((listing) => listing.itemId),
    marketplaceId: input.marketplaceId,
    userId: input.userId,
  });
  const enriched: EnrichedEbayDealListing[] = [];

  for (const listing of input.listings) {
    let cardMatch = matchEbayListingToCard({
      title: listing.title,
      condition: listing.condition,
      candidates: matchCandidates,
      requestedMode: input.mode,
      override: overrides.get(listing.itemId) ?? null,
    });

    if (input.pinnedCard) {
      if (cardMatch.source === "ignored") continue;
      if (cardMatch.card && cardMatch.card.id !== input.pinnedCard.id) continue;
      if (!listingHasPinnedCardHint(listing, input.pinnedCard)) continue;
      if (cardMatch.status === "unmatched") {
        cardMatch = getPinnedReviewMatch({ card: input.pinnedCard, match: cardMatch });
      }
    }

    let reference = NO_MATCH_REFERENCE;
    let comparison: Pick<
      EbayDealListing,
      "discountPercent" | "differenceEur" | "dealScore" | "dealTone"
    > = {
      discountPercent: null,
      differenceEur: null,
      dealScore: null,
      dealTone: "unknown" as const,
    };

    if (input.pinnedCard && cardMatch.card?.id === input.pinnedCard.id) {
      reference = await buildReferenceForCard(
        input.pinnedCard,
        input.mode,
        input.gradingFilter
      );
      comparison = compareListingToReference({
        totalPriceEur: listing.total.valueEur,
        referencePriceEur: reference.valueEur,
      });
    } else if (cardMatch.status === "matched" && cardMatch.card) {
      let cardContext = cardContextById.get(cardMatch.card.id) ?? null;
      if (!cardContext) {
        cardContext = await getCardDealContext(cardMatch.card.id, input.userId);
        if (cardContext) cardContextById.set(cardContext.id, cardContext);
      }

      if (cardContext) {
        reference = await buildReferenceForCard(
          cardContext,
          input.mode,
          input.gradingFilter
        );
        comparison = compareListingToReference({
          totalPriceEur: listing.total.valueEur,
          referencePriceEur: reference.valueEur,
        });
      }
    }

    enriched.push({
      ...listing,
      reference,
      cardMatch,
      ...comparison,
    });
  }

  const sorted = enriched.sort(compareEnrichedListings);
  if (
    sorted.length === 0 &&
    input.mode === "graded" &&
    input.pinnedCard &&
    input.listings.length > 0
  ) {
    return enrichListingsWithCardMatches({
      ...input,
      pinnedCard: null,
    });
  }

  return sorted;
}

async function enrichDemandListingsWithPinnedCard(input: {
  listings: EbayDealListing[];
  mode: Exclude<DealMode, "sealed">;
  card: CardDealContext;
  reference: EbayDealReference;
}): Promise<EnrichedEbayDealListing[]> {
  const candidate = toMatchCard(input.card);
  const reference = input.reference;

  return input.listings.flatMap((listing): EnrichedEbayDealListing[] => {
    const cardMatch = matchEbayListingToCard({
      title: listing.title,
      condition: listing.condition,
      candidates: [candidate],
      requestedMode: input.mode,
    });
    if (
      cardMatch.status !== "matched" ||
      cardMatch.card?.id !== input.card.id ||
      !listingHasPinnedCardHint(listing, input.card)
    ) {
      return [];
    }

    const comparison = compareListingToReference({
      totalPriceEur: listing.total.valueEur,
      referencePriceEur: reference.valueEur,
    });
    return [{ ...listing, reference, cardMatch, ...comparison }];
  }).sort(compareEnrichedListings);
}

function enrichListingsWithSealedReference(input: {
  listings: EbayDealListing[];
  reference: EbayDealReference;
}): EnrichedEbayDealListing[] {
  return input.listings
    .map((listing) => {
      const comparison = compareListingToReference({
        totalPriceEur: listing.total.valueEur,
        referencePriceEur: input.reference.valueEur,
      });

      return {
        ...listing,
        reference: input.reference,
        cardMatch: getNoCardMatchForListing(listing, "Sealed product listing"),
        ...comparison,
      };
    })
    .sort(compareEnrichedListings);
}

async function buildReferenceForCard(
  card: CardDealContext,
  mode: Exclude<DealMode, "sealed">,
  gradingFilter: GradingListingFilter = { company: null, grade: null, explicit: false }
): Promise<EbayDealReference> {
  if (mode === "graded") {
    if (gradingFilter.explicit && (!gradingFilter.company || !gradingFilter.grade)) {
      return {
        label: `${getGradingSearchContext(gradingFilter)} listings`,
        valueEur: null,
        source: "none",
      };
    }

    const targetCompany = gradingFilter.explicit
      ? gradingFilter.company
      : card.collectionItem?.grading_company;
    const targetGrade = gradingFilter.explicit
      ? gradingFilter.grade
      : card.collectionItem?.grading_grade;
    const usdToEurRate = card.ebaySoldGradedPrices.some(
      (price) => price.currency.toUpperCase() === "USD"
    )
      ? await getUsdToEurRate()
      : null;
    const matchedGradedPrice = getCollectionMatchedGradedPrice(
      {
        gradedPrices: card.gradedPrices,
        ebaySoldGradedPrices: card.ebaySoldGradedPrices,
      },
      {
        gradingCompany: targetCompany,
        gradingGrade: targetGrade,
        usdToEurRate,
      }
    );

    if (matchedGradedPrice) {
      return {
        label: matchedGradedPrice.label,
        valueEur: matchedGradedPrice.price,
        source: matchedGradedPrice.source === "ebay_sold_graded" ? "ebay_sold_graded" : "graded",
      };
    }

    const matchedEbaySoldGradedPrice =
      card.ebaySoldGradedPrices.find((price) =>
        gradedLabelMatches({
          label: price.label,
          company: price.company,
          grade: price.grade,
          targetCompany,
          targetGrade,
        })
      ) ?? null;

    if (matchedEbaySoldGradedPrice) {
      const currency = matchedEbaySoldGradedPrice.currency.toUpperCase();
      const valueEur =
        currency === "EUR"
          ? matchedEbaySoldGradedPrice.median_price
          : currency === "USD"
            ? convertUsdToEur(matchedEbaySoldGradedPrice.median_price, usdToEurRate)
            : null;

      return {
        label: matchedEbaySoldGradedPrice.label,
        valueEur,
        source: "ebay_sold_graded",
      };
    }

    if (gradingFilter.explicit) {
      return {
        label: `${getGradingSearchContext(gradingFilter)} listings`,
        valueEur: null,
        source: "none",
      };
    }

    const fallbackEbaySoldGradedPrice = card.ebaySoldGradedPrices[0] ?? null;
    if (fallbackEbaySoldGradedPrice) {
      const currency = fallbackEbaySoldGradedPrice.currency.toUpperCase();
      const valueEur =
        currency === "EUR"
          ? fallbackEbaySoldGradedPrice.median_price
          : currency === "USD"
            ? convertUsdToEur(fallbackEbaySoldGradedPrice.median_price, usdToEurRate)
            : null;

      return {
        label: fallbackEbaySoldGradedPrice.label,
        valueEur,
        source: "ebay_sold_graded",
      };
    }

    const fallbackGradedPrice = card.gradedPrices[0] ?? null;
    if (fallbackGradedPrice) {
      return {
        label: fallbackGradedPrice.label,
        valueEur: fallbackGradedPrice.price,
        source: "graded",
      };
    }
  }

  const cardMarketValue = getCardMarketValue(card.latestPrice);
  if (cardMarketValue != null) {
    return {
      label: "CardMarket raw",
      valueEur: cardMarketValue,
      source: "cardmarket",
    };
  }

  if (card.latestPrice?.tcp_market != null) {
    const usdToEurRate = await getUsdToEurRate();
    return {
      label: "TCGPlayer raw",
      valueEur: convertUsdToEur(card.latestPrice.tcp_market, usdToEurRate),
      source: "tcgplayer",
    };
  }

  return {
    label: "No DustyCards price",
    valueEur: null,
    source: "none",
  };
}

function buildReferenceForSealed(product: SealedDealContext): EbayDealReference {
  if (product.referenceValue != null) {
    return {
      label: "CardMarket sealed",
      valueEur: product.referenceValue,
      source: "sealed",
    };
  }

  return {
    label: "No DustyCards sealed price",
    valueEur: null,
    source: "none",
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const demandProfile = req.nextUrl.searchParams.get("profile") === "demand";
    const config = demandProfile
      ? getEbayDemandRuntimeConfig()
      : getEbayRuntimeConfig();
    const cardId = req.nextUrl.searchParams.get("cardId")?.trim() ?? "";
    const productId = req.nextUrl.searchParams.get("productId")?.trim() ?? "";
    const q = cardId || productId ? "" : (req.nextUrl.searchParams.get("q")?.trim() ?? "");
    const requestedMode = parseDealMode(req.nextUrl.searchParams.get("mode"));
    const requestedBuyingMode = parseBuyingMode(req.nextUrl.searchParams.get("buying"));
    const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
    const gradingCompany = parseGradingCompanyFilter(
      req.nextUrl.searchParams.get("grader")
    );
    const gradingGrade = parseGradingGradeFilter(req.nextUrl.searchParams.get("grade"));
    const gradingFilter: GradingListingFilter = {
      company: gradingCompany,
      grade: gradingGrade,
      explicit: Boolean(gradingCompany || gradingGrade),
    };

    let mode: DealMode = requestedMode ?? (productId ? "sealed" : "raw");
    let query = q
      ? mode === "sealed"
        ? buildEbaySealedManualSearchQuery(q)
        : buildEbayManualSearchQuery(q)
      : "";
    let reference: EbayDealReference = {
      label: "No DustyCards price",
      valueEur: null,
      source: "none",
    };
    let card: Awaited<ReturnType<typeof getCardDealContext>> = null;
    let sealedProduct: Awaited<ReturnType<typeof getSealedDealContext>> = null;

    if (cardId) {
      card = await getCardDealContext(cardId, user.id);
      if (!card) {
        return NextResponse.json({ error: "Card not found" }, { status: 404 });
      }

      const cardMode: Exclude<DealMode, "sealed"> =
        requestedMode === "raw" || requestedMode === "graded"
          ? requestedMode
          : card.hasSavedGrade
            ? "graded"
            : "raw";
      const useGenericGradedDemand = demandProfile && cardMode === "graded";
      mode = cardMode;
      reference = useGenericGradedDemand
        ? GRADE_AGNOSTIC_DEMAND_REFERENCE
        : await buildReferenceForCard(card, cardMode, gradingFilter);

      if (!query) {
        if (demandProfile) {
          // Match the broad exact-card query used by the complete For Sale
          // pipeline. Expansion names/codes severely undercount listings whose
          // titles only contain the name and collector number. The strict
          // post-fetch filters below still enforce the selected market mode.
          query = buildEbayCardDemandSearchQuery({
            name: card.name,
            game: card.game === "one-piece" ? "one-piece" : "pokemon",
            cardNumber: getCardSearchNumber(card),
          });
        } else {
          query = buildEbayCardSearchQuery({
            name: card.name,
            game: card.game === "one-piece" ? "one-piece" : "pokemon",
            episodeName: card.episode.name,
            episodeCode: card.episode.code,
            cardNumber: getCardSearchNumber(card),
            gradingCompany: gradingFilter.explicit
              ? gradingFilter.company
              : card.collectionItem?.grading_company,
            gradingGrade: gradingFilter.explicit
              ? gradingFilter.grade
              : card.collectionItem?.grading_grade,
            mode: cardMode,
          });
        }
      }
    } else if (productId) {
      sealedProduct = await getSealedDealContext(productId);
      if (!sealedProduct) {
        return NextResponse.json({ error: "Sealed product not found" }, { status: 404 });
      }

      mode = "sealed";
      reference = buildReferenceForSealed(sealedProduct);

      if (!query) {
        query = buildEbaySealedSearchQuery({
          name: sealedProduct.name,
          episodeName: sealedProduct.episode.name,
          episodeCode: sealedProduct.episode.code,
        });
      }
    }

    if (q && mode === "graded" && gradingFilter.explicit) {
      query = buildEbayManualSearchQuery(`${getGradingSearchContext(gradingFilter)} ${q}`);
    } else if (q && mode === "graded" && !hasGradedQueryContext(q)) {
      query = buildEbayManualSearchQuery(`${q} graded`);
    }

    // Demand measures clean active fixed-price supply. Ignore legacy
    // `buying=all` clients here so auctions cannot enter the shared cohort or
    // consume extra Browse API quota.
    const buyingMode =
      demandProfile && mode !== "sealed"
        ? "fixed"
        : requestedBuyingMode ?? (mode === "sealed" ? "all" : "fixed");

    if (!query) {
      return NextResponse.json({
        configured: config.configured,
        query,
        reference,
        card: null,
        sealedProduct: sealedProduct
          ? {
              id: sealedProduct.id,
              name: sealedProduct.name,
              image_url: sealedProduct.image_url,
              episode: sealedProduct.episode,
            }
          : null,
        mode,
        marketplaceId: config.marketplaceId,
        deliveryCountry: config.deliveryCountry,
        buyingMode,
        total: 0,
        listings: [],
        directSearchUrl: buildEbayMarketplaceSearchUrl(
          query,
          config.marketplaceId,
          mode === "graded" || mode === "sealed" ? null : config.categoryId
        ),
      });
    }

    const searchConfig =
      !demandProfile && (mode === "graded" || mode === "sealed")
        ? { ...config, categoryId: null }
        : config;
    const searchListingKind = mode === "sealed" ? "sealed" : mode === "graded" ? "graded" : "card";
    const runDealSearch = (searchQuery: string) =>
      searchEbayDeals({
        query: searchQuery,
        reference,
        limit,
        buyingMode,
        config: searchConfig,
        strictEnglish: demandProfile && mode !== "sealed",
        strictNearMint: demandProfile && mode === "raw",
        excludeGraded: mode === "raw",
        requireGraded: mode === "graded",
        listingKind: searchListingKind,
      });

    const searchQueries = card
      ? demandProfile
        ? [query]
        : buildCardDealSearchQueries({
            card,
            mode: mode === "graded" ? "graded" : "raw",
            primaryQuery: query,
            gradingFilter,
          })
      : sealedProduct
        ? uniqueDealQueries([query])
        : [query];
    const mergedListingsByItemId = new Map<string, EbayDealListing>();
    const maxCandidateListings = card ? Math.max(limit * 3, limit) : limit;
    let result: Awaited<ReturnType<typeof runDealSearch>> | null = null;

    for (const searchQuery of searchQueries) {
      const nextResult = await runDealSearch(searchQuery);
      if (!result || (result.listings.length === 0 && nextResult.listings.length > 0)) {
        result = nextResult;
        query = nextResult.query;
      }

      for (const listing of nextResult.listings) {
        if (mergedListingsByItemId.has(listing.itemId)) continue;
        mergedListingsByItemId.set(listing.itemId, listing);
      }

      if (mergedListingsByItemId.size >= maxCandidateListings) {
        break;
      }
    }
    result = {
      ...(result ?? (await runDealSearch(query))),
      listings: [...mergedListingsByItemId.values()],
      total: mergedListingsByItemId.size,
    };
    const listings =
      demandProfile && card && mode !== "sealed"
        ? await enrichDemandListingsWithPinnedCard({
            listings: result.listings,
            mode,
            card,
            reference,
          })
        : mode === "sealed"
        ? enrichListingsWithSealedReference({
            listings: result.listings,
            reference,
          })
        : await enrichListingsWithCardMatches({
            listings: result.listings,
            query,
            userId: user.id,
            mode,
            marketplaceId: result.marketplaceId,
            pinnedCard: card,
            gradingFilter,
          });
    const gradingFilteredListings =
      mode === "graded" && gradingFilter.explicit
        ? listings.filter((listing) => listingMatchesGradingFilter(listing, gradingFilter))
        : listings;
    const limitedListings =
      card || sealedProduct ? gradingFilteredListings.slice(0, limit) : gradingFilteredListings;
    let demand: EbayDemandPayload | null = null;

    if (demandProfile && card && (mode === "raw" || mode === "graded")) {
      const exactCardListings = listings.filter(
        (listing) =>
          listing.cardMatch.status === "matched" && listing.cardMatch.card?.id === card.id
      );

      try {
        demand = await recordEbayDemandScan({
          cardId: card.id,
          marketplaceId: result.marketplaceId,
          mode,
          listings: exactCardListings,
          observedCount: result.scan?.fetchedCount ?? result.listings.length,
          capped: result.scan?.capped ?? result.listings.length >= limit,
        });
      } catch (error) {
        // eBay deals must remain usable if demand persistence is temporarily
        // unavailable (for example while a migration is still rolling out).
        console.error("[ebay-demand] could not record scan", error);
      }
    }

    return NextResponse.json({
      configured: config.configured,
      reference,
      card: card
        ? {
            id: card.id,
            name: card.name,
            card_number: card.card_number,
            image_url: card.image_url,
            episode: card.episode,
            has_saved_grade: card.hasSavedGrade,
          }
        : null,
      sealedProduct: sealedProduct
        ? {
            id: sealedProduct.id,
            name: sealedProduct.name,
            image_url: sealedProduct.image_url,
            episode: sealedProduct.episode,
          }
        : null,
      mode,
      ...result,
      total:
        card || sealedProduct || (mode === "graded" && gradingFilter.explicit)
          ? limitedListings.length
          : result.total,
      listings: limitedListings,
      demand,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
