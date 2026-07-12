import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import {
  getFirecrawlConfigSnapshot,
  getFirecrawlProviderCreditUsage,
} from "@/lib/firecrawl";

const DEFAULT_SIGNAL_MONTHLY_CREDITS = 120;
const RESERVATION_TTL_MS = 30 * 60_000;
const EXTERNAL_SIGNAL_CONSUMER = "external-signal-catalysts";
const PROVIDER_SAFETY_RESERVE_CREDITS = 25;

type BudgetClient = Pick<
  Prisma.TransactionClient,
  "cardSubmission" | "firecrawlCreditLedger"
>;

export interface FirecrawlMonthWindow {
  periodKey: string;
  startsAt: Date;
  endsAt: Date;
}

export interface FirecrawlBudgetSnapshot {
  configured: boolean;
  periodKey: string;
  globalBudget: number;
  globalOffset: number;
  submittedCredits: number;
  ledgerCredits: number;
  reservedCredits: number;
  globalUsed: number;
  globalRemaining: number;
  consumer: string;
  consumerBudget: number;
  consumerUsed: number;
  consumerRemaining: number;
  providerRemaining: number | null;
  providerPlan: number | null;
  providerBillingPeriodStart: string | null;
  providerBillingPeriodEnd: string | null;
}

export interface FirecrawlCreditReservation {
  id: string;
  created: boolean;
  status: string;
  estimatedCredits: number;
  creditsUsed: number;
}

export class FirecrawlBudgetError extends Error {
  status: number;

