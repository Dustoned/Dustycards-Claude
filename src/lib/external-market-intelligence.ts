import "server-only";

import { db } from "@/lib/db";
import {
  deriveEbayDemandIntelligence,
  type EbayDemandSignalSnapshot,
} from "@/lib/ebay-demand-signal";
import { EBAY_DEMAND_COHORT_REVISION_AT } from "@/lib/ebay-demand";
import { getEbayDemandRuntimeConfig } from "@/lib/ebay";
import { getExternalEntityKey } from "@/lib/external-event-candidates";
import {
  alignConfluenceWithScenario,
  alignOpportunityScoreWithScenario,
  buildPriceScenario,
  calculateGoldMineConfluence,
  calculateOpportunityScores,
  calculateScarcityScore,
  calculateSealedPressure,
  calculateSetRarityPosition,
  classifySealedProduct,
  getGradedSupplyLabel,
  hasActiveReprintRisk,
  percentChange,
} from "@/lib/external-market-intelligence-core";
import type {
  ExternalCardSignal,
  ExternalGradedIntelligence,
  ExternalMarketIntelligence,
  ExternalSealedIntelligence,
} from "@/lib/external-signal-radar";
import type { TradingCardGame } from "@/lib/games";
import { normalizeRarityLabel } from "@/lib/rarity";
import {
  buildDailyMarketHistory,
  calculateRobustPriceTrend,
} from "@/lib/robust-price-history";
import { createSwrCache } from "@/lib/server-swr-cache";
import type { SetLifecycleStatus } from "@/lib/set-lifecycle-core";

const DAY_MS = 86_400_000;
const CARD_CHUNK_SIZE = 50;
const marketIntelligenceCache = createSwrCache<ExternalCardSignal[]>(5 * 60_000, 30 * 60_000);
const FORECAST_MODEL_VERSION = "signed-market-v3";

const LIFECYCLE_COPY: Record<
  SetLifecycleStatus,
  { label: string; summary: string }
> = {
  upcoming: {
    label: "Upcoming",
    summary: "This set has not released yet, so supply signals are still provisional.",
  },
  launch_window: {
    label: "Launch window",
    summary: "Launch supply is still settling; temporary shortages are not treated as out of print.",
  },
  actively_supplied: {
    label: "Actively supplied",
    summary: "Recent product observations still show active set supply.",
  },
  supply_tightening: {
    label: "Supply tightening",
    summary: "Observed sealed supply is tightening, but out-of-print status is not confirmed.",
  },
  likely_out_of_print: {
    label: "Likely out of print",
    summary: "Multiple set-level observations point to an ended print cycle; no official confirmation was found.",
  },
  confirmed_out_of_print: {
    label: "Confirmed out of print",
    summary: "An authoritative source explicitly indicates that this set is out of print.",
  },
  reprint_restock: {
    label: "Reprint / restock",
    summary: "A recent reprint or meaningful restock indicates renewed supply.",
  },
  unknown_historical: {
    label: "History incomplete",
    summary: "There is not enough fresh set-level supply history for a reliable lifecycle call yet.",
  },
};

function parseLifecycleStatus(value: string): SetLifecycleStatus | null {
  return Object.prototype.hasOwnProperty.call(LIFECYCLE_COPY, value)
    ? (value as SetLifecycleStatus)
    : null;
}

function lifecycleCopyFromEvidence(value: string | null): {
  label: string;
  summary: string;
} | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as {
      assessment?: { label?: unknown; summary?: unknown };
    };
    const label = parsed.assessment?.label;
    const summary = parsed.assessment?.summary;
    return typeof label === "string" && typeof summary === "string"
      ? { label, summary }
      : null;
  } catch {
    return null;
  }
}

function lifecycleFields(
  observation:
    | {
        status: string;
        oop_probability: number;
        confidence: number;
        observed_at: Date;
        evidence_json: string | null;
      }
    | null
    | undefined
): Pick<
  ExternalSealedIntelligence,
  | "lifecycleStatus"
  | "lifecycleLabel"
  | "lifecycleConfidence"
  | "lifecycleOopProbability"
  | "lifecycleAsOf"
  | "lifecycleSummary"
