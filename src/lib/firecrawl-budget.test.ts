import { afterEach, describe, expect, it } from "vitest";

import {
  getFirecrawlConsumerMonthlyBudget,
  getFirecrawlMonthWindow,
} from "@/lib/firecrawl-budget";
import {
  getCompleteExternalSignalGames,
  getExternalSignalPriceBand,
  isExternalRefreshDue,
} from "@/lib/sync/external-signal-persistence";
import type { ExternalSignalRadarData } from "@/lib/external-signal-radar";

const originalSignalBudget = process.env.FIRECRAWL_SIGNAL_MONTHLY_CREDIT_BUDGET;

afterEach(() => {
  if (originalSignalBudget == null) delete process.env.FIRECRAWL_SIGNAL_MONTHLY_CREDIT_BUDGET;
  else process.env.FIRECRAWL_SIGNAL_MONTHLY_CREDIT_BUDGET = originalSignalBudget;
});

describe("external signal schedules and Firecrawl budget", () => {
  it("uses UTC calendar months for the credit ledger", () => {
    expect(getFirecrawlMonthWindow(new Date("2026-12-31T23:59:00Z"))).toMatchObject({
      periodKey: "2026-12",
      startsAt: new Date("2026-12-01T00:00:00Z"),
      endsAt: new Date("2027-01-01T00:00:00Z"),
    });
  });

  it("caps the signal crawler separately from the shared Firecrawl budget", () => {
    process.env.FIRECRAWL_SIGNAL_MONTHLY_CREDIT_BUDGET = "180";
    expect(getFirecrawlConsumerMonthlyBudget("external-signal-catalysts", 1000)).toBe(180);
    expect(getFirecrawlConsumerMonthlyBudget("external-signal-catalysts", 100)).toBe(100);
  });

  it("marks six-hour competitive scans due without visitor traffic", () => {
    const now = new Date("2026-07-12T12:00:00Z");
    expect(isExternalRefreshDue(new Date("2026-07-12T05:59:59Z"), 6 * 60 * 60_000, now)).toBe(true);
    expect(isExternalRefreshDue(new Date("2026-07-12T08:00:00Z"), 6 * 60 * 60_000, now)).toBe(false);
  });

  it("creates stable price bands for cohort calibration", () => {
    expect([null, 2, 10, 50, 500].map(getExternalSignalPriceBand)).toEqual([
      null,
      "under-5",
      "5-25",
      "25-100",
      "100-plus",
    ]);
  });

  it("excludes partial upstream game reads from persisted cohorts", () => {
    const data = {
      sources: [
        {
          game: "pokemon",
          label: "Pokemon",
          url: "https://limitlesstcg.com/decks",
          ok: true,
          deckCount: 6,
          message: null,
          fetchedAt: "2026-07-12T12:00:00Z",
        },
        {
          game: "one-piece",
          label: "One Piece",
          url: "https://onepiece.limitlesstcg.com/decks",
          ok: true,
          deckCount: 2,
          message: "2 of 6 archetypes could be read",
          fetchedAt: "2026-07-12T12:00:00Z",
        },
      ],
    } as ExternalSignalRadarData;

    expect([...getCompleteExternalSignalGames(data)]).toEqual(["pokemon"]);
  });
});
