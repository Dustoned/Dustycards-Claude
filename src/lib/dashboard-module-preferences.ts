export type HomeDashboardModuleKey =
  | "overview"
  | "value-drivers"
  | "sudden-drops"
  | "market-movers"
  | "signal-radar"
  | "featured"
  | "allocation"
  | "top-sets"
  | "wants"
  | "for-sale"
  | "upcoming"
  | "shortcuts";

export const DEFAULT_HOME_DASHBOARD_MODULE_ORDER: HomeDashboardModuleKey[] = [
  "overview",
  "value-drivers",
  "sudden-drops",
  "market-movers",
  "signal-radar",
  "featured",
  "allocation",
  "top-sets",
  "wants",
  "for-sale",
  "upcoming",
  "shortcuts",
];

export const DEFAULT_HIDDEN_HOME_DASHBOARD_MODULES: HomeDashboardModuleKey[] = [
  "market-movers",
  "signal-radar",
  "wants",
  "for-sale",
  "upcoming",
];

type LegacyHomeDashboardModuleKey = "market" | "breakdown";

const LEGACY_HOME_DASHBOARD_MODULES: Record<
  LegacyHomeDashboardModuleKey,
  HomeDashboardModuleKey[]
> = {
  market: ["value-drivers", "sudden-drops"],
  breakdown: ["allocation", "top-sets"],
};

function expandHomeDashboardModuleKeys(raw: unknown): HomeDashboardModuleKey[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((value) => {
    if (typeof value !== "string") return [];
    if (value in LEGACY_HOME_DASHBOARD_MODULES) {
      return LEGACY_HOME_DASHBOARD_MODULES[value as LegacyHomeDashboardModuleKey];
    }
    return DEFAULT_HOME_DASHBOARD_MODULE_ORDER.includes(value as HomeDashboardModuleKey)
      ? [value as HomeDashboardModuleKey]
      : [];
  });
}

export function normalizeHomeDashboardModuleOrder(
  raw: unknown
): HomeDashboardModuleKey[] {
  if (!Array.isArray(raw)) return [...DEFAULT_HOME_DASHBOARD_MODULE_ORDER];

  const normalized = expandHomeDashboardModuleKeys(raw);
  const unique = [...new Set(normalized)];

  for (const key of DEFAULT_HOME_DASHBOARD_MODULE_ORDER) {
    if (!unique.includes(key)) unique.push(key);
  }

  return unique;
}

export function normalizeHomeDashboardModuleSelection(
  raw: unknown
): HomeDashboardModuleKey[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(expandHomeDashboardModuleKeys(raw))];
}

export function normalizeHiddenHomeDashboardModules(
  raw: unknown,
  storedOrder?: unknown
): HomeDashboardModuleKey[] {
  const normalized = normalizeHomeDashboardModuleSelection(raw);
  const hasStoredOrder = Array.isArray(storedOrder);
  const alreadyUsesExpandedWidgets =
    hasStoredOrder &&
    storedOrder.some(
      (value) =>
        typeof value === "string" &&
        DEFAULT_HOME_DASHBOARD_MODULE_ORDER.includes(value as HomeDashboardModuleKey) &&
        value !== "overview" &&
        value !== "featured" &&
        value !== "shortcuts"
    );

  if (!hasStoredOrder || !alreadyUsesExpandedWidgets) {
    for (const key of DEFAULT_HIDDEN_HOME_DASHBOARD_MODULES) {
      if (!normalized.includes(key)) normalized.push(key);
    }
  }

  return normalized;
}
