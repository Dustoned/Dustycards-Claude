export interface MarktplaatsFilterNavigationState {
  sellingView?: string;
  dealKind?: string;
  dealMatch?: string;
  dealQ?: string;
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

