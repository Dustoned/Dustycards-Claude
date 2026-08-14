import { describe, expect, it } from "vitest";
import { scopeHomeApiEndpointToVisibleLibraries } from "@/lib/home-library-scope";

describe("scopeHomeApiEndpointToVisibleLibraries", () => {
  it("forces Pokemon immediately when One Piece is disabled", () => {
    expect(
      scopeHomeApiEndpointToVisibleLibraries(
        "/api/collection/home-insights?game=one-piece&source=tcp",
        false
      )
    ).toBe("/api/collection/home-insights?game=pokemon&source=tcp");
  });

  it("keeps the existing endpoint while One Piece is enabled", () => {
    expect(scopeHomeApiEndpointToVisibleLibraries("/api/collection/home-insights", true))
      .toBe("/api/collection/home-insights");
  });
});
