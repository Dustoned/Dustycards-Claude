import type { CollectionMoverBrowserItem } from "@/lib/movers";

export type SortKey =
  | "move"
  | "tcggo_score"
  | "grade_score"
  | "grade_multiplier"
  | "grade_gap"
  | "older_value"
  | "raw_price_low"
  | "7d"
  | "30d"
  | "tracked"
  | "low_rebound"
  | "peak_gap"
  | "price_low"
  | "price_high"
  | "release_newest"
  | "release_oldest"
  | "name";

export type DirectionFilter = "all" | "risers" | "fallers";

export interface MoverVariantGroup<
  T extends Pick<CollectionMoverBrowserItem, "cardId" | "gradedLabel" | "source">,
> {
  cardId: string;
  variants: T[];
}

/**
 * Keeps the current sort order while collapsing grade-company variants of one
 * physical card into a single render group. Exact duplicate grade rows are
 * ignored so stale/imported market rows cannot create duplicate selectors.
 */
export function groupMoverVariantsByCard<
  T extends Pick<CollectionMoverBrowserItem, "cardId" | "gradedLabel" | "source">,
>(items: readonly T[]): MoverVariantGroup<T>[] {
  const groups: MoverVariantGroup<T>[] = [];
  const byCardId = new Map<string, MoverVariantGroup<T>>();
  const variantKeysByCardId = new Map<string, Set<string>>();

  for (const item of items) {
    let group = byCardId.get(item.cardId);
    if (!group) {
      group = { cardId: item.cardId, variants: [] };
      byCardId.set(item.cardId, group);
      variantKeysByCardId.set(item.cardId, new Set());
      groups.push(group);
    }

    const normalizedLabel =
      item.gradedLabel?.trim().toLocaleLowerCase("en-US") || "ungraded";
    const variantKey = `${item.source}:${normalizedLabel}`;
    const variantKeys = variantKeysByCardId.get(item.cardId)!;
    if (variantKeys.has(variantKey)) continue;

    variantKeys.add(variantKey);
    group.variants.push(item);
  }

  return groups;
}

export function buildSortSummary(sortKey: SortKey, direction: DirectionFilter): string {
  switch (sortKey) {
    case "tcggo_score":
      return "TCGGO Score high -> low";
    case "grade_score":
      return "Grade score best target -> weakest target";
    case "grade_multiplier":
      return "Risk-adjusted return high -> low";
    case "grade_gap":
      return "Expected grading gain high -> low";
    case "older_value":
      return "Older affordable cards first";
    case "raw_price_low":
      return "Raw CardMarket price low -> high";
    case "7d":
      return direction === "fallers"
        ? "7D biggest drop -> smallest drop"
        : "7D biggest rise -> biggest drop";
    case "30d":
      return direction === "fallers"
        ? "30D biggest drop -> smallest drop"
        : "30D biggest rise -> biggest drop";
    case "tracked":
      return direction === "fallers"
        ? "Since tracked biggest drop -> smallest drop"
        : "Since tracked biggest rise -> biggest drop";
    case "low_rebound":
      return direction === "fallers"
        ? "From low weakest rebound -> strongest rebound"
        : "From low strongest rebound -> weakest rebound";
    case "peak_gap":
      return "Vs peak deepest discount -> closest to peak";
    case "price_low":
      return "Price low -> high";
    case "price_high":
      return "Price high -> low";
    case "release_newest":
      return "Newest card releases first";
    case "release_oldest":
      return "Oldest card releases first";
    case "name":
      return "Name A -> Z";
    case "move":
    default:
      return direction === "fallers"
        ? "Move hardest faller -> mildest faller"
        : "Move strongest -> most negative (recent + lifetime)";
  }
}

export function matchesDirection(
  item: CollectionMoverBrowserItem,
  direction: DirectionFilter
): boolean {
  if (direction === "risers") {
    return item.movementScore > 0;
  }

  if (direction === "fallers") {
    return item.movementScore < 0;
  }

  return true;
}

function compareMetricValues(
  a: number | null | undefined,
  b: number | null | undefined,
  order: "asc" | "desc"
): number {
  const leftMissing = a == null;
  const rightMissing = b == null;

  if (leftMissing || rightMissing) {
    if (leftMissing && rightMissing) {
      return 0;
    }

    return leftMissing ? 1 : -1;
  }

  return order === "asc" ? a - b : b - a;
}

