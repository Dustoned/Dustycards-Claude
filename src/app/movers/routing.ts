import type { MoversScope } from "@/lib/movers";
import type { PriceSource } from "@/lib/user-settings";

export type MoversMode = "raw" | "graded" | "targets";

export function normalizeMoversPriceSource(
  value: string | null | undefined,
  fallback: PriceSource
): PriceSource {
  return value === "cm_en" || value === "tcp" ? value : fallback;
}

export function normalizeMoversScope(value: string | null | undefined): MoversScope {
  return value === "all" || value === "graded" || value === "grading" ? value : "collection";
}

export function getMoversMode(scope: MoversScope): MoversMode {
  if (scope === "graded") {
    return "graded";
  }

  if (scope === "grading") {
    return "targets";
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

  if (source) {
    params.set("source", source);
  }

  if (mode === "graded") {
    params.set("scope", "graded");
  } else if (mode === "targets") {
    params.set("scope", "grading");
  } else if (rawScope === "all") {
    params.set("scope", "all");
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function buildMoversSourceHref(
  pathname: string,
  source: PriceSource,
  scope: MoversScope = "collection"
): string {
  const params = new URLSearchParams();
  params.set("source", source);

  if (scope !== "collection") {
    params.set("scope", scope);
  }

  return `${pathname}?${params.toString()}`;
}
