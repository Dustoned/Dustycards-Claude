import { loadSafeCardMarketHistoryRows } from "@/lib/card-market-history";
import { db } from "@/lib/db";
import {
  FORECAST_PUBLISH_GATES,
  evaluateSignalOutcome,
  scoreForecastOutcome,
  summarizeForecastCohort,
  type ForecastCohortSummary,
  type WilsonInterval,
} from "@/lib/external-signal-forecast";
import {
  getCardmarketMedianLow,
  getSaneCardmarketAverage7d,
} from "@/lib/market-price-sanity";
import { normalizeCardMarketListingValue } from "@/lib/price-history";

const DAY_MS = 24 * 60 * 60_000;
const REFERENCE_PRICE_MAX_AGE_MS = 72 * 60 * 60_000;
const OUTCOME_EVALUATION_BATCH_SIZE = 500;
const SQLITE_SAFE_CARD_CHUNK_SIZE = 50;
const OUTCOME_WRITE_CHUNK_SIZE = 50;

export const EXTERNAL_FORECAST_TARGETS = [
  {
    key: "1.5x-90d",
    targetMultiplier: 1.5,
    horizonDays: 90,
    hitField: "hit_15x",
  },
  {
    key: "2x-90d",
    targetMultiplier: 2,
    horizonDays: 90,
    hitField: "hit_2x",
  },
  {
    key: "3x-180d",
    targetMultiplier: 3,
    horizonDays: 180,
    hitField: "hit_3x",
  },
] as const;

/**
 * When a model-version bump leaves the new version without enough completed
 * outcomes, its cohort may borrow from the version it replaced (flagged via
 * usingPreviousModelCohort) instead of restarting calibration from zero.
 */
export const FORECAST_MODEL_VERSION_FALLBACKS: Readonly<Record<string, string>> = {
  "v9-calibrated-inputs": "v8-expanded-coverage",
};

export type ExternalForecastTarget = (typeof EXTERNAL_FORECAST_TARGETS)[number];
export type ExternalForecastTargetKey = ExternalForecastTarget["key"];
type ExternalForecastHitField = ExternalForecastTarget["hitField"];
export type ExternalForecastCohortScope = "game-tier-price" | "game-tier" | "game";

export interface ExternalForecastTargetSummary {
  key: ExternalForecastTargetKey;
  targetMultiplier: 1.5 | 2 | 3;
  horizonDays: 90 | 180;
  status: "learning" | "calibrated";
  hits: number;
  samples: number;
  uniqueCards: number;
  interval: WilsonInterval | null;
  upperBound95: number | null;
  reason: string | null;
  cohortScope: ExternalForecastCohortScope;
  cohortLabel: string;
  holdoutSamples: number;
  holdoutCalibrationError: number | null;
  directionAccuracy?: number | null;
  bandCoverage?: number | null;
  meanAbsoluteErrorPct180?: number | null;
  insufficientShare?: number | null;
  usingPreviousModelCohort?: boolean;
}

export interface ExternalForecastTrackingStatus {
  observations: number;
  independentPredictions: number;
  pending90d: number;
  complete90d: number;
  insufficient90d: number;
  pending180d: number;
  complete180d: number;
  insufficient180d: number;
  meaningfulCorrect90d: number;
  meaningfulWrong90d: number;
  smallMove90d: number;
  next90dMaturesAt: string | null;
  next180dMaturesAt: string | null;
}

export interface ExternalCardForecastSummary {
  cardId: string;
  game: string;
  modelVersion: string;
  signalTier: string;
  priceBand: string | null;
  observedAt: string;
  targets: Record<ExternalForecastTargetKey, ExternalForecastTargetSummary>;
  tracking?: ExternalForecastTrackingStatus;
}

export interface ExternalOutcomeEvaluationResult {
  matured: number;
  evaluated: number;
  complete: number;
  insufficient: number;
  truncated: boolean;
}

export interface ExternalOutcomePriceCaptureResult {
  trackedCards: number;
  captured: number;
  unavailable: number;
  observedDay: string;
}

interface CardmarketPriceRow {
  card_id: string;
  fetched_at: Date;
  cm_en_avg_7d: number | null;
  cm_en_lowest_nm: number | null;
  cm_de_lowest_nm: number | null;
  cm_fr_lowest_nm: number | null;
  cm_es_lowest_nm: number | null;
  cm_it_lowest_nm: number | null;
}

interface DailyOutcomePriceRow {
  cardId: string;
  referenceSource: string;
  observedAt: Date;
  value: number;
}

