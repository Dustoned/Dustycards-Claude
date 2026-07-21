import { describe, expect, it } from "vitest";
import type { ExternalCardSignal, ExternalPriceScenario } from "@/lib/external-signal-radar";
import {
  calculateExpansionChaseSeedScore,
  getExpansionChaseFreshness,
  getExpansionChaseReadiness,
  getExpansionChaseVerdict,
  rankExpansionChaseSignals,
  selectExpansionChaseCandidates,
  type ExpansionChaseCandidateInput,
} from "@/lib/expansion-chase-radar-core";

function card(
  id: string,
  overrides: Partial<ExpansionChaseCandidateInput> = {}
): ExpansionChaseCandidateInput {
  return {
    id,
    name: id,
    imageUrl: null,
    cardNumber: id,
    printedCardNumber: id,
    rarity: "Common",
    currentPrice: 0.1,
    priceFetchedAt: "2026-07-19T00:00:00.000Z",
    ...overrides,
  };
}

function scenario(
  outlook: ExternalPriceScenario["outlook"],
  confidence: ExternalPriceScenario["confidence"] = "Medium",
  expectedReturnPct180 = 10
): ExternalPriceScenario {
  return {
    marketMode: "raw",
    currentPrice: 100,
    currency: "EUR",
    confidence,
    outlook,
    expectedReturnPct180,
    points: [
      { days: 30, low: 90, base: 102, high: 115 },
      { days: 90, low: 85, base: 106, high: 125 },
      { days: 180, low: 80, base: 110, high: 135 },
    ],
    drivers: [],
  };
}

function signal(
  cardId: string,
  score: number,
  expectedReturnPct180: number
): ExternalCardSignal {
  return {
    rank: 0,
    cardId,
    sourceMode: "structural",
    game: "pokemon",
    name: cardId,
    imageUrl: null,
    cardNumber: cardId,
    episodeName: "Test set",
    episodeCode: "TST",
    rarity: "Special Illustration Rare",
    currentPrice: 100,
    currency: "EUR",
    externalScore: 60,
    competitiveScore: -1,
    confidence: "Emerging",
    horizon: "30-90 day watch",
    pressureLabel: "Watch",
    pressureExplanation: "Test",
    reasons: [],
    evidence: [],
    maxDeckSharePercent: 0,
    maxInclusionPercent: 0,
    archetypeCount: 0,
    marketIntelligence: ({
      rawOpportunityScore: score,
      rawScenario: scenario("modest_up", "Medium", expectedReturnPct180),
      rawConfluence: { score: 60, label: "Building", drivers: [], freshChase: false },
      confluence: { score: 60, label: "Building", drivers: [], freshChase: false },
    } as unknown) as ExternalCardSignal["marketIntelligence"],
  };
}

describe("expansion chase candidate selection", () => {
  it("keeps chase rarities, secret numbers and an unknown expensive rarity fallback", () => {
    const selected = selectExpansionChaseCandidates([
      card("common", { currentPrice: 0.2 }),
      card("sir", { rarity: "Special Illustration Rare", currentPrice: 20 }),
      card("unpriced-sir", {
        rarity: "Special Illustration Rare",
        currentPrice: null,
      }),
      card("secret-number", {
        rarity: "Mystery Finish",
        printedCardNumber: "121/88",
        currentPrice: 8,
      }),
      card("future-rarity", { rarity: "New Galaxy Rare", currentPrice: 50 }),
      card("cheap-unknown", { rarity: "New Galaxy Rare", currentPrice: 1 }),
    ]);

    expect(selected.map((item) => item.id)).toEqual([
      "sir",
      "unpriced-sir",
      "secret-number",
      "future-rarity",
    ]);
  });

  it("is deterministic and never exceeds twelve candidates", () => {
    const candidates = Array.from({ length: 20 }, (_, index) =>
      card(`card-${String(index).padStart(2, "0")}`, {
        rarity: "Special Art Rare",
        currentPrice: 10,
      })
    );
    const selected = selectExpansionChaseCandidates(candidates, 99);
    expect(selected).toHaveLength(12);
    expect(selected.map((item) => item.id)).toEqual(
      [...selected.map((item) => item.id)].sort()
    );
  });

  it("gives premium and secret-numbered cards a stronger structural seed", () => {
    expect(
      calculateExpansionChaseSeedScore(
        card("premium", {
          rarity: "Special Art Rare",
          printedCardNumber: "121/88",
          currentPrice: 100,
        })
      )
    ).toBeGreaterThan(
      calculateExpansionChaseSeedScore(
        card("ordinary", { rarity: "Double Rare", currentPrice: 100 })
      )
    );
  });
});

