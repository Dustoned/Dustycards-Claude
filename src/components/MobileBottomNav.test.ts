import { describe, expect, it } from "vitest";
import {
  getMobileMoreRouteInventory,
  getMobilePinnedNavigation,
  getMobilePrimaryNavigation,
  getMoreMenuSections,
} from "./MobileBottomNav";

describe("mobile navigation model", () => {
  it("keeps four configurable quick-bar destinations in their chosen order", () => {
    const items = getMobilePrimaryNavigation(
      ["market-sealed", "home", "openings", "wants"],
      true
    );

    expect(items.map((item) => item.key)).toEqual([
      "market-sealed",
      "home",
      "openings",
      "wants",
    ]);
    expect(items.map((item) => item.shortLabel ?? item.label)).toEqual([
      "Sealed",
      "Home",
      "Openings",
      "Wants",
    ]);
  });

  it("fills a hidden One Piece quick-bar choice with a safe default", () => {
    const items = getMobilePrimaryNavigation(
      ["one-piece", "market-sealed", "openings", "wants"],
      false
    );

    expect(items.map((item) => item.key)).toEqual([
      "market-sealed",
      "openings",
      "wants",
      "home",
    ]);
  });

  it("keeps ordered More shortcuts independently configurable", () => {
    const items = getMobilePinnedNavigation(
      ["selling", "market-sealed", "market-radar"],
      true
    );

    expect(items.map((item) => item.key)).toEqual([
      "selling",
      "market-sealed",
      "market-radar",
    ]);
  });

  it("makes every market mode directly discoverable in More", () => {
    const inventory = getMobileMoreRouteInventory(true);
    const market = inventory.sections.find((section) => section.label === "Market");

    expect(market?.routes).toEqual([
      "/movers",
      "/movers?scope=graded",
      "/movers?scope=grading",
      "/movers?scope=sealed",
      "/movers/signal-radar",
      "/?tab=selling",
    ]);
    expect(inventory.pinned).toEqual([
      "/movers?scope=sealed",
      "/movers/signal-radar",
      "/?tab=selling",
      "/openings",
      "/search",
      "/?tab=binders",
    ]);
    expect(inventory.account).toEqual(["/account", "/settings"]);
  });

  it("groups the complete app directory consistently", () => {
    const inventory = getMobileMoreRouteInventory(true);

    expect(inventory.sections).toEqual([
      {
        label: "Market",
        routes: [
          "/movers",
          "/movers?scope=graded",
          "/movers?scope=grading",
          "/movers?scope=sealed",
          "/movers/signal-radar",
          "/?tab=selling",
        ],
      },
      {
        label: "My collection",
        routes: [
          "/?tab=complete",
          "/?tab=singles",
          "/?tab=binders",
          "/?tab=sealed",
          "/openings",
          "/?tab=graded",
          "/wants",
        ],
      },
      {
        label: "Discover",
        routes: [
          "/upcoming",
          "/expansions",
          "/one-piece/expansions",
          "/categories",
          "/illustrators",
          "/social",
        ],
      },
      {
        label: "Tools",
        routes: ["/search", "/submit-card"],
      },
    ]);
  });

  it("removes only the One Piece library entry when that preference is disabled", () => {
    const enabled = getMoreMenuSections(true);
    const disabled = getMoreMenuSections(false);
    const enabledDiscover = enabled.find((section) => section.label === "Discover");
    const disabledDiscover = disabled.find((section) => section.label === "Discover");

    expect(enabledDiscover?.items.map((item) => item.href)).toContain(
      "/one-piece/expansions"
    );
    expect(disabledDiscover?.items.map((item) => item.href)).not.toContain(
      "/one-piece/expansions"
    );
    expect(disabledDiscover?.items.find((item) => item.href === "/expansions")?.label).toBe(
      "Expansions"
    );
  });
});
