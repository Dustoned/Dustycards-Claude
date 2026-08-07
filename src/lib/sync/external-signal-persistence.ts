import { db } from "@/lib/db";
import { loadSafeCardMarketHistoryRows } from "@/lib/card-market-history";
import { getSameSourceCardmarketValue } from "@/lib/external-signal-forecast-store";
import type {
  ExternalCardSignal,
  ExternalPriceScenario,
  ExternalSignalRadarData,
} from "@/lib/external-signal-radar";

export const EXTERNAL_COMPETITIVE_REFRESH_INTERVAL_MS = 6 * 60 * 60_000;
export const EXTERNAL_CATALYST_REFRESH_INTERVAL_MS = 24 * 60 * 60_000;
export const EXTERNAL_SIGNAL_MODEL_VERSION = "v11-hype-reset-support";
export const EXTERNAL_SIGNAL_OUTCOME_HORIZONS = [30, 90, 180] as const;
const INDEPENDENT_ENTRY_GAP_MS = 14 * 24 * 60 * 60_000;
const REFERENCE_PRICE_MAX_AGE_MS = 72 * 60 * 60_000;

interface CardmarketReference {
  price: number;
  source: "cardmarket:en-nm";
  fetchedAt: Date;
}

interface EntryForecastFields {
  entry_outlook: string | null;
  entry_expected_return_pct_180: number | null;
  entry_opportunity_score: number | null;
  entry_scenario_json: string | null;
}

interface PreviousEpisodeEntry {
  observedAt: Date;
  pressureLabel: string;
}

export function isExternalRefreshDue(
  lastFinishedAt: Date | null | undefined,
  intervalMs: number,
  now = new Date()
): boolean {
  return !lastFinishedAt || lastFinishedAt.getTime() <= now.getTime() - intervalMs;
}

export function getExternalSignalPriceBand(price: number | null): string | null {
  if (price == null || !Number.isFinite(price) || price < 1) return null;
  if (price < 5) return "under-5";
  if (price < 25) return "5-25";
  if (price < 100) return "25-100";
  return "100-plus";
}

export function getCompleteExternalSignalGames(
  data: ExternalSignalRadarData
): Set<ExternalCardSignal["game"]> {
  return new Set(
    data.sources
      .filter((source) => source.ok && source.message == null && source.deckCount > 0)
      .map((source) => source.game)
  );
}