export interface ForecastCohortOutcomeSample {
  horizonDays: number;
  hit15x: boolean | null;
  hit2x: boolean | null;
  hit3x: boolean | null;
  cardId: string;
  game: string;
  modelVersion: string;
  signalTier: string;
  priceBand: string | null;
  observedAt: Date;
  status?: "complete" | "insufficient";
  directionHit?: boolean | null;
  meaningfulDirectionHit?: boolean | null;
  bandWithin?: boolean | null;
  realizedReturnPct?: number | null;
  entryExpectedReturnPct180?: number | null;
}

export interface ForecastSignalContext {
  cardId: string;
  game: string;
  modelVersion: string;
  signalTier: string;
  priceBand: string | null;
  observedAt: Date;
}

/**
 * Resolves the exact CardMarket reference family fixed when an episode starts.
 * TCGPlayer and unknown references deliberately return null so currencies and
 * marketplaces can never be mixed inside one outcome.
 */
export function getSameSourceCardmarketValue(
  referenceSource: string | null,
  row: Omit<CardmarketPriceRow, "card_id" | "fetched_at">
): number | null {
  if (referenceSource === "cardmarket:en-nm") {
    return normalizeCardMarketListingValue(row.cm_en_lowest_nm);
  }
  if (referenceSource === "cardmarket:avg7d") {
    return getSaneCardmarketAverage7d(row);
  }
  if (referenceSource === "cardmarket:median-low") {
    return getCardmarketMedianLow(row);
  }
  return null;
}

function horizonCutoff(now: Date, horizonDays: number): Date {
  return new Date(now.getTime() - horizonDays * DAY_MS);
}

function dailyPriceKey(cardId: string, referenceSource: string): string {
  return `${cardId}\u0000${referenceSource}`;
}

/**
 * Persists one append-only quote per UTC day for every card that still has an
 * open forecast horizon. A source quote may be carried forward for at most 72
 * hours, and its original fetched timestamp remains attached for provenance.
 * Unlike Price.fetched_at, these rows never lose an unchanged observation day.
 */
export async function captureOpenExternalSignalOutcomePrices(
  now = new Date()
): Promise<ExternalOutcomePriceCaptureResult> {
  const observedDay = now.toISOString().slice(0, 10);
  const open = await db.externalSignalOutcome.findMany({
    where: { status: "pending" },
    select: {
      entry_observation: {
        select: {
          card_id: true,
          reference_source: true,
        },
      },
    },
  });
  const pairs = new Map<string, { cardId: string; referenceSource: string }>();
  for (const outcome of open) {
    const cardId = outcome.entry_observation.card_id;
    const referenceSource = outcome.entry_observation.reference_source;
    if (!referenceSource) continue;
    pairs.set(dailyPriceKey(cardId, referenceSource), { cardId, referenceSource });
  }
  if (pairs.size === 0) {
    return { trackedCards: 0, captured: 0, unavailable: 0, observedDay };
  }

  const cardIds = [...new Set([...pairs.values()].map((pair) => pair.cardId))];
  const existing = await db.externalSignalPriceObservation.findMany({
    where: {
      card_id: { in: cardIds },
      observed_day: observedDay,
    },
    select: { card_id: true, reference_source: true },
  });
  const existingKeys = new Set(
    existing.map((row) => dailyPriceKey(row.card_id, row.reference_source))
  );
  const missingPairs = [...pairs.values()].filter(
    (pair) => !existingKeys.has(dailyPriceKey(pair.cardId, pair.referenceSource))
  );
  if (missingPairs.length === 0) {
    return { trackedCards: pairs.size, captured: 0, unavailable: 0, observedDay };
  }

  const cards = await db.card.findMany({
    where: { id: { in: [...new Set(missingPairs.map((pair) => pair.cardId))] } },
    select: {
      id: true,
      game: true,
      episode_id: true,
      name: true,
      card_number: true,
      printed_card_number: true,
      cardmarket_id: true,
      cardmarket_url: true,
    },
  });
  const historyByCardId = await loadSafeCardMarketHistoryRows(
    cards.map((card) => ({
      id: card.id,
      game: card.game,
      episodeId: card.episode_id,
      name: card.name,
      cardNumber: card.card_number,
      printedCardNumber: card.printed_card_number,
      cardmarketId: card.cardmarket_id,
      cardmarketUrl: card.cardmarket_url,
    })),
    { fetchedAtGte: new Date(now.getTime() - REFERENCE_PRICE_MAX_AGE_MS) }
  );
  const creates: Array<{
    card_id: string;
    reference_source: string;
    reference_price: number;
    source_price_at: Date;
    observed_at: Date;
    observed_day: string;
    provenance: string;
  }> = [];
  for (const pair of missingPairs) {
    const row = [...(historyByCardId.get(pair.cardId) ?? [])]
      .reverse()
      .find((candidate) => getSameSourceCardmarketValue(pair.referenceSource, candidate) != null);
    if (!row) continue;
    const value = getSameSourceCardmarketValue(pair.referenceSource, row);
    if (value == null) continue;
    creates.push({
      card_id: pair.cardId,
      reference_source: pair.referenceSource,
      reference_price: value,
      source_price_at: row.fetched_at,
      observed_at: now,
      observed_day: observedDay,
      provenance: "scheduler-carry-forward",
    });
  }
  if (creates.length > 0) {
    await db.externalSignalPriceObservation.createMany({ data: creates });
  }
  return {
    trackedCards: pairs.size,
    captured: creates.length,
    unavailable: missingPairs.length - creates.length,
    observedDay,
  };
}

