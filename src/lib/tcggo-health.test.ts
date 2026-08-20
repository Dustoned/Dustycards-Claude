import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    syncJob: {
      findUnique: mocks.findUnique,
    },
  },
}));

import {
  getTcggoMonthlyHealthPeriod,
  maybeRunMonthlyTcggoHealthcheck,
  type TcggoHealthObservation,
} from "@/lib/tcggo-health";

const availableQuota = {
  requestsUsed: 12,
  requestsLimit: 3_000,
  requestsRemaining: 2_988,
  quotaResetsAt: new Date("2026-09-11T17:57:00.000Z"),
  observedAt: new Date("2026-08-31T10:00:00.000Z"),
  hasLiveWindow: true,
};

function healthyObservation(period: string): TcggoHealthObservation {
  return {
    state: "healthy",
    ok: true,
    reason: "monthly",
    checkedAt: "2026-08-31T10:00:00.000Z",
    latencyMs: 42,
    httpStatus: 200,
    message: "ok",
    monthlyPeriodKey: period,
  };
}

describe("TCGGO monthly healthcheck policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(null);
  });

  it("is due only on the final Amsterdam calendar day", () => {
    expect(getTcggoMonthlyHealthPeriod(new Date("2026-08-30T12:00:00.000Z"))).toBeNull();
    expect(getTcggoMonthlyHealthPeriod(new Date("2026-08-31T12:00:00.000Z"))).toBe(
      "2026-08"
    );
    expect(getTcggoMonthlyHealthPeriod(new Date("2026-08-31T22:30:00.000Z"))).toBeNull();
  });

  it("runs exactly once for the month", async () => {
    const run = vi.fn(async ({ monthlyPeriodKey }: { monthlyPeriodKey: string }) =>
      healthyObservation(monthlyPeriodKey)
    );

    const result = await maybeRunMonthlyTcggoHealthcheck({
      now: new Date("2026-08-31T10:00:00.000Z"),
      quota: availableQuota,
      run,
    });

    expect(result).toMatchObject({ due: false, ran: true, skippedReason: null });
    expect(run).toHaveBeenCalledWith({
      reason: "monthly",
      monthlyPeriodKey: "2026-08",
    });
  });

  it("does not repeat a completed monthly check", async () => {
    mocks.findUnique.mockResolvedValue({
      details_json: JSON.stringify({
        lastMonthlyPeriodKey: "2026-08",
        latest: healthyObservation("2026-08"),
      }),
    });
    const run = vi.fn();

    const result = await maybeRunMonthlyTcggoHealthcheck({
      now: new Date("2026-08-31T10:00:00.000Z"),
      quota: availableQuota,
      run,
    });

    expect(result).toMatchObject({
      due: false,
      ran: false,
      skippedReason: "already-checked",
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("never spends a request while the live quota is empty", async () => {
    const run = vi.fn();

    const result = await maybeRunMonthlyTcggoHealthcheck({
      now: new Date("2026-08-31T10:00:00.000Z"),
      quota: { ...availableQuota, requestsRemaining: 0 },
      run,
    });

    expect(result).toMatchObject({
      due: true,
      ran: false,
      skippedReason: "quota-paused",
    });
    expect(run).not.toHaveBeenCalled();
  });
});