export function compareMoverItems(
  a: CollectionMoverBrowserItem,
  b: CollectionMoverBrowserItem,
  sortKey: SortKey,
  direction: DirectionFilter
): number {
  const preferMostNegativeFirst = direction === "fallers";

  if (sortKey === "name") {
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
  }

  if (sortKey === "release_newest" || sortKey === "release_oldest") {
    const leftDate = a.episodeReleaseDate ?? "";
    const rightDate = b.episodeReleaseDate ?? "";
    if (!leftDate && !rightDate) return a.name.localeCompare(b.name);
    if (!leftDate) return 1;
    if (!rightDate) return -1;
    const difference = leftDate.localeCompare(rightDate);
    if (difference !== 0) return sortKey === "release_oldest" ? difference : -difference;
  }

  if (sortKey === "price_low") {
    if (a.currentPrice !== b.currentPrice) {
      return a.currentPrice - b.currentPrice;
    }
  } else if (sortKey === "price_high") {
    if (a.currentPrice !== b.currentPrice) {
      return b.currentPrice - a.currentPrice;
    }
  } else if (sortKey === "grade_score") {
    const diff = compareMetricValues(a.grading?.score, b.grading?.score, "desc");
    if (diff !== 0) return diff;
  } else if (sortKey === "tcggo_score") {
    const diff = compareMetricValues(a.tcggoScore?.score, b.tcggoScore?.score, "desc");
    if (diff !== 0) return diff;
  } else if (sortKey === "grade_multiplier") {
    const diff = compareMetricValues(
      a.grading?.expectedMultiplier,
      b.grading?.expectedMultiplier,
      "desc"
    );
    if (diff !== 0) return diff;
  } else if (sortKey === "grade_gap") {
    const diff = compareMetricValues(a.grading?.expectedGain, b.grading?.expectedGain, "desc");
    if (diff !== 0) return diff;
  } else if (sortKey === "older_value") {
    const diff = compareMetricValues(a.olderValueScore, b.olderValueScore, "desc");
    if (diff !== 0) return diff;

    const ageDiff = compareMetricValues(a.releaseAgeYears, b.releaseAgeYears, "desc");
    if (ageDiff !== 0) return ageDiff;

    const aPrice = a.grading?.rawPrice ?? a.currentPrice;
    const bPrice = b.grading?.rawPrice ?? b.currentPrice;
    if (aPrice !== bPrice) {
      return aPrice - bPrice;
    }
  } else if (sortKey === "raw_price_low") {
    const diff = compareMetricValues(a.grading?.rawPrice, b.grading?.rawPrice, "asc");
    if (diff !== 0) return diff;
  } else if (sortKey === "7d") {
    const diff = compareMetricValues(
      a.change7dPct,
      b.change7dPct,
      preferMostNegativeFirst ? "asc" : "desc"
    );
    if (diff !== 0) return diff;
  } else if (sortKey === "30d") {
    const diff = compareMetricValues(
      a.change30dPct,
      b.change30dPct,
      preferMostNegativeFirst ? "asc" : "desc"
    );
    if (diff !== 0) return diff;
  } else if (sortKey === "tracked") {
    const diff = compareMetricValues(
      a.changeSinceTrackedPct,
      b.changeSinceTrackedPct,
      preferMostNegativeFirst ? "asc" : "desc"
    );
    if (diff !== 0) return diff;
  } else if (sortKey === "low_rebound") {
    const diff = compareMetricValues(
      a.changeFromLowPct,
      b.changeFromLowPct,
      preferMostNegativeFirst ? "asc" : "desc"
    );
    if (diff !== 0) return diff;
  } else if (sortKey === "peak_gap") {
    const diff = compareMetricValues(a.gapToPeakPct, b.gapToPeakPct, "asc");
    if (diff !== 0) return diff;
  } else if (a.rankingScore !== b.rankingScore) {
    return preferMostNegativeFirst ? a.movementScore - b.movementScore : b.rankingScore - a.rankingScore;
  }

  if (a.rankingScore !== b.rankingScore || a.movementScore !== b.movementScore) {
    return preferMostNegativeFirst ? a.movementScore - b.movementScore : b.rankingScore - a.rankingScore;
  }

  return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
}
