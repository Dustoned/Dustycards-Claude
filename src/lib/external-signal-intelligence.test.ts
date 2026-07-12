import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { calculateExternalEventScore } from "@/lib/external-signal-intelligence";
import type { ExternalSignalCatalyst } from "@/lib/external-signal-radar";

function catalyst(overrides: Partial<ExternalSignalCatalyst> = {}): ExternalSignalCatalyst {
  return {
    id: "event",
    kind: "reveal",
    direction: "positive",
    strength: 0.95,
    headline: "Mega Gengar chase card revealed",
    explanation: "The exact card is named.",
    sourceUrl: "https://pokemon.com/news/gengar",
    sourceDomain: "pokemon.com",
    sourceKind: "official",
    evidenceLevel: "Confirmed",
    contextLabel: "Japanese · reveal",
    observedAt: "2026-07-12T12:00:00Z",
    expiresAt: null,
    ...overrides,
  };
}

describe("external event score", () => {
  it("can make a confirmed reveal independently actionable", () => {
    expect(
      calculateExternalEventScore([catalyst()], {
        catalystScore: 0.95,
        hypeScore: 0,
        riskScore: 0,
      })
    ).toBeGreaterThanOrEqual(70);
  });

  it("keeps social-only rumours below confirmed official evidence", () => {
    const rumour = catalyst({
      sourceKind: "social",
      evidenceLevel: "Rumour",
      sourceUrl: "https://reddit.com/r/pokemontcg/example",
      sourceDomain: "reddit.com",
    });
    const rumourScore = calculateExternalEventScore([rumour], {
      catalystScore: 0.3,
      hypeScore: 0,
      riskScore: 0,
    });
    const confirmedScore = calculateExternalEventScore([catalyst()], {
      catalystScore: 0.95,
      hypeScore: 0,
      riskScore: 0,
    });
    expect(rumourScore).toBeLessThan(confirmedScore);
  });

  it("penalizes reprint and supply risk", () => {
    expect(
      calculateExternalEventScore([catalyst()], {
        catalystScore: 0.7,
        hypeScore: 0,
        riskScore: 0.8,
      })
    ).toBeLessThan(50);
  });
});
