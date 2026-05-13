import type { MoversItemScope, MoversScope } from "@/lib/movers";
import type { PriceSource } from "@/lib/user-settings";

export type MoversPageScope = MoversScope | "value";
export type MoversMode = "value" | "raw" | "graded" | "targets" | "sealed";

export function normalizeMoversPriceSource(
  value: string | null | undefined,
  fallback: PriceSource
): PriceSource {
  return value === "cm_en" || value === "tcp" ? value : fallback;
}

export function normalizeMoversScope(value: string | null | undefined): MoversPageScope {
  return value === "collection" ||
    value === "all" ||
    value === "graded" ||
    value === "grading" ||
    value === "sealed"
    ? value
    : "value";
}

export function normalizeMoversItemScope(
  value: string | null | undefined,
  fallback: MoversItemScope
): MoversItemScope {
  return value === "all" || value === "collection" ? value : fallback;
}

export function getMoversMode(scope: MoversPageScope): MoversMode {
  if (scope === "value") {
    return "value";
  }

  if (scope === "graded") {
    return "graded";
  }

  if (scope === "grading") {
    return "targets";
  }

  if (scope === "sealed") {
    return "sealed";
  }

  return "raw";
}

export function buildMoversModeHref(
  pathname: string,
  mode: MoversMode,
  source?: PriceSource,
  rawScope: Extract<MoversScope, "collection" | "all"> = "collection"
): string {
  const params = new URLSearchParams();

  if (source && mode !== "value") {
    params.set("source", source);
  }

  if (mode === "value") {
    params.delete("source");
  } else if (mode === "graded") {
    params.set("scope", "graded");
  } else if (mode === "targets") {
    params.set("scope", "grading");
  } else if (mode === "sealed") {
    params.set("scope", "sealed");
  } else if (rawScope === "collection") {
    params.set("scope", "collection");
  } else if (rawScope === "all") {
    params.set("scope", "all");
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function buildMoversSourceHref(
  pathname: string,
  source: PriceSource,
  scope: MoversScope = "collection",
  itemScope?: MoversItemScope
): string {
  const params = new URLSearchParams();
  params.set("source", source);

  if (scope !== "collection") {
    params.set("scope", scope);
  } else {
    params.set("scope", "collection");
  }

  if ((scope === "graded" || scope === "grading") && itemScope === "collection") {
    params.set("view", "collection");
  }

  return `${pathname}?${params.toString()}`;
}
