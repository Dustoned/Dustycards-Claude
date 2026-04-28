import type { CollectionMoverItem } from "@/lib/movers";
import { getRichMoverTrackWidth } from "@/lib/display-scale";
import type { CardSize } from "@/lib/user-settings";

export type SortKey =
  | "move"
  | "tcggo_score"
  | "grade_score"
  | "grade_multiplier"
  | "grade_gap"
  | "raw_price_low"
  | "7d"
  | "30d"
  | "tracked"
  | "low_rebound"
  | "peak_gap"
  | "price_low"
  | "price_high"
  | "name";

export type DirectionFilter = "all" | "risers" | "fallers";

export function getMoverTileMinWidth(
  cardSize: CardSize,
  widescreen: boolean
): string {
  return getRichMoverTrackWidth(cardSize, widescreen);
}

export function buildSortSummary(sortKey: SortKey, direction: DirectionFilter): string {
  switch (sortKey) {
    case "tcggo_score":
      return "TCGGO Score high -> low";
    case "grade_score":
      return "Grade score best target -> weakest target";
    case "grade_multiplier":
      return "Raw-to-graded multiplier high -> low";
    case "grade_gap":
      return "Raw-to-graded gap high -> low";
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
  item: CollectionMoverItem,
  direction: DirectionFilter
): boolean {
  if (direction === "risers") {
    return item.moverScore > 0;
  }

  if (direction === "fallers") {
    return item.moverScore < 0;
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
  a: CollectionMoverItem,
  b: CollectionMoverItem,
  sortKey: SortKey,
  direction: DirectionFilter
): number {
  const preferMostNegativeFirst = direction === "fallers";

  if (sortKey === "name") {
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
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
      a.grading?.valueMultiplier,
      b.grading?.valueMultiplier,
      "desc"
    );
    if (diff !== 0) return diff;
  } else if (sortKey === "grade_gap") {
    const diff = compareMetricValues(a.grading?.valueGap, b.grading?.valueGap, "desc");
    if (diff !== 0) return diff;
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
  } else if (a.moverScore !== b.moverScore) {
    return preferMostNegativeFirst ? a.moverScore - b.moverScore : b.moverScore - a.moverScore;
  }

  if (a.moverScore !== b.moverScore) {
    return preferMostNegativeFirst ? a.moverScore - b.moverScore : b.moverScore - a.moverScore;
  }

  return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
}
