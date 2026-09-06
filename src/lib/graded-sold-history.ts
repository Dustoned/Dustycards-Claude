import { buildDailyMarketHistory, type DailyMarketValue } from "@/lib/robust-price-history";

export interface GradedSoldSnapshotLike {
  company: string;
  grade: string;
  currency: string;
  median_price: number;
  fetched_at: Date;
}

export interface GradedSoldMatch {
  company: string;
  grade: string;
  currency: string;
}

function normalizeGrade(value: string): number | null {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Builds the daily sold-price series of one graded market (for example PSA 10
 * in USD) from eBay sold snapshots, so a graded scenario can run on its own
 * momentum instead of borrowing the raw market's. Company and grade match
 * case- and format-insensitively ("psa" / "10.0"); a day with several
 * snapshots collapses to its median.
 */
export function buildGradedSoldDailyHistory(
  snapshots: readonly GradedSoldSnapshotLike[],
  match: GradedSoldMatch
): DailyMarketValue[] {
  const company = match.company.trim().toUpperCase();
  const grade = normalizeGrade(match.grade);
  const currency = match.currency.trim().toUpperCase();
  if (grade == null) return [];

  return buildDailyMarketHistory(
    snapshots
      .filter(
        (snapshot) =>
          snapshot.company.trim().toUpperCase() === company &&
          normalizeGrade(snapshot.grade) === grade &&
          snapshot.currency.trim().toUpperCase() === currency
      )
      .map((snapshot) => ({
        observedAt: snapshot.fetched_at,
        primaryValue: snapshot.median_price,
      }))
  );
}