  constructor(message: string, status = 429) {
    super(message);
    this.name = "FirecrawlBudgetError";
    this.status = status;
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function getFirecrawlMonthWindow(now = new Date()): FirecrawlMonthWindow {
  const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    periodKey: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
    startsAt,
    endsAt,
  };
}

export function getFirecrawlConsumerMonthlyBudget(
  consumer: string,
  globalBudget: number
): number {
  if (consumer !== EXTERNAL_SIGNAL_CONSUMER) return globalBudget;
  return Math.min(
    globalBudget,
    parsePositiveInteger(
      process.env.FIRECRAWL_SIGNAL_MONTHLY_CREDIT_BUDGET,
      DEFAULT_SIGNAL_MONTHLY_CREDITS
    )
  );
}

async function expireStaleReservations(client: BudgetClient, now: Date): Promise<void> {
  await client.firecrawlCreditLedger.updateMany({
    where: {
      status: "reserved",
      expires_at: { lte: now },
    },
    data: {
      status: "expired",
      credits_used: 0,
      finished_at: now,
    },
  });
}

async function readBudgetUsage(
  client: BudgetClient,
  consumer: string,
  now: Date
): Promise<
  Omit<
    FirecrawlBudgetSnapshot,
    | "configured"
    | "providerRemaining"
    | "providerPlan"
    | "providerBillingPeriodStart"
    | "providerBillingPeriodEnd"
  >
> {
  const config = getFirecrawlConfigSnapshot();
  const window = getFirecrawlMonthWindow(now);
  const [submitted, completed, reserved, consumerCompleted, consumerReserved] =
    await Promise.all([
      client.cardSubmission.aggregate({
        where: {
          created_at: { gte: window.startsAt, lt: window.endsAt },
        },
        _sum: { credits_used: true },
      }),
      client.firecrawlCreditLedger.aggregate({
        where: {
          period_key: window.periodKey,
          status: { in: ["completed", "failed"] },
        },
        _sum: { credits_used: true },
      }),
      client.firecrawlCreditLedger.aggregate({
        where: {
          period_key: window.periodKey,
          status: "reserved",
        },
        _sum: { estimated_credits: true },
      }),
      client.firecrawlCreditLedger.aggregate({
        where: {
          period_key: window.periodKey,
          consumer,
          status: { in: ["completed", "failed"] },
        },
        _sum: { credits_used: true },
      }),
      client.firecrawlCreditLedger.aggregate({
        where: {
          period_key: window.periodKey,
          consumer,
          status: "reserved",
        },
        _sum: { estimated_credits: true },
      }),
    ]);

  const submittedCredits = submitted._sum.credits_used ?? 0;
  const ledgerCredits = completed._sum.credits_used ?? 0;
  const reservedCredits = reserved._sum.estimated_credits ?? 0;
  const globalUsed =
    config.monthlyCreditOffset + submittedCredits + ledgerCredits + reservedCredits;
  const consumerUsed =
    (consumerCompleted._sum.credits_used ?? 0) +
    (consumerReserved._sum.estimated_credits ?? 0);
  const consumerBudget = getFirecrawlConsumerMonthlyBudget(
    consumer,
    config.monthlyCreditBudget
  );

  return {
    periodKey: window.periodKey,
    globalBudget: config.monthlyCreditBudget,
    globalOffset: config.monthlyCreditOffset,
    submittedCredits,
    ledgerCredits,
    reservedCredits,
    globalUsed,
    globalRemaining: Math.max(0, config.monthlyCreditBudget - globalUsed),
    consumer,
    consumerBudget,
    consumerUsed,
    consumerRemaining: Math.max(0, consumerBudget - consumerUsed),
  };
}

export async function getFirecrawlBudgetSnapshot(
  consumer = EXTERNAL_SIGNAL_CONSUMER,
  now = new Date()
): Promise<FirecrawlBudgetSnapshot> {
  await expireStaleReservations(db, now);
  const [usage, provider] = await Promise.all([
    readBudgetUsage(db, consumer, now),
    getFirecrawlProviderCreditUsage(),
  ]);
  return {
    configured: getFirecrawlConfigSnapshot().configured,
    ...usage,
    providerRemaining: provider?.remainingCredits ?? null,
    providerPlan: provider?.planCredits ?? null,
    providerBillingPeriodStart: provider?.billingPeriodStart ?? null,
    providerBillingPeriodEnd: provider?.billingPeriodEnd ?? null,
  };
}

function toReservation(
  row: {
    id: string;
    status: string;
    estimated_credits: number;
    credits_used: number;
  },
  created: boolean
): FirecrawlCreditReservation {
  return {
    id: row.id,
    created,
    status: row.status,
    estimatedCredits: row.estimated_credits,
    creditsUsed: row.credits_used,
  };
}

export async function reserveFirecrawlCredits(input: {
  consumer?: string;
  operation: string;
  idempotencyKey: string;
  estimatedCredits: number;
  sourceUrl?: string | null;
  now?: Date;
}): Promise<FirecrawlCreditReservation> {
  const consumer = input.consumer?.trim() || EXTERNAL_SIGNAL_CONSUMER;
  const operation = input.operation.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  const estimatedCredits = Math.max(1, Math.ceil(input.estimatedCredits));
  const now = input.now ?? new Date();
  const config = getFirecrawlConfigSnapshot();

  if (!config.configured) {
    throw new FirecrawlBudgetError("Firecrawl API key is not configured.", 503);
  }
  if (!operation || !idempotencyKey) {
    throw new FirecrawlBudgetError("A Firecrawl operation and idempotency key are required.", 400);
  }
  const provider = await getFirecrawlProviderCreditUsage();
  if (
    provider &&
    provider.remainingCredits - estimatedCredits < PROVIDER_SAFETY_RESERVE_CREDITS
  ) {
    throw new FirecrawlBudgetError(
      `Firecrawl provider balance is too low (${provider.remainingCredits}/${provider.planCredits}); ${PROVIDER_SAFETY_RESERVE_CREDITS} credits are kept in reserve.`
    );
  }

  try {
    return await db.$transaction(async (tx) => {
      await expireStaleReservations(tx, now);
      const existing = await tx.firecrawlCreditLedger.findUnique({
        where: { idempotency_key: idempotencyKey },
      });
      if (existing) return toReservation(existing, false);

      const usage = await readBudgetUsage(tx, consumer, now);
      if (usage.globalUsed + estimatedCredits > usage.globalBudget) {
        throw new FirecrawlBudgetError(
          `Firecrawl monthly budget is reached (${usage.globalUsed}/${usage.globalBudget}).`
        );
      }
      if (usage.consumerUsed + estimatedCredits > usage.consumerBudget) {
        throw new FirecrawlBudgetError(
          `External signal Firecrawl budget is reached (${usage.consumerUsed}/${usage.consumerBudget}).`
        );
      }

      const row = await tx.firecrawlCreditLedger.create({
        data: {
          period_key: usage.periodKey,
          consumer,
          operation,
          idempotency_key: idempotencyKey,
          estimated_credits: estimatedCredits,
          source_url: input.sourceUrl ?? null,
          reserved_at: now,
          expires_at: new Date(now.getTime() + RESERVATION_TTL_MS),
        },
      });
      return toReservation(row, true);
    });
  } catch (error) {
    // A concurrent transaction can win the unique idempotency key between our
    // read and insert. Returning that row turns the race into a free dedupe.
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      String((error as { code?: unknown }).code) === "P2002"
    ) {
      const existing = await db.firecrawlCreditLedger.findUnique({
        where: { idempotency_key: idempotencyKey },
      });
      if (existing) return toReservation(existing, false);
    }
    throw error;
  }
}

