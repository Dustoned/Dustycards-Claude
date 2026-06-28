import { describe, expect, it } from "vitest";
import { rankAndSelectAutoRefreshCandidates, type DueCardCandidate } from "@/lib/sync";

function candidate(overrides: {
  id: string;
  episodeId: string;
  tier: DueCardCandidate["tier"];
  overdueScore?: number;
  latestFetchedAt?: string;
}): DueCardCandidate {
  return {
    id: overrides.id,
    game: "pokemon",
    episodeId: overrides.episodeId,
    rarity: null,
    latestFetchedAt: overrides.latestFetchedAt ?? "2026-06-01T00:00:00.000Z",
    priceSourceStatus: null,
    priceSourceCheckedAt: null,
    tier: overrides.tier,
    overdueScore: overrides.overdueScore ?? 1,
  };
}

describe("rankAndSelectAutoRefreshCandidates", () => {
  it("prefers a non-base card over a much more overdue common", () => {
    const result = rankAndSelectAutoRefreshCandidates(
      [
        candidate({ id: "common", episodeId: "A", tier: "base", overdueScore: 10 }),
        candidate({ id: "rare", episodeId: "B", tier: "high", overdueScore: 1.1 }),
      ],
      12,
      1 // only one card fits
    );

    expect(result.selectedCards).toBe(1);
    expect(result.selectedNonBaseCards).toBe(1);
    expect([...result.selectedByEpisode.values()].flat()).toEqual(["rare"]);
  });

  it("within the non-base group, serves the most overdue first", () => {
    const result = rankAndSelectAutoRefreshCandidates(
      [
        candidate({ id: "rareA", episodeId: "A", tier: "high", overdueScore: 2 }),
        candidate({ id: "rareB", episodeId: "B", tier: "high", overdueScore: 5 }),
      ],
      12,
      1
    );

    expect([...result.selectedByEpisode.values()].flat()).toEqual(["rareB"]);
  });

  it("refreshes non-base cards before base cards within one episode", () => {
    const result = rankAndSelectAutoRefreshCandidates(
      [
        candidate({ id: "common1", episodeId: "A", tier: "base", overdueScore: 9 }),
        candidate({ id: "rare1", episodeId: "A", tier: "medium", overdueScore: 1.2 }),
      ],
      12,
      1
    );

    expect([...result.selectedByEpisode.values()].flat()).toEqual(["rare1"]);
    expect(result.selectedNonBaseCards).toBe(1);
  });

  it("still selects commons when no higher-value work remains", () => {
    const result = rankAndSelectAutoRefreshCandidates(
      [
        candidate({ id: "c1", episodeId: "A", tier: "base", overdueScore: 3 }),
        candidate({ id: "c2", episodeId: "A", tier: "base", overdueScore: 5 }),
      ],
      12,
      10
    );

    expect(result.selectedCards).toBe(2);
    expect(result.selectedNonBaseCards).toBe(0);
    // most overdue common first
    expect([...result.selectedByEpisode.values()].flat()).toEqual(["c2", "c1"]);
  });

  it("respects the card cap", () => {
    const cards = Array.from({ length: 50 }, (_, i) =>
      candidate({ id: `c${i}`, episodeId: `e${i % 5}`, tier: "high", overdueScore: 1 + i / 100 })
    );
    const result = rankAndSelectAutoRefreshCandidates(cards, 12, 10);
    expect(result.selectedCards).toBe(10);
  });
});
