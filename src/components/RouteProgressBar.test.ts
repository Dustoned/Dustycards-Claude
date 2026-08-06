import { describe, expect, it } from "vitest";
import {
  hasRouteProgressReachedDestination,
  isRouteProgressNavigation,
  normalizeRouteProgressLabel,
  shouldAttemptDirectRouteRecovery,
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
    expect(normalizeRouteProgressLabel("A".repeat(80))).toBe("A".repeat(24));
    expect(normalizeRouteProgressLabel("Open full analysis for Shaymin-EX")).toBe(
      "Shaymin-EX"
    );
    expect(normalizeRouteProgressLabel("   ")).toBeNull();
  });

  it("recognizes a committed destination without treating a hash as pending", () => {
    expect(
      hasRouteProgressReachedDestination(
        "https://dustycards.example/expansions/399?card=31735#market",
        "https://dustycards.example/expansions/399?card=31735",
        "https://dustycards.example"
      )
    ).toBe(true);
    expect(
      hasRouteProgressReachedDestination(
        "https://dustycards.example/expansions/399?card=31735",
        "https://dustycards.example/expansions/399",
        "https://dustycards.example"
      )
    ).toBe(false);
  });

  it("recovers a stuck route once without creating a reload loop", () => {
    expect(shouldAttemptDirectRouteRecovery(null, 100_000)).toBe(true);
    expect(shouldAttemptDirectRouteRecovery(90_000, 100_000)).toBe(false);
    expect(shouldAttemptDirectRouteRecovery(40_000, 100_000)).toBe(true);
  });
});
