import { db } from "@/lib/db";

const TCGGO_USAGE_SOURCE = "tcggo-rapidapi";
const QUOTA_WINDOW_TOLERANCE_MS = 1000 * 60 * 5;

export interface TcggoUsageSnapshot {
  requestsUsed: number;
  requestsLimit: number | null;
  requestsRemaining: number | null;
  quotaResetsAt: Date | null;
  observedAt: Date | null;
  hasLiveWindow: boolean;
}

function parseHeaderInt(value: string | null): number | null {
  if (value == null) return null;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampNonNegative(value: number | null): number | null {
  if (value == null) return null;
  return Math.max(value, 0);
}

function parseQuotaResetAt(headers: Headers, observedAt: Date): Date | null {
  const resetSeconds = parseHeaderInt(headers.get("x-ratelimit-requests-reset"));
  if (resetSeconds == null || resetSeconds < 0) return null;
  return new Date(observedAt.getTime() + resetSeconds * 1000);
}

function mergeRemaining(existing: number | null, next: number | null): number | null {
  if (existing == null) return next;
  if (next == null) return existing;
  return Math.min(existing, next);
}

function mergeUsed(existing: number | null, next: number | null): number | null {
  if (existing == null) return next;
  if (next == null) return existing;
  return Math.max(existing, next);
}

function isSameQuotaWindow(existing: Date | null, next: Date | null): boolean {
  if (!existing || !next) return false;
  return Math.abs(existing.getTime() - next.getTime()) <= QUOTA_WINDOW_TOLERANCE_MS;
}

export async function recordTcggoQuotaSnapshot(headers: Headers): Promise<void> {
  const observedAt = new Date();
  const requestsLimit = parseHeaderInt(headers.get("x-ratelimit-requests-limit"));
  const requestsRemaining = clampNonNegative(
    parseHeaderInt(headers.get("x-ratelimit-requests-remaining"))
  );
  const requestsUsed =
    requestsLimit != null && requestsRemaining != null
      ? Math.max(requestsLimit - requestsRemaining, 0)
      : null;
  const quotaResetsAt = parseQuotaResetAt(headers, observedAt);

  if (
    requestsLimit == null &&
    requestsRemaining == null &&
    requestsUsed == null &&
    quotaResetsAt == null
  ) {
    return;
  }

  await db.$transaction(async (tx) => {
    const existing = await tx.apiQuotaSnapshot.findUnique({
      where: { source: TCGGO_USAGE_SOURCE },
    });

    if (!existing) {
      await tx.apiQuotaSnapshot.create({
        data: {
          source: TCGGO_USAGE_SOURCE,
          requests_limit: requestsLimit,
          requests_remaining: requestsRemaining,
          requests_used: requestsUsed,
          quota_resets_at: quotaResetsAt,
          observed_at: observedAt,
        },
      });
      return;
    }

    const nextWindowDetected =
      quotaResetsAt != null &&
      existing.quota_resets_at != null &&
      !isSameQuotaWindow(existing.quota_resets_at, quotaResetsAt);

    await tx.apiQuotaSnapshot.update({
      where: { source: TCGGO_USAGE_SOURCE },
      data: nextWindowDetected
        ? {
            requests_limit: requestsLimit ?? existing.requests_limit,
            requests_remaining: requestsRemaining,
            requests_used: requestsUsed,
            quota_resets_at: quotaResetsAt,
            observed_at: observedAt,
          }
        : {
            requests_limit: requestsLimit ?? existing.requests_limit,
            requests_remaining: mergeRemaining(
              existing.requests_remaining,
              requestsRemaining
            ),
            requests_used: mergeUsed(existing.requests_used, requestsUsed),
            quota_resets_at: quotaResetsAt ?? existing.quota_resets_at,
            observed_at: observedAt,
          },
    });
  });
}

export async function getTcggoUsageSnapshot(): Promise<TcggoUsageSnapshot> {
  const snapshot = await db.apiQuotaSnapshot.findUnique({
    where: { source: TCGGO_USAGE_SOURCE },
  });

  if (!snapshot) {
    return {
      requestsUsed: 0,
      requestsLimit: null,
      requestsRemaining: null,
      quotaResetsAt: null,
      observedAt: null,
      hasLiveWindow: false,
    };
  }

  const now = new Date();
  const quotaExpired =
    snapshot.quota_resets_at != null &&
    snapshot.quota_resets_at.getTime() <= now.getTime();

  if (quotaExpired) {
    return {
      requestsUsed: 0,
      requestsLimit: snapshot.requests_limit,
      requestsRemaining: snapshot.requests_limit,
      quotaResetsAt: snapshot.quota_resets_at,
      observedAt: snapshot.observed_at,
      hasLiveWindow: false,
    };
  }

  const requestsUsed = snapshot.requests_used ?? 0;
  const requestsRemaining =
    clampNonNegative(snapshot.requests_remaining) ??
    (snapshot.requests_limit != null
      ? Math.max(snapshot.requests_limit - Math.max(requestsUsed, 0), 0)
      : null);

  return {
    requestsUsed:
      snapshot.requests_limit != null
        ? Math.min(Math.max(requestsUsed, 0), snapshot.requests_limit)
        : Math.max(requestsUsed, 0),
    requestsLimit: snapshot.requests_limit,
    requestsRemaining,
    quotaResetsAt: snapshot.quota_resets_at,
    observedAt: snapshot.observed_at,
    hasLiveWindow: snapshot.quota_resets_at != null,
  };
}
