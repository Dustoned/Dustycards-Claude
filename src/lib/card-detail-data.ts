import { loadSafeCardMarketHistoryRows } from "@/lib/card-market-history";
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
  type CardEbaySoldGradedPriceHistorySnapshot,
  type CardGradedPriceHistorySnapshot,
} from "@/lib/price-history";
import { getPullRateInfoForSetRarity } from "@/lib/pull-rates";
import { ONE_PIECE_GAME } from "@/lib/games";
import { getServerUserSettings } from "@/lib/user-settings-server";
import { getDisplayCardNumber } from "@/lib/card-number-display";
import { parseBgsSubgrades } from "@/lib/graded-slabs";
import { buildBuySignal } from "@/lib/buy-signal";
import { buildCardMarketStats } from "@/lib/card-market-stats";
import { getEbayDemandPayload } from "@/lib/ebay-demand";
import { getCurrentRawCardmarketValue } from "@/lib/market-price-sanity";
import { loadRelatedCardPrintings } from "@/lib/card-printings";
import { getCardCharacters } from "@/lib/card-characters-core";
import { selectCardDetailSealedProducts } from "@/lib/sealed-products";
import { getSealedOriginMarketPrice } from "@/lib/collection-sealed-origin";

type CardDetailCollectionItem = {
  id: string;
  binder_id: string | null;
  for_sale: boolean;
  purchase_price: number | null;
  grading_company: string | null;
  grading_grade: string | null;
  grading_subgrades_json: string | null;
  binder: {
    id: string;
    name: string;
    type: string;
    episode_id: string | null;
    base_purchase_price: number | null;
  } | null;
};

async function loadDailyGradedHistory(cardId: string): Promise<{
  cardMarket: CardGradedPriceHistorySnapshot[];
  ebaySold: CardEbaySoldGradedPriceHistorySnapshot[];
}> {
  const [cardMarket, ebaySold] = await Promise.all([
    db.$queryRaw<CardGradedPriceHistorySnapshot[]>`
      SELECT label, price, fetched_at
      FROM (
        SELECT
          label,
          price,
          fetched_at,
          ROW_NUMBER() OVER (
            PARTITION BY label, DATE(fetched_at)
            ORDER BY fetched_at DESC, id DESC
          ) AS row_num
        FROM "CardGradedPriceSnapshot"
        WHERE card_id = ${cardId}
      )
      WHERE row_num = 1
      ORDER BY label ASC, fetched_at ASC
    `,
    db.$queryRaw<CardEbaySoldGradedPriceHistorySnapshot[]>`
      SELECT label, median_price, currency, sample_size, fetched_at
      FROM (
        SELECT
          label,
          median_price,
          currency,
          sample_size,
          fetched_at,
          ROW_NUMBER() OVER (
            PARTITION BY label, DATE(fetched_at)
            ORDER BY fetched_at DESC, id DESC
          ) AS row_num
        FROM "CardEbaySoldGradedPriceSnapshot"
        WHERE card_id = ${cardId}
      )
      WHERE row_num = 1
      ORDER BY label ASC, fetched_at ASC
    `,
  ]);

  return { cardMarket, ebaySold };
}

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
      where: { binder_id: binder.id, user_id: userId, for_sale: false, sold_at: null },
      select: {
        id: true,
        purchase_price: true,
        grading_company: true,
        grading_grade: true,
        card: {
          select: {
            episode_id: true,
            prices: {
              where: { cm_en_lowest_nm: { gt: 0, not: 9001 } },
              orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
              take: 1,
              select: {
                cm_en_lowest_nm: true,
                cm_de_lowest_nm: true,
                cm_fr_lowest_nm: true,
                cm_es_lowest_nm: true,
                cm_it_lowest_nm: true,
                cm_jp_lowest_nm: true,
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
                label: true,
                company: true,
                grade: true,
                median_price: true,
                currency: true,
              },
            },
          },
        },
      },
    });
    const hasUsdEbaySoldGradedPrices = binderCards.some(
      (item) =>
        item.grading_company &&
        item.grading_grade &&
        item.card.ebaySoldGradedPrices.some(
          (price) => price.currency.toUpperCase() === "USD"
        )
    );
    const usdToEurRate = hasUsdEbaySoldGradedPrices ? await getUsdToEurRate() : null;
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
          usdToEurRate,
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

