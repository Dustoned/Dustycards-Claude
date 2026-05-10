import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAdmin, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  buildLinkedBinderCostBasis,
  getCollectionCardMarketValue,
  type CollectionCostBasis,
} from "@/lib/collection";
import { convertUsdToEur, getUsdToEurRate } from "@/lib/exchange-rates";
import {
  buildCardEbaySoldGradedPriceHistory,
  buildCardGradedPriceHistory,
  buildCardPriceHistory,
} from "@/lib/price-history";
import { getPullRateInfoForSetRarity } from "@/lib/pull-rates";
import {
  runCardPriceRefresh,
  runSingleCardHistoryImport,
  SyncCancelledError,
  SyncConflictError,
} from "@/lib/sync";
import { isTcggoQuotaExceededError } from "@/lib/tcggo";
import { getScraperDisabledResponse } from "@/app/api/scraper-disabled-response";

type CardAction = "refresh" | "sync-history";

type CardDetailCollectionItem = {
  id: string;
  binder_id: string | null;
  purchase_price: number | null;
  grading_company: string | null;
  grading_grade: string | null;
  binder: {
    id: string;
    type: string;
    episode_id: string | null;
    base_purchase_price: number | null;
  } | null;
};

function buildDirectCostBasis(purchasePrice: number | null): CollectionCostBasis | null {
  return purchasePrice == null
    ? null
    : {
        value: purchasePrice,
        label: "Paid",
        source: "direct",
      };
}

async function getCardDetailCostBasis(
  collectionItem: CardDetailCollectionItem | null,
  userId: string
): Promise<CollectionCostBasis | null> {
  if (!collectionItem) return null;

  const binder = collectionItem.binder;
  if (binder?.type === "linked_set" && binder.episode_id) {
    const binderCards = await db.collectionCard.findMany({
      where: { binder_id: binder.id, user_id: userId },
      select: {
        id: true,
        purchase_price: true,
        grading_company: true,
        grading_grade: true,
        card: {
          select: {
            episode_id: true,
            prices: {
              orderBy: { fetched_at: "desc" },
              take: 1,
              select: {
                cm_en_lowest_nm: true,
                cm_de_lowest_nm: true,
                cm_fr_lowest_nm: true,
                cm_es_lowest_nm: true,
                cm_it_lowest_nm: true,
              },
            },
            gradedPrices: {
              orderBy: [{ price: "desc" }, { label: "asc" }],
              select: {
                label: true,
                price: true,
              },
            },
          },
        },
      },
    });
    const allocation = buildLinkedBinderCostBasis({
      binderType: binder.type,
      binderEpisodeId: binder.episode_id,
      binderBasePurchasePrice: binder.base_purchase_price,
      items: binderCards.map((item) => ({
        itemId: item.id,
        episodeId: item.card.episode_id,
        directPurchasePrice: item.purchase_price,
        currentValue: getCollectionCardMarketValue(item.card, {
          gradingCompany: item.grading_company,
          gradingGrade: item.grading_grade,
        }),
      })),
    });
    const allocated = allocation.get(collectionItem.id);
    if (allocated) {
      return allocated;
    }
  }

  return buildDirectCostBasis(collectionItem.purchase_price);
}