describe("expansion chase readiness", () => {
  const now = new Date("2026-07-19T12:00:00.000Z");

  it("distinguishes empty catalogs, incomplete prices, discovery, ready and stale data", () => {
    expect(
      getExpansionChaseReadiness({
        localCardCount: 0,
        pricedCardCount: 0,
        currentPricedCardCount: 0,
        releaseDate: "2026-07-17",
        latestPriceAt: null,
        now,
      }).readiness
    ).toBe("catalog_missing");
    expect(
      getExpansionChaseReadiness({
        localCardCount: 100,
        pricedCardCount: 40,
        currentPricedCardCount: 40,
        releaseDate: "2026-01-01",
        latestPriceAt: "2026-07-19T00:00:00.000Z",
        now,
      }).readiness
    ).toBe("prices_loading");
    expect(
      getExpansionChaseReadiness({
        localCardCount: 100,
        pricedCardCount: 95,
        currentPricedCardCount: 95,
        releaseDate: "2026-07-01",
        latestPriceAt: "2026-07-19T00:00:00.000Z",
        now,
      }).readiness
    ).toBe("price_discovery");
    expect(
      getExpansionChaseReadiness({
        localCardCount: 100,
        pricedCardCount: 95,
        currentPricedCardCount: 95,
        releaseDate: "2026-03-01",
        latestPriceAt: "2026-07-19T00:00:00.000Z",
        now,
      }).readiness
    ).toBe("ready");
    expect(
      getExpansionChaseReadiness({
        localCardCount: 100,
        pricedCardCount: 95,
        currentPricedCardCount: 0,
        releaseDate: "2026-03-01",
        latestPriceAt: "2026-05-16T00:00:00.000Z",
        now,
      }).readiness
    ).toBe("stale");
  });

  it("reports quote freshness at two- and seven-day boundaries", () => {
    expect(getExpansionChaseFreshness("2026-07-17T12:00:00.000Z", now)).toBe("fresh");
    expect(getExpansionChaseFreshness("2026-07-14T12:00:00.000Z", now)).toBe("aging");
    expect(getExpansionChaseFreshness("2026-07-11T12:00:00.000Z", now)).toBe("stale");
    expect(getExpansionChaseFreshness(null, now)).toBe("unknown");
  });
});

describe("expansion chase verdict and ranking", () => {
  it.each([
    ["stale", scenario("strong_up"), 90, "data_stale"],
    ["fresh", null, 90, "insufficient_data"],
    ["fresh", scenario("strong_up", "Low"), 90, "price_discovery"],
    ["fresh", scenario("down", "Low"), 90, "cooling"],
    ["fresh", scenario("strong_up"), 80, "strong_watch"],
    ["fresh", scenario("modest_up"), 80, "building"],
    ["fresh", scenario("flat"), 80, "stable"],
    ["fresh", scenario("down"), 80, "cooling"],
  ] as const)("maps %s market data to %s", (freshness, marketScenario, score, verdict) => {
    expect(
      getExpansionChaseVerdict({
        scenario: marketScenario,
        opportunityScore: score,
        freshness,
      }).key
    ).toBe(verdict);
  });

  it("sorts by opportunity, then expected return, then card id", () => {
    const ranked = rankExpansionChaseSignals([
      signal("b", 80, 10),
      signal("c", 79, 50),
      signal("a", 80, 10),
      signal("d", 80, 20),
    ]);
    expect(ranked.map((item) => item.cardId)).toEqual(["d", "a", "b", "c"]);
  });

  it("calls a falling launch ask cooling without applying that shortcut to mature cards", () => {
    const launchScenario = scenario("flat", "Low");
    launchScenario.drivers = ["launch price discovery"];
    expect(
      getExpansionChaseVerdict({
        scenario: launchScenario,
        opportunityScore: 74,
        freshness: "fresh",
        observedChange7dPct: -18,
      }).key
    ).toBe("cooling");
    expect(
      getExpansionChaseVerdict({
        scenario: scenario("flat", "Low"),
        opportunityScore: 74,
        freshness: "fresh",
        observedChange7dPct: -18,
      }).key
    ).toBe("price_discovery");
  });
});
