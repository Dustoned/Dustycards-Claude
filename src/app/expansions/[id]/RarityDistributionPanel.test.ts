import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import RarityDistributionPanel from "./RarityDistributionPanel";

const profile = {
  source: "pricedex",
  source_url: null,
  cards_counted: 5,
  rarities: [
    {
      id: "common",
      rarity_name: "Common",
      card_count: 3,
      per_booster_box: null,
      pull_rate_denominator: null,
      specific_pull_denominator: null,
    },
    {
      id: "uncommon",
      rarity_name: "Uncommon",
      card_count: 2,
      per_booster_box: null,
      pull_rate_denominator: null,
      specific_pull_denominator: null,
    },
  ],
};

describe("RarityDistributionPanel", () => {
  it("marks the selected segment and exposes a Show all control", () => {
    const html = renderToStaticMarkup(
      React.createElement(RarityDistributionPanel, {
        expansionName: "Test Set",
        rarityCounts: [
          { name: "Common", count: 3 },
          { name: "Uncommon", count: 2 },
        ],
        profile,
        activeRarities: ["Uncommon"],
        onSelectRarity: vi.fn(),
        onShowAll: vi.fn(),
      })
    );

    expect(html).toContain('aria-label="Uncommon: 2 cards');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Show all");
    expect(html).not.toContain("disabled=\"\"");
  });

  it("disables Show all when every rarity is visible", () => {
    const html = renderToStaticMarkup(
      React.createElement(RarityDistributionPanel, {
        expansionName: "Test Set",
        rarityCounts: [{ name: "Common", count: 3 }],
        profile: { ...profile, rarities: profile.rarities.slice(0, 1) },
        activeRarities: [],
        onSelectRarity: vi.fn(),
        onShowAll: vi.fn(),
      })
    );

    expect(html).toContain("Show all");
    expect(html).toContain("disabled=\"\"");
  });
});