async function loadMaturedPendingOutcomes(now: Date) {
  return db.externalSignalOutcome.findMany({
    where: {
      status: "pending",
      OR: [30, 90, 180].map((horizonDays) => ({
        horizon_days: horizonDays,
        entry_observation: {
          observed_at: { lte: horizonCutoff(now, horizonDays) },
        },
      })),
    },
    orderBy: [{ entry_observation: { observed_at: "asc" } }, { horizon_days: "asc" }],
    take: OUTCOME_EVALUATION_BATCH_SIZE,
    select: {
      id: true,
      horizon_days: true,
      entry_observation: {
        select: {
          card_id: true,
          observed_at: true,
          reference_source: true,
          reference_price: true,
          entry_outlook: true,
          entry_expected_return_pct_180: true,
          entry_scenario_json: true,
        },
      },
    },
  });
}

async function loadMaturedOutcomes(now: Date) {
  const pending = await loadMaturedPendingOutcomes(now);
  const remaining = OUTCOME_EVALUATION_BATCH_SIZE - pending.length;
  if (remaining <= 0) return pending;

  // An insufficient result is normally final, but a later history import may
  // add evidence inside its original horizon. Only those rows are retried;
  // unchanged insufficient outcomes never churn on every scheduler tick.
  const retryIds = await db.$queryRaw<Array<{ id: string }>>`
    SELECT outcome.id
    FROM "ExternalSignalOutcome" outcome
    INNER JOIN "ExternalSignalObservation" entry
      ON entry.id = outcome.entry_observation_id
    WHERE outcome.status = 'insufficient'
      AND outcome.evaluated_at IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM "ExternalSignalPriceObservation" price
        WHERE price.card_id = entry.card_id
          AND price.reference_source = entry.reference_source
          AND julianday(price.created_at) > julianday(outcome.evaluated_at)
          AND julianday(price.observed_at) > julianday(entry.observed_at)
          AND julianday(price.observed_at) <=
              julianday(entry.observed_at, '+' || outcome.horizon_days || ' days')
      )
    ORDER BY outcome.evaluated_at ASC
    LIMIT ${remaining}
  `;
  if (retryIds.length === 0) return pending;
  const retries = await db.externalSignalOutcome.findMany({
    where: { id: { in: retryIds.map((row) => row.id) } },
    orderBy: [{ entry_observation: { observed_at: "asc" } }, { horizon_days: "asc" }],
    select: {
      id: true,
      horizon_days: true,
      entry_observation: {
        select: {
          card_id: true,
          observed_at: true,
          reference_source: true,
          reference_price: true,
          entry_outlook: true,
          entry_expected_return_pct_180: true,
          entry_scenario_json: true,
        },
      },
    },
  });
  return [...pending, ...retries];
}