> {
  const status = observation ? parseLifecycleStatus(observation.status) : null;
  if (!observation || !status) {
    return {
      lifecycleStatus: null,
      lifecycleLabel: null,
      lifecycleConfidence: null,
      lifecycleOopProbability: null,
      lifecycleAsOf: null,
      lifecycleSummary: null,
    };
  }
  const copy = lifecycleCopyFromEvidence(observation.evidence_json) ?? LIFECYCLE_COPY[status];
  const confidence = Math.round(observation.confidence);
  return {
    lifecycleStatus: status,
    lifecycleLabel: copy.label,
    lifecycleConfidence: confidence,
    // A low-confidence historical prior is not an actionable probability.
    // Keep the honest lifecycle label, but show "Learning" instead of a
    // precise percentage until the observation has enough evidence.
    lifecycleOopProbability:
      confidence >= 45 ? Math.round(observation.oop_probability) : null,
    lifecycleAsOf: observation.observed_at.toISOString(),
    lifecycleSummary: copy.summary,
  };
}

async function loadEbayDemandCacheVersion(cardIds: string[]): Promise<string> {
  if (cardIds.length === 0) return "none";
  const marketplaceId = getEbayDemandRuntimeConfig().marketplaceId;
  const rows = await db.cardEbayDemandSnapshot.findMany({
    where: {
      card_id: { in: cardIds },
      marketplace_id: marketplaceId,
      mode: { in: ["raw", "graded"] },
      updated_at: { gte: EBAY_DEMAND_COHORT_REVISION_AT },
    },
    orderBy: [{ updated_at: "desc" }, { id: "desc" }],
    select: { card_id: true, mode: true, updated_at: true },
  });
  const latestByCard = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.card_id}:${row.mode}`;
    if (!latestByCard.has(key)) latestByCard.set(key, row.updated_at.getTime());
  }
  return [...latestByCard]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([cardId, updatedAt]) => `${cardId}:${updatedAt}`)
    .join("|") || "none";
}

function firstPositive(values: Array<number | null | undefined>): number | null {
  return values.find((value): value is number => value != null && Number.isFinite(value) && value > 0) ?? null;
}

function sealedValue(product: {
  cm_avg_7d: number | null;
  cm_lowest: number | null;
  cm_lowest_eu: number | null;
  cm_lowest_de: number | null;
  cm_lowest_fr: number | null;
  cm_lowest_es: number | null;
  cm_lowest_it: number | null;
}): number | null {
  return firstPositive([
    product.cm_avg_7d,
    product.cm_lowest,
    product.cm_lowest_eu,
    product.cm_lowest_de,
    product.cm_lowest_fr,
    product.cm_lowest_es,
    product.cm_lowest_it,
  ]);
}

function releaseAgeYears(value: string | null, now: Date): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Number((Math.max(0, now.getTime() - timestamp) / (DAY_MS * 365.25)).toFixed(1));
}

function historyTrend(
  points: Array<{ fetchedAt: Date; value: number | null }>,
  days: number
): number | null {
  const valid = points
    .filter((point): point is { fetchedAt: Date; value: number } => point.value != null && point.value > 0)
    .sort((left, right) => left.fetchedAt.getTime() - right.fetchedAt.getTime());
  if (valid.length < 2) return null;
  const latest = valid[valid.length - 1];
  const cutoff = latest.fetchedAt.getTime() - days * DAY_MS;
  const previous = [...valid].reverse().find((point) => point.fetchedAt.getTime() <= cutoff) ?? valid[0];
  if (latest.fetchedAt.getTime() - previous.fetchedAt.getTime() < Math.min(days, 14) * DAY_MS) return null;
  const change = percentChange(latest.value, previous.value);
  return change != null && Math.abs(change) <= 300 ? change : null;
}

function chooseLatestGrade<T extends { company: string; grade: string; fetched_at: Date }>(
  rows: T[],
  grade: "9" | "10"
): T | null {
  return (
    rows
      .filter((row) => row.company.toUpperCase() === "PSA" && Number.parseFloat(row.grade) === Number(grade))
      .sort((left, right) => right.fetched_at.getTime() - left.fetched_at.getTime())[0] ?? null
  );
}

function chooseCardMarketPsa10<T extends { label: string; fetched_at: Date }>(rows: T[]): T | null {
  return (
    rows
      .filter((row) => /\bPSA\s*10\b/i.test(row.label))
      .sort((left, right) => right.fetched_at.getTime() - left.fetched_at.getTime())[0] ?? null
  );
}

interface ArtistDemandRow {
  artist: string;
  priced_cards: number;
  average_value: number;
  valuable_cards: number;
}

async function loadArtistDemand(artists: string[]): Promise<Map<string, number>> {
  if (artists.length === 0) return new Map();
  const placeholders = artists.map(() => "?").join(",");
  const rows = await db.$queryRawUnsafe<ArtistDemandRow[]>(
    `
      WITH latest AS (
        SELECT
          c.id AS card_id,
          c.artist,
          p.cm_en_lowest_nm AS value,
          ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY p.fetched_at DESC, p.id DESC) AS row_number
        FROM "Card" c
        INNER JOIN "Price" p ON p.card_id = c.id
        WHERE c.artist IN (${placeholders})
          AND p.cm_en_lowest_nm > 0
          AND p.cm_en_lowest_nm <> 9001
      )
      SELECT
        artist,
        COUNT(*) AS priced_cards,
        AVG(value) AS average_value,
        SUM(CASE WHEN value >= 25 THEN 1 ELSE 0 END) AS valuable_cards
      FROM latest
      WHERE row_number = 1 AND value > 0
      GROUP BY artist
    `,
    ...artists
  );
  return new Map(
    rows.map((row) => [
      row.artist,
      Math.round(
        Math.min(
          100,
          25 +
            Math.log10(Number(row.average_value) + 1) * 24 +
            Math.min(20, Number(row.valuable_cards) * 2) +
            Math.min(8, Number(row.priced_cards) * 0.1)
        )
      ),
    ])
  );
}

interface CollectorDemandRow {
  game: string;
  name: string;
  value: number | null;
}

export async function loadCollectorDemandScores(
  games: TradingCardGame[]
): Promise<Map<string, number>> {
  if (games.length === 0) return new Map();
  const placeholders = games.map(() => "?").join(",");
  const rows = await db.$queryRawUnsafe<CollectorDemandRow[]>(
    `
      SELECT c.game, c.name,
        p.cm_en_lowest_nm AS value
      FROM "Card" c
      INNER JOIN "Price" p ON p.id = (
        SELECT latest.id FROM "Price" latest
        WHERE latest.card_id = c.id
          AND latest.cm_en_lowest_nm > 0
          AND latest.cm_en_lowest_nm <> 9001
        ORDER BY latest.fetched_at DESC, latest.id DESC LIMIT 1
      )
      WHERE c.game IN (${placeholders})
    `,
    ...games
  );
  const pricesByEntity = new Map<string, number[]>();
  for (const row of rows) {
    if (row.value == null || row.value <= 0) continue;
    const game: TradingCardGame = row.game === "one-piece" ? "one-piece" : "pokemon";
    const key = getExternalEntityKey(game, row.name);
    const prices = pricesByEntity.get(key) ?? [];
    prices.push(Number(row.value));
    pricesByEntity.set(key, prices);
  }
  return new Map(
    [...pricesByEntity].map(([key, prices]) => {
      prices.sort((left, right) => right - left);
      const top = prices.slice(0, 5);
      const topAverage = top.reduce((sum, value) => sum + value, 0) / top.length;
      const valuableVariants = prices.filter((value) => value >= 25).length;
      return [
        key,
        Math.round(Math.min(100, 12 + Math.log10(topAverage + 1) * 30 + Math.min(28, valuableVariants * 3.5))),
      ];
    })
  );
}

function emptySealed(
  ageYears: number | null,
  lifecycle: ReturnType<typeof lifecycleFields>
): ExternalSealedIntelligence {
  return {
    productCount: 0,
    packProductCount: 0,
    packName: null,
    packPrice: null,
    boxName: null,
    boxPrice: null,
    trend30dPct: null,
    trend90dPct: null,
    ageYears,
    pressureScore: 28,
    pressureLabel: "Low",
    ...lifecycle,
  };
}

export async function enrichSignalsWithMarketIntelligence(
  signals: ExternalCardSignal[],
  now = new Date()
): Promise<ExternalCardSignal[]> {
  const cardIds = [...new Set(signals.map((signal) => signal.cardId))];
  const ebayDemandVersion = await loadEbayDemandCacheVersion(cardIds);
  const cacheKey = signals
    .map(
      (signal) =>
        `${signal.cardId}:${signal.externalScore}:${signal.competitiveScore ?? "none"}:${signal.catalystScore ?? 0}:${signal.hypeScore ?? 0}:${signal.riskScore ?? 0}:${signal.currency}:${signal.currentPrice ?? "none"}`
    )
    .sort()
    .join("|") + `::ebay:${ebayDemandVersion}::model:${FORECAST_MODEL_VERSION}`;
  return marketIntelligenceCache.get(cacheKey, () =>
    enrichSignalsWithMarketIntelligenceUncached(signals, now)
  );
}

async function enrichSignalsWithMarketIntelligenceUncached(
  signals: ExternalCardSignal[],
  now: Date
): Promise<ExternalCardSignal[]> {
  if (signals.length === 0) return signals;
  const cardIds = [...new Set(signals.map((signal) => signal.cardId))];
  const cards = [] as Awaited<ReturnType<typeof loadCards>>;
  for (let index = 0; index < cardIds.length; index += CARD_CHUNK_SIZE) {
    cards.push(...(await loadCards(cardIds.slice(index, index + CARD_CHUNK_SIZE), now)));
  }
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const episodeIds = [...new Set(cards.map((card) => card.episode.id))];
  const setCodes = [...new Set(cards.map((card) => card.episode.code).filter((code): code is string => Boolean(code)))];
  const artists = [...new Set(cards.map((card) => card.artist).filter((artist): artist is string => Boolean(artist)))];

  const games = [...new Set(signals.map((signal) => signal.game))];
  const ebayDemandMarketplaceId = getEbayDemandRuntimeConfig().marketplaceId;
  const demandHistoryStart = new Date(now.getTime() - 30 * DAY_MS);
  const [
    products,
    pullRates,
    artistDemand,
    collectorDemand,
    episodeRarities,
    ebayDemandSnapshots,
    lifecycleObservations,
  ] = await Promise.all([
    db.sealedProduct.findMany({
      where: {
        OR: [
          { contentSets: { some: { episode_id: { in: episodeIds } } } },
          { includedCards: { some: { card_id: { in: cardIds } } } },
        ],
      },
      select: {
        id: true,
        name: true,
        cm_avg_7d: true,
        cm_lowest: true,
        cm_lowest_eu: true,
        cm_lowest_de: true,
        cm_lowest_fr: true,
        cm_lowest_es: true,
        cm_lowest_it: true,
        contentSets: { select: { episode_id: true } },
        includedCards: { select: { card_id: true } },
      },
    }),
    setCodes.length
      ? db.setPullRateRarity.findMany({
          where: { set_code: { in: setCodes.map((code) => code.toUpperCase()) } },
          orderBy: { imported_at: "desc" },
          select: {
            source: true,
            set_code: true,
            normalized_rarity: true,
            pull_rate_odds: true,
            specific_pull_denominator: true,
            psa_avg_gem_pct: true,
          },
        })
      : Promise.resolve([]),
    loadArtistDemand(artists),
    loadCollectorDemandScores(games),
    db.card.groupBy({
      by: ["episode_id", "rarity"],
      where: { episode_id: { in: episodeIds }, rarity: { not: null } },
    }),
    db.cardEbayDemandSnapshot.findMany({
      where: {
        card_id: { in: cardIds },
        marketplace_id: ebayDemandMarketplaceId,
        mode: { in: ["raw", "graded"] },
        snapshot_date: { gte: demandHistoryStart },
        updated_at: { gte: EBAY_DEMAND_COHORT_REVISION_AT },
      },
      orderBy: [{ card_id: "asc" }, { snapshot_date: "asc" }, { updated_at: "asc" }],
      select: {
        card_id: true,
        mode: true,
        snapshot_date: true,
        updated_at: true,
        capped: true,
        observed_count: true,
        clean_count: true,
        active_count: true,
        new_count: true,
        removed_count: true,
        median_ask_eur: true,
        lowest_ask_eur: true,
      },
    }),
    db.setLifecycleObservation.findMany({
      where: { episode_id: { in: episodeIds } },
      orderBy: [{ observed_at: "desc" }, { created_at: "desc" }],
      select: {
        episode_id: true,
        status: true,
        oop_probability: true,
        confidence: true,
        observed_at: true,
        evidence_json: true,
      },
    }),
  ]);

  const lifecycleByEpisode = new Map<
    string,
    (typeof lifecycleObservations)[number]
  >();
  for (const observation of lifecycleObservations) {
    if (!lifecycleByEpisode.has(observation.episode_id)) {
      lifecycleByEpisode.set(observation.episode_id, observation);
    }
  }

  const rawEbayDemandByCard = new Map<string, EbayDemandSignalSnapshot[]>();
  const gradedEbayDemandByCard = new Map<string, EbayDemandSignalSnapshot[]>();
  for (const snapshot of ebayDemandSnapshots) {
    const demandByCard =
      snapshot.mode === "graded" ? gradedEbayDemandByCard : rawEbayDemandByCard;
    const rows = demandByCard.get(snapshot.card_id) ?? [];
    rows.push({
      snapshotDate: snapshot.snapshot_date,
      updatedAt: snapshot.updated_at,
      capped: snapshot.capped,
      observedCount: snapshot.observed_count,
      cleanCount: snapshot.clean_count,
      activeCount: snapshot.active_count,
      newCount: snapshot.new_count,
      removedCount: snapshot.removed_count,
      medianAskEur: snapshot.median_ask_eur,
      lowestAskEur: snapshot.lowest_ask_eur,
    });
    demandByCard.set(snapshot.card_id, rows);
  }

  const productIds = products.map((product) => product.id);
  const sealedSnapshots = [] as Array<{
    product_id: string;
    fetched_at: Date;
    cm_avg_7d: number | null;
    cm_lowest: number | null;
    cm_lowest_eu: number | null;
    cm_lowest_de: number | null;
    cm_lowest_fr: number | null;
    cm_lowest_es: number | null;
    cm_lowest_it: number | null;
  }>;
  for (let index = 0; index < productIds.length; index += 200) {
    sealedSnapshots.push(
      ...(await db.sealedPriceSnapshot.findMany({
        where: { product_id: { in: productIds.slice(index, index + 200) } },
        orderBy: { fetched_at: "desc" },
        select: {
          product_id: true,
          fetched_at: true,
          cm_avg_7d: true,
          cm_lowest: true,
          cm_lowest_eu: true,
          cm_lowest_de: true,
          cm_lowest_fr: true,
          cm_lowest_es: true,
          cm_lowest_it: true,
        },
      }))
    );
  }
  const snapshotsByProduct = new Map<string, typeof sealedSnapshots>();
  for (const snapshot of sealedSnapshots) {
    const existing = snapshotsByProduct.get(snapshot.product_id) ?? [];
    existing.push(snapshot);
    snapshotsByProduct.set(snapshot.product_id, existing);
  }
  const pullByKey = new Map<string, (typeof pullRates)[number]>();
  for (const pull of pullRates) {
    const key = `${pull.set_code.toUpperCase()}::${pull.normalized_rarity}`;
    if (!pullByKey.has(key) || pull.source === "pricedex") pullByKey.set(key, pull);
  }
  const raritiesByEpisode = new Map<string, string[]>();
  for (const row of episodeRarities) {
    if (!row.rarity) continue;
    const rarities = raritiesByEpisode.get(row.episode_id) ?? [];
    rarities.push(row.rarity);
    raritiesByEpisode.set(row.episode_id, rarities);
  }

  return signals.map((signal) => {
    const card = cardById.get(signal.cardId);
    if (!card) return signal;
    const ageYears = releaseAgeYears(card.episode.release_date, now);
    const relevantProducts = products.filter(
      (product) =>
        product.contentSets.some((set) => set.episode_id === card.episode.id) ||
        product.includedCards.some((included) => included.card_id === card.id)
    );
    const pricedProducts = relevantProducts
      .map((product) => ({ product, value: sealedValue(product), kind: classifySealedProduct(product.name) }))
      .filter((item): item is typeof item & { value: number } => item.value != null)
      .sort((left, right) => left.value - right.value);
    const pack = pricedProducts.find((item) => item.kind === "pack") ?? null;
    const box = pricedProducts.find((item) => item.kind === "box") ?? null;
    const representative = pack ?? box ?? pricedProducts[0] ?? null;
    const representativeHistory = representative
      ? (snapshotsByProduct.get(representative.product.id) ?? []).map((snapshot) => ({
          fetchedAt: snapshot.fetched_at,
          value: sealedValue(snapshot),
        }))
      : [];
    const trend30dPct = historyTrend(representativeHistory, 30);
    const trend90dPct = historyTrend(representativeHistory, 90);
    const lifecycle = lifecycleFields(lifecycleByEpisode.get(card.episode.id));
    const hasReprintRisk = hasActiveReprintRisk(signal.catalysts ?? []);
    const sealedPressure = calculateSealedPressure({
      ageYears,
      packPrice: pack?.value ?? null,
      rawCardPrice: signal.currency === "EUR" ? signal.currentPrice : null,
      trend30dPct,
      trend90dPct,
      packProductCount: pricedProducts.filter((item) => item.kind === "pack").length,
      hasReprintRisk,
      lifecycleOopProbability: lifecycle.lifecycleOopProbability,
      lifecycleConfidence: lifecycle.lifecycleConfidence,
    });
    const sealed: ExternalSealedIntelligence = representative
      ? {
          productCount: relevantProducts.length,
          packProductCount: pricedProducts.filter((item) => item.kind === "pack").length,
          packName: pack?.product.name ?? null,
          packPrice: pack?.value ?? null,
          boxName: box?.product.name ?? null,
          boxPrice: box?.value ?? null,
          trend30dPct,
          trend90dPct,
          ageYears,
          ...sealedPressure,
          ...lifecycle,
        }
      : {
          ...emptySealed(ageYears, lifecycle),
          ...sealedPressure,
        };

    const normalizedRarity = normalizeRarityLabel(card.rarity);
    const setRarity = calculateSetRarityPosition(
      card.rarity,
      raritiesByEpisode.get(card.episode.id) ?? []
    );
    const pull =
      card.episode.code && normalizedRarity
        ? pullByKey.get(`${card.episode.code.toUpperCase()}::${normalizedRarity}`) ?? null
        : null;
    const gemRatePct =
      pull?.psa_avg_gem_pct == null
        ? null
        : pull.psa_avg_gem_pct <= 1
          ? Number((pull.psa_avg_gem_pct * 100).toFixed(1))
          : Number(pull.psa_avg_gem_pct.toFixed(1));
    const psa10 = chooseLatestGrade(card.ebaySoldGradedPrices, "10");
    const psa9 = chooseLatestGrade(card.ebaySoldGradedPrices, "9");
    const cardMarketPsa10 = chooseCardMarketPsa10(card.gradedPrices);
    const gradedCurrent = psa10?.median_price ?? cardMarketPsa10?.price ?? null;
    const gradedCurrency = psa10 ? (psa10.currency === "EUR" ? "EUR" : "USD") : "EUR";
    const comparableRaw = signal.currency === gradedCurrency ? signal.currentPrice : null;
    const gradePremiumPct =
      gradedCurrent != null && comparableRaw != null && comparableRaw > 0
        ? Number((((gradedCurrent - comparableRaw) / comparableRaw) * 100).toFixed(1))
        : null;
    const graded: ExternalGradedIntelligence = {
      available: gradedCurrent != null,
      label: psa10?.label ?? cardMarketPsa10?.label ?? null,
      currentPrice: gradedCurrent,
      currency: gradedCurrency,
      sampleSize: psa10?.sample_size ?? null,
      psa9Price: psa9?.median_price ?? null,
      psa10Price: psa10?.median_price ?? cardMarketPsa10?.price ?? null,
      gradePremiumPct,
      gemRatePct,
      population10: null,
      populationTotal: null,
      populationStatus: gemRatePct == null ? "unavailable" : "set-rarity-estimate",
      supplyLabel: getGradedSupplyLabel(psa10?.sample_size ?? null),
    };

    const rawHistory = buildDailyMarketHistory(
      card.prices.map((price) => ({
        observedAt: price.fetched_at,
        // Signal Radar's EUR baseline is always English NM. Prefer the
        // steadier Cardmarket 7-day average and use the English NM listing
        // floor only when that day's average is unavailable.
        primaryValue:
          signal.currency === "EUR" ? price.cm_en_avg_7d : price.tcp_market,
        fallbackValues:
          signal.currency === "EUR"
            ? [price.cm_en_lowest_nm]
            : [price.tcp_mid, price.tcp_low],
      }))
    );
    const rawTrend30dPct = calculateRobustPriceTrend(rawHistory, 30)?.percent ?? null;
    const rawTrend90dPct = calculateRobustPriceTrend(rawHistory, 90)?.percent ?? null;
    const rawTrend180dPct = calculateRobustPriceTrend(rawHistory, 180)?.percent ?? null;
    const latestRaw = card.prices[0];
    const currentVsAverage30dPct =
      signal.currency === "EUR" &&
      signal.currentPrice != null &&
      latestRaw?.cm_en_avg_30d != null &&
      latestRaw.cm_en_avg_30d > 0
        ? Number(
            (
              ((signal.currentPrice - latestRaw.cm_en_avg_30d) /
                latestRaw.cm_en_avg_30d) *
              100
            ).toFixed(1)
          )
        : null;
    const rawMarketBreadth = latestRaw
      ? [
          latestRaw.cm_en_lowest_nm,
          latestRaw.cm_de_lowest_nm,
          latestRaw.cm_fr_lowest_nm,
          latestRaw.cm_es_lowest_nm,
          latestRaw.cm_it_lowest_nm,
          latestRaw.tcp_market,
        ].filter((value) => value != null && value > 0).length
      : 0;
    const ebayDemand = deriveEbayDemandIntelligence({
      marketplaceId: ebayDemandMarketplaceId,
      snapshots: rawEbayDemandByCard.get(signal.cardId) ?? [],
      currentMarketPriceEur: signal.currency === "EUR" ? signal.currentPrice : null,
      now,
    });
    const gradedEbayDemand = deriveEbayDemandIntelligence({
      marketplaceId: ebayDemandMarketplaceId,
      snapshots: gradedEbayDemandByCard.get(signal.cardId) ?? [],
      currentMarketPriceEur:
        graded.currency === "EUR" ? graded.currentPrice : null,
      now,
    });
    const artistScore = card.artist ? artistDemand.get(card.artist) ?? null : null;
    const collectorScore = collectorDemand.get(getExternalEntityKey(signal.game, signal.name)) ?? 50;
    const scarcityBase = calculateScarcityScore({
      ageYears,
      specificPullDenominator: pull?.specific_pull_denominator ?? null,
      gemRatePct,
      rawMarketBreadth,
      verifiedActiveListings:
        ebayDemand.status === "ready" || ebayDemand.status === "learning"
          ? ebayDemand.activeCount
          : null,
      sealedPressureScore: sealed.pressureScore,
      artistDemandScore: artistScore,
      setRarityScore: setRarity.setRarityScore,
    });
    const scarcity = {
      ...scarcityBase,
      ...setRarity,
      pullOdds: pull?.pull_rate_odds ?? null,
      specificPullDenominator: pull?.specific_pull_denominator ?? null,
      rawMarketBreadth,
      rawTrend90dPct,
      artist: card.artist,
      artistDemandScore: artistScore,
      collectorDemandScore: collectorScore,
    };
    const hasFreshChaseCatalyst = (signal.catalysts ?? []).some(
      (catalyst) =>
        catalyst.direction === "positive" &&
        ["reveal", "product", "localization", "hype"].includes(catalyst.kind)
    );
    const structuralConfluence = calculateGoldMineConfluence({
      artistDemandScore: artistScore,
      collectorDemandScore: collectorScore,
      specificPullDenominator: pull?.specific_pull_denominator ?? null,
      scarcityScore: scarcity.score,
      gemRatePct,
      hasFreshChaseCatalyst,
      ageYears,
    });
    const structuralOpportunity = calculateOpportunityScores({
      externalScore: signal.externalScore,
      sealedPressureScore: sealed.pressureScore,
      scarcityScore: scarcity.score,
      confluenceScore: structuralConfluence.score,
      rawEbayDemandAdjustment: ebayDemand.scoreAdjustment,
      gradedEbayDemandAdjustment: gradedEbayDemand.scoreAdjustment,
      rawTrend90dPct,
      gradePremiumPct,
      gemRatePct,
      gradedAvailable: graded.available,
      riskScore: signal.riskScore ?? 0,
      setRarityScore: setRarity.setRarityScore,
    });
    const sharedEvidenceCount =
      signal.evidence.length +
      new Set((signal.catalysts ?? []).map((item) => item.sourceUrl)).size;
    const rawEvidenceCount =
      sharedEvidenceCount + (ebayDemand.status === "ready" ? 1 : 0);
    const gradedEvidenceCount =
      sharedEvidenceCount + (gradedEbayDemand.status === "ready" ? 1 : 0);
    const rawScenario = buildPriceScenario({
      marketMode: "raw",
      currentPrice: signal.currentPrice,
      currency: signal.currency,
      ageYears,
      opportunityScore: structuralOpportunity.raw,
      sealedTrendPct: sealed.trend30dPct ?? sealed.trend90dPct,
      rawTrend30dPct,
      rawTrend90dPct,
      rawTrend180dPct,
      scarcityScore: scarcity.score,
      gemRatePct,
      riskScore: signal.riskScore ?? 0,
      evidenceCount: rawEvidenceCount,
      historyPoints: rawHistory.length,
      ebayDemandAdjustment: ebayDemand.scoreAdjustment,
      competitiveScore:
        signal.sourceMode === "competitive" || signal.sourceMode === "hybrid"
          ? signal.competitiveScore ?? null
          : null,
      catalystScore: signal.catalystScore ?? null,
      hypeScore: signal.hypeScore ?? null,
      setRarityScore: setRarity.setRarityScore,
      confluenceScore: structuralConfluence.score,
      artistDemandScore: artistScore,
      collectorDemandScore: collectorScore,
      lifecycleStatus: sealed.lifecycleStatus,
      lifecycleConfidence: sealed.lifecycleConfidence,
      lifecycleOopProbability: sealed.lifecycleOopProbability,
      currentVsAverage30dPct,
    });
    const gradedScenario = buildPriceScenario({
      marketMode: "graded",
      currentPrice: graded.currentPrice,
      currency: graded.currency,
      ageYears,
      opportunityScore: structuralOpportunity.graded,
      sealedTrendPct: sealed.trend30dPct ?? sealed.trend90dPct,
      rawTrend30dPct,
      rawTrend90dPct,
      rawTrend180dPct,
      scarcityScore: scarcity.score,
      gemRatePct,
      riskScore: signal.riskScore ?? 0,
      evidenceCount: gradedEvidenceCount + (graded.sampleSize != null ? 1 : 0),
      historyPoints: card.ebaySoldGradedPriceSnapshots.length,
      ebayDemandAdjustment: gradedEbayDemand.scoreAdjustment,
      competitiveScore:
        signal.sourceMode === "competitive" || signal.sourceMode === "hybrid"
          ? signal.competitiveScore ?? null
          : null,
      catalystScore: signal.catalystScore ?? null,
      hypeScore: signal.hypeScore ?? null,
      setRarityScore: setRarity.setRarityScore,
      confluenceScore: structuralConfluence.score,
      artistDemandScore: artistScore,
      collectorDemandScore: collectorScore,
      lifecycleStatus: sealed.lifecycleStatus,
      lifecycleConfidence: sealed.lifecycleConfidence,
      lifecycleOopProbability: sealed.lifecycleOopProbability,
    });
    const rawOpportunity = alignOpportunityScoreWithScenario(
      structuralOpportunity.raw,
      rawScenario
    );
    const gradedOpportunity =
      structuralOpportunity.graded == null
        ? null
        : alignOpportunityScoreWithScenario(structuralOpportunity.graded, gradedScenario);
    const rawConfluence = alignConfluenceWithScenario(structuralConfluence, rawScenario);
    const gradedConfluence = graded.available
      ? alignConfluenceWithScenario(structuralConfluence, gradedScenario)
      : null;
    const intelligence: ExternalMarketIntelligence = {
      rawOpportunityScore: rawOpportunity,
      gradedOpportunityScore: gradedOpportunity,
      ebayDemand,
      gradedEbayDemand,
      sealed,
      graded,
      scarcity,
      rawConfluence,
      gradedConfluence,
      // Backwards-compatible default for persisted payloads and raw-only UI.
      confluence: rawConfluence,
      rawScenario,
      gradedScenario,
    };
    return { ...signal, marketIntelligence: intelligence };
  });
}

function loadCards(cardIds: string[], now: Date) {
  // Fetch by calendar range rather than by refresh-row count: some cards have
  // many observations per day, so `take: 40` could represent less than a
  // month and was incorrectly presented as a 90-day history.
  const historyStart = new Date(now.getTime() - 220 * DAY_MS);
  return db.card.findMany({
    where: { id: { in: cardIds } },
    select: {
      id: true,
      rarity: true,
      artist: true,
      episode: { select: { id: true, code: true, release_date: true } },
      prices: {
        where: { fetched_at: { gte: historyStart } },
        orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
        select: {
          fetched_at: true,
          cm_en_avg_7d: true,
          cm_en_avg_30d: true,
          cm_en_lowest_nm: true,
          cm_de_lowest_nm: true,
          cm_fr_lowest_nm: true,
          cm_es_lowest_nm: true,
          cm_it_lowest_nm: true,
          tcp_market: true,
          tcp_mid: true,
          tcp_low: true,
        },
      },
      gradedPrices: {
        select: { label: true, price: true, fetched_at: true },
      },
      ebaySoldGradedPrices: {
        select: {
          label: true,
          company: true,
          grade: true,
          median_price: true,
          currency: true,
          sample_size: true,
          fetched_at: true,
        },
      },
      ebaySoldGradedPriceSnapshots: {
        orderBy: { fetched_at: "desc" },
        take: 60,
        select: { fetched_at: true },
      },
    },
  });
}
