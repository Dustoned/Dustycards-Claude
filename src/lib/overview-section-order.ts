export type OverviewSectionKey = "graded" | "raw" | "binderWatch" | "sealed" | "binders";

export const OVERVIEW_SECTION_ORDER_STORAGE_KEY = "dustycards-complete-section-order-v2";
export const OVERVIEW_SECTION_ORDER_COOKIE_NAME = "dustycards-complete-section-order-v2";
export const OVERVIEW_SECTION_ORDER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const DEFAULT_OVERVIEW_SECTION_ORDER: OverviewSectionKey[] = [
  "binders",
  "raw",
  "graded",
  "sealed",
  "binderWatch",
];

export function normalizeOverviewSectionOrder(raw: unknown): OverviewSectionKey[] {
  if (!Array.isArray(raw)) {
    return DEFAULT_OVERVIEW_SECTION_ORDER;
  }

  const next = raw.filter((value): value is OverviewSectionKey =>
    DEFAULT_OVERVIEW_SECTION_ORDER.includes(value as OverviewSectionKey)
  );

  const unique = [...new Set(next)];

  for (const key of DEFAULT_OVERVIEW_SECTION_ORDER) {
    if (!unique.includes(key)) {
      const defaultIndex = DEFAULT_OVERVIEW_SECTION_ORDER.indexOf(key);
      const insertIndex = unique.findIndex(
        (existingKey) => DEFAULT_OVERVIEW_SECTION_ORDER.indexOf(existingKey) > defaultIndex
      );

      if (insertIndex >= 0) {
        unique.splice(insertIndex, 0, key);
      } else {
        unique.push(key);
      }
    }
  }

  return unique;
}

export function serializeOverviewSectionOrder(order: OverviewSectionKey[]): string {
  return JSON.stringify(normalizeOverviewSectionOrder(order));
}

export function parseStoredOverviewSectionOrder(
  raw: string | null | undefined
): OverviewSectionKey[] | null {
  if (!raw) return null;

  try {
    return normalizeOverviewSectionOrder(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function parseOverviewSectionOrderCookie(
  raw: string | null | undefined
): OverviewSectionKey[] | null {
  if (!raw) return null;

  try {
    return parseStoredOverviewSectionOrder(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

export function buildOverviewSectionOrderCookie(order: OverviewSectionKey[]): string {
  return [
    `${OVERVIEW_SECTION_ORDER_COOKIE_NAME}=${encodeURIComponent(
      serializeOverviewSectionOrder(order)
    )}`,
    "Path=/",
    `Max-Age=${OVERVIEW_SECTION_ORDER_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
  ].join("; ");
}
