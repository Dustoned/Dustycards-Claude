import type { MoversScope } from "@/lib/movers";
import type { PriceSource } from "@/lib/user-settings";

export function normalizeMoversPriceSource(
  value: string | null | undefined,
  fallback: PriceSource
): PriceSource {
  return value === "cm_en" || value === "tcp" ? value : fallback;
}

export function normalizeMoversScope(value: string | null | undefined): MoversScope {
  return value === "all" ? "all" : "collection";
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
