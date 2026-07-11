export function resolveAutoPriceRefreshStartedAt(
  existing: { status: string; started_at: Date | null } | null,
  now: Date
): Date {
  if (existing?.status === "queued" && existing.started_at) {
    return existing.started_at;
  }

  return now;
}