async function loadDailyPriceRowsForMaturedOutcomes(
  outcomes: Awaited<ReturnType<typeof loadMaturedOutcomes>>
): Promise<Map<string, DailyOutcomePriceRow[]>> {
  const rowsByPair = new Map<string, DailyOutcomePriceRow[]>();
  const cardIds = [...new Set(outcomes.map((outcome) => outcome.entry_observation.card_id))];

  for (let index = 0; index < cardIds.length; index += SQLITE_SAFE_CARD_CHUNK_SIZE) {
    const chunk = cardIds.slice(index, index + SQLITE_SAFE_CARD_CHUNK_SIZE);
    const relevantOutcomes = outcomes.filter((outcome) =>
      chunk.includes(outcome.entry_observation.card_id)
    );
    const earliestEntryMs = Math.min(
      ...relevantOutcomes.map((outcome) => outcome.entry_observation.observed_at.getTime())
    );
    const latestHorizonMs = Math.max(
      ...relevantOutcomes.map(
        (outcome) =>
          outcome.entry_observation.observed_at.getTime() + outcome.horizon_days * DAY_MS
      )
    );
    const rows = await db.externalSignalPriceObservation.findMany({
      where: {
        card_id: { in: chunk },
        observed_at: {
          gt: new Date(earliestEntryMs),
          lte: new Date(latestHorizonMs),
        },
      },
      orderBy: [{ observed_at: "asc" }, { id: "asc" }],
      select: {
        card_id: true,
        reference_source: true,
        reference_price: true,
        observed_at: true,
      },
    });
    for (const row of rows) {
      const key = dailyPriceKey(row.card_id, row.reference_source);
      const bucket = rowsByPair.get(key) ?? [];
      bucket.push({
        cardId: row.card_id,
        referenceSource: row.reference_source,
        observedAt: row.observed_at,
        value: row.reference_price,
      });
      rowsByPair.set(key, bucket);
    }
  }

  return rowsByPair;
}

/**
 * Evaluates a bounded batch of horizons that have actually matured. Price
 * history is loaded per at-most-50-card chunk; there is no per-outcome query.
 * A later scheduler tick continues when `truncated` is true.
 */
export async function evaluatePendingExternalSignalOutcomes(
  now = new Date()
): Promise<ExternalOutcomeEvaluationResult> {
  const outcomes = await loadMaturedOutcomes(now);
  if (outcomes.length === 0) {
    return {
      matured: 0,
      evaluated: 0,
      complete: 0,
      insufficient: 0,
      truncated: false,
    };
  }

  const pricesByPair = await loadDailyPriceRowsForMaturedOutcomes(outcomes);
  const writes: Array<{
    id: string;
    data: {
      status: "complete" | "insufficient";
      evaluated_at: Date;
      observed_days: number;
      coverage_ratio: number;
      max_reference_price: number | null;
      max_multiplier: number | null;
      end_reference_price: number | null;
      hit_15x: boolean | null;
      hit_2x: boolean | null;
      hit_3x: boolean | null;
      realized_return_pct: number | null;
      direction_hit: boolean | null;
      absolute_change_eur: number | null;
      meaningful_move: boolean | null;
      meaningful_direction_hit: boolean | null;
      band_within: boolean | null;
    };
  }> = [];
  let complete = 0;
  let insufficient = 0;

  for (const outcome of outcomes) {
    const entry = outcome.entry_observation;
    const rawRows = entry.reference_source
      ? (pricesByPair.get(dailyPriceKey(entry.card_id, entry.reference_source)) ?? [])
      : [];
    const priceRows = rawRows
      .filter(
        (row) =>
          row.observedAt > entry.observed_at &&
          row.observedAt.getTime() <=
            entry.observed_at.getTime() + outcome.horizon_days * DAY_MS
      )
      .map((row) => ({
        observedAt: row.observedAt,
        value: row.value,
      }));
    const entryPrice =
      entry.reference_price != null && entry.reference_price >= 1
        ? entry.reference_price
        : 0;
    const evaluated = evaluateSignalOutcome({
      entryAt: entry.observed_at,
      entryPrice,
      horizonDays: outcome.horizon_days,
      prices: priceRows,
      now,
    });
    const status = evaluated.status === "complete" ? "complete" : "insufficient";
    if (status === "complete") complete += 1;
    else insufficient += 1;
    const score = scoreForecastOutcome({
      entryOutlook: entry.entry_outlook ?? null,
      entryExpectedReturnPct180: entry.entry_expected_return_pct_180 ?? null,
      entryScenarioJson: entry.entry_scenario_json ?? null,
      horizonDays: outcome.horizon_days as 30 | 90 | 180,
      entryPrice,
      endPrice: status === "complete" ? evaluated.endReferencePrice : null,
    });
    writes.push({
      id: outcome.id,
      data: {
        status,
        evaluated_at: now,
        observed_days: evaluated.observedDays,
        coverage_ratio: evaluated.coverageRatio,
        max_reference_price: evaluated.maxReferencePrice,
        max_multiplier: evaluated.maxMultiplier,
        end_reference_price: evaluated.endReferencePrice,
        hit_15x: status === "complete" ? evaluated.hit15x : null,
        hit_2x: status === "complete" ? evaluated.hit2x : null,
        hit_3x: status === "complete" ? evaluated.hit3x : null,
        realized_return_pct: score.realizedReturnPct,
        direction_hit: score.directionHit,
        absolute_change_eur: score.absoluteChangeEur,
        meaningful_move: score.meaningfulMove,
        meaningful_direction_hit: score.meaningfulDirectionHit,
        band_within: score.bandWithin,
      },
    });
  }

  for (let index = 0; index < writes.length; index += OUTCOME_WRITE_CHUNK_SIZE) {
    const chunk = writes.slice(index, index + OUTCOME_WRITE_CHUNK_SIZE);
    await db.$transaction(
      chunk.map((write) =>
        db.externalSignalOutcome.update({
          where: { id: write.id },
          data: write.data,
        })
      )
    );
  }

  return {
    matured: outcomes.length,
    evaluated: writes.length,
    complete,
    insufficient,
    truncated: outcomes.length === OUTCOME_EVALUATION_BATCH_SIZE,
  };
}

