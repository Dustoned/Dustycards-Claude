import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { getScrapeDoConfigSnapshot } from "@/lib/scrapedo";

export const NEW_RELEASE_CHASE_SCRAPEDO_CONSUMER = "new-release-chase-prices";

const DEFAULT_CHASE_MONTHLY_CREDITS = 650;
const DEFAULT_CHASE_DAILY_CREDITS = 40;
const DEFAULT_PROVIDER_RESERVE_CREDITS = 50;
const RESERVATION_TTL_MS = 30 * 60_000;
const PROVIDER_BALANCE_FRESHNESS_MS = 12 * 60 * 60_000;

type BudgetClient = Pick<Prisma.TransactionClient, "scrapeDoCreditLedger">;

export class ScrapeDoBudgetError extends Error {
  status: number;

  constructor(message: string, status = 429) {
    super(message);
    this.name = "ScrapeDoBudgetError";
    this.status = status;
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function getScrapeDoBudgetWindow(now = new Date()): {
  periodKey: string;
  dayKey: string;
} {
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const day = `${month}-${String(now.getUTCDate()).padStart(2, "0")}`;
  return { periodKey: month, dayKey: day };
}

export function getNewReleaseChaseScrapeDoLimits(): {
  monthly: number;
  daily: number;
  providerReserve: number;
} {
  const providerBudget = getScrapeDoConfigSnapshot().monthlyCreditBudget;
  return {
    monthly: Math.min(
      providerBudget,
      positiveInteger(
        process.env.SCRAPEDO_CHASE_MONTHLY_CREDIT_BUDGET,
        DEFAULT_CHASE_MONTHLY_CREDITS
      )
    ),
    daily: positiveInteger(
      process.env.SCRAPEDO_CHASE_DAILY_CREDIT_BUDGET,
      DEFAULT_CHASE_DAILY_CREDITS
    ),
    providerReserve: positiveInteger(
      process.env.SCRAPEDO_PROVIDER_RESERVE_CREDITS,
      DEFAULT_PROVIDER_RESERVE_CREDITS
    ),
  };
}

async function expireReservations(client: BudgetClient, now: Date): Promise<void> {
  await client.scrapeDoCreditLedger.updateMany({
    where: { status: "reserved", expires_at: { lte: now } },
    data: { status: "expired", credits_used: 0, finished_at: now },
  });
}

async function usageFor(
  client: BudgetClient,
  consumer: string,
  now: Date
): Promise<{
  monthlyUsed: number;
  dailyUsed: number;
  lastProviderRemaining: number | null;
}> {
  const { periodKey, dayKey } = getScrapeDoBudgetWindow(now);
  const [monthlyCompleted, monthlyReserved, dailyCompleted, dailyReserved, latest] =
    await Promise.all([
      client.scrapeDoCreditLedger.aggregate({
        where: {
          consumer,
          period_key: periodKey,
          status: { in: ["completed", "failed"] },
        },
        _sum: { credits_used: true },
      }),
      client.scrapeDoCreditLedger.aggregate({
        where: { consumer, period_key: periodKey, status: "reserved" },
        _sum: { estimated_credits: true },
      }),
      client.scrapeDoCreditLedger.aggregate({
        where: {
          consumer,
          day_key: dayKey,
          status: { in: ["completed", "failed"] },
        },
        _sum: { credits_used: true },
      }),
      client.scrapeDoCreditLedger.aggregate({
        where: { consumer, day_key: dayKey, status: "reserved" },
        _sum: { estimated_credits: true },
      }),
      client.scrapeDoCreditLedger.findFirst({
        where: {
          period_key: periodKey,
          remaining_credits: { not: null },
          finished_at: {
            gte: new Date(now.getTime() - PROVIDER_BALANCE_FRESHNESS_MS),
          },
        },
        orderBy: { finished_at: "desc" },
        select: { remaining_credits: true },
      }),
    ]);

  return {
    monthlyUsed:
      (monthlyCompleted._sum.credits_used ?? 0) +
      (monthlyReserved._sum.estimated_credits ?? 0),
    dailyUsed:
      (dailyCompleted._sum.credits_used ?? 0) +
      (dailyReserved._sum.estimated_credits ?? 0),
    lastProviderRemaining: latest?.remaining_credits ?? null,
  };
}

export interface ScrapeDoCreditReservation {
  id: string;
  created: boolean;
  estimatedCredits: number;
  creditsUsed: number;
}

export async function reserveScrapeDoCredits(input: {
  consumer?: string;
  operation: string;
  idempotencyKey: string;
  estimatedCredits?: number;
  sourceUrl?: string | null;
  now?: Date;
}): Promise<ScrapeDoCreditReservation> {
  const consumer = input.consumer?.trim() || NEW_RELEASE_CHASE_SCRAPEDO_CONSUMER;
  const estimatedCredits = Math.max(1, Math.ceil(input.estimatedCredits ?? 1));
  const operation = input.operation.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  const now = input.now ?? new Date();
  const config = getScrapeDoConfigSnapshot();
  if (!config.configured) {
    throw new ScrapeDoBudgetError("Scrape.do API key is not configured.", 503);
  }
  if (!operation || !idempotencyKey) {
    throw new ScrapeDoBudgetError("A Scrape.do operation and idempotency key are required.", 400);
  }

  try {
    return await db.$transaction(async (tx) => {
      await expireReservations(tx, now);
      const existing = await tx.scrapeDoCreditLedger.findUnique({
        where: { idempotency_key: idempotencyKey },
      });
      if (existing) {
        return {
          id: existing.id,
          created: false,
          estimatedCredits: existing.estimated_credits,
          creditsUsed: existing.credits_used,
        };
      }

      const [usage, limits] = await Promise.all([
        usageFor(tx, consumer, now),
        Promise.resolve(getNewReleaseChaseScrapeDoLimits()),
      ]);
      if (usage.monthlyUsed + estimatedCredits > limits.monthly) {
        throw new ScrapeDoBudgetError(
          `Chase Watch Scrape.do monthly budget is reached (${usage.monthlyUsed}/${limits.monthly}).`
        );
      }
      if (usage.dailyUsed + estimatedCredits > limits.daily) {
        throw new ScrapeDoBudgetError(
          `Chase Watch Scrape.do daily budget is reached (${usage.dailyUsed}/${limits.daily}).`
        );
      }
      if (
        usage.lastProviderRemaining != null &&
        usage.lastProviderRemaining - estimatedCredits < limits.providerReserve
      ) {
        throw new ScrapeDoBudgetError(
          `Scrape.do provider balance is low (${usage.lastProviderRemaining} credits); ${limits.providerReserve} are kept in reserve.`
        );
      }

      const window = getScrapeDoBudgetWindow(now);
      const row = await tx.scrapeDoCreditLedger.create({
        data: {
          period_key: window.periodKey,
          day_key: window.dayKey,
          consumer,
          operation,
          idempotency_key: idempotencyKey,
          estimated_credits: estimatedCredits,
          source_url: input.sourceUrl ?? null,
          reserved_at: now,
          expires_at: new Date(now.getTime() + RESERVATION_TTL_MS),
        },
      });
      return {
        id: row.id,
        created: true,
        estimatedCredits: row.estimated_credits,
        creditsUsed: row.credits_used,
      };
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      String((error as { code?: unknown }).code) === "P2002"
    ) {
      const existing = await db.scrapeDoCreditLedger.findUnique({
        where: { idempotency_key: idempotencyKey },
      });
      if (existing) {
        return {
          id: existing.id,
          created: false,
          estimatedCredits: existing.estimated_credits,
          creditsUsed: existing.credits_used,
        };
      }
    }
    throw error;
  }
}

export async function completeScrapeDoReservation(
  reservationId: string,
  input: {
    creditsUsed?: number | null;
    remainingCredits?: number | null;
    details?: Record<string, unknown>;
  }
): Promise<number> {
  const row = await db.scrapeDoCreditLedger.findUniqueOrThrow({
    where: { id: reservationId },
  });
  const creditsUsed =
    input.creditsUsed != null && Number.isFinite(input.creditsUsed)
      ? Math.max(0, Math.ceil(input.creditsUsed))
      : row.estimated_credits;
  await db.scrapeDoCreditLedger.update({
    where: { id: reservationId },
    data: {
      status: "completed",
      credits_used: creditsUsed,
      remaining_credits:
        input.remainingCredits != null && Number.isFinite(input.remainingCredits)
          ? Math.max(0, Math.floor(input.remainingCredits))
          : null,
      details_json: input.details ? JSON.stringify(input.details) : row.details_json,
      finished_at: new Date(),
    },
  });
  return creditsUsed;
}

export async function failScrapeDoReservation(
  reservationId: string,
  error: unknown
): Promise<void> {
  const row = await db.scrapeDoCreditLedger.findUnique({ where: { id: reservationId } });
  if (!row) return;
  await db.scrapeDoCreditLedger.update({
    where: { id: reservationId },
    data: {
      status: "failed",
      credits_used: row.estimated_credits,
      details_json: JSON.stringify({
        error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
      }),
      finished_at: new Date(),
    },
  });
}

export async function getNewReleaseChaseScrapeDoBudgetSnapshot(now = new Date()) {
  await expireReservations(db, now);
  const usage = await usageFor(db, NEW_RELEASE_CHASE_SCRAPEDO_CONSUMER, now);
  const limits = getNewReleaseChaseScrapeDoLimits();
  return {
    configured: getScrapeDoConfigSnapshot().configured,
    monthlyUsed: usage.monthlyUsed,
    monthlyLimit: limits.monthly,
    dailyUsed: usage.dailyUsed,
    dailyLimit: limits.daily,
    providerRemaining: usage.lastProviderRemaining,
    providerReserve: limits.providerReserve,
    paused:
      usage.monthlyUsed >= limits.monthly ||
      usage.dailyUsed >= limits.daily ||
      (usage.lastProviderRemaining != null &&
        usage.lastProviderRemaining <= limits.providerReserve),
  };
}
