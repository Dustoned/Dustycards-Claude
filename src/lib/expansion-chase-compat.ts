import type {
  ExpansionChaseRadarCard,
  ExpansionChaseRadarData,
} from "@/lib/expansion-chase-radar";

type ChaseBuySignal = ExpansionChaseRadarCard["buySignal"];

const BUY_SIGNAL_LABELS = new Set<ChaseBuySignal["label"]>([
  "strong_sell",
  "sell",
  "hold",
  "buy",
  "strong_buy",
]);
const BUY_SIGNAL_CONFIDENCE = new Set<ChaseBuySignal["confidence"]>([
  "low",
  "medium",
  "high",
]);

export const FALLBACK_CHASE_BUY_SIGNAL: ChaseBuySignal = {
  label: "hold",
  label_text: "Hold",
  score: 50,
  confidence: "low",
};

export function getSafeChaseBuySignal(
  card: Pick<ExpansionChaseRadarCard, "buySignal"> | { buySignal?: unknown }
): ChaseBuySignal {
  const value = card.buySignal;
  if (!value || typeof value !== "object") return FALLBACK_CHASE_BUY_SIGNAL;

  const candidate = value as Partial<ChaseBuySignal>;
  if (
    !BUY_SIGNAL_LABELS.has(candidate.label as ChaseBuySignal["label"]) ||
    typeof candidate.label_text !== "string" ||
    !Number.isFinite(candidate.score) ||
    !BUY_SIGNAL_CONFIDENCE.has(candidate.confidence as ChaseBuySignal["confidence"])
  ) {
    return FALLBACK_CHASE_BUY_SIGNAL;
  }

  return candidate as ChaseBuySignal;
}

export function normalizeExpansionChaseRadarData(
  data: ExpansionChaseRadarData
): ExpansionChaseRadarData {
  return {
    ...data,
    cards: data.cards.map((card) => ({
      ...card,
      buySignal: getSafeChaseBuySignal(card),
    })),
  };
}
