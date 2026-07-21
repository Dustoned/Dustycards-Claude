import { afterEach, describe, expect, it } from "vitest";
import {
  getNewReleaseChaseScrapeDoLimits,
  getScrapeDoBudgetWindow,
} from "@/lib/scrapedo-budget";

const original = {
  apiKey: process.env.SCRAPEDO_API_KEY,
  provider: process.env.SCRAPEDO_MONTHLY_CREDIT_BUDGET,
  chaseMonth: process.env.SCRAPEDO_CHASE_MONTHLY_CREDIT_BUDGET,
  chaseDay: process.env.SCRAPEDO_CHASE_DAILY_CREDIT_BUDGET,
  reserve: process.env.SCRAPEDO_PROVIDER_RESERVE_CREDITS,
};

function restore(name: string, value: string | undefined) {
  if (value == null) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore("SCRAPEDO_API_KEY", original.apiKey);
  restore("SCRAPEDO_MONTHLY_CREDIT_BUDGET", original.provider);
  restore("SCRAPEDO_CHASE_MONTHLY_CREDIT_BUDGET", original.chaseMonth);
  restore("SCRAPEDO_CHASE_DAILY_CREDIT_BUDGET", original.chaseDay);
  restore("SCRAPEDO_PROVIDER_RESERVE_CREDITS", original.reserve);
});

describe("Scrape.do chase budget policy", () => {
  it("uses stable UTC month and day ledger keys", () => {
    expect(getScrapeDoBudgetWindow(new Date("2026-12-31T23:59:00Z"))).toEqual({
      periodKey: "2026-12",
      dayKey: "2026-12-31",
    });
  });

  it("caps Chase Watch below the provider plan and keeps a reserve", () => {
    process.env.SCRAPEDO_API_KEY = "test";
    process.env.SCRAPEDO_MONTHLY_CREDIT_BUDGET = "500";
    process.env.SCRAPEDO_CHASE_MONTHLY_CREDIT_BUDGET = "650";
    process.env.SCRAPEDO_CHASE_DAILY_CREDIT_BUDGET = "35";
    process.env.SCRAPEDO_PROVIDER_RESERVE_CREDITS = "60";

    expect(getNewReleaseChaseScrapeDoLimits()).toEqual({
      monthly: 500,
      daily: 35,
      providerReserve: 60,
    });
  });
});
