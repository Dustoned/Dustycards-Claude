import { normalizeRarityLabel } from "@/lib/rarity";

const DAY_MS = 86_400_000;
const MIN_RELEASE_AGE_DAYS = 45;
const MAX_RELEASE_AGE_DAYS = 1_100;
const MIN_SET_SAMPLE_SIZE = 8;
const MIN_SET_BREADTH_PCT = 55;
const MIN_CARD_ANCHOR_EUR = 5;

const POST_LAUNCH_RARITIES = new Set([
  "Secret Rare",
  "Rare Holo Star",
  "Rare Ultra",
  "Ultra Rare",
  "Radiant Rare",
  "Amazing Rare",
  "ACE SPEC Rare",
  "Rare BREAK",
  "Rare Prism Star",
  "Rare Prime",
  "Rare Rainbow",
  "Rare Shiny",
  "Rare Shiny GX",
  "Illustration Rare",
  "Art Rare",
  "Alternate Art",
  "Special Illustration Rare",
  "Special Art Rare",
  "Shiny Rare",
  "Shiny Ultra Rare",
  "Hyper Rare",
  "Rare Shining",
  "Rare ACE",
  "Trainer Gallery Rare Holo",
  "Classic Collection",
  "Black White Rare",
  "Mega Attack Rare",
  "Mega Hyper Rare",
  "LEGEND",
]);

export interface PostLaunchPriceObservation {
  observedAt: Date | string;
  value: number | null;
}

export interface PostLaunchReratingMetrics {
  releaseAgeDays: number;
  rarity: string;
  historyDayCount: number;
  first30dFloorPrice: number | null;
  day30AnchorPrice: number | null;
  currentPrice: number;
  recoveryFromFloorPct: number | null;
  recoveryFromDay30Pct: number | null;
  setSampleSize: number;
  setRisingCount: number;
  setFallingCount: number;
  setBreadthPct: number | null;
  rankingBoost: number;
  label: "No confirmation" | "Building re-rating" | "Confirmed re-rating";
}

export interface PostLaunchReratingEntry {
  cardId: string;
  episodeId: string;
  metrics: PostLaunchReratingMetrics;
}