export async function getCardDetailPayload(id: string, userId: string) {
  const card = await db.card.findUnique({
    where: { id },
    select: {
      id: true,
      game: true,
      name: true,
      card_number: true,
      printed_card_number: true,
      version: true,
      rarity: true,
      hp: true,
      image_url: true,
      supertype: true,
      subtypes: true,
      artist: true,
      cardmarket_id: true,
      cardmarket_url: true,
      tcggo_url: true,
      tcgid: true,
      price_source_status: true,
      price_source_checked_at: true,
      tcggo_score: true,
      tcggo_score_tier: true,
      tcggo_score_momentum: true,
      tcggo_score_stability: true,
      tcggo_score_liquidity: true,
      tcggo_score_demand: true,
      tcggo_score_market_depth: true,
      tcggo_score_grade_premium: true,
      tcggo_score_rsi: true,
      tcggo_score_ath: true,
      tcggo_score_atl: true,
      tcggo_score_synced_at: true,
      tcggo_score_updated_at: true,
      ebay_sold_graded_status: true,
      ebay_sold_graded_checked_at: true,
      ebay_sold_graded_synced_at: true,
      episode: {
        select: { id: true, name: true, code: true, series: true, release_date: true },
      },
      collectionItems: {
        where: { user_id: userId, for_sale: false, sold_at: null },
        orderBy: { updated_at: "desc" },
        take: 1,
        select: {
          id: true,
          binder_id: true,
          for_sale: true,
          purchase_price: true,
          condition: true,
          language: true,
          notes: true,
          grading_company: true,
          grading_grade: true,
          grading_subgrades_json: true,
          origin_sealed_product_id: true,
          purchase_price_source: true,
          originSealedProduct: {
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
              cm_avg_7d: true,
              cm_avg_30d: true,
            },
          },
          tags: {
            select: {
              label: true,
            },
          },
          binder: {
            select: {
              id: true,
              name: true,
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
          fetched_at: true,
        },
      },
    },
  });

  if (!card) {
    return null;
  }

  if (card.game === ONE_PIECE_GAME) {
    const settings = await getServerUserSettings(userId);
    if (!settings.onePieceLibraryEnabled) {
      return null;
    }
  }

  const dailyGradedHistoryPromise = loadDailyGradedHistory(card.id);

  const sealedProductsPromise = db.sealedProduct.findMany({
    where: {
      game: card.game,
      OR: [
        { episode_id: card.episode.id },
        { contentSets: { some: { episode_id: card.episode.id } } },
        { includedCards: { some: { card_id: card.id } } },
      ],
    },
    orderBy: [{ name: "asc" }],
    take: 100,
    select: {
      id: true,
      name: true,
      image_url: true,
      cardmarket_url: true,
      release_date: true,
      cm_lowest: true,
      cm_lowest_eu: true,
      cm_lowest_de: true,
      cm_lowest_fr: true,
      cm_lowest_es: true,
      cm_lowest_it: true,
      cm_avg_7d: true,
      cm_avg_30d: true,
      episode_id: true,
      episode: { select: { id: true, name: true, code: true } },
      contentSets: {
        where: { episode_id: card.episode.id },
        take: 1,
        select: { episode_id: true },
      },
      includedCards: {
        where: { card_id: card.id },
        take: 1,
        select: { relation_type: true },
      },
      _count: { select: { contentSets: true } },
    },
  });
  const sealedProductCountPromise = db.sealedProduct.count({
    where: {
      game: card.game,
      OR: [
        { episode_id: card.episode.id },
        { contentSets: { some: { episode_id: card.episode.id } } },
        { includedCards: { some: { card_id: card.id } } },
      ],
    },
  });

  const safePriceRowsPromise = loadSafeCardMarketHistoryRows([
        {
          id: card.id,
          game: card.game,
          episodeId: card.episode.id,
          name: card.name,
          cardNumber: card.card_number,
          printedCardNumber: card.printed_card_number,
          cardmarketId: card.cardmarket_id,
          cardmarketUrl: card.cardmarket_url,
        },
      ]);
  const relatedPrintingsPromise = loadRelatedCardPrintings(card);
  const [sealedProductCandidates, sealedProductCount, safePriceRowsByCard, relatedPrintings] =
    await Promise.all([
      sealedProductsPromise,
      sealedProductCountPromise,
      safePriceRowsPromise,
      relatedPrintingsPromise,
    ]);
  const sealedProducts = selectCardDetailSealedProducts(sealedProductCandidates, 8);
  const safePriceRows = safePriceRowsByCard.get(card.id) ?? [];

  const latestSourceSnapshot = safePriceRows[safePriceRows.length - 1] ?? null;
  const latestEnglishNmSnapshot = [...safePriceRows]
    .reverse()
    .find((price) => getCurrentRawCardmarketValue(price) != null) ?? null;
  const priceHistory = buildCardPriceHistory(safePriceRows);
  const [dailyGradedHistory, pullRateInfo, ebayDemand] = await Promise.all([
    dailyGradedHistoryPromise,
    getPullRateInfoForSetRarity({
      setCode: card.episode.code,
      rarity: card.rarity,
    }),
    getEbayDemandPayload({ cardId: card.id, mode: "raw" }),
  ]);
  const gradedPriceHistory = buildCardGradedPriceHistory(dailyGradedHistory.cardMarket);
  const pullRateInfoPayload = pullRateInfo
    ? {
        source: pullRateInfo.source,
        rarity_name: pullRateInfo.rarityName,
        pull_rate_odds: pullRateInfo.pullRateOdds,
        specific_pull_odds: pullRateInfo.specificPullOdds,
        pull_rate_weight: pullRateInfo.pullRateWeight,
        psa_avg_gem_pct: pullRateInfo.psaAvgGemPct,
      }
    : null;
  const collectionItem = card.collectionItems[0] ?? null;
  const wantItem = card.wants[0] ?? null;
  const collectionCostBasis = await getCardDetailCostBasis(collectionItem, userId);
  const hasUsdEbaySoldGradedPrices = card.ebaySoldGradedPrices.some(
    (price) => price.currency.toUpperCase() === "USD"
  ) || dailyGradedHistory.ebaySold.some((price) => price.currency.toUpperCase() === "USD");
  const usdToEurRate = hasUsdEbaySoldGradedPrices ? await getUsdToEurRate() : null;
  const ebaySoldGradedPriceHistory = buildCardEbaySoldGradedPriceHistory(
    dailyGradedHistory.ebaySold,
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
      source: price.source as "ebay_sold",
      currency,
      median_price_eur: medianPriceEur,
      exchange_rate_usd_eur: currency === "USD" ? usdToEurRate?.rate ?? null : null,
      exchange_rate_date: currency === "USD" ? usdToEurRate?.date ?? null : null,
      fetched_at: price.fetched_at ? price.fetched_at.toISOString() : null,
    };
  });
  const latestPricePayload = latestSourceSnapshot || latestEnglishNmSnapshot
    ? {
        // The main/default market is always the newest usable English Near
        // Mint quote. Other language and TCG fields remain from the newest
        // general source snapshot and are only shown after explicit selection.
        cm_en_lowest_nm: latestEnglishNmSnapshot?.cm_en_lowest_nm ?? null,
        cm_de_lowest_nm: latestSourceSnapshot?.cm_de_lowest_nm ?? null,
        cm_fr_lowest_nm: latestSourceSnapshot?.cm_fr_lowest_nm ?? null,
        cm_es_lowest_nm: latestSourceSnapshot?.cm_es_lowest_nm ?? null,
        cm_it_lowest_nm: latestSourceSnapshot?.cm_it_lowest_nm ?? null,
        cm_jp_lowest_nm: latestSourceSnapshot?.cm_jp_lowest_nm ?? null,
        tcp_market: latestSourceSnapshot?.tcp_market ?? null,
        tcp_mid: latestSourceSnapshot?.tcp_mid ?? null,
        tcp_low: latestSourceSnapshot?.tcp_low ?? null,
        cm_en_avg_7d: latestEnglishNmSnapshot?.cm_en_avg_7d ?? null,
        cm_en_avg_30d: latestEnglishNmSnapshot?.cm_en_avg_30d ?? null,
      }
    : null;
  const marketStats = buildCardMarketStats({
    history: priceHistory,
    currentLanguagePrices: {
      en: latestPricePayload?.cm_en_lowest_nm,
      de: latestPricePayload?.cm_de_lowest_nm,
      fr: latestPricePayload?.cm_fr_lowest_nm,
      es: latestPricePayload?.cm_es_lowest_nm,
      it: latestPricePayload?.cm_it_lowest_nm,
      jp: latestPricePayload?.cm_jp_lowest_nm,
    },
    rawPrice: latestPricePayload?.cm_en_lowest_nm,
    gradedPrices: card.gradedPrices,
    ebaySoldGradedPrices,
    demand: ebayDemand,
    updatedAt: latestEnglishNmSnapshot?.fetched_at ?? latestSourceSnapshot?.fetched_at ?? null,
    tcggo: {
      score: card.tcggo_score,
      tier: card.tcggo_score_tier,
      momentum: card.tcggo_score_momentum,
      stability: card.tcggo_score_stability,
      liquidity: card.tcggo_score_liquidity,
      demand: card.tcggo_score_demand,
      marketDepth: card.tcggo_score_market_depth,
      gradePremium: card.tcggo_score_grade_premium,
      rsi: card.tcggo_score_rsi,
      ath: card.tcggo_score_ath,
      atl: card.tcggo_score_atl,
      updatedAt: card.tcggo_score_updated_at ?? card.tcggo_score_synced_at,
    },
  });
  const collectionItemPayload = collectionItem
    ? {
        id: collectionItem.id,
        binder_id: collectionItem.binder_id,
        for_sale: collectionItem.for_sale,
        binder_name: collectionItem.binder?.name ?? null,
        binder_type: collectionItem.binder?.type ?? null,
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
        grading_subgrades: parseBgsSubgrades(collectionItem.grading_subgrades_json),
        origin_sealed_product_id: collectionItem.origin_sealed_product_id,
        purchase_price_source: collectionItem.purchase_price_source,
        origin_sealed_product: collectionItem.originSealedProduct
          ? {
              id: collectionItem.originSealedProduct.id,
              name: collectionItem.originSealedProduct.name,
              image_url: collectionItem.originSealedProduct.image_url,
              price_basis: getSealedOriginMarketPrice(collectionItem.originSealedProduct),
            }
          : null,
      }
    : null;
  const buySignal = buildBuySignal({
    rarity: card.rarity,
    episode_name: card.episode.name,
    episode_code: card.episode.code,
    episode_release_date: card.episode.release_date,
    price: latestPricePayload,
    price_fetched_at: latestEnglishNmSnapshot
      ? latestEnglishNmSnapshot.fetched_at.toISOString()
      : null,
    price_source_checked_at: card.price_source_checked_at
      ? card.price_source_checked_at.toISOString()
      : null,
    ebay_sold_graded_synced_at: card.ebay_sold_graded_synced_at
      ? card.ebay_sold_graded_synced_at.toISOString()
      : null,
    price_history: priceHistory,
    graded_prices: card.gradedPrices,
    ebay_sold_graded_prices: ebaySoldGradedPrices,
    graded_price_history: gradedPriceHistory,
    ebay_sold_graded_price_history: ebaySoldGradedPriceHistory,
    pull_rate_info: pullRateInfoPayload,
    collection_item: collectionItemPayload,
  });

  return {
    id: card.id,
    game: card.game,
    name: card.name,
    card_number: getDisplayCardNumber(card),
    version: card.version,
    rarity: card.rarity,
    hp: card.hp,
    image_url: card.image_url,
    supertype: card.supertype,
    subtypes: card.subtypes,
    artist: card.artist,
    characters: getCardCharacters({
      game: card.game,
      name: card.name,
      supertype: card.supertype,
    }),
    cardmarket_id: card.cardmarket_id,
    cardmarket_url: card.cardmarket_url,
    tcggo_url: card.tcggo_url,
    price_source_status: card.price_source_status,
    price_source_checked_at: card.price_source_checked_at
      ? card.price_source_checked_at.toISOString()
      : null,
    ebay_sold_graded_status: card.ebay_sold_graded_status,
    ebay_sold_graded_checked_at: card.ebay_sold_graded_checked_at
      ? card.ebay_sold_graded_checked_at.toISOString()
      : null,
    ebay_sold_graded_synced_at: card.ebay_sold_graded_synced_at
      ? card.ebay_sold_graded_synced_at.toISOString()
      : null,
    price_fetched_at: latestEnglishNmSnapshot
      ? latestEnglishNmSnapshot.fetched_at.toISOString()
      : null,
    price: latestPricePayload,
    graded_prices: card.gradedPrices,
    ebay_sold_graded_prices: ebaySoldGradedPrices,
    graded_price_history: gradedPriceHistory,
    ebay_sold_graded_price_history: ebaySoldGradedPriceHistory,
    price_history: priceHistory,
    market_stats: marketStats,
    buy_signal: buySignal,
    pull_rate_info: pullRateInfoPayload,
    episode_id: card.episode.id,
    episode_name: card.episode.name,
    episode_code: card.episode.code,
    episode_series: card.episode.series,
    episode_release_date: card.episode.release_date,
    sealed_product_count: sealedProductCount,
    sealed_products: sealedProducts.map((product) => ({
      id: product.id,
      name: product.name,
      image_url: product.image_url,
      cardmarket_url: product.cardmarket_url,
      release_date: product.release_date ? product.release_date.toISOString() : null,
      match_type:
        product.includedCards.length > 0
          ? "included_promo"
          : product._count.contentSets > 1 || product.episode_id !== card.episode.id
            ? "mixed_pack"
            : "set_product" as "included_promo" | "mixed_pack" | "set_product",
      price: {
        cm_lowest: product.cm_lowest,
        cm_lowest_eu: product.cm_lowest_eu,
        cm_lowest_de: product.cm_lowest_de,
        cm_lowest_fr: product.cm_lowest_fr,
        cm_lowest_es: product.cm_lowest_es,
        cm_lowest_it: product.cm_lowest_it,
        cm_avg_7d: product.cm_avg_7d,
        cm_avg_30d: product.cm_avg_30d,
      },
      episode: {
        id: product.episode.id,
        name: product.episode.name,
        code: product.episode.code,
      },
    })),
    related_printings: relatedPrintings,
    collection_item: collectionItemPayload,
    want_item: wantItem
      ? {
          id: wantItem.id,
          created_at: wantItem.created_at.toISOString(),
        }
      : null,
  };
}

export type CardDetailPayload = NonNullable<
  Awaited<ReturnType<typeof getCardDetailPayload>>
>;