function pairKey(game: string, modelVersion: string): string {
  return `${game}\u0000${modelVersion}`;
}

async function loadLatestSignalObservations(
  cardIds: readonly string[]
): Promise<Map<string, ForecastSignalContext>> {
  const latestByCardId = new Map<string, ForecastSignalContext>();
  for (let index = 0; index < cardIds.length; index += SQLITE_SAFE_CARD_CHUNK_SIZE) {
    const rows = await db.externalSignalObservation.findMany({
      where: { card_id: { in: cardIds.slice(index, index + SQLITE_SAFE_CARD_CHUNK_SIZE) } },
      orderBy: [{ observed_at: "desc" }, { id: "desc" }],
      select: {
        card_id: true,
        game: true,
        model_version: true,
        pressure_label: true,
        price_band: true,
        observed_at: true,
      },
    });
    for (const row of rows) {
      if (latestByCardId.has(row.card_id)) continue;
      latestByCardId.set(row.card_id, {
        cardId: row.card_id,
        game: row.game,
        modelVersion: row.model_version,
        signalTier: row.pressure_label,
        priceBand: row.price_band,
        observedAt: row.observed_at,
      });
    }
  }
  return latestByCardId;
}

async function loadCompletedCohortOutcomes(
  pairs: readonly { game: string; modelVersion: string }[]
): Promise<Map<string, ForecastCohortOutcomeSample[]>> {
  const rowsByPair = new Map<string, ForecastCohortOutcomeSample[]>();
  await Promise.all(
    pairs.map(async ({ game, modelVersion }) => {
      // Insufficient rows are loaded alongside complete ones purely so the
      // survivorship share can be reported; they never enter the hit counts.
      const rows = await db.externalSignalOutcome.findMany({
        where: {
          status: { in: ["complete", "insufficient"] },
          horizon_days: { in: [90, 180] },
          entry_observation: {
            game,
            model_version: modelVersion,
            is_episode_entry: true,
          },
        },
        orderBy: { entry_observation: { observed_at: "asc" } },
        select: {
          horizon_days: true,
          status: true,
          hit_15x: true,
          hit_2x: true,
          hit_3x: true,
          realized_return_pct: true,
          direction_hit: true,
          meaningful_direction_hit: true,
          band_within: true,
          entry_observation: {
            select: {
              card_id: true,
              game: true,
              model_version: true,
              pressure_label: true,
              price_band: true,
              observed_at: true,
              entry_expected_return_pct_180: true,
            },
          },
        },
      });
      rowsByPair.set(
        pairKey(game, modelVersion),
        rows.map((row) => ({
          horizonDays: row.horizon_days,
          hit15x: row.hit_15x,
          hit2x: row.hit_2x,
          hit3x: row.hit_3x,
          cardId: row.entry_observation.card_id,
          game: row.entry_observation.game,
          modelVersion: row.entry_observation.model_version,
          signalTier: row.entry_observation.pressure_label,
          priceBand: row.entry_observation.price_band,
          observedAt: row.entry_observation.observed_at,
          status: row.status === "insufficient" ? ("insufficient" as const) : ("complete" as const),
          directionHit: row.direction_hit,
          meaningfulDirectionHit: row.meaningful_direction_hit,
          bandWithin: row.band_within,
          realizedReturnPct: row.realized_return_pct,
          entryExpectedReturnPct180: row.entry_observation.entry_expected_return_pct_180,
        }))
      );
    })
  );
  return rowsByPair;
}

