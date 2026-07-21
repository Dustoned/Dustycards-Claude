import { describe, expect, it } from "vitest";
import { getMobileMoreRouteInventory, getMoreMenuSections } from "./MobileBottomNav";

describe("mobile More navigation model", () => {
  it("keeps the primary bottom destinations out of the More hub", () => {
    const inventory = getMobileMoreRouteInventory(true);
    const moreRoutes = [
      inventory.featured,
      ...inventory.quickActions,
      ...inventory.account,
      ...inventory.sections.flatMap((section) => section.routes),
    ];

    expect(moreRoutes).not.toContain("/");
    expect(moreRoutes).not.toContain("/?tab=complete");
    expect(moreRoutes).not.toContain("/wants");
    expect(moreRoutes).not.toContain("/movers");
    expect(new Set(moreRoutes).size).toBe(moreRoutes.length);
  });

  it("surfaces high-value destinations before the library sections", () => {
    const inventory = getMobileMoreRouteInventory(true);

    expect(inventory.featured).toBe("/movers/signal-radar");
    expect(inventory.quickActions).toEqual(["/submit-card", "/?tab=selling"]);
    expect(inventory.account).toEqual(["/account", "/settings"]);
  });

  it("keeps collection and discovery routes grouped consistently", () => {
    const inventory = getMobileMoreRouteInventory(true);

    expect(inventory.sections).toEqual([
      {
        label: "My collection",
        routes: ["/?tab=singles", "/?tab=binders", "/?tab=sealed", "/?tab=graded"],
      },
      {
        label: "Discover",
        routes: [
          "/expansions",
          "/one-piece/expansions",
          "/categories",
          "/illustrators",
          "/social",
        ],
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
