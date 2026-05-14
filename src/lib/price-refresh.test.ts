import { describe, expect, it } from "vitest";
import { getPriceRefreshInfo, getPriceRefreshTier } from "@/lib/price-refresh";

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
});
