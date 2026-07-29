import { describe, expect, it, vi } from "vitest";
import {
  isCardHistoryQuotaDrainWindow,
  isCardHistoryQuotaWindDownWindow,
} from "@/lib/sync/card-history-auto-drain";

vi.mock("@/lib/scraper-guard", () => ({
  areScraperRequestsDisabled: vi.fn(() => false),
}));

vi.mock("@/lib/tcggo-usage", () => ({
  getTcggoUsageSnapshot: vi.fn(),
}));

vi.mock("@/lib/sync/card-history-job", () => ({
  startCardHistorySyncJob: vi.fn(),
}));

describe("card history quota drain window", () => {
  const now = new Date("2026-05-09T20:00:00.000Z");

  it("opens in the final two hours of a live quota window", () => {
    expect(
      isCardHistoryQuotaDrainWindow(
        {
          hasLiveWindow: true,
          quotaResetsAt: new Date("2026-05-09T21:30:00.000Z"),
          requestsRemaining: 250,
        },
        now
      )
    ).toBe(true);
  });

  it("stays closed without live quota data, after reset, or with no requests left", () => {
    expect(
      isCardHistoryQuotaDrainWindow(
        { hasLiveWindow: false, quotaResetsAt: null, requestsRemaining: 250 },
        now
      )
    ).toBe(false);
    expect(
      isCardHistoryQuotaDrainWindow(
        {
          hasLiveWindow: true,
          quotaResetsAt: new Date("2026-05-09T19:59:00.000Z"),
          requestsRemaining: 250,
        },
        now
      )
    ).toBe(false);
    expect(
      isCardHistoryQuotaDrainWindow(
        {
          hasLiveWindow: true,
          quotaResetsAt: new Date("2026-05-09T21:30:00.000Z"),
          requestsRemaining: 0,
        },
        now
      )
    ).toBe(false);
  });

  it("marks the wind-down window only in the final two hours before reset", () => {
    expect(
      isCardHistoryQuotaWindDownWindow(
        { hasLiveWindow: true, quotaResetsAt: new Date("2026-05-09T21:30:00.000Z") },
        now
      )
    ).toBe(true);
    expect(
      isCardHistoryQuotaWindDownWindow(
        { hasLiveWindow: true, quotaResetsAt: new Date("2026-05-10T06:00:00.000Z") },
        now
      )
    ).toBe(false);
    expect(
      isCardHistoryQuotaWindDownWindow(
        { hasLiveWindow: false, quotaResetsAt: null },
        now
      )
    ).toBe(false);
  });
});