function getNextMaturityDate(
  rows: readonly {
    horizon_days: number;
    status: string;
    entry_observation: { observed_at: Date };
  }[],
  horizonDays: 90 | 180
): string | null {
  const oldestPending = rows
    .filter((row) => row.horizon_days === horizonDays && row.status === "pending")
    .reduce<Date | null>((oldest, row) => {
      const observedAt = row.entry_observation.observed_at;
      return !oldest || observedAt < oldest ? observedAt : oldest;
    }, null);
  if (!oldestPending) return null;
  return new Date(oldestPending.getTime() + horizonDays * DAY_MS).toISOString();
}

async function loadForecastTrackingStatuses(
  pairs: readonly { game: string; modelVersion: string }[]
): Promise<Map<string, ExternalForecastTrackingStatus>> {
  const statuses = new Map<string, ExternalForecastTrackingStatus>();
  await Promise.all(
    pairs.map(async ({ game, modelVersion }) => {
      const observationFilter = { game, model_version: modelVersion };
      const [observations, independentPredictions, outcomeRows] = await Promise.all([
        db.externalSignalObservation.count({ where: observationFilter }),
        db.externalSignalObservation.count({
          where: { ...observationFilter, is_episode_entry: true },
        }),
        db.externalSignalOutcome.findMany({
          where: {
            horizon_days: { in: [90, 180] },
            entry_observation: {
              ...observationFilter,
              is_episode_entry: true,
            },
          },
          select: {
            horizon_days: true,
            status: true,
            meaningful_move: true,
            meaningful_direction_hit: true,
            entry_observation: { select: { observed_at: true } },
          },
        }),
      ]);
      const count = (horizonDays: 90 | 180, status: string) =>
        outcomeRows.filter(
          (row) => row.horizon_days === horizonDays && row.status === status
        ).length;
      statuses.set(pairKey(game, modelVersion), {
        observations,
        independentPredictions,
        pending90d: count(90, "pending"),
        complete90d: count(90, "complete"),
        insufficient90d: count(90, "insufficient"),
        pending180d: count(180, "pending"),
        complete180d: count(180, "complete"),
        insufficient180d: count(180, "insufficient"),
        meaningfulCorrect90d: outcomeRows.filter(
          (row) =>
            row.horizon_days === 90 &&
            row.status === "complete" &&
            row.meaningful_direction_hit === true
        ).length,
        meaningfulWrong90d: outcomeRows.filter(
          (row) =>
            row.horizon_days === 90 &&
            row.status === "complete" &&
            row.meaningful_direction_hit === false
        ).length,
        smallMove90d: outcomeRows.filter(
          (row) =>
            row.horizon_days === 90 &&
            row.status === "complete" &&
            row.meaningful_move === false &&
            row.meaningful_direction_hit == null
        ).length,
        next90dMaturesAt: getNextMaturityDate(outcomeRows, 90),
        next180dMaturesAt: getNextMaturityDate(outcomeRows, 180),
      });
    })
  );
  return statuses;
}

/** Ensures one card cannot contribute overlapping outcomes to one horizon. */
export function dedupeCohortRowsByHorizon(
  rows: readonly ForecastCohortOutcomeSample[],
  horizonDays: number
): ForecastCohortOutcomeSample[] {
  const sorted = [...rows].sort(
    (left, right) => left.observedAt.getTime() - right.observedAt.getTime()
  );
  const lastIncludedByCard = new Map<string, number>();
  const minimumGapMs = horizonDays * DAY_MS;
  return sorted.filter((row) => {
    const observedMs = row.observedAt.getTime();
    const previousMs = lastIncludedByCard.get(row.cardId);
    if (previousMs != null && observedMs - previousMs < minimumGapMs) return false;
    lastIncludedByCard.set(row.cardId, observedMs);
    return true;
  });
}

function getHit(
  row: ForecastCohortOutcomeSample,
  field: ExternalForecastHitField
): boolean | null {
  if (field === "hit_15x") return row.hit15x;
  if (field === "hit_2x") return row.hit2x;
  return row.hit3x;
}

