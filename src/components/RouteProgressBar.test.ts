import { describe, expect, it } from "vitest";
import {
  isRouteProgressNavigation,
  normalizeRouteProgressLabel,
} from "@/components/RouteProgressBar";

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

  it("keeps destination labels compact and readable", () => {
    expect(normalizeRouteProgressLabel("  Perfect   Order  ")).toBe("Perfect Order");
    expect(normalizeRouteProgressLabel("A".repeat(80))).toBe(`${"A".repeat(41)}…`);
    expect(normalizeRouteProgressLabel("   ")).toBeNull();
  });
});
