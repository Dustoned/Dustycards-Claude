import { describe, expect, it } from "vitest";
import {
  getNextRollingRefreshAt,
  getPriceRefreshInfo,
  getPriceRefreshTier,
} from "@/lib/price-refresh";

describe("price refresh tiers", () => {
  it("keeps One Piece Common and Uncommon variants at base price only", () => {
    expect(getPriceRefreshTier("Common")).toBe("base");
    expect(getPriceRefreshTier("Uncommon")).toBe("base");
    expect(getPriceRefreshTier("C")).toBe("base");
    expect(getPriceRefreshTier("UC")).toBe("base");
  });

  it("auto-refreshes One Piece Rare and higher rarities", () => {
    expect(getPriceRefreshTier("Rare")).toBe("medium");
    expect(getPriceRefreshTier("R")).toBe("medium");
    expect(getPriceRefreshTier("Super Rare")).toBe("high");
    expect(getPriceRefreshTier("SR")).toBe("high");
  });

  it("does not schedule a repeat refresh for base-price-only cards", () => {
    const info = getPriceRefreshInfo("UC", "2026-05-01T00:00:00.000Z", Date.UTC(2026, 4, 14));

    expect(info.autoRefreshEnabled).toBe(false);
    expect(info.due).toBe(false);
  });

  it("keeps high-refresh cards on their own rolling 12h cadence", () => {
    const first = "2026-05-15T00:08:00.000Z";
    const second = "2026-05-15T01:17:00.000Z";
    const now = Date.UTC(2026, 4, 15, 10, 0, 0);

    expect(getPriceRefreshInfo("Special Illustration Rare", first, now).nextRefreshAt).toBe(
      Date.UTC(2026, 4, 15, 12, 8, 0)
    );
    expect(getPriceRefreshInfo("Special Illustration Rare", second, now).nextRefreshAt).toBe(
      Date.UTC(2026, 4, 15, 13, 17, 0)
    );
  });

  it("schedules the next refresh directly after the tier interval", () => {
    expect(getNextRollingRefreshAt(Date.UTC(2026, 4, 15, 6, 30, 0), 12 * 60 * 60 * 1000)).toBe(
      Date.UTC(2026, 4, 15, 18, 30, 0)
    );
  });

  it("keeps daily refresh cards on their own rolling cadence", () => {
    const first = "2026-05-15T00:12:00.000Z";
    const second = "2026-05-15T01:42:00.000Z";
    const now = Date.UTC(2026, 4, 15, 12, 0, 0);

    expect(getPriceRefreshInfo("Rare", first, now).nextRefreshAt).toBe(
      Date.UTC(2026, 4, 16, 0, 12, 0)
    );
    expect(getPriceRefreshInfo("Rare", second, now).nextRefreshAt).toBe(
      Date.UTC(2026, 4, 16, 1, 42, 0)
    );
  });
});
