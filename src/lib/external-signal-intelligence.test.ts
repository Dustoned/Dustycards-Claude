import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  calculateExternalEventScore,
  selectDiverseEventSignals,
} from "@/lib/external-signal-intelligence";
import type {
  ExternalCardSignal,
  ExternalSignalCatalyst,
} from "@/lib/external-signal-radar";

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

function signal(input: {
  cardId: string;
  game?: "pokemon" | "one-piece";
  entityKey?: string;
  episodeCode?: string | null;
  episodeName?: string;
  externalScore?: number;
}): ExternalCardSignal {
  return {
    rank: 0,
    cardId: input.cardId,
    entityKey: input.entityKey ?? `${input.game ?? "pokemon"}:${input.cardId}`,
    sourceMode: "event",
    game: input.game ?? "pokemon",
    name: input.cardId,
    imageUrl: null,
    cardNumber: input.cardId,
    episodeName: input.episodeName ?? input.episodeCode ?? "Test set",
    episodeCode: input.episodeCode ?? "SET",
    rarity: "Special Illustration Rare",
    currentPrice: 10,
    currency: "EUR",
    externalScore: input.externalScore ?? 70,
    competitiveScore: 0,
    confidence: "Medium",
    horizon: "30-90 day watch",
    pressureLabel: "Strong",
    pressureExplanation: "Test",
    reasons: [],
    evidence: [],
    maxDeckSharePercent: 0,
    maxInclusionPercent: 0,
    archetypeCount: 0,
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

describe("event signal coverage", () => {
  it("reserves an independent forty-card window for each game", () => {
    const selected = selectDiverseEventSignals([
      ...Array.from({ length: 60 }, (_, index) =>
        signal({
          cardId: `pokemon-${index}`,
          game: "pokemon",
          episodeCode: `P-${Math.floor(index / 10)}`,
          externalScore: 100 - index / 10,
        })
      ),
      ...Array.from({ length: 60 }, (_, index) =>
        signal({
          cardId: `one-piece-${index}`,
          game: "one-piece",
          episodeCode: `OP-${Math.floor(index / 10)}`,
          externalScore: 90 - index / 10,
        })
      ),
    ]);

    expect(selected).toHaveLength(80);
    expect(selected.filter((candidate) => candidate.game === "pokemon")).toHaveLength(40);
    expect(selected.filter((candidate) => candidate.game === "one-piece")).toHaveLength(40);
  });

  it("prevents one episode or character from filling the event cohort", () => {
    const oneEpisode = selectDiverseEventSignals(
      Array.from({ length: 20 }, (_, index) =>
        signal({ cardId: `episode-${index}`, episodeCode: "SAME" })
      )
    );
    const oneEntity = selectDiverseEventSignals(
      Array.from({ length: 10 }, (_, index) =>
        signal({
          cardId: `entity-${index}`,
          entityKey: "pokemon:gengar",
          episodeCode: `SET-${index}`,
        })
      )
    );

    expect(oneEpisode).toHaveLength(12);
    expect(oneEntity).toHaveLength(4);
  });
});
