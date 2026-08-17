export interface MarktplaatsFilterNavigationState {
  sellingView?: string;
  dealKind?: string;
  dealMatch?: string;
  dealQ?: string;
}

export type MarktplaatsDealFilterKind =
  | "raw"
  | "graded"
  | "expansion"
  | "collection";
export type MarktplaatsSelectionFilter = "daily" | "deals" | "review";

export interface MarktplaatsFilterCountRow {
  kind: string;
  match_status: string;
}

export interface MarktplaatsContextualFilterCounts {
  categoryCounts: Record<MarktplaatsDealFilterKind, number>;
  allKindsCount: number;
  currentResultCount: number;
  dailyCount: number;
  dealCount: number;
  reviewCount: number;
}

export function matchesMarktplaatsSelection(
  status: string,
  selection: MarktplaatsSelectionFilter,
): boolean {
  if (selection === "review") return status === "review";
  if (selection === "deals") return status === "matched";
  return status === "matched" || status === "shortlist";
}

export function summarizeMarktplaatsFilterCounts(
  rows: MarktplaatsFilterCountRow[],
  activeKind: MarktplaatsDealFilterKind | null,
  activeSelection: MarktplaatsSelectionFilter,
): MarktplaatsContextualFilterCounts {
  const categoryCounts: Record<MarktplaatsDealFilterKind, number> = {
    raw: 0,
    graded: 0,
    expansion: 0,
    collection: 0,
  };
  const selectionRows = rows.filter((row) =>
    matchesMarktplaatsSelection(row.match_status, activeSelection),
  );

  for (const row of selectionRows) {
    if (row.kind in categoryCounts) {
      categoryCounts[row.kind as MarktplaatsDealFilterKind] += 1;
    }
  }

  const kindRows = activeKind
    ? rows.filter((row) => row.kind === activeKind)
    : rows;

  return {
    categoryCounts,
    allKindsCount: selectionRows.length,
    currentResultCount: activeKind
      ? categoryCounts[activeKind]
      : selectionRows.length,
    dailyCount: kindRows.filter((row) =>
      matchesMarktplaatsSelection(row.match_status, "daily"),
    ).length,
    dealCount: kindRows.filter((row) =>
      matchesMarktplaatsSelection(row.match_status, "deals"),
    ).length,
    reviewCount: kindRows.filter((row) =>
      matchesMarktplaatsSelection(row.match_status, "review"),
    ).length,
  };
}

function keyPart(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  return encodeURIComponent(normalized || fallback);
}

export function buildSellingInventoryTabsKey(
  state: MarktplaatsFilterNavigationState,
): string {
  const view = state.sellingView ?? "default";
  if (view !== "marktplaats") return `selling-${keyPart(view, "default")}`;

  return [
    "selling-marktplaats",
    keyPart(state.dealKind, "all"),
    keyPart(state.dealMatch, "daily"),
    keyPart(state.dealQ, "no-query"),
  ].join(":");
}