function round(value: number, precision = 1): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function dayTimestamp(value: Date | string): number | null {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const date = new Date(parsed);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function percentageChange(current: number, baseline: number | null): number | null {
  if (baseline == null || baseline <= 0) return null;
  return round(((current - baseline) / baseline) * 100);
}

function isPromoLike(episodeName: string | null, episodeCode: string | null): boolean {
  return /\b(?:promo|promos|black\s+star|pr-[a-z0-9]+|svp|swshp|sm-p|s-p)\b/i.test(
    `${episodeName ?? ""} ${episodeCode ?? ""}`
  );
}

export function isPostLaunchReratingRarity(input: {
  game: string;
  rarity: string | null;
  episodeName?: string | null;
  episodeCode?: string | null;
}): boolean {
  if (input.game !== "pokemon" || isPromoLike(input.episodeName ?? null, input.episodeCode ?? null)) {
    return false;
  }
  const rarity = normalizeRarityLabel(input.rarity);
  return rarity != null && POST_LAUNCH_RARITIES.has(rarity);
}

function rarityRankingBonus(rarity: string): number {
  if (rarity === "Illustration Rare") return 3;
  if (rarity === "Special Illustration Rare") return 1;
  return 0;
}

export function calculatePostLaunchRerating(input: {
  game: string;
  rarity: string | null;
  episodeName?: string | null;
  episodeCode?: string | null;
  releaseDate: string | null;
  currentPrice: number | null;
  history: readonly PostLaunchPriceObservation[];
  now?: Date;
}): PostLaunchReratingMetrics | null {
  if (
    !isPostLaunchReratingRarity(input) ||
    input.releaseDate == null ||
    input.currentPrice == null ||
    input.currentPrice <= 0
  ) {
    return null;
  }
  const releaseTimestamp = dayTimestamp(`${input.releaseDate}T00:00:00.000Z`);
  const nowTimestamp = dayTimestamp(input.now ?? new Date());
  if (releaseTimestamp == null || nowTimestamp == null) return null;
  const releaseAgeDays = Math.floor((nowTimestamp - releaseTimestamp) / DAY_MS);
  if (
    releaseAgeDays < MIN_RELEASE_AGE_DAYS ||
    releaseAgeDays > MAX_RELEASE_AGE_DAYS
  ) {
    return null;
  }

  const daily = new Map<number, { observedAt: number; value: number }>();
  for (const observation of input.history) {
    if (
      observation.value == null ||
      !Number.isFinite(observation.value) ||
      observation.value <= 0 ||
      observation.value === 9001
    ) {
      continue;
    }
    const observedAt = dayTimestamp(observation.observedAt);
    if (observedAt == null) continue;
    const offset = Math.floor((observedAt - releaseTimestamp) / DAY_MS);
    if (offset < 0 || offset > 35) continue;
    daily.set(offset, { observedAt, value: observation.value });
  }
  const points = [...daily]
    .map(([offset, observation]) => ({ offset, ...observation }))
    .sort((left, right) => left.offset - right.offset);
  const first30d = points.filter((point) => point.offset <= 30);
  const floorValues = [...first30d]
    .sort((left, right) => left.value - right.value)
    .slice(0, Math.min(3, first30d.length))
    .map((point) => point.value);
  const anchorValues = points
    .filter((point) => point.offset >= 25 && point.offset <= 35)
    .slice(-3)
    .map((point) => point.value);
  const first30dFloorPrice = first30d.length >= 2 ? median(floorValues) : null;
  const day30AnchorPrice = anchorValues.length >= 2 ? median(anchorValues) : null;
  const rarity = normalizeRarityLabel(input.rarity);
  if (!rarity) return null;

  return {
    releaseAgeDays,
    rarity,
    historyDayCount: points.length,
    first30dFloorPrice,
    day30AnchorPrice,
    currentPrice: input.currentPrice,
    recoveryFromFloorPct: percentageChange(input.currentPrice, first30dFloorPrice),
    recoveryFromDay30Pct: percentageChange(input.currentPrice, day30AnchorPrice),
    setSampleSize: 0,
    setRisingCount: 0,
    setFallingCount: 0,
    setBreadthPct: null,
    rankingBoost: 0,
    label: "No confirmation",
  };
}

export function applyPostLaunchSetBreadth(
  entries: readonly PostLaunchReratingEntry[]
): Map<string, PostLaunchReratingMetrics> {
  const byEpisode = new Map<string, PostLaunchReratingEntry[]>();
  for (const entry of entries) {
    const episodeEntries = byEpisode.get(entry.episodeId) ?? [];
    episodeEntries.push(entry);
    byEpisode.set(entry.episodeId, episodeEntries);
  }

  const result = new Map<string, PostLaunchReratingMetrics>();
  for (const episodeEntries of byEpisode.values()) {
    const cohort = episodeEntries.filter(
      (entry) =>
        entry.metrics.day30AnchorPrice != null &&
        entry.metrics.day30AnchorPrice >= 1 &&
        entry.metrics.recoveryFromDay30Pct != null
    );
    const rising = cohort.filter(
      (entry) => (entry.metrics.recoveryFromDay30Pct ?? 0) > 5
    ).length;
    const falling = cohort.filter(
      (entry) => (entry.metrics.recoveryFromDay30Pct ?? 0) < -5
    ).length;
    const breadthPct = cohort.length > 0 ? round((rising / cohort.length) * 100) : null;

    for (const entry of episodeEntries) {
      const metrics = entry.metrics;
      let rankingBoost = 0;
      if (
        cohort.length >= MIN_SET_SAMPLE_SIZE &&
        breadthPct != null &&
        breadthPct >= MIN_SET_BREADTH_PCT &&
        metrics.day30AnchorPrice != null &&
        metrics.day30AnchorPrice >= MIN_CARD_ANCHOR_EUR &&
        metrics.currentPrice >= MIN_CARD_ANCHOR_EUR &&
        (metrics.recoveryFromDay30Pct ?? 0) > 5
      ) {
        const breadthBoost = breadthPct >= 75 ? 5 : breadthPct >= 65 ? 4 : 2;
        const recovery = metrics.recoveryFromDay30Pct ?? 0;
        const recoveryBoost = recovery >= 100 ? 4 : recovery >= 50 ? 3 : recovery >= 25 ? 2 : 1;
        rankingBoost = Math.min(
          12,
          breadthBoost + recoveryBoost + rarityRankingBonus(metrics.rarity)
        );
      }
      result.set(entry.cardId, {
        ...metrics,
        setSampleSize: cohort.length,
        setRisingCount: rising,
        setFallingCount: falling,
        setBreadthPct: breadthPct,
        rankingBoost,
        label:
          rankingBoost >= 9
            ? "Confirmed re-rating"
            : rankingBoost > 0
              ? "Building re-rating"
              : "No confirmation",
      });
    }
  }
  return result;
}

export function formatPostLaunchReratingReason(
  metrics: PostLaunchReratingMetrics
): string | null {
  if (
    metrics.rankingBoost <= 0 ||
    metrics.recoveryFromDay30Pct == null ||
    metrics.setBreadthPct == null
  ) {
    return null;
  }
  return `Post-launch re-rating: ${metrics.recoveryFromDay30Pct.toFixed(0)}% since day 30 while ${metrics.setBreadthPct.toFixed(0)}% of the set cohort is rising`;
}
