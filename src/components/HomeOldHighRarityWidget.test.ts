import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomeItemDetailProvider from "@/components/HomeItemDetailProvider";
import { HomeOldHighRarityWidgetContent } from "@/components/HomeOldHighRarityWidget";
import type { ExternalCardSignal } from "@/lib/external-signal-radar";

function signal(overrides: Partial<ExternalCardSignal> = {}): ExternalCardSignal {
  return {
    rank: 1,
    cardId: "old-card-1",
    entityKey: "pokemon:charizard",
    sourceMode: "structural",
    olderHighRarityValue: {
      kind: "older-high-rarity-value",
      ageYears: 14.5,
      rarityCohortSize: 6,
      historyPoints: 42,
    },
    game: "pokemon",
    name: "Charizard",
    imageUrl: null,
    cardNumber: "136/135",
    episodeName: "Plasma Storm",
    episodeCode: "PLS",
    episodeReleaseDate: "2013-02-06",
    rarity: "Rare Secret",
    currentPrice: 425,
    currency: "EUR",
    externalScore: 91,
    competitiveScore: -1,
    confidence: "Medium",
    horizon: "30-90 day watch",
    pressureLabel: "Strong",
    pressureExplanation: "Older high-rarity value",
    reasons: [],
    evidence: [],
    maxDeckSharePercent: 0,
    maxInclusionPercent: 0,
    archetypeCount: 0,
    ...overrides,
  };
}

describe("Old High-Rarity Home widget", () => {
  it.each(["grid", "list"] as const)(
    "opens cards as details while the header remains the Radar link in %s view",
    (viewMode) => {
      const markup = renderToStaticMarkup(createElement(
        HomeItemDetailProvider,
        null,
        createElement(HomeOldHighRarityWidgetContent, {
          signals: [signal()],
          total: 53,
          viewAllHref: "/movers/signal-radar?view=old-high-rarity",
          viewMode,
          compact: false,
        })
      ));

      expect(markup).toContain('href="/movers/signal-radar?view=old-high-rarity"');
      expect(markup).toContain('<button type="button"');
      expect(markup).toContain("14.5 years");
      expect(markup).toContain("6 in rarity tier");
      expect(markup).toContain("€425.00");
    }
  );

  it("limits a compact grid to six cards", () => {
    const signals = Array.from({ length: 8 }, (_, index) => signal({
      cardId: `old-card-${index + 1}`,
      name: `Older chase ${index + 1}`,
    }));
    const markup = renderToStaticMarkup(createElement(
      HomeItemDetailProvider,
      null,
      createElement(HomeOldHighRarityWidgetContent, {
        signals,
        total: signals.length,
        viewAllHref: "/movers/signal-radar?view=old-high-rarity",
        viewMode: "grid",
        compact: true,
      })
    ));

    expect(markup).toContain("Older chase 6");
    expect(markup).not.toContain("Older chase 7");
  });
});
