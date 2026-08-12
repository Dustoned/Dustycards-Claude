const DAY_MS = 24 * 60 * 60_000;

export const UPCOMING_RECENT_RELEASE_DAYS = 45;

export function utcDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function upcomingRecentReleaseFloor(now = new Date()): string {
  return utcDateKey(new Date(now.getTime() - UPCOMING_RECENT_RELEASE_DAYS * DAY_MS));
}

export function isRelevantUpcomingReleaseDate(
  value: string | null | undefined,
  floor: string
): boolean {
  const key = value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  return key != null && key >= floor;
}

export function isUnreleasedUpcomingSingleDate(
  value: string | null | undefined,
  today: string
): boolean {
  const key = value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  // Source-only leaks do not always have a confirmed release date yet. Keep
  // those visible, but remove every item whose known release date has arrived.
  return key == null || key > today;
}
