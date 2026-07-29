import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  calculateExternalEventScore,
  catalystAgeDecayFactor,
  getSignalRadarRankingScore,
  getStructuralSignalEras,
  selectActionableRadarCohort,
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
  sourceMode?: ExternalCardSignal["sourceMode"];
  currentPrice?: number;
  ageYears?: number;
  catalysts?: ExternalSignalCatalyst[];
}): ExternalCardSignal {
  return {
    rank: 0,
    cardId: input.cardId,
    entityKey: input.entityKey ?? `${input.game ?? "pokemon"}:${input.cardId}`,
    sourceMode: input.sourceMode ?? "event",
    game: input.game ?? "pokemon",
    name: input.cardId,
    imageUrl: null,
    cardNumber: input.cardId,
    episodeName: input.episodeName ?? input.episodeCode ?? "Test set",
    episodeCode: input.episodeCode ?? "SET",
    rarity: "Special Illustration Rare",
    currentPrice: input.currentPrice ?? 10,
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
    catalysts: input.catalysts,
    marketIntelligence:
      input.ageYears == null
        ? undefined
        : ({ sealed: { ageYears: input.ageYears } } as ExternalCardSignal["marketIntelligence"]),
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

describe("catalyst age decay", () => {
  it("holds full strength for two weeks and then slides linearly to 0.35 at expiry", () => {
    const observedAt = "2026-06-01T00:00:00.000Z";
    const expiresAt = "2026-08-30T00:00:00.000Z";
    const active = { observedAt, expiresAt };

    expect(catalystAgeDecayFactor(active, new Date("2026-06-10T00:00:00.000Z"))).toBe(1);
    expect(catalystAgeDecayFactor(active, new Date("2026-06-15T00:00:00.000Z"))).toBe(1);
    const flatUntil = Date.parse(observedAt) + 14 * 24 * 60 * 60 * 1_000;
    const midway = new Date((flatUntil + Date.parse(expiresAt)) / 2);
    expect(catalystAgeDecayFactor(active, midway)).toBeCloseTo(0.675, 5);
    expect(catalystAgeDecayFactor(active, new Date(expiresAt))).toBeCloseTo(0.35, 5);
  });

  it("does not decay catalysts without an expiry", () => {
    expect(
      catalystAgeDecayFactor(
        { observedAt: "2026-01-01T00:00:00.000Z", expiresAt: null },
        new Date("2026-07-01T00:00:00.000Z")
      )
    ).toBe(1);
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

describe("actionable radar cohort", () => {
  it("keeps a small trophy group without letting it fill the cohort", () => {
    const trophyCards = Array.from({ length: 8 }, (_, index) =>
      signal({
        cardId: `trophy-${index}`,
        sourceMode: "structural",
        currentPrice: 5_000,
        ageYears: 20,
      })
    );
    const selected = selectActionableRadarCohort([
      ...trophyCards,
      signal({
        cardId: "fresh-trophy-event",
        sourceMode: "event",
        currentPrice: 5_000,
        catalysts: [catalyst()],
      }),
      signal({ cardId: "accessible", sourceMode: "structural", currentPrice: 180, ageYears: 7 }),
    ]);

    expect(selected.filter((candidate) => candidate.cardId.startsWith("trophy-"))).toHaveLength(2);
    expect(selected.map((candidate) => candidate.cardId)).toContain("fresh-trophy-event");
    expect(selected.map((candidate) => candidate.cardId)).toContain("accessible");
  });

  it("does not limit old cards merely because of their age", () => {
    const mature = Array.from({ length: 10 }, (_, index) =>
      signal({
        cardId: `mature-${index}`,
        sourceMode: "structural",
        currentPrice: 200,
        ageYears: 20,
      })
    );
    const selected = selectActionableRadarCohort(mature);

    expect(selected).toHaveLength(10);
  });

  it("prevents premium structural cards from filling a game cohort", () => {
    const premium = Array.from({ length: 10 }, (_, index) =>
      signal({
        cardId: `premium-${index}`,
        sourceMode: "structural",
        currentPrice: 800,
        ageYears: 7,
      })
    );
    const accessible = Array.from({ length: 10 }, (_, index) =>
      signal({
        cardId: `accessible-${index}`,
        sourceMode: "structural",
        currentPrice: 120,
        ageYears: 7,
      })
    );
    const selected = selectActionableRadarCohort([...premium, ...accessible]);

    expect(selected.filter((candidate) => candidate.cardId.startsWith("premium-"))).toHaveLength(6);
    expect(selected.filter((candidate) => candidate.cardId.startsWith("accessible-"))).toHaveLength(10);
  });
});

describe("post-launch radar priority", () => {
  it("splits recent candidates into half-year cohorts", () => {
    const eras = getStructuralSignalEras(new Date("2026-07-26T12:00:00Z"));
    expect(eras).toEqual(
      expect.arrayContaining([
        { key: "launch-2025-h1", gte: "2025-01-01", lte: "2025-06-30" },
        { key: "launch-2025-h2", gte: "2025-07-01", lte: "2025-12-31" },
        { key: "launch-2026-h2", gte: "2026-07-01", lte: "2026-07-26" },
      ])
    );
  });

  it("moves confirmed re-ratings up without changing the displayed opportunity score", () => {
    const candidate = signal({ cardId: "audino", sourceMode: "structural" });
    candidate.marketIntelligence = {
      rawOpportunityScore: 72,
      postLaunch: {
        releaseAgeDays: 373,
        rarity: "Illustration Rare",
        historyDayCount: 31,
        first30dFloorPrice: 6.5,
        day30AnchorPrice: 8,
        currentPrice: 27,
        recoveryFromFloorPct: 315.4,
        recoveryFromDay30Pct: 237.5,
        setSampleSize: 82,
        setRisingCount: 62,
        setFallingCount: 14,
        setBreadthPct: 75.6,
        rankingBoost: 12,
        label: "Confirmed re-rating",
      },
      ebayDemand: { scoreAdjustment: 1 },
      sealed: { lifecycleStatus: "supply_tightening" },
      rawScenario: {
        marketMode: "raw",
        currentPrice: 27,
        currency: "EUR",
        confidence: "Medium",
        outlook: "modest_up",
        points: [{ days: 180, low: 25, base: 32, high: 40 }],
        drivers: [],
      },
    } as unknown as NonNullable<ExternalCardSignal["marketIntelligence"]>;

    expect(getSignalRadarRankingScore(candidate)).toBe(84);
    expect(candidate.marketIntelligence?.rawOpportunityScore).toBe(72);
  });

  it("suppresses the boost when reprint risk or demand contradicts it", () => {
    const candidate = signal({ cardId: "reprint", sourceMode: "structural" });
    candidate.marketIntelligence = {
      rawOpportunityScore: 72,
      postLaunch: {
        releaseAgeDays: 373,
        rarity: "Illustration Rare",
        historyDayCount: 31,
        first30dFloorPrice: 8,
        day30AnchorPrice: 10,
        currentPrice: 20,
        recoveryFromFloorPct: 150,
        recoveryFromDay30Pct: 100,
        setSampleSize: 20,
        setRisingCount: 15,
        setFallingCount: 3,
        setBreadthPct: 75,
        rankingBoost: 12,
        label: "Confirmed re-rating",
      },
      ebayDemand: { scoreAdjustment: -3 },
      sealed: { lifecycleStatus: "reprint_restock" },
      rawScenario: {
        marketMode: "raw",
        currentPrice: 20,
        currency: "EUR",
        confidence: "Medium",
        outlook: "modest_up",
        points: [{ days: 180, low: 18, base: 24, high: 30 }],
        drivers: [],
      },
    } as unknown as NonNullable<ExternalCardSignal["marketIntelligence"]>;

    expect(getSignalRadarRankingScore(candidate)).toBe(72);
  });
});
