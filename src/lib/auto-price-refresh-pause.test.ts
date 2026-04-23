import { describe, expect, it } from "vitest";
import {
  AUTO_PRICE_REFRESH_CANCEL_COOLDOWN_MS,
  formatAutoPriceRefreshPauseRemaining,
  getAutoPriceRefreshPauseRemainingMs,
} from "@/lib/auto-price-refresh-pause";

describe("auto price refresh pause", () => {
  it("returns remaining cooldown time after a manual stop", () => {
    const now = new Date("2026-04-23T14:15:00.000Z");
    const cancelledAt = new Date(
      now.getTime() - (AUTO_PRICE_REFRESH_CANCEL_COOLDOWN_MS - 2 * 60 * 1000)
    );

    const remainingMs = getAutoPriceRefreshPauseRemainingMs({ cancelledAt, now });

    expect(remainingMs).toBe(2 * 60 * 1000);
  });

  it("clamps expired cooldowns to zero", () => {
    const now = new Date("2026-04-23T14:15:00.000Z");
    const cancelledAt = new Date(
      now.getTime() - (AUTO_PRICE_REFRESH_CANCEL_COOLDOWN_MS + 1_000)
    );

    const remainingMs = getAutoPriceRefreshPauseRemainingMs({ cancelledAt, now });

    expect(remainingMs).toBe(0);
  });

  it("formats short cooldown windows in minutes", () => {
    expect(formatAutoPriceRefreshPauseRemaining(2 * 60 * 1000)).toBe("2 minutes");
  });
});
