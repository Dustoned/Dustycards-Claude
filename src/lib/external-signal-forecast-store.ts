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

export interface ExternalCardForecastSummary {
  cardId: string;
  game: string;
  modelVersion: string;
  signalTier: string;
  priceBand: string | null;
  observedAt: string;
  targets: Record<ExternalForecastTargetKey, ExternalForecastTargetSummary>;
}

export interface ExternalOutcomeEvaluationResult {
  matured: number;
  evaluated: number;
  complete: number;
  insufficient: number;
  truncated: boolean;
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

async function loadPriceRowsForMaturedOutcomes(
  outcomes: Awaited<ReturnType<typeof loadMaturedPendingOutcomes>>
): Promise<Map<string, CardmarketPriceRow[]>> {
  const rowsByCardId = new Map<string, CardmarketPriceRow[]>();
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
    const cards = await db.card.findMany({
      where: { id: { in: chunk } },
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
      {
        fetchedAtGte: new Date(earliestEntryMs + 1),
        fetchedAtLte: new Date(latestHorizonMs),
      }
    );
    for (const card of cards) {
      rowsByCardId.set(
        card.id,
        (historyByCardId.get(card.id) ?? []).map((row) => ({
          card_id: card.id,
          fetched_at: row.fetched_at,
          cm_en_avg_7d: row.cm_en_avg_7d,
          cm_en_lowest_nm: row.cm_en_lowest_nm,
          cm_de_lowest_nm: row.cm_de_lowest_nm,
          cm_fr_lowest_nm: row.cm_fr_lowest_nm,
          cm_es_lowest_nm: row.cm_es_lowest_nm,
          cm_it_lowest_nm: row.cm_it_lowest_nm,
        }))
      );
    }
  }

  return rowsByCardId;
}

/**
 * Evaluates a bounded batch of horizons that have actually matured. Price
 * history is loaded per at-most-50-card chunk; there is no per-outcome query.
 * A later scheduler tick continues when `truncated` is true.
 */
export async function evaluatePendingExternalSignalOutcomes(
  now = new Date()
): Promise<ExternalOutcomeEvaluationResult> {
  const outcomes = await loadMaturedPendingOutcomes(now);
  if (outcomes.length === 0) {
    return {
      matured: 0,
      evaluated: 0,
      complete: 0,
      insufficient: 0,
      truncated: false,
    };
  }

  const pricesByCardId = await loadPriceRowsForMaturedOutcomes(outcomes);
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
      band_within: boolean | null;
    };
  }> = [];
  let complete = 0;
  let insufficient = 0;

  for (const outcome of outcomes) {
    const entry = outcome.entry_observation;
    const rawRows = pricesByCardId.get(entry.card_id) ?? [];
    const priceRows = rawRows
      .filter(
        (row) =>
          row.fetched_at > entry.observed_at &&
          row.fetched_at.getTime() <=
            entry.observed_at.getTime() + outcome.horizon_days * DAY_MS
      )
      .map((row) => ({
        observedAt: row.fetched_at,
        value: getSameSourceCardmarketValue(entry.reference_source, row),
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
          bandWithin: row.band_within,
          realizedReturnPct: row.realized_return_pct,
          entryExpectedReturnPct180: row.entry_observation.entry_expected_return_pct_180,
        }))
      );
    })
  );
  return rowsByPair;
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

  const directionRows = independentRows.filter((row) => row.directionHit != null);
  const directionAccuracy = directionRows.length
    ? directionRows.filter((row) => row.directionHit === true).length / directionRows.length
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
      targets: Object.fromEntries(targetEntries) as Record<
        ExternalForecastTargetKey,
        ExternalForecastTargetSummary
      >,
    });
  }

  return summaries;
}
