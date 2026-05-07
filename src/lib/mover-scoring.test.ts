import { describe, expect, it } from "vitest";
import { buildMoverScores, chooseRawMoverSource } from "@/lib/mover-scoring";

describe("mover scoring", () => {
  it("keeps old sealed lifetime spikes out of the top ranking without recent confirmation", () => {
    const scores = buildMoverScores({
      kind: "sealed",
      currentPrice: 4500,
      change7d: null,
      change30d: null,
      changeSinceTrackedPct: 449970,
      changeFromLowPct: 449970,
      gapToPeakPct: null,
      historyPoints: 12,
      lifetimeHistoryPoints: 12,
    });

    expect(scores.priceQuality.status).toBe("ok");
    expect(scores.movementScore).toBe(0);
    expect(scores.rankingScore).toBeLessThan(2);
  });

  it("marks wild raw recent jumps as suspicious and removes score", () => {
    const scores = buildMoverScores({
      kind: "raw",
      currentPrice: 9001,
      change7d: null,
      change30d: {
        change: 8953.5,
        changePct: 18849.5,
        coveredDays: 16,
      },
      changeSinceTrackedPct: 18849.5,
      changeFromLowPct: 18849.5,
      gapToPeakPct: null,
      historyPoints: 3,
      lifetimeHistoryPoints: 3,
      comparisonPrice: 14.79,
    });

    expect(scores.priceQuality).toMatchObject({
      status: "suspicious",
      reason: "Outlier ignored",
    });
    expect(scores.movementScore).toBe(0);
    expect(scores.rankingScore).toBe(0);
  });

  it("ranks a normal recent rise with enough history", () => {
    const scores = buildMoverScores({
      kind: "raw",
      currentPrice: 18,
      change7d: {
        change: 3,
        changePct: 20,
        coveredDays: 7,
      },
      change30d: {
        change: 5,
        changePct: 38.5,
        coveredDays: 30,
      },
      changeSinceTrackedPct: 42,
      changeFromLowPct: 42,
      gapToPeakPct: -18,
      historyPoints: 8,
      lifetimeHistoryPoints: 12,
      rarityWeight: 1.35,
      comparisonPrice: 17,
    });

    expect(scores.priceQuality.status).toBe("ok");
    expect(scores.movementScore).toBeGreaterThan(20);
    expect(scores.rankingScore).toBeGreaterThan(scores.opportunityScore);
  });

  it("uses the selected raw source and falls back only when it is missing", () => {
    expect(
      chooseRawMoverSource({
        preferred: "cardmarket",
        available: { cardmarket: true, tcgplayer: true },
      })
    ).toBe("cardmarket");
    expect(
      chooseRawMoverSource({
        preferred: "cardmarket",
        available: { cardmarket: false, tcgplayer: true },
      })
    ).toBe("tcgplayer");
    expect(
      chooseRawMoverSource({
        preferred: "tcgplayer",
        available: { cardmarket: true, tcgplayer: false },
      })
    ).toBe("cardmarket");
  });
});
