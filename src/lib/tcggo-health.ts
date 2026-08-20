import "server-only";

import { db } from "@/lib/db";
import type { TcggoUsageSnapshot } from "@/lib/tcggo-usage";

export const TCGGO_HEALTH_JOB_TYPE = "tcggo-healthcheck";
const AMSTERDAM_TIME_ZONE = "Europe/Amsterdam";

export type TcggoHealthState =
  | "healthy"
  | "degraded"
  | "unreachable"
  | "quota-paused";

export type TcggoHealthReason = "monthly" | "reactive" | "manual";

export interface TcggoHealthObservation {
  state: TcggoHealthState;
  ok: boolean;
  reason: TcggoHealthReason;
  checkedAt: string;
  latencyMs: number | null;
  httpStatus: number | null;
  message: string | null;
  monthlyPeriodKey: string | null;
}

export interface TcggoMonthlyHealthcheckResult {
  due: boolean;
  ran: boolean;
  skippedReason:
    | "not-month-end"
    | "already-checked"
    | "quota-paused"
    | "scraper-disabled"
    | null;
  observation: TcggoHealthObservation | null;
}

interface StoredTcggoHealthDetails {
  latest?: TcggoHealthObservation;
  lastMonthlyPeriodKey?: string | null;
}

function getAmsterdamCalendarParts(now: Date): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AMSTERDAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
  };
}

function readStoredDetails(value: string | null | undefined): StoredTcggoHealthDetails {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed != null
      ? (parsed as StoredTcggoHealthDetails)
      : {};
  } catch {
    return {};
  }
}

export function getTcggoMonthlyHealthPeriod(now: Date): string | null {
  const { year, month, day } = getAmsterdamCalendarParts(now);
  const finalDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day !== finalDayOfMonth) return null;

  return `${year}-${String(month).padStart(2, "0")}`;
}

export async function recordTcggoHealthObservation(
  observation: TcggoHealthObservation
): Promise<void> {
  await db.$transaction(async (tx) => {
    const existing = await tx.syncJob.findUnique({
      where: { type: TCGGO_HEALTH_JOB_TYPE },
      select: { details_json: true },
    });
    const previous = readStoredDetails(existing?.details_json);
    const lastMonthlyPeriodKey =
      observation.reason === "monthly" && observation.monthlyPeriodKey
        ? observation.monthlyPeriodKey
        : (previous.lastMonthlyPeriodKey ?? null);
    const details: StoredTcggoHealthDetails = {
      latest: observation,
      lastMonthlyPeriodKey,
    };
    const checkedAt = new Date(observation.checkedAt);
    const status = observation.ok
      ? "success"
      : observation.state === "quota-paused"
        ? "paused"
        : "failed";

    await tx.syncJob.upsert({
      where: { type: TCGGO_HEALTH_JOB_TYPE },
      create: {
        type: TCGGO_HEALTH_JOB_TYPE,
        status,
        details_json: JSON.stringify(details),
        started_at: checkedAt,
        finished_at: checkedAt,
        heartbeat_at: checkedAt,
      },
      update: {
        status,
        details_json: JSON.stringify(details),
        started_at: checkedAt,
        finished_at: checkedAt,
        heartbeat_at: checkedAt,
      },
    });
  });
}

export async function maybeRunMonthlyTcggoHealthcheck(options: {
  now: Date;
  quota: TcggoUsageSnapshot;
  run: (options: {
    reason: "monthly";
    monthlyPeriodKey: string;
  }) => Promise<TcggoHealthObservation>;
}): Promise<TcggoMonthlyHealthcheckResult> {
  const monthlyPeriodKey = getTcggoMonthlyHealthPeriod(options.now);
  if (!monthlyPeriodKey) {
    return {
      due: false,
      ran: false,
      skippedReason: "not-month-end",
      observation: null,
    };
  }

  const existing = await db.syncJob.findUnique({
    where: { type: TCGGO_HEALTH_JOB_TYPE },
    select: { details_json: true },
  });
  const details = readStoredDetails(existing?.details_json);
  if (details.lastMonthlyPeriodKey === monthlyPeriodKey) {
    return {
      due: false,
      ran: false,
      skippedReason: "already-checked",
      observation: details.latest ?? null,
    };
  }

  if (options.quota.hasLiveWindow && options.quota.requestsRemaining === 0) {
    return {
      due: true,
      ran: false,
      skippedReason: "quota-paused",
      observation: null,
    };
  }

  const observation = await options.run({
    reason: "monthly",
    monthlyPeriodKey,
  });

  return {
    due: false,
    ran: true,
    skippedReason: null,
    observation,
  };
}