async function getCardDetailPayload(id: string, userId: string) {
  const card = await db.card.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      card_number: true,
      rarity: true,
      hp: true,
      image_url: true,
      supertype: true,
      subtypes: true,
      artist: true,
      cardmarket_id: true,
      cardmarket_url: true,
      tcggo_url: true,
      price_source_status: true,
      price_source_checked_at: true,
      episode: {
        select: { id: true, name: true, code: true },
      },
      collectionItems: {
        where: { user_id: userId },
        orderBy: { updated_at: "desc" },
        take: 1,
        select: {
          id: true,
          binder_id: true,
          purchase_price: true,
          condition: true,
          language: true,
          notes: true,
          grading_company: true,
          grading_grade: true,
          tags: {
            select: {
              label: true,
            },
          },
          binder: {
            select: {
              id: true,
              type: true,
              episode_id: true,
              base_purchase_price: true,
            },
          },
        },
      },
      wants: {
        where: { user_id: userId },
        take: 1,
        select: {
          id: true,
          created_at: true,
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
      ebaySoldGradedPriceSnapshots: {
        orderBy: [{ label: "asc" }, { fetched_at: "asc" }],
        select: {
          label: true,
          median_price: true,
          currency: true,
          sample_size: true,
          fetched_at: true,
        },
      },
      gradedPriceSnapshots: {
        orderBy: [{ label: "asc" }, { fetched_at: "asc" }],
        select: {
          label: true,
          price: true,
          fetched_at: true,
        },
      },
      prices: {
        orderBy: { fetched_at: "asc" },
        select: {
          cm_en_lowest_nm: true,
          cm_de_lowest_nm: true,
          cm_fr_lowest_nm: true,
          cm_es_lowest_nm: true,
          cm_it_lowest_nm: true,
          tcp_market: true,
          tcp_mid: true,
          tcp_low: true,
          cm_en_avg_7d: true,
          cm_en_avg_30d: true,
          fetched_at: true,
        },
      },
    },
  });

  if (!card) {
    return null;
  }

  const latestPrice = card.prices[card.prices.length - 1] ?? null;
  const priceHistory = buildCardPriceHistory(card.prices);
  const gradedPriceHistory = buildCardGradedPriceHistory(card.gradedPriceSnapshots);
  const pullRateInfo = await getPullRateInfoForSetRarity({
    setCode: card.episode.code,
    rarity: card.rarity,
  });
  const collectionItem = card.collectionItems[0] ?? null;
  const wantItem = card.wants[0] ?? null;
  const collectionCostBasis = await getCardDetailCostBasis(collectionItem, userId);
  const hasUsdEbaySoldGradedPrices = card.ebaySoldGradedPrices.some(
    (price) => price.currency.toUpperCase() === "USD"
  ) || card.ebaySoldGradedPriceSnapshots.some((price) => price.currency.toUpperCase() === "USD");
  const usdToEurRate = hasUsdEbaySoldGradedPrices ? await getUsdToEurRate() : null;
  const ebaySoldGradedPriceHistory = buildCardEbaySoldGradedPriceHistory(
    card.ebaySoldGradedPriceSnapshots,
    { usdToEurRate: usdToEurRate?.rate ?? null }
  );
  const ebaySoldGradedPrices = card.ebaySoldGradedPrices.map((price) => {
    const currency = price.currency.toUpperCase();
    const medianPriceEur =
      currency === "EUR"
        ? price.median_price
        : currency === "USD"
          ? convertUsdToEur(price.median_price, usdToEurRate)
          : null;

    return {
      ...price,
      currency,
      median_price_eur: medianPriceEur,
      exchange_rate_usd_eur: currency === "USD" ? usdToEurRate?.rate ?? null : null,
      exchange_rate_date: currency === "USD" ? usdToEurRate?.date ?? null : null,
    };
  });

  return {
    id: card.id,
    name: card.name,
    card_number: card.card_number,
    rarity: card.rarity,
    hp: card.hp,
    image_url: card.image_url,
    supertype: card.supertype,
    subtypes: card.subtypes,
    artist: card.artist,
    cardmarket_id: card.cardmarket_id,
    cardmarket_url: card.cardmarket_url,
    tcggo_url: card.tcggo_url,
    price_source_status: card.price_source_status,
    price_source_checked_at: card.price_source_checked_at
      ? card.price_source_checked_at.toISOString()
      : null,
    price_fetched_at: latestPrice ? latestPrice.fetched_at.toISOString() : null,
    price: latestPrice
      ? {
          cm_en_lowest_nm: latestPrice.cm_en_lowest_nm,
          cm_de_lowest_nm: latestPrice.cm_de_lowest_nm,
          cm_fr_lowest_nm: latestPrice.cm_fr_lowest_nm,
          cm_es_lowest_nm: latestPrice.cm_es_lowest_nm,
          cm_it_lowest_nm: latestPrice.cm_it_lowest_nm,
          tcp_market: latestPrice.tcp_market,
          tcp_mid: latestPrice.tcp_mid,
          tcp_low: latestPrice.tcp_low,
          cm_en_avg_7d: latestPrice.cm_en_avg_7d,
          cm_en_avg_30d: latestPrice.cm_en_avg_30d,
        }
      : null,
    graded_prices: card.gradedPrices,
    ebay_sold_graded_prices: ebaySoldGradedPrices,
    graded_price_history: gradedPriceHistory,
    ebay_sold_graded_price_history: ebaySoldGradedPriceHistory,
    price_history: priceHistory,
    pull_rate_info: pullRateInfo
      ? {
          source: pullRateInfo.source,
          rarity_name: pullRateInfo.rarityName,
          pull_rate_odds: pullRateInfo.pullRateOdds,
          specific_pull_odds: pullRateInfo.specificPullOdds,
          pull_rate_weight: pullRateInfo.pullRateWeight,
          psa_avg_gem_pct: pullRateInfo.psaAvgGemPct,
        }
      : null,
    episode_id: card.episode.id,
    episode_name: card.episode.name,
    episode_code: card.episode.code,
    collection_item: collectionItem
      ? {
          id: collectionItem.id,
          binder_id: collectionItem.binder_id,
          purchase_price: collectionItem.purchase_price,
          cost_basis_value: collectionCostBasis?.value ?? null,
          cost_basis_label: collectionCostBasis?.label ?? "Paid",
          cost_basis_source: collectionCostBasis?.source ?? "direct",
          condition: collectionItem.condition,
          language: collectionItem.language,
          notes: collectionItem.notes,
          tags: collectionItem.tags.map((tag) => tag.label),
          grading_company: collectionItem.grading_company,
          grading_grade: collectionItem.grading_grade,
        }
      : null,
    want_item: wantItem
      ? {
          id: wantItem.id,
          created_at: wantItem.created_at.toISOString(),
        }
      : null,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const payload = await getCardDetailPayload(id, user.id);

    if (!payload) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Failed to load card" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin();
    const { id } = await params;
    const scraperDisabled = getScraperDisabledResponse();
    if (scraperDisabled) return scraperDisabled;

    let action: CardAction = "refresh";

    try {
      const body = (await req.json()) as { action?: CardAction };
      if (body.action === "sync-history") {
        action = "sync-history";
      }
    } catch {
      // Empty or invalid JSON should behave like a regular refresh.
    }

    if (action === "sync-history") {
      await runSingleCardHistoryImport(id);
    } else {
      await runCardPriceRefresh(id);
    }

    const payload = await getCardDetailPayload(id, user.id);

    if (!payload) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof SyncCancelledError) {
      return NextResponse.json(
        {
          error: error.message,
          cancelled: true,
        },
        { status: 409 }
      );
    }

    if (error instanceof SyncConflictError) {
      return NextResponse.json(
        {
          error: error.message,
          activeType: error.activeType,
          startedAt: error.startedAt.toISOString(),
        },
        { status: 409 }
      );
    }

    if (isTcggoQuotaExceededError(error)) {
      return NextResponse.json(
        {
          error: error.message,
          resetAt: error.resetAt ? error.resetAt.toISOString() : null,
        },
        { status: 429 }
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return authErrorResponse(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
