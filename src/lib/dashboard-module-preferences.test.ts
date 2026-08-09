import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOME_DASHBOARD_MODULE_ORDER,
  normalizeHiddenHomeDashboardModules,
  normalizeHomeDashboardModuleOrder,
  normalizeHomeDashboardModuleSelection,
} from "@/lib/dashboard-module-preferences";
import {
  DEFAULT_OVERVIEW_SECTION_ORDER,
  normalizeHiddenOverviewSections,
} from "@/lib/overview-section-order";

describe("dashboard module preferences", () => {
  it("keeps a custom home order and restores missing new modules", () => {
    expect(normalizeHomeDashboardModuleOrder(["featured", "overview", "featured"])).toEqual([
      "featured",
      "overview",
      "value-drivers",
      "sudden-drops",
      "market-movers",
      "cheap-rarity",
      "discount-watch",
      "signal-radar",
      "allocation",
      "top-sets",
      "wants",
      "for-sale",
      "upcoming",
      "upcoming-singles",
      "shortcuts",
    ]);
  });

  it("expands the old combined widgets without losing their placement", () => {
    expect(
      normalizeHomeDashboardModuleOrder([
        "overview",
        "market",
        "featured",
        "breakdown",
        "shortcuts",
      ])
    ).toEqual([
      "overview",
      "value-drivers",
      "sudden-drops",
      "featured",
      "allocation",
      "top-sets",
      "shortcuts",
      "market-movers",
      "cheap-rarity",
      "discount-watch",
      "signal-radar",
      "wants",
      "for-sale",
      "upcoming",
      "upcoming-singles",
    ]);
  });

  it("drops unknown and duplicate hidden module keys", () => {
    expect(
      normalizeHiddenHomeDashboardModules(["market", "unknown", "market"], ["market"])
    ).toEqual([
      "value-drivers",
      "sudden-drops",
      "market-movers",
      "cheap-rarity",
      "discount-watch",
      "signal-radar",
      "wants",
      "for-sale",
      "upcoming",
      "upcoming-singles",
    ]);
    expect(normalizeHomeDashboardModuleSelection(["featured", "bad", "featured"])).toEqual([
      "featured",
    ]);
    expect(normalizeHiddenOverviewSections(["raw", "unknown", "raw"])).toEqual(["raw"]);
  });

  it("uses complete defaults for invalid orders", () => {
    expect(normalizeHomeDashboardModuleOrder(null)).toEqual(
      DEFAULT_HOME_DASHBOARD_MODULE_ORDER
    );
    expect(DEFAULT_OVERVIEW_SECTION_ORDER).toContain("binders");
  });
});