export async function completeFirecrawlReservation(
  reservationId: string,
  creditsUsed: number | null | undefined,
  details?: Record<string, unknown>
): Promise<number> {
  const row = await db.firecrawlCreditLedger.findUniqueOrThrow({
    where: { id: reservationId },
  });
  const actual =
    creditsUsed != null && Number.isFinite(creditsUsed)
      ? Math.max(0, Math.ceil(creditsUsed))
      : row.estimated_credits;
  await db.firecrawlCreditLedger.update({
    where: { id: reservationId },
    data: {
      status: "completed",
      credits_used: actual,
      details_json: details ? JSON.stringify(details) : row.details_json,
      finished_at: new Date(),
    },
  });
  return actual;
}

export async function failFirecrawlReservation(
  reservationId: string,
  error: unknown
): Promise<void> {
  const row = await db.firecrawlCreditLedger.findUnique({
    where: { id: reservationId },
  });
  if (!row) return;
  const message = error instanceof Error ? error.message : String(error);
  await db.firecrawlCreditLedger.update({
    where: { id: reservationId },
    data: {
      status: "failed",
      // Conservatively count the whole reservation: a response failure does not
      // prove the provider declined to bill the request.
      credits_used: row.estimated_credits,
      details_json: JSON.stringify({ error: message.slice(0, 500) }),
      finished_at: new Date(),
    },
  });
}

export async function runBudgetedFirecrawlRequest<T>(input: {
  consumer?: string;
  operation: string;
  idempotencyKey: string;
  estimatedCredits: number;
  sourceUrl?: string | null;
  request: () => Promise<T>;
  getCreditsUsed: (result: T) => number | null | undefined;
}): Promise<{
  executed: boolean;
  result: T | null;
  creditsUsed: number;
  reservationId: string;
}> {
  const reservation = await reserveFirecrawlCredits(input);
  if (!reservation.created) {
    return {
      executed: false,
      result: null,
      creditsUsed:
        reservation.creditsUsed > 0
          ? reservation.creditsUsed
          : reservation.estimatedCredits,
      reservationId: reservation.id,
    };
  }

  try {
    const result = await input.request();
    const creditsUsed = await completeFirecrawlReservation(
      reservation.id,
      input.getCreditsUsed(result)
    );
    return {
      executed: true,
      result,
      creditsUsed,
      reservationId: reservation.id,
    };
  } catch (error) {
    await failFirecrawlReservation(reservation.id, error);
    throw error;
  }
}
