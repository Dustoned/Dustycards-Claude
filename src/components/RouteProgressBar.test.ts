import { describe, expect, it } from "vitest";
import { isRouteProgressNavigation } from "@/components/RouteProgressBar";

describe("isRouteProgressNavigation", () => {
  it("starts only for a different internal route", () => {
    expect(
      isRouteProgressNavigation(
        "/movers?game=pokemon",
        "https://dustycards.example/",
        "https://dustycards.example"
      )
    ).toBe(true);
  });

  it("ignores the current route, hash-only changes and external links", () => {
    const current = "https://dustycards.example/cards/123?mode=raw";
    expect(
      isRouteProgressNavigation(
        "/cards/123?mode=raw#market",
        current,
        "https://dustycards.example"
      )
    ).toBe(false);
    expect(
      isRouteProgressNavigation(
        "https://cardmarket.com/card",
        current,
        "https://dustycards.example"
      )
    ).toBe(false);
  });
});
