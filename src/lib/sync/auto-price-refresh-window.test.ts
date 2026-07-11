import { describe, expect, it } from "vitest";
import { resolveAutoPriceRefreshStartedAt } from "./auto-price-refresh-window";

describe("resolveAutoPriceRefreshStartedAt", () => {
  const now = new Date("2026-07-11T01:04:24.054Z");

  it("preserves the original window when a queued multi-batch refresh resumes", () => {
    const originalStart = new Date("2026-07-11T00:13:00.000Z");

    expect(
      resolveAutoPriceRefreshStartedAt(
        { status: "queued", started_at: originalStart },
        now
      )
    ).toBe(originalStart);
  });

  it("starts a new window after a completed refresh", () => {
    expect(
      resolveAutoPriceRefreshStartedAt(
        { status: "success", started_at: new Date("2026-07-10T19:32:50.046Z") },
        now
      )
    ).toBe(now);
  });

  it("uses the current time when a queued record has no start", () => {
    expect(resolveAutoPriceRefreshStartedAt({ status: "queued", started_at: null }, now)).toBe(
      now
    );
  });
});
