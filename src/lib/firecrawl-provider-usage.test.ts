import { describe, expect, it } from "vitest";

import { parseFirecrawlProviderCreditUsage } from "@/lib/firecrawl";

describe("Firecrawl provider usage parsing", () => {
  it("uses the provider billing cycle as the authoritative balance", () => {
    expect(
      parseFirecrawlProviderCreditUsage({
        success: true,
        data: {
          remainingCredits: 412,
          planCredits: 1000,
          billingPeriodStart: "2026-06-17T20:03:29.110Z",
          billingPeriodEnd: "2026-07-17T20:03:29.110Z",
        },
      })
    ).toEqual({
      remainingCredits: 412,
      planCredits: 1000,
      billingPeriodStart: "2026-06-17T20:03:29.110Z",
      billingPeriodEnd: "2026-07-17T20:03:29.110Z",
    });
  });

  it("rejects incomplete provider responses", () => {
    expect(parseFirecrawlProviderCreditUsage({ data: { remainingCredits: 10 } })).toBeNull();
  });
});
