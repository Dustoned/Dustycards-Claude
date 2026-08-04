import { buildMoverScores, type MoverWindowLike } from "@/lib/mover-scoring";
import { KNOWN_RARITY_ORDER, normalizeRarityLabel } from "@/lib/rarity";
import type { CollectionCardViewItem } from "@/types/collection-view";

const DAY_MS = 24 * 60 * 60 * 1000;

interface PriceHistoryRow {
  card_id: string;
  fetched_at: Date | string;
  cm_en_lowest_nm: number | null;
}

interface SeriesPoint {
  timestamp: number;
  value: number;
}

export interface BinderNextBuyRecommendation {
  cardId: string;
  name: string;
  imageUrl: string | null;
  cardNumber: string | null;
  rarity: string | null;
  episodeName: string;
  episodeId: string;
  currentPriceEur: number;
  buyNowScore: number;
  signalScore: number | null;
  moverOpportunityScore: number;
  chaseScore: number | null;
  chaseTier: string | null;
  completionAfterPercent: number | null;
  label: "Best now" | "Good pick" | "Budget pick";
  reason: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function rarityWeight(rarity: string | null): number {
  const normalized = normalizeRarityLabel(rarity);
  if (!normalized) return 1;
  const index = KNOWN_RARITY_ORDER.indexOf(
    normalized as (typeof KNOWN_RARITY_ORDER)[number]
  );
  if (index < 0) return 1.08;
  return 0.75 + (index / Math.max(KNOWN_RARITY_ORDER.length - 1, 1)) * 0.95;
}

function windowMetric(series: SeriesPoint[], desiredDays: number): MoverWindowLike | null {
  if (series.length < 2) return null;
  const latest = series[series.length - 1];
  const cutoff = latest.timestamp - desiredDays * DAY_MS;
  const baseline =
    [...series].reverse().find((point) => point.timestamp <= cutoff) ?? series[0];
  if (!baseline || baseline.timestamp >= latest.timestamp || baseline.value <= 0) return null;
  const change = Number((latest.value - baseline.value).toFixed(2));
  return {
    change,
    changePct: Number(((change / baseline.value) * 100).toFixed(1)),
    coveredDays: Math.max(1, Math.round((latest.timestamp - baseline.timestamp) / DAY_MS)),
  };
}

function buildSeries(history: PriceHistoryRow[]): Map<string, SeriesPoint[]> {
  const byCard = new Map<string, SeriesPoint[]>();
  for (const row of history) {
    if (
      row.cm_en_lowest_nm == null ||
      !Number.isFinite(row.cm_en_lowest_nm) ||
      row.cm_en_lowest_nm <= 0 ||
      row.cm_en_lowest_nm === 9001
    ) {
      continue;
    }
    const timestamp = new Date(row.fetched_at).getTime();
    if (!Number.isFinite(timestamp)) continue;
    const points = byCard.get(row.card_id) ?? [];
    points.push({ timestamp, value: row.cm_en_lowest_nm });
    byCard.set(row.card_id, points);
  }
  for (const points of byCard.values()) points.sort((a, b) => a.timestamp - b.timestamp);
  return byCard;
}

function recommendationReason(input: {
  signalScore: number | null;
  opportunityScore: number;
  price: number;
  medianPrice: number;
  rarity: string | null;
  chaseScore: number | null;
}): string {
  if (input.chaseScore != null && input.chaseScore >= 85 && (input.signalScore ?? 0) >= 70) {
    return "Chase-tier gap backed by a strong signal";
  }
  if (input.chaseScore != null && input.chaseScore >= 85) {
    return "Chase-tier card with higher binder priority";
  }
  if (input.signalScore != null && input.signalScore >= 72 && input.opportunityScore >= 8) {
    return "Strong signal with an attractive price window";
  }
  if (input.opportunityScore >= 10) return "Movers model sees an off-peak opportunity";
  if (input.signalScore != null && input.signalScore >= 72) return "One of your strongest current signals";
  if (rarityWeight(input.rarity) >= 1.35) return "Higher-rarity gap with good completion impact";
  if (input.price <= input.medianPrice) return "Affordable versus your other missing cards";
  return "Balanced price, signal and binder progress";
}

export function buildBinderNextBuyRecommendations({
  items,
  history,
  ownedCount,
  totalCards,
  limit = 3,
}: {
  items: CollectionCardViewItem[];
  history: PriceHistoryRow[];
  ownedCount: number;
  totalCards: number;
  limit?: number;
}): BinderNextBuyRecommendation[] {
  const priced = items.filter(
    (item): item is CollectionCardViewItem & { current_value: number } =>
      item.current_value != null && Number.isFinite(item.current_value) && item.current_value > 0
  );
  if (priced.length === 0) return [];

  const sortedPrices = priced.map((item) => item.current_value).sort((a, b) => a - b);
  const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)] ?? 0;
  const maximumPrice = sortedPrices[sortedPrices.length - 1] ?? medianPrice;
  const historyByCard = buildSeries(history);
  const completionAfterPercent =
    totalCards > 0 ? Math.min(100, Math.round(((ownedCount + 1) / totalCards) * 100)) : null;

  return priced
    .flatMap((item) => {
      const series = historyByCard.get(item.card_id) ?? [];
      const values = series.map((point) => point.value);
      const current = item.current_value;
      const first = values[0] ?? current;
      const low = values.length > 0 ? Math.min(...values) : current;
      const high = values.length > 0 ? Math.max(...values) : current;
      const rarity = rarityWeight(item.rarity);
      const mover = buildMoverScores({
        kind: "raw",
        currentPrice: current,
        change7d: windowMetric(series, 7),
        change30d: windowMetric(series, 30),
        changeSinceTrackedPct: first > 0 ? ((current - first) / first) * 100 : null,
        changeFromLowPct: low > 0 ? ((current - low) / low) * 100 : null,
        gapToPeakPct: high > 0 ? ((current - high) / high) * 100 : null,
        historyPoints: series.length,
        lifetimeHistoryPoints: series.length,
        rarityWeight: rarity,
        cheapnessWeight: clamp(1.55 - current / Math.max(maximumPrice, 1), 0.8, 1.55),
      });
      if (mover.priceQuality.status === "suspicious") return [];

      const signalScore =
        item.signal_score == null ? null : clamp(item.signal_score, 0, 100);
      const chaseScore =
        item.chase_score == null ? null : clamp(item.chase_score, 0, 100);
      const isChase = (chaseScore ?? 0) >= 85;
      const affordability =
        maximumPrice <= 0 ? 1 : 1 - clamp(current / maximumPrice, 0, 1);
      const lowValuePenalty =
        current < 1 ? (isChase ? 14 : 26) : current < 5 ? (isChase ? 10 : 18) : 0;
      const chaseBonus = isChase
        ? 18 + ((signalScore ?? 0) >= 70 ? 8 : 0)
        : chaseScore != null && chaseScore >= 60
          ? 6
          : 0;
      const buyNowScore = Math.round(
        clamp(
          (signalScore ?? 50) * 0.44 +
            clamp(mover.opportunityScore / 22, 0, 1) * 25 +
            affordability * 10 +
            clamp((rarity - 0.75) / 0.95, 0, 1) * 8 +
            chaseBonus +
            3 -
            lowValuePenalty,
          0,
          100
        )
      );

      return [{
        cardId: item.card_id,
        name: item.name,
        imageUrl: item.image_url,
        cardNumber: item.card_number,
        rarity: item.rarity,
        episodeName: item.episode_name,
        episodeId: item.episode_id,
        currentPriceEur: Number(current.toFixed(2)),
        buyNowScore,
        signalScore: signalScore == null ? null : Math.round(signalScore),
        moverOpportunityScore: Math.round(mover.opportunityScore),
        chaseScore: chaseScore == null ? null : Math.round(chaseScore),
        chaseTier: item.chase_tier ?? null,
        completionAfterPercent,
        label: buyNowScore >= 72 ? "Best now" as const : buyNowScore >= 56 ? "Good pick" as const : "Budget pick" as const,
        reason: recommendationReason({
          signalScore,
          opportunityScore: mover.opportunityScore,
          price: current,
          medianPrice,
          rarity: item.rarity,
          chaseScore,
        }),
      }];
    })
    .sort(
      (left, right) =>
        right.buyNowScore - left.buyNowScore ||
        left.currentPriceEur - right.currentPriceEur ||
        left.name.localeCompare(right.name)
    )
    .slice(0, Math.max(0, limit));
}
