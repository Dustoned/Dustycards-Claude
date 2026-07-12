import "server-only";

import { db } from "@/lib/db";
import { getExternalEntityKey } from "@/lib/external-event-candidates";
import { getExternalForecastSummaries } from "@/lib/external-signal-forecast-store";
import type {
  ExternalCardSignal,
  ExternalEvidenceLevel,
  ExternalSignalCatalyst,
  ExternalSignalRadarData,
} from "@/lib/external-signal-radar";
import { getPressureTierForScore } from "@/lib/external-signal-radar";

const SQLITE_SAFE_CARD_CHUNK_SIZE = 50;
const MAX_CATALYSTS_PER_CARD = 3;
const MAX_EVENT_ONLY_SIGNALS = 30;
const MAX_EVENT_VARIANTS_PER_ENTITY = 3;
const MIN_EVENT_ONLY_SCORE = 40;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function isCatalystKind(value: string): value is ExternalSignalCatalyst["kind"] {
  return [
    "support",
    "product",
    "reveal",
    "localization",
    "reprint",
    "ban",
    "rotation",
    "hype",
  ].includes(value);
}

function isCatalystDirection(
  value: string
): value is ExternalSignalCatalyst["direction"] {
  return ["positive", "negative", "neutral"].includes(value);
}

function isSourceKind(value: string): value is ExternalSignalCatalyst["sourceKind"] {
  return ["official", "community", "social"].includes(value);
}

function evidenceLevel(
  sourceKind: ExternalSignalCatalyst["sourceKind"],
  text: string
): ExternalEvidenceLevel {
  if (sourceKind === "official") return "Confirmed";
  if (sourceKind === "social") return "Rumour";
  return /\b(?:leak|leaked|booklet|scan|photo)\b/i.test(text)
    ? "Credible leak"
    : "Strong evidence";
}

function catalystContext(kind: ExternalSignalCatalyst["kind"], text: string): string | null {
  const region = /\b(?:japan|japanese|jp)\b/i.test(text)
    ? "Japanese"
    : /\b(?:english|international|global)\b/i.test(text)
      ? "English / global"
      : null;
  const stage = /\b(?:leak|leaked|booklet)\b/i.test(text)
    ? "leak"
    : kind === "reveal"
      ? "reveal"
      : kind === "localization"
        ? "set mapping"
        : kind === "product"
          ? "product"
          : null;
  return [region, stage].filter(Boolean).join(" · ") || null;
}

async function loadActiveCatalysts(
  cardIds: readonly string[],
  now: Date
): Promise<Map<string, ExternalSignalCatalyst[]>> {
  const byCard = new Map<string, ExternalSignalCatalyst[]>();
  for (let index = 0; index < cardIds.length; index += SQLITE_SAFE_CARD_CHUNK_SIZE) {
    const rows = await db.externalCardCatalyst.findMany({
      where: {
        card_id: { in: cardIds.slice(index, index + SQLITE_SAFE_CARD_CHUNK_SIZE) },
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      },
      orderBy: [{ observed_at: "desc" }, { strength: "desc" }],
      include: {
        source: {
          select: {
            canonical_url: true,
            domain: true,
            source_type: true,
            title: true,
            description: true,
          },
        },
      },
    });
    for (const row of rows) {
      if (
        !row.card_id ||
        !isCatalystKind(row.catalyst_type) ||
        !isCatalystDirection(row.direction) ||
        !isSourceKind(row.source.source_type)
      ) {
        continue;
      }
      const existing = byCard.get(row.card_id) ?? [];
      if (existing.length >= MAX_CATALYSTS_PER_CARD) continue;
      const sourceText = [
        row.source.title,
        row.source.description,
        row.headline,
        row.evidence_excerpt,
      ]
        .filter(Boolean)
        .join(" ");
      existing.push({
        id: row.id,
        kind: row.catalyst_type,
        direction: row.direction,
        strength: clamp(row.strength, 0, 1),
        headline: row.headline,
        explanation: row.explanation,
        sourceUrl: row.source.canonical_url,
        sourceDomain: row.source.domain,
        sourceKind: row.source.source_type,
        evidenceLevel: evidenceLevel(row.source.source_type, sourceText),
        contextLabel: catalystContext(row.catalyst_type, sourceText),
        observedAt: row.observed_at.toISOString(),
        expiresAt: row.expires_at?.toISOString() ?? null,
      });
      byCard.set(row.card_id, existing);
    }
  }
  return byCard;
}

