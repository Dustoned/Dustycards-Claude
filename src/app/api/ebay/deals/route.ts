import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import {
  extractUsefulEbayTitleTokens,
  matchEbayListingToCard,
  type EbayCardMatch,
  type EbayMatchCard,
} from "@/lib/ebay-card-matching";
import { getCollectionMatchedGradedPrice } from "@/lib/collection";
import { db } from "@/lib/db";
import {
  buildEbayCardSearchQuery,
  buildEbayManualSearchQuery,
  buildEbayMarketplaceSearchUrl,
  buildEbaySealedManualSearchQuery,
  buildEbaySealedSearchQuery,
  compareListingToReference,
  getEbayRuntimeConfig,
  searchEbayDeals,
  type EbayBuyingMode,
  type EbayDealListing,
  type EbayDealReference,
} from "@/lib/ebay";
import { convertUsdToEur, getUsdToEurRate } from "@/lib/exchange-rates";
import { getCardMarketValue } from "@/lib/price-history";
import { getSealedProductPrice } from "@/lib/sealed-products";
import type { Prisma } from "@/generated/prisma";

export const runtime = "nodejs";

type DealMode = "raw" | "graded" | "sealed";

function parseDealMode(value: string | null): DealMode | null {
  return value === "raw" || value === "graded" || value === "sealed" ? value : null;
}

function parseBuyingMode(value: string | null): EbayBuyingMode {
  return value === "auction" || value === "all" ? value : "fixed";
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
      prices: {
        orderBy: { fetched_at: "desc" },
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
        where: { user_id: userId },
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

  const latestPrice = card.prices[0] ?? null;
  const collectionItem = card.collectionItems[0] ?? null;
  const hasSavedGrade = Boolean(collectionItem?.grading_company && collectionItem.grading_grade);

  return {
    ...card,
    latestPrice,
    collectionItem,
    hasSavedGrade,
  };
}

type CardDealContext = NonNullable<Awaited<ReturnType<typeof getCardDealContext>>>;
type SealedDealContext = NonNullable<Awaited<ReturnType<typeof getSealedDealContext>>>;

type EnrichedEbayDealListing = EbayDealListing & {
  reference: EbayDealReference;
  cardMatch: EbayCardMatch;
};

const NO_MATCH_REFERENCE: EbayDealReference = {
  label: "No matched DustyCards card",
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
    card_number: card.card_number,
    rarity: card.rarity,
    image_url: card.image_url,
    episode: card.episode,
  };
}

function listingHasPinnedCardHint(listing: EbayDealListing, card: CardDealContext): boolean {
  const listingTokens = new Set(
    extractUsefulEbayTitleTokens(`${listing.title} ${listing.condition ?? ""}`)
  );
  const cardNameTokens = extractUsefulEbayTitleTokens(card.name);
  const hasNameHint = cardNameTokens.some((token) => listingTokens.has(token));
  const cardNumberToken = getCandidateNumbers(card.card_number ?? "")[0] ?? null;
  const listingNumbers = new Set(getCandidateNumbers(`${listing.title} ${listing.condition ?? ""}`));

  return hasNameHint || Boolean(cardNumberToken && listingNumbers.has(cardNumberToken));
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
}): string {
  const parts = [
    input.card.name,
    input.includeNumber ? input.card.card_number : null,
    input.includeSetCode ? input.card.episode.code : null,
    input.mode === "graded" ? "graded" : null,
    "Pokemon",
  ];

  return buildEbayManualSearchQuery(parts.filter(Boolean).join(" "));
}