function summarizeRows(
  rows: readonly ForecastCohortOutcomeSample[],
  target: ExternalForecastTarget
): ForecastCohortSummary & {
  holdoutSamples: number;
  holdoutCalibrationError: number | null;
  directionAccuracy: number | null;
  bandCoverage: number | null;
  meanAbsoluteErrorPct180: number | null;
  insufficientShare: number | null;
} {
  const completeRows = rows.filter((row) => (row.status ?? "complete") === "complete");
  const dedupedRows = dedupeCohortRowsByHorizon(completeRows, target.horizonDays);
  const independentRows = dedupedRows.filter((row) => getHit(row, target.hitField) != null);
  const samples = independentRows.length;
  const hits = independentRows.filter((row) => getHit(row, target.hitField) === true).length;
  const uniqueCards = new Set(independentRows.map((row) => row.cardId)).size;
  const holdoutStart = Math.floor(samples * 0.8);
  const training = independentRows.slice(0, holdoutStart);
  const holdout = independentRows.slice(holdoutStart);
  const trainingHits = training.filter((row) => getHit(row, target.hitField) === true).length;
  const holdoutHits = holdout.filter((row) => getHit(row, target.hitField) === true).length;
  const holdoutCalibrationError =
    training.length > 0 && holdout.length > 0
      ? Math.abs(trainingHits / training.length - holdoutHits / holdout.length)
      : null;

  // Survivorship: how many episodes never produced a usable outcome (status
  // insufficient, or complete without a hit verdict for this target).
  const insufficientCount =
    rows.filter((row) => row.status === "insufficient").length +
    (dedupedRows.length - independentRows.length);
  const consideredCount = insufficientCount + samples;
  const insufficientShare = consideredCount > 0 ? insufficientCount / consideredCount : null;

  const directionRows = independentRows.filter(
    (row) => (row.meaningfulDirectionHit ?? row.directionHit) != null
  );
  const directionAccuracy = directionRows.length
    ? directionRows.filter(
        (row) => (row.meaningfulDirectionHit ?? row.directionHit) === true
      ).length /
      directionRows.length
    : null;
  const bandRows = independentRows.filter((row) => row.bandWithin != null);
  const bandCoverage = bandRows.length
    ? bandRows.filter((row) => row.bandWithin === true).length / bandRows.length
    : null;
  const absoluteErrors = independentRows
    .filter((row) => row.horizonDays === 180)
    .map((row) =>
      row.realizedReturnPct != null && row.entryExpectedReturnPct180 != null
        ? Math.abs(row.realizedReturnPct - row.entryExpectedReturnPct180)
        : null
    )
    .filter((value): value is number => value != null);
  const meanAbsoluteErrorPct180 = absoluteErrors.length
    ? absoluteErrors.reduce((sum, value) => sum + value, 0) / absoluteErrors.length
    : null;

  return {
    ...summarizeForecastCohort({
      targetMultiplier: target.targetMultiplier,
      hits,
      samples,
      uniqueCards,
      holdoutSamples: holdout.length,
      holdoutCalibrationError,
    }),
    holdoutSamples: holdout.length,
    holdoutCalibrationError,
    directionAccuracy,
    bandCoverage,
    meanAbsoluteErrorPct180,
    insufficientShare,
  };
}

function toTargetSummary(input: {
  target: ExternalForecastTarget;
  rows: ForecastCohortOutcomeSample[];
  scope: ExternalForecastCohortScope;
  label: string;
}): ExternalForecastTargetSummary {
  const summary = summarizeRows(input.rows, input.target);
  return {
    key: input.target.key,
    targetMultiplier: input.target.targetMultiplier,
    horizonDays: input.target.horizonDays,
    ...summary,
    upperBound95:
      summary.samples > 0 && summary.hits === 0
        ? Math.min(1, 3 / summary.samples)
        : null,
    cohortScope: input.scope,
    cohortLabel: input.label,
  };
}

function selectForecastCohortForVersion(input: {
  current: ForecastSignalContext;
  rows: readonly ForecastCohortOutcomeSample[];
  target: ExternalForecastTarget;
  modelVersion: string;
}): ExternalForecastTargetSummary {
  const horizonRows = input.rows.filter(
    (row) =>
      row.horizonDays === input.target.horizonDays &&
      row.game === input.current.game &&
      row.modelVersion === input.modelVersion
  );
  const candidates: Array<{
    scope: ExternalForecastCohortScope;
    label: string;
    rows: ForecastCohortOutcomeSample[];
  }> = [];
  if (input.current.priceBand) {
    candidates.push({
      scope: "game-tier-price",
      label: `${input.current.game} ${input.current.signalTier} / ${input.current.priceBand}`,
      rows: horizonRows.filter(
        (row) =>
          row.signalTier === input.current.signalTier &&
          row.priceBand === input.current.priceBand
      ),
    });
  }
  candidates.push(
    {
      scope: "game-tier",
      label: `${input.current.game} ${input.current.signalTier}`,
      rows: horizonRows.filter((row) => row.signalTier === input.current.signalTier),
    },
    {
      scope: "game",
      label: `All ${input.current.game} ${input.modelVersion} signals`,
      rows: horizonRows,
    }
  );

  let broadestLearning: ExternalForecastTargetSummary | null = null;
  for (const candidate of candidates) {
    const summary = toTargetSummary({
      target: input.target,
      rows: candidate.rows,
      scope: candidate.scope,
      label: candidate.label,
    });
    if (summary.status === "calibrated") return summary;
    broadestLearning = summary;
  }
  return broadestLearning!;
}