function calculateCatalystScores(catalysts: readonly ExternalSignalCatalyst[]): {
  catalystScore: number;
  hypeScore: number;
  riskScore: number;
} {
  let catalystScore = 0;
  let hypeScore = 0;
  let riskScore = 0;
  for (const catalyst of catalysts) {
    const sourceWeight =
      catalyst.sourceKind === "official" ? 1 : catalyst.sourceKind === "community" ? 0.75 : 0.4;
    const weightedStrength = catalyst.strength * sourceWeight;
    const signed = catalyst.direction === "positive" ? weightedStrength : -weightedStrength;
    if (catalyst.kind === "hype") hypeScore += signed;
    else if (catalyst.direction === "negative") riskScore += weightedStrength;
    else catalystScore += signed;
  }
  return {
    catalystScore: clamp(catalystScore, -1, 1),
    hypeScore: clamp(hypeScore, -1, 1),
    riskScore: clamp(riskScore, 0, 1),
  };
}

function getEventConfidence(catalysts: readonly ExternalSignalCatalyst[]): ExternalCardSignal["confidence"] {
  if (catalysts.some((catalyst) => catalyst.evidenceLevel === "Confirmed")) return "High";
  const independentSources = new Set(catalysts.map((catalyst) => catalyst.sourceUrl)).size;
  if (independentSources >= 2) return "High";
  if (
    catalysts.some((catalyst) =>
      ["Strong evidence", "Credible leak"].includes(catalyst.evidenceLevel)
    )
  ) {
    return "Medium";
  }
  return "Emerging";
}

export function calculateExternalEventScore(
  catalysts: readonly ExternalSignalCatalyst[],
  scores: ReturnType<typeof calculateCatalystScores>
): number {
  const sourceBonus = Math.min(8, new Set(catalysts.map((item) => item.sourceUrl)).size * 3);
  return Math.round(
    clamp(
      24 +
        Math.max(0, scores.catalystScore) * 48 +
        Math.max(0, scores.hypeScore) * 20 +
        sourceBonus -
        scores.riskScore * 38,
      0,
      100
    )
  );
}

async function loadActiveCatalystCardIds(now: Date): Promise<string[]> {
  const rows = await db.externalCardCatalyst.findMany({
    where: {
      card_id: { not: null },
      direction: { in: ["positive", "neutral"] },
      OR: [{ expires_at: null }, { expires_at: { gt: now } }],
    },
    distinct: ["card_id"],
    select: { card_id: true },
  });
  return rows.map((row) => row.card_id).filter((cardId): cardId is string => Boolean(cardId));
}

function firstPositivePrice(values: Array<number | null | undefined>): number | null {
  return values.find((value): value is number => value != null && Number.isFinite(value) && value > 0) ?? null;
}

async function loadEventSignalSeeds(
  cardIds: readonly string[]
): Promise<ExternalCardSignal[]> {
  const seeds: ExternalCardSignal[] = [];
  for (let index = 0; index < cardIds.length; index += SQLITE_SAFE_CARD_CHUNK_SIZE) {
    const rows = await db.card.findMany({
      where: { id: { in: cardIds.slice(index, index + SQLITE_SAFE_CARD_CHUNK_SIZE) } },
      select: {
        id: true,
        game: true,
        name: true,
        image_url: true,
        card_number: true,
        printed_card_number: true,
        rarity: true,
        episode: { select: { name: true, code: true } },
        prices: {
          orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            cm_en_avg_7d: true,
            cm_en_lowest_nm: true,
            cm_de_lowest_nm: true,
            cm_fr_lowest_nm: true,
            cm_es_lowest_nm: true,
            cm_it_lowest_nm: true,
            tcp_market: true,
          },
        },
      },
    });
    for (const row of rows) {
      const price = row.prices[0];
      const eur = price
        ? firstPositivePrice([
            price.cm_en_avg_7d,
            price.cm_en_lowest_nm,
            price.cm_de_lowest_nm,
            price.cm_fr_lowest_nm,
            price.cm_es_lowest_nm,
            price.cm_it_lowest_nm,
          ])
        : null;
      const usd = eur == null ? firstPositivePrice([price?.tcp_market]) : null;
      if (eur == null && usd == null) continue;
      const game = row.game === "one-piece" ? "one-piece" : "pokemon";
      seeds.push({
        rank: 0,
        cardId: row.id,
        entityKey: getExternalEntityKey(game, row.name),
        sourceMode: "event",
        game,
        name: row.name,
        imageUrl: row.image_url,
        cardNumber: row.printed_card_number ?? row.card_number,
        episodeName: row.episode.name,
        episodeCode: row.episode.code,
        rarity: row.rarity,
        currentPrice: eur ?? usd,
        currency: eur != null ? "EUR" : "USD",
        externalScore: 0,
        competitiveScore: 0,
        confidence: "Emerging",
        horizon: "30-90 day watch",
        pressureLabel: "Watch",
        pressureExplanation: "Fresh external event that still needs confirmation",
        reasons: [],
        evidence: [],
        maxDeckSharePercent: 0,
        maxInclusionPercent: 0,
        archetypeCount: 0,
      });
    }
  }
  return seeds;
}

