import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AdminCardMarketPriceCheckError,
  createAdminCardMarketPriceCheckToken,
  parseAdminCardMarketPriceCheckToken,
} from "./admin-cardmarket-price-check";

describe("admin CardMarket price check tokens", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps the scraped quote bound to one card for ten minutes", () => {
    vi.stubEnv("DUSTYCARDS_SYNC_SCHEDULER_SECRET", "price-check-secret");
    const now = new Date("2026-08-05T12:00:00.000Z");
    const token = createAdminCardMarketPriceCheckToken({
      v: 1,
      cardId: "card-1",
      priceEur: 99.99,
      offerCount: 4,
      sourceUrl: "https://www.cardmarket.com/en/Pokemon/Products/Singles/Test/Test",
      provider: "firecrawl",
      observedAt: now.toISOString(),
    });

    expect(parseAdminCardMarketPriceCheckToken(token, "card-1", now)).toMatchObject({
      cardId: "card-1",
      priceEur: 99.99,
      offerCount: 4,
    });
    expect(() => parseAdminCardMarketPriceCheckToken(token, "card-2", now)).toThrow(
      AdminCardMarketPriceCheckError
    );
  });

  it("rejects expired or modified live quotes", () => {
    vi.stubEnv("DUSTYCARDS_SYNC_SCHEDULER_SECRET", "price-check-secret");
    const observedAt = new Date("2026-08-05T12:00:00.000Z");
    const token = createAdminCardMarketPriceCheckToken({
      v: 1,
      cardId: "card-1",
      priceEur: 44,
      offerCount: 1,
      sourceUrl: "https://www.cardmarket.com/en/Pokemon/Products/Singles/Test/Test",
      provider: "scrapedo",
      observedAt: observedAt.toISOString(),
    });

    expect(() =>
      parseAdminCardMarketPriceCheckToken(
        token,
        "card-1",
        new Date(observedAt.getTime() + 11 * 60_000)
      )
    ).toThrow(/expired/i);
    expect(() =>
      parseAdminCardMarketPriceCheckToken(`${token.slice(0, -1)}x`, "card-1", observedAt)
    ).toThrow(/invalid/i);
  });
});