export function selectForecastCohort(input: {
  current: ForecastSignalContext;
  rows: readonly ForecastCohortOutcomeSample[];
  target: ExternalForecastTarget;
}): ExternalForecastTargetSummary {
  const primary = selectForecastCohortForVersion({
    ...input,
    modelVersion: input.current.modelVersion,
  });
  if (primary.status === "calibrated") return primary;
  const gate = FORECAST_PUBLISH_GATES.find(
    (candidate) => candidate.targetMultiplier === input.target.targetMultiplier
  );
  if (!gate || primary.samples >= gate.minimumSamples) return primary;
  const fallbackVersion = FORECAST_MODEL_VERSION_FALLBACKS[input.current.modelVersion];
  if (!fallbackVersion) return primary;
  const fallback = selectForecastCohortForVersion({
    ...input,
    modelVersion: fallbackVersion,
  });
  if (fallback.samples <= primary.samples) return primary;
  return { ...fallback, usingPreviousModelCohort: true };
}

/**
 * Returns latest forecast calibration per requested card. Cohorts progressively
 * widen from same game/model/tier/price-band to tier and finally game. Games are
 * never crossed; model versions only via the explicit fallback map, flagged as
 * usingPreviousModelCohort.
 */
export async function getExternalForecastSummaries(
  cardIds: readonly string[]
): Promise<Map<string, ExternalCardForecastSummary>> {
  const uniqueCardIds = [...new Set(cardIds.filter(Boolean))];
  if (uniqueCardIds.length === 0) return new Map();
  const currentByCardId = await loadLatestSignalObservations(uniqueCardIds);
  const pairsByKey = new Map(
    [...currentByCardId.values()].map((current) => [
      pairKey(current.game, current.modelVersion),
      { game: current.game, modelVersion: current.modelVersion },
    ])
  );
  for (const pair of [...pairsByKey.values()]) {
    const fallbackVersion = FORECAST_MODEL_VERSION_FALLBACKS[pair.modelVersion];
    if (!fallbackVersion) continue;
    pairsByKey.set(pairKey(pair.game, fallbackVersion), {
      game: pair.game,
      modelVersion: fallbackVersion,
    });
  }
  const cohortRowsByPair = await loadCompletedCohortOutcomes([...pairsByKey.values()]);
  const currentPairs = [
    ...new Map(
      [...currentByCardId.values()].map((current) => [
        pairKey(current.game, current.modelVersion),
        { game: current.game, modelVersion: current.modelVersion },
      ])
    ).values(),
  ];
  const trackingByPair = await loadForecastTrackingStatuses(currentPairs);
  const summaries = new Map<string, ExternalCardForecastSummary>();

  for (const current of currentByCardId.values()) {
    const fallbackVersion = FORECAST_MODEL_VERSION_FALLBACKS[current.modelVersion];
    const rows = [
      ...(cohortRowsByPair.get(pairKey(current.game, current.modelVersion)) ?? []),
      ...(fallbackVersion
        ? (cohortRowsByPair.get(pairKey(current.game, fallbackVersion)) ?? [])
        : []),
    ];
    const targetEntries = EXTERNAL_FORECAST_TARGETS.map((target) => [
      target.key,
      selectForecastCohort({ current, rows, target }),
    ] as const);
    summaries.set(current.cardId, {
      cardId: current.cardId,
      game: current.game,
      modelVersion: current.modelVersion,
      signalTier: current.signalTier,
      priceBand: current.priceBand,
      observedAt: current.observedAt.toISOString(),
      tracking: trackingByPair.get(pairKey(current.game, current.modelVersion)),
      targets: Object.fromEntries(targetEntries) as Record<
        ExternalForecastTargetKey,
        ExternalForecastTargetSummary
      >,
    });
  }

  return summaries;
}