async function loadFreshCardmarketReferences(
  signals: ExternalCardSignal[],
  now: Date
): Promise<Map<string, CardmarketReference>> {
  const references = new Map<string, CardmarketReference>();
  const cardIds = [...new Set(signals.map((signal) => signal.cardId))];
  const oldestAllowed = new Date(now.getTime() - REFERENCE_PRICE_MAX_AGE_MS);

  for (let index = 0; index < cardIds.length; index += 50) {
    const cards = await db.card.findMany({
      where: { id: { in: cardIds.slice(index, index + 50) } },
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
      { fetchedAtGte: oldestAllowed }
    );
    for (const card of cards) {
      // The displayed raw scenario starts on English Near Mint, so outcome
      // tracking must anchor on that exact same family as well.
      const latest = [...(historyByCardId.get(card.id) ?? [])]
        .reverse()
        .find((row) => getSameSourceCardmarketValue("cardmarket:en-nm", row) != null);
      if (!latest) continue;
      const englishNearMint = getSameSourceCardmarketValue("cardmarket:en-nm", latest);
      if (englishNearMint != null) {
        references.set(card.id, {
          price: englishNearMint,
          source: "cardmarket:en-nm",
          fetchedAt: latest.fetched_at,
        });
      }
    }
  }
  return references;
}

async function loadPreviousEpisodeEntries(
  signals: ExternalCardSignal[]
): Promise<Map<string, PreviousEpisodeEntry>> {
  const entries = new Map<string, PreviousEpisodeEntry>();
  const cardIds = [...new Set(signals.map((signal) => signal.cardId))];
  for (let index = 0; index < cardIds.length; index += 50) {
    const rows = await db.externalSignalObservation.findMany({
      where: {
        card_id: { in: cardIds.slice(index, index + 50) },
        is_episode_entry: true,
        model_version: EXTERNAL_SIGNAL_MODEL_VERSION,
      },
      orderBy: [{ card_id: "asc" }, { observed_at: "desc" }],
      select: { card_id: true, observed_at: true, pressure_label: true },
    });
    for (const row of rows) {
      if (!entries.has(row.card_id)) {
        entries.set(row.card_id, {
          observedAt: row.observed_at,
          pressureLabel: row.pressure_label,
        });
      }
    }
  }
  return entries;
}

function pressureRank(label: string): number {
  if (label === "Breakout") return 2;
  if (label === "Strong") return 1;
  return 0;
}

/**
 * Serializes the displayed scenario band exactly as scoreForecastOutcome
 * expects: { points: { d30:{low,base,high}, d90:{...}, d180:{...} } } in EUR.
 * Non-EUR scenarios and incomplete horizon sets are stored as null so an
 * outcome can never be scored against a band the user did not see.
 */
function serializeEntryScenario(scenario: ExternalPriceScenario | null): string | null {
  if (!scenario || scenario.currency !== "EUR") return null;
  const byDays = new Map(scenario.points.map((point) => [point.days, point]));
  const d30 = byDays.get(30);
  const d90 = byDays.get(90);
  const d180 = byDays.get(180);
  if (!d30 || !d90 || !d180) return null;
  return JSON.stringify({
    points: {
      d30: { low: d30.low, base: d30.base, high: d30.high },
      d90: { low: d90.low, base: d90.base, high: d90.high },
      d180: { low: d180.low, base: d180.base, high: d180.high },
    },
  });
}

function getEntryForecastFields(signal: ExternalCardSignal): EntryForecastFields {
  const scenario = signal.marketIntelligence?.rawScenario ?? null;
  return {
    entry_outlook: scenario?.outlook ?? null,
    entry_expected_return_pct_180: scenario?.expectedReturnPct180 ?? null,
    entry_opportunity_score: signal.marketIntelligence?.rawOpportunityScore ?? null,
    entry_scenario_json: serializeEntryScenario(scenario),
  };
}

function isIndependentEpisodeEntry(
  signal: ExternalCardSignal,
  reference: CardmarketReference | undefined,
  previous: PreviousEpisodeEntry | undefined,
  observedAt: Date
): boolean {
  if (!reference || reference.price < 1) return false;
  if (!previous) return true;
  if (observedAt.getTime() - previous.observedAt.getTime() >= INDEPENDENT_ENTRY_GAP_MS) return true;
  return pressureRank(signal.pressureLabel) > pressureRank(previous.pressureLabel);
}

/**
 * Stores every six-hour scan, but opens outcome horizons only for independent
 * episode entries: first sighting, a 14-day gap, or a higher signal tier. This
 * avoids treating repeated observations of the same run-up as independent
 * evidence. Forecast references are fresh CardMarket English-NM values only;
 * the displayed scenario is frozen on the row so outcomes score the exact
 * prediction the user saw.
 */
export async function persistExternalCompetitiveScan(
  data: ExternalSignalRadarData,
  now = new Date()
): Promise<{ runId: string; created: boolean; observations: number; episodeEntries: number }> {
  const generatedAt = new Date(data.generatedAt);
  if (!Number.isFinite(generatedAt.getTime())) {
    throw new Error("External signal scan has an invalid generatedAt value.");
  }
  const completeGames = getCompleteExternalSignalGames(data);
  const eventGames = new Set(
    data.signals
      .filter((signal) => signal.sourceMode === "event" && (signal.catalysts?.length ?? 0) > 0)
      .map((signal) => signal.game)
  );
  const persistableSignals = data.signals.filter(
    (signal) => completeGames.has(signal.game) || signal.sourceMode === "event"
  );
  if (persistableSignals.length === 0) {
    throw new Error(
      "External signal scan returned no complete game source; previous cohorts were preserved."
    );
  }

  const existing = await db.externalSignalRun.findFirst({
    where: { kind: "competitive", generated_at: generatedAt },
    select: { id: true, item_count: true, details_json: true },
  });
  if (existing) {
    const details = existing.details_json ? JSON.parse(existing.details_json) as { episodeEntries?: number } : null;
    return {
      runId: existing.id,
      created: false,
      observations: existing.item_count,
      episodeEntries: details?.episodeEntries ?? 0,
    };
  }

  const [references, previousEntries] = await Promise.all([
    loadFreshCardmarketReferences(persistableSignals, now),
    loadPreviousEpisodeEntries(persistableSignals),
  ]);
  const entryCardIds = new Set(
    persistableSignals
      .filter((signal) =>
        isIndependentEpisodeEntry(
          signal,
          references.get(signal.cardId),
          previousEntries.get(signal.cardId),
          generatedAt
        )
      )
      .map((signal) => signal.cardId)
  );
  const observedDay = generatedAt.toISOString().slice(0, 10);
  const existingDailyPrices = await db.externalSignalPriceObservation.findMany({
    where: {
      card_id: { in: persistableSignals.map((signal) => signal.cardId) },
      reference_source: "cardmarket:en-nm",
      observed_day: observedDay,
    },
    select: { card_id: true },
  });
  const existingDailyCardIds = new Set(existingDailyPrices.map((row) => row.card_id));
  const dailyPriceRows = persistableSignals.flatMap((signal) => {
    const reference = references.get(signal.cardId);
    if (!reference || existingDailyCardIds.has(signal.cardId)) return [];
    return [{
      card_id: signal.cardId,
      reference_source: reference.source,
      reference_price: reference.price,
      source_price_at: reference.fetchedAt,
      observed_at: generatedAt,
      observed_day: observedDay,
      provenance: "signal-scan",
    }];
  });

  return db.$transaction(async (tx) => {
    const run = await tx.externalSignalRun.create({
      data: {
        kind: "competitive",
        status: "success",
        requested_at: now,
        generated_at: generatedAt,
        finished_at: now,
          source_count: new Set([...completeGames, ...eventGames]).size,
        item_count: persistableSignals.length,
        details_json: JSON.stringify({
          scannedDeckCount: data.scannedDeckCount,
          unmatchedCount: data.unmatchedCount,
          episodeEntries: entryCardIds.size,
          excludedPartialGames: data.sources
            .filter((source) => !completeGames.has(source.game))
            .map((source) => source.game),
          sources: data.sources,
        }),
      },
    });

    for (const signal of persistableSignals) {
      const reference = references.get(signal.cardId);
      const isEpisodeEntry = entryCardIds.has(signal.cardId);
      const entryForecast = getEntryForecastFields(signal);
      await tx.externalSignalObservation.create({
        data: {
          run_id: run.id,
          card_id: signal.cardId,
          game: signal.game,
          card_name: signal.name,
          episode_code: signal.episodeCode,
          card_number: signal.cardNumber,
          model_version: EXTERNAL_SIGNAL_MODEL_VERSION,
          price_band: getExternalSignalPriceBand(reference?.price ?? null),
          reference_source: reference?.source ?? null,
          reference_price: reference?.price ?? null,
          reference_price_at: reference?.fetchedAt ?? null,
          is_episode_entry: isEpisodeEntry,
          entry_outlook: entryForecast.entry_outlook,
          entry_expected_return_pct_180: entryForecast.entry_expected_return_pct_180,
          entry_opportunity_score: entryForecast.entry_opportunity_score,
          entry_scenario_json: entryForecast.entry_scenario_json,
          external_score: signal.externalScore,
          competitive_score: signal.competitiveScore ?? signal.externalScore,
          confidence: signal.confidence,
          pressure_label: signal.pressureLabel,
          current_price: signal.currentPrice,
          currency: signal.currency,
          max_deck_share_percent: signal.maxDeckSharePercent,
          max_inclusion_percent: signal.maxInclusionPercent,
          archetype_count: signal.archetypeCount,
          catalyst_score: signal.catalystScore ?? 0,
          hype_score: signal.hypeScore ?? 0,
          risk_score: signal.riskScore ?? 0,
          reasons_json: JSON.stringify(signal.reasons),
          evidence_json: JSON.stringify(signal.evidence),
          observed_at: generatedAt,
          outcomes: isEpisodeEntry
            ? {
                create: EXTERNAL_SIGNAL_OUTCOME_HORIZONS.map((horizonDays) => ({
                  horizon_days: horizonDays,
                })),
              }
            : undefined,
        },
      });
    }
    if (dailyPriceRows.length > 0) {
      await tx.externalSignalPriceObservation.createMany({ data: dailyPriceRows });
    }

    return {
      runId: run.id,
      created: true,
      observations: persistableSignals.length,
      episodeEntries: entryCardIds.size,
    };
  });
}