function buildCardDealSearchQueries(input: {
  card: CardDealContext;
  mode: Exclude<DealMode, "sealed">;
  primaryQuery: string;
}): string[] {
  return uniqueDealQueries([
    input.primaryQuery,
    buildLooseCardDealQuery({
      card: input.card,
      mode: input.mode,
      includeNumber: true,
      includeSetCode: true,
    }),
    buildLooseCardDealQuery({
      card: input.card,
      mode: input.mode,
      includeNumber: true,
    }),
    buildLooseCardDealQuery({
      card: input.card,
      mode: input.mode,
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
    ...numbers.map((number) => ({ card_number: { contains: number } })),
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
        OR: numbers.map((number) => ({ card_number: { contains: number } })),
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
      prices: {
        orderBy: { fetched_at: "desc" },
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
        where: { user_id: input.userId },
        orderBy: { updated_at: "desc" },
        take: 1,
        select: {
          grading_company: true,
          grading_grade: true,
        },
      },
    },
  });

  const broadContexts = cards.map((card) => {
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
      if (cardMatch.status === "unmatched") {
        if (!listingHasPinnedCardHint(listing, input.pinnedCard)) continue;
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
      reference = await buildReferenceForCard(input.pinnedCard, input.mode);
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
        reference = await buildReferenceForCard(cardContext, input.mode);
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

  return enriched.sort(compareEnrichedListings);
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
  mode: Exclude<DealMode, "sealed">
): Promise<EbayDealReference> {
  if (mode === "graded") {
    const matchedCardMarketGradedPrice = getCollectionMatchedGradedPrice(
      { gradedPrices: card.gradedPrices },
      {
        gradingCompany: card.collectionItem?.grading_company,
        gradingGrade: card.collectionItem?.grading_grade,
      }
    );

    if (matchedCardMarketGradedPrice) {
      return {
        label: matchedCardMarketGradedPrice.label,
        valueEur: matchedCardMarketGradedPrice.price,
        source: "graded",
      };
    }

    const matchedEbaySoldGradedPrice =
      card.ebaySoldGradedPrices.find((price) =>
        gradedLabelMatches({
          label: price.label,
          company: price.company,
          grade: price.grade,
          targetCompany: card.collectionItem?.grading_company,
          targetGrade: card.collectionItem?.grading_grade,
        })
      ) ?? card.ebaySoldGradedPrices[0] ?? null;

    if (matchedEbaySoldGradedPrice) {
      const currency = matchedEbaySoldGradedPrice.currency.toUpperCase();
      const usdToEurRate = currency === "USD" ? await getUsdToEurRate() : null;
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
    const config = getEbayRuntimeConfig();
    const cardId = req.nextUrl.searchParams.get("cardId")?.trim() ?? "";
    const productId = req.nextUrl.searchParams.get("productId")?.trim() ?? "";
    const q = cardId || productId ? "" : (req.nextUrl.searchParams.get("q")?.trim() ?? "");
    const requestedMode = parseDealMode(req.nextUrl.searchParams.get("mode"));
    const buyingMode = parseBuyingMode(req.nextUrl.searchParams.get("buying"));
    const limit = parseLimit(req.nextUrl.searchParams.get("limit"));

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
      mode = cardMode;
      reference = await buildReferenceForCard(card, cardMode);

      if (!query) {
        query = buildEbayCardSearchQuery({
          name: card.name,
          episodeName: card.episode.name,
          episodeCode: card.episode.code,
          cardNumber: card.card_number,
          gradingCompany: card.collectionItem?.grading_company,
          gradingGrade: card.collectionItem?.grading_grade,
          mode: cardMode,
        });
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

    if (q && mode === "graded" && !hasGradedQueryContext(q)) {
      query = buildEbayManualSearchQuery(`${q} graded`);
    }

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

    const searchConfig = mode === "graded" || mode === "sealed" ? { ...config, categoryId: null } : config;
    const searchListingKind = mode === "sealed" ? "sealed" : mode === "graded" ? "graded" : "card";
    const runDealSearch = (searchQuery: string) =>
      searchEbayDeals({
        query: searchQuery,
        reference,
        limit,
        buyingMode,
        config: searchConfig,
        excludeGraded: mode === "raw",
        requireGraded: mode === "graded",
        listingKind: searchListingKind,
      });

    const searchQueries = card
      ? buildCardDealSearchQueries({
          card,
          mode: mode === "graded" ? "graded" : "raw",
          primaryQuery: query,
        })
      : sealedProduct
        ? uniqueDealQueries([sealedProduct.name])
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
      mode === "sealed"
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
          });
    const limitedListings = card || sealedProduct ? listings.slice(0, limit) : listings;

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
      total: card || sealedProduct ? limitedListings.length : result.total,
      listings: limitedListings,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
