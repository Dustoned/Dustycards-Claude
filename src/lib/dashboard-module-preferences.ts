export type HomeDashboardModuleKey =
  | "overview"
  | "market"
  | "featured"
  | "breakdown"
  | "shortcuts";

export const DEFAULT_HOME_DASHBOARD_MODULE_ORDER: HomeDashboardModuleKey[] = [
  "overview",
  "market",
  "featured",
  "breakdown",
  "shortcuts",
];

export function normalizeHomeDashboardModuleOrder(
  raw: unknown
): HomeDashboardModuleKey[] {
  if (!Array.isArray(raw)) return [...DEFAULT_HOME_DASHBOARD_MODULE_ORDER];

  const normalized = raw.filter((value): value is HomeDashboardModuleKey =>
    DEFAULT_HOME_DASHBOARD_MODULE_ORDER.includes(value as HomeDashboardModuleKey)
  );
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
  return [
    ...new Set(
      raw.filter((value): value is HomeDashboardModuleKey =>
        DEFAULT_HOME_DASHBOARD_MODULE_ORDER.includes(value as HomeDashboardModuleKey)
      )
    ),
  ];
}

export const normalizeHiddenHomeDashboardModules = normalizeHomeDashboardModuleSelection;
