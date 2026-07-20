import "server-only";

import { db } from "@/lib/db";
import { getExternalEntityKey } from "@/lib/external-event-candidates";
import {
  ALL_GAMES,
  ONE_PIECE_GAME,
  POKEMON_GAME,
  type TradingCardGame,
  type TradingCardGameFilter,
} from "@/lib/games";
import type {
  ExternalCardSignal,
  ExternalSignalEvidence,
  ExternalSignalRadarData,
  ExternalSignalSourceStatus,
} from "@/lib/external-signal-radar";

const SQLITE_SAFE_CARD_CHUNK_SIZE = 50;

function requestedGames(filter: TradingCardGameFilter): TradingCardGame[] {
  return filter === ALL_GAMES ? [POKEMON_GAME, ONE_PIECE_GAME] : [filter];
}

function parseJsonArray<T>(value: string | null): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseDetails(value: string | null): {
  scannedDeckCount?: number;
  unmatchedCount?: number;
  sources?: ExternalSignalSourceStatus[];
} {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function confidence(value: string): ExternalCardSignal["confidence"] {
  return value === "High" || value === "Medium" ? value : "Emerging";
}

function pressure(value: string): ExternalCardSignal["pressureLabel"] {
  return value === "Breakout" || value === "Strong" ? value : "Watch";
}

function fallbackSource(game: TradingCardGame, fetchedAt: string): ExternalSignalSourceStatus {
  const pokemon = game === POKEMON_GAME;
  return {
    game,
    label: pokemon ? "Limitless Pokemon" : "Limitless One Piece",
    url: pokemon ? "https://limitlesstcg.com/decks" : "https://onepiece.limitlesstcg.com/decks",
    ok: true,
    deckCount: 0,
    fetchedAt,
    message: "Loaded from the last successful background snapshot",
  };
}

function awaitingBackgroundSource(game: TradingCardGame): ExternalSignalSourceStatus {
  const pokemon = game === POKEMON_GAME;
  return {
    game,
    label: pokemon ? "Limitless Pokemon" : "Limitless One Piece",
    url: pokemon ? "https://limitlesstcg.com/decks" : "https://onepiece.limitlesstcg.com/decks",
    ok: false,
    deckCount: 0,
    fetchedAt: null,
    message: "Waiting for the first background signal scan",
  };
}

export interface ExternalSignalRadarDetailContext {
  generatedAt: string;
  rank: number | null;
  runId: string | null;
}

/**
 * Minimal persisted context for one Radar detail page. The list loader below
 * deliberately materialises every observation and card image; a detail route
 * only needs the snapshot time and (when it was in the competitive run) rank.
 */
export async function getExternalSignalRadarDetailContext(
  cardId: string,
  game: TradingCardGame,
  now = new Date()
): Promise<ExternalSignalRadarDetailContext> {
  const run = await db.externalSignalRun.findFirst({
    where: {
      kind: "competitive",
      status: "success",
      observations: { some: { game } },
    },
    orderBy: [{ generated_at: "desc" }, { created_at: "desc" }],
    select: { id: true, generated_at: true, created_at: true },
  });
  if (!run) return { generatedAt: now.toISOString(), rank: null, runId: null };

  const generatedAt = (run.generated_at ?? run.created_at).toISOString();
  const observation = await db.externalSignalObservation.findUnique({
    where: { run_id_card_id: { run_id: run.id, card_id: cardId } },
    select: { external_score: true, archetype_count: true },
  });
  if (!observation) return { generatedAt, rank: null, runId: run.id };

  const preceding = await db.externalSignalObservation.count({
    where: {
      run_id: run.id,
      game,
      OR: [
        { external_score: { gt: observation.external_score } },
        {
          external_score: observation.external_score,
          archetype_count: { gt: observation.archetype_count },
        },
        {
          external_score: observation.external_score,
          archetype_count: observation.archetype_count,
          card_id: { lt: cardId },
        },
      ],
    },
  });

  return { generatedAt, rank: preceding + 1, runId: run.id };
}

/**
 * Render-path data for Signal Radar. External websites are deliberately never
 * contacted from a page request: the scheduler owns those scans and persists
 * their last successful result. A fresh installation gets a fast, honest
 * empty state until that first background scan completes.
 */
export async function getExternalSignalRadarPageData(
  gameFilter: TradingCardGameFilter
): Promise<ExternalSignalRadarData> {
  const persisted = await getPersistedExternalSignalRadarData(gameFilter);
  if (persisted) return persisted;

  return {
    generatedAt: new Date().toISOString(),
    signals: [],
    sources: requestedGames(gameFilter).map(awaitingBackgroundSource),
    unmatchedCount: 0,
    scannedDeckCount: 0,
  };
}

export async function getPersistedExternalSignalRadarData(
  gameFilter: TradingCardGameFilter
): Promise<ExternalSignalRadarData | null> {
  const games = requestedGames(gameFilter);
  const runs = await Promise.all(
    games.map((game) =>
      db.externalSignalRun.findFirst({
        where: {
          kind: "competitive",
          status: "success",
          observations: { some: { game } },
        },
        orderBy: [{ generated_at: "desc" }, { created_at: "desc" }],
        include: {
          observations: {
            where: { game },
            orderBy: [{ external_score: "desc" }, { id: "asc" }],
          },
        },
      })
    )
  );
  const availableRuns = runs.filter((run): run is NonNullable<typeof run> => Boolean(run));
  if (availableRuns.length === 0) return null;

  const observations = availableRuns.flatMap((run) => run.observations);
  const cardIds = [...new Set(observations.map((row) => row.card_id))];
  const cards = new Map<
    string,
    { imageUrl: string | null; rarity: string | null; episodeName: string; episodeCode: string | null }
  >();
  for (let index = 0; index < cardIds.length; index += SQLITE_SAFE_CARD_CHUNK_SIZE) {
    const rows = await db.card.findMany({
      where: { id: { in: cardIds.slice(index, index + SQLITE_SAFE_CARD_CHUNK_SIZE) } },
      select: {
        id: true,
        image_url: true,
        rarity: true,
        episode: { select: { name: true, code: true } },
      },
    });
    for (const row of rows) {
      cards.set(row.id, {
        imageUrl: row.image_url,
        rarity: row.rarity,
        episodeName: row.episode.name,
        episodeCode: row.episode.code,
      });
    }
  }

  const signals = observations
    .map((row) => {
      const card = cards.get(row.card_id);
      const signalPressure = pressure(row.pressure_label);
      return {
        rank: 0,
        cardId: row.card_id,
        entityKey: getExternalEntityKey(
          row.game === ONE_PIECE_GAME ? ONE_PIECE_GAME : POKEMON_GAME,
          row.card_name
        ),
        sourceMode:
          row.competitive_score < 0
            ? "structural"
            : row.competitive_score === 0
            ? "event"
            : row.catalyst_score !== 0 || row.hype_score !== 0 || row.risk_score !== 0
              ? "hybrid"
              : "competitive",
        game: row.game === ONE_PIECE_GAME ? ONE_PIECE_GAME : POKEMON_GAME,
        name: row.card_name,
        imageUrl: card?.imageUrl ?? null,
        cardNumber: row.card_number,
        episodeName: card?.episodeName ?? row.episode_code ?? "Unknown set",
        episodeCode: card?.episodeCode ?? row.episode_code,
        rarity: card?.rarity ?? null,
        currentPrice: row.current_price,
        currency: row.currency === "USD" ? "USD" : "EUR",
        externalScore: row.external_score,
        competitiveScore: row.competitive_score,
        confidence: confidence(row.confidence),
        horizon: "30-90 day watch",
        pressureLabel: signalPressure,
        pressureExplanation:
          signalPressure === "Breakout"
            ? "Highest observed external demand pressure"
            : signalPressure === "Strong"
              ? "Strong observed external demand pressure"
              : "External signal that still needs more confirmation",
        reasons: parseJsonArray<string>(row.reasons_json),
        evidence: parseJsonArray<ExternalSignalEvidence>(row.evidence_json),
        maxDeckSharePercent: row.max_deck_share_percent,
        maxInclusionPercent: row.max_inclusion_percent,
        archetypeCount: row.archetype_count,
        catalystScore: row.catalyst_score,
        hypeScore: row.hype_score,
        riskScore: row.risk_score,
      } satisfies ExternalCardSignal;
    })
    .sort(
      (left, right) =>
        right.externalScore - left.externalScore ||
        right.archetypeCount - left.archetypeCount ||
        left.cardId.localeCompare(right.cardId)
    )
    .map((signal, index) => ({ ...signal, rank: index + 1 }));

  const sourceMap = new Map<TradingCardGame, ExternalSignalSourceStatus>();
  let scannedDeckCount = 0;
  let unmatchedCount = 0;
  for (const run of availableRuns) {
    const details = parseDetails(run.details_json);
    scannedDeckCount += details.scannedDeckCount ?? 0;
    unmatchedCount += details.unmatchedCount ?? 0;
    const runGame = run.observations[0]?.game === ONE_PIECE_GAME ? ONE_PIECE_GAME : POKEMON_GAME;
    const stored = details.sources?.find((source) => source.game === runGame);
    sourceMap.set(
      runGame,
      stored
        ? {
            ...stored,
            ok: true,
            message: "Loaded from the last successful background snapshot",
          }
        : fallbackSource(runGame, run.generated_at?.toISOString() ?? run.created_at.toISOString())
    );
  }
  const generatedTimes = availableRuns
    .map((run) => run.generated_at?.getTime() ?? run.created_at.getTime())
    .filter(Number.isFinite);

  return {
    generatedAt: new Date(Math.max(...generatedTimes)).toISOString(),
    signals,
    sources: games.map(
      (game) => sourceMap.get(game) ?? fallbackSource(game, new Date(0).toISOString())
    ),
    unmatchedCount,
    scannedDeckCount,
  };
}

export function mergeExternalSignalRadarWithFallback(
  live: ExternalSignalRadarData,
  persisted: ExternalSignalRadarData | null,
  gameFilter: TradingCardGameFilter
): ExternalSignalRadarData {
  if (!persisted) return live;
  const games = requestedGames(gameFilter);
  const signals: ExternalCardSignal[] = [];
  const sources: ExternalSignalSourceStatus[] = [];
  const generatedTimes: number[] = [];

  for (const game of games) {
    const liveSource = live.sources.find((source) => source.game === game);
    const liveSignals = live.signals.filter((signal) => signal.game === game);
    const useLive = Boolean(liveSource?.ok && liveSignals.length > 0);
    if (useLive) {
      signals.push(...liveSignals);
      if (liveSource) sources.push(liveSource);
      if (liveSource?.fetchedAt) generatedTimes.push(new Date(liveSource.fetchedAt).getTime());
    } else {
      signals.push(...persisted.signals.filter((signal) => signal.game === game));
      const storedSource = persisted.sources.find((source) => source.game === game);
      if (storedSource) sources.push(storedSource);
      if (storedSource?.fetchedAt) generatedTimes.push(new Date(storedSource.fetchedAt).getTime());
    }
  }

  return {
    generatedAt: generatedTimes.some(Number.isFinite)
      ? new Date(Math.max(...generatedTimes.filter(Number.isFinite))).toISOString()
      : persisted.generatedAt,
    signals: signals
      .sort(
        (left, right) =>
          right.externalScore - left.externalScore ||
          right.archetypeCount - left.archetypeCount ||
          left.rank - right.rank
      )
      .map((signal, index) => ({ ...signal, rank: index + 1 })),
    sources,
    unmatchedCount: live.unmatchedCount,
    scannedDeckCount: sources.reduce((total, source) => total + source.deckCount, 0),
  };
}
