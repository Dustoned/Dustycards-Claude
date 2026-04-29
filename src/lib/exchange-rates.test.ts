import { describe, expect, it } from "vitest";
import { convertUsdToEur, parseUsdToEurRateResponse } from "@/lib/exchange-rates";

describe("exchange rates", () => {
  it("parses Frankfurter v2 USD to EUR rates", () => {
    const rate = parseUsdToEurRateResponse([
      {
        date: "2026-04-29",
        base: "USD",
        quote: "EUR",
        rate: 0.8552,
      },
    ]);

    expect(rate).toEqual({
      from: "USD",
      to: "EUR",
      rate: 0.8552,
      date: "2026-04-29",
      source: "frankfurter",
    });
  });

  it("converts USD amounts to EUR cents", () => {
    expect(
      convertUsdToEur(1200, {
        from: "USD",
        to: "EUR",
        rate: 0.8552,
        date: "2026-04-29",
        source: "frankfurter",
      })
    ).toBe(1026.24);
  });
});
