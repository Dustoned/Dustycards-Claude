import "server-only";

import { db } from "@/lib/db";
import { getExternalForecastSummaries } from "@/lib/external-signal-forecast-store";
import type {
  ExternalSignalCatalyst,
  ExternalSignalRadarData,
} from "@/lib/external-signal-radar";
import { getPressureTierForScore } from "@/lib/external-signal-radar";

const SQLITE_SAFE_CARD_CHUNK_SIZE = 50;
const MAX_CATALYSTS_PER_CARD = 3;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function isCatalystKind(value: string): value is ExternalSignalCatalyst["kind"] {
  return ["support", "product", "reprint", "ban", "rotation", "hype"].includes(value);
}

function isCatalystDirection(
  value: string
): value is ExternalSignalCatalyst["direction"] {
  return ["positive", "negative", "neutral"].includes(value);
}

function isSourceKind(value: string): value is ExternalSignalCatalyst["sourceKind"] {
  return ["official", "community", "social"].includes(value);
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

export async function enrichExternalSignalRadarData(
  data: ExternalSignalRadarData,
  now = new Date()
): Promise<ExternalSignalRadarData> {
  const cardIds = [...new Set(data.signals.map((signal) => signal.cardId))];
  if (cardIds.length === 0) return data;
  const [forecasts, catalystsByCard] = await Promise.all([
    getExternalForecastSummaries(cardIds),
    loadActiveCatalysts(cardIds, now),
  ]);

  const signals = data.signals
    .map((signal) => {
      const catalysts = catalystsByCard.get(signal.cardId) ?? [];
      const scores = calculateCatalystScores(catalysts);
      const competitiveScore = signal.competitiveScore ?? signal.externalScore;
      const externalScore = Math.round(
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
      return {
        ...signal,
        competitiveScore,
        externalScore,
        pressureLabel: pressure.label,
        pressureExplanation: pressure.explanation,
        forecast: forecasts.get(signal.cardId) ?? null,
        catalysts,
        ...scores,
      };
    })
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
