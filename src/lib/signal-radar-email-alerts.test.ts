import { describe, expect, it } from "vitest";
import type { ExternalCardSignal } from "@/lib/external-signal-radar";
import { selectHighPotentialAlertCandidates } from "@/lib/signal-radar-email-alerts";

function signal(input: {
  id: string;
  opportunity: number;
  external?: number;
  confluence?: number;
  confidence?: ExternalCardSignal["confidence"];
  scenario?: "actionable" | "bearish" | "missing";
}): ExternalCardSignal {
  return {
    rank: 1,
    cardId: input.id,
    game: "pokemon",
    name: input.id,
    imageUrl: null,
    cardNumber: "1/100",
    episodeName: "Test Set",
    episodeCode: "TST",
    rarity: "Rare",
    currentPrice: 10,
    currency: "EUR",
    externalScore: input.external ?? 85,
    confidence: input.confidence ?? "Medium",
    horizon: "30-90 day watch",
    pressureLabel: "Breakout",
    pressureExplanation: "Strong setup",
    reasons: ["collector demand"],
    evidence: [],
    maxDeckSharePercent: 0,
    maxInclusionPercent: 0,
    archetypeCount: 0,
    marketIntelligence: {
      rawOpportunityScore: input.opportunity,
      rawScenario:
        input.scenario === "missing"
          ? null
          : {
              marketMode: "raw",
              currentPrice: 10,
              currency: "EUR",
              confidence: "Medium",
              drivers: ["market history"],
              points: [
                { days: 30, low: 9, base: input.scenario === "bearish" ? 9.8 : 10.5, high: 11 },
                { days: 90, low: 8, base: input.scenario === "bearish" ? 9.2 : 11, high: 12 },
                { days: 180, low: 7, base: input.scenario === "bearish" ? 8.5 : 12, high: 14 },
              ],
            },
      confluence: {
        score: input.confluence ?? 70,
        label: "Strong setup",
        drivers: ["collector demand 90/100"],
        freshChase: false,
      },
    } as ExternalCardSignal["marketIntelligence"],
  };
}

describe("Signal Radar email alerts", () => {
  it("only selects strongly confirmed Medium or High confidence opportunities", () => {
    const selected = selectHighPotentialAlertCandidates([
      signal({ id: "qualified", opportunity: 92, confluence: 72 }),
      signal({ id: "low-score", opportunity: 89, confluence: 90 }),
      signal({ id: "unconfirmed", opportunity: 95, confluence: 60, external: 89 }),
      signal({ id: "emerging", opportunity: 99, confluence: 90, confidence: "Emerging" }),
    ]);

    expect(selected.map((item) => item.signal.cardId)).toEqual(["qualified"]);
  });

  it("accepts a very strong external score as independent confirmation", () => {
    const selected = selectHighPotentialAlertCandidates([
      signal({ id: "external-proof", opportunity: 94, confluence: 55, external: 93 }),
    ]);

    expect(selected).toHaveLength(1);
    expect(selected[0].score).toBe(94);
  });

  it("never emails a structural score without a confident actionable raw scenario", () => {
    const selected = selectHighPotentialAlertCandidates([
      signal({ id: "missing-forecast", opportunity: 99, confluence: 95, scenario: "missing" }),
      signal({ id: "bearish-forecast", opportunity: 99, confluence: 95, scenario: "bearish" }),
    ]);

    expect(selected).toEqual([]);
  });
});