function selectDiverseEventSignals(signals: ExternalCardSignal[]): ExternalCardSignal[] {
  const perEntity = new Map<string, number>();
  return signals
    .sort(
      (left, right) =>
        right.externalScore - left.externalScore ||
        (right.currentPrice ?? 0) - (left.currentPrice ?? 0) ||
        left.cardId.localeCompare(right.cardId)
    )
    .filter((signal) => {
      const key = signal.entityKey ?? `${signal.game}:${signal.name.toLowerCase()}`;
      const count = perEntity.get(key) ?? 0;
      if (count >= MAX_EVENT_VARIANTS_PER_ENTITY) return false;
      perEntity.set(key, count + 1);
      return true;
    })
    .slice(0, MAX_EVENT_ONLY_SIGNALS);
}

export async function enrichExternalSignalRadarData(
  data: ExternalSignalRadarData,
  now = new Date()
): Promise<ExternalSignalRadarData> {
  const existingCardIds = new Set(data.signals.map((signal) => signal.cardId));
  const activeCatalystCardIds = await loadActiveCatalystCardIds(now);
  const eventSeeds = await loadEventSignalSeeds(
    activeCatalystCardIds.filter((cardId) => !existingCardIds.has(cardId))
  );
  const seeds = [
    ...data.signals.map((signal) => ({
      ...signal,
      entityKey: signal.entityKey ?? getExternalEntityKey(signal.game, signal.name),
      sourceMode: signal.sourceMode ?? ("competitive" as const),
    })),
    ...eventSeeds,
  ];
  const catalystsByCard = await loadActiveCatalysts(
    [...new Set(seeds.map((signal) => signal.cardId))],
    now
  );

  const scored = seeds
    .map((signal) => {
      const catalysts = catalystsByCard.get(signal.cardId) ?? [];
      const scores = calculateCatalystScores(catalysts);
      const competitiveScore = signal.competitiveScore ?? signal.externalScore;
      const eventOnly = competitiveScore <= 0;
      const externalScore = eventOnly
        ? calculateExternalEventScore(catalysts, scores)
        : Math.round(
            clamp(
              competitiveScore +
                scores.catalystScore * 12 +
                scores.hypeScore * 8 -
                scores.riskScore * 18,
              0,
              100
            )
          );
      const pressure = getPressureTierForScore(externalScore);
      const sourceMode: NonNullable<ExternalCardSignal["sourceMode"]> = eventOnly
        ? "event"
        : catalysts.length
          ? "hybrid"
          : "competitive";
      const eventReasons = eventOnly
        ? [
            catalysts[0]?.headline ?? "Fresh set or character event",
            catalysts[0]?.explanation ?? "External evidence is being verified.",
            `${new Set(catalysts.map((item) => item.sourceUrl)).size} independent source${new Set(catalysts.map((item) => item.sourceUrl)).size === 1 ? "" : "s"} linked`,
          ]
        : signal.reasons;
      return {
        ...signal,
        competitiveScore,
        externalScore,
        sourceMode,
        confidence: eventOnly ? getEventConfidence(catalysts) : signal.confidence,
        pressureLabel: pressure.label,
        pressureExplanation: pressure.explanation,
        reasons: eventReasons,
        catalysts,
        ...scores,
      };
    });
  const competitiveSignals = scored.filter((signal) => signal.sourceMode !== "event");
  const eventSignals = selectDiverseEventSignals(
    scored.filter(
      (signal) => signal.sourceMode === "event" && signal.externalScore >= MIN_EVENT_ONLY_SCORE
    )
  );
  const selected = [...competitiveSignals, ...eventSignals];
  const forecasts = await getExternalForecastSummaries(selected.map((signal) => signal.cardId));
  const signals = selected
    .map((signal) => ({
      ...signal,
      forecast: forecasts.get(signal.cardId) ?? null,
    }))
    .sort(
      (left, right) =>
        right.externalScore - left.externalScore ||
        right.archetypeCount - left.archetypeCount ||
        left.rank - right.rank
    )
    .map((signal, index) => ({ ...signal, rank: index + 1 }));

  return {
    ...data,
    signals,
  };
}
