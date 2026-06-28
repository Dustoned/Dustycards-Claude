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

  it("auto-refreshes base-price cards on a roughly 2-week cadence", () => {
    const fetchedAt = "2026-05-01T00:00:00.000Z";

    const fresh = getPriceRefreshInfo("UC", fetchedAt, Date.UTC(2026, 4, 2));
    expect(fresh.autoRefreshEnabled).toBe(true);
    expect(fresh.due).toBe(false);

    const stale = getPriceRefreshInfo("UC", fetchedAt, Date.UTC(2026, 5, 1));
    expect(stale.due).toBe(true);
  });

  it("keeps high-refresh cards on the shared 12h class cadence", () => {
    const first = "2026-05-15T00:08:00.000Z";
    const second = "2026-05-15T01:17:00.000Z";
    const now = Date.UTC(2026, 4, 15, 10, 0, 0);

    expect(getPriceRefreshInfo("Special Illustration Rare", first, now).nextRefreshAt).toBe(
      Date.UTC(2026, 4, 15, 12, 0, 0)
    );
    expect(getPriceRefreshInfo("Special Illustration Rare", second, now).nextRefreshAt).toBe(
      Date.UTC(2026, 4, 15, 12, 0, 0)
    );
  });

  it("rounds the next refresh to the next shared tier slot", () => {
    expect(getNextRollingRefreshAt(Date.UTC(2026, 4, 15, 6, 30, 0), 12 * 60 * 60 * 1000)).toBe(
      Date.UTC(2026, 4, 15, 12, 0, 0)
    );
  });

  it("keeps daily refresh cards on the shared daily class cadence", () => {
    const first = "2026-05-15T00:12:00.000Z";
    const second = "2026-05-15T01:42:00.000Z";
    const now = Date.UTC(2026, 4, 15, 12, 0, 0);

    expect(getPriceRefreshInfo("Rare", first, now).nextRefreshAt).toBe(
      Date.UTC(2026, 4, 16, 0, 0, 0)
    );
    expect(getPriceRefreshInfo("Rare", second, now).nextRefreshAt).toBe(
      Date.UTC(2026, 4, 16, 0, 0, 0)
    );
  });

  it("does not let a manual refresh create a private countdown", () => {
    const manualRefresh = "2026-05-15T10:37:00.000Z";
    const anotherCardRefresh = "2026-05-15T08:02:00.000Z";
    const now = Date.UTC(2026, 4, 15, 10, 45, 0);

    expect(getPriceRefreshInfo("Special Illustration Rare", manualRefresh, now).nextRefreshAt).toBe(
      Date.UTC(2026, 4, 15, 12, 0, 0)
    );
    expect(
      getPriceRefreshInfo("Special Illustration Rare", anotherCardRefresh, now).nextRefreshAt
    ).toBe(
      Date.UTC(2026, 4, 15, 12, 0, 0)
    );
  });
});
