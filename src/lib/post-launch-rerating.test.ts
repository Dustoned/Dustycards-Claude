import { describe, expect, it } from "vitest";
import {
  applyPostLaunchSetBreadth,
  calculatePostLaunchRerating,
  isPostLaunchReratingRarity,
  type PostLaunchReratingEntry,
} from "@/lib/post-launch-rerating";

function history(value = 8) {
  return [
    { observedAt: "2025-07-18T12:00:00Z", value: value * 1.5 },
    { observedAt: "2025-07-19T12:00:00Z", value: value * 1.2 },
    { observedAt: "2025-07-20T12:00:00Z", value },
    { observedAt: "2025-08-13T12:00:00Z", value },
    { observedAt: "2025-08-15T12:00:00Z", value },
    { observedAt: "2025-08-17T12:00:00Z", value },
  ];
}

function entry(
  cardId: string,
  recovery: number,
  rarity = "Illustration Rare",
  anchor = 8
): PostLaunchReratingEntry {
  const metrics = calculatePostLaunchRerating({
    game: "pokemon",
    rarity,
    episodeName: "Black Bolt",
    episodeCode: "BLK",
    releaseDate: "2025-07-18",
    currentPrice: anchor * (1 + recovery / 100),
    history: history(anchor),
    now: new Date("2026-07-26T12:00:00Z"),
  });
  if (!metrics) throw new Error("Expected a post-launch metric");
  return { cardId, episodeId: "black-bolt", metrics };
}

describe("post-launch re-rating", () => {
  it("recognizes pullable high rarities but excludes promos", () => {
    expect(
      isPostLaunchReratingRarity({
        game: "pokemon",
        rarity: "Illustration Rare",
        episodeName: "Black Bolt",
      })
    ).toBe(true);
    expect(
      isPostLaunchReratingRarity({
        game: "pokemon",
        rarity: "Rare Ultra",
        episodeName: "SV Black Star Promos",
      })
    ).toBe(false);
  });

  it("uses a stable day-30 anchor instead of one cent-price observation", () => {
    const metrics = calculatePostLaunchRerating({
      game: "pokemon",
      rarity: "Illustration Rare",
      episodeName: "Black Bolt",
      releaseDate: "2025-07-18",
      currentPrice: 24,
      history: [
        ...history(8),
        { observedAt: "2025-08-16T12:00:00Z", value: 0.02 },
      ],
      now: new Date("2026-07-26T12:00:00Z"),
    });
    expect(metrics?.day30AnchorPrice).toBe(8);
    expect(metrics?.recoveryFromDay30Pct).toBe(200);
  });

  it("boosts a rising IR only when the wider set confirms the move", () => {
    const entries = [
      ...Array.from({ length: 7 }, (_, index) => entry(`up-${index}`, 50)),
      entry("flat", 0),
      entry("down-1", -10),
      entry("down-2", -20),
    ];
    const metrics = applyPostLaunchSetBreadth(entries);
    expect(metrics.get("up-0")).toMatchObject({
      setSampleSize: 10,
      setRisingCount: 7,
      setBreadthPct: 70,
      rankingBoost: 10,
      label: "Confirmed re-rating",
    });
    expect(metrics.get("down-1")?.rankingBoost).toBe(0);
  });

  it("does not boost sub-five-euro anchors", () => {
    const entries = Array.from({ length: 10 }, (_, index) =>
      entry(`cheap-${index}`, 100, "Illustration Rare", 2)
    );
    const metrics = applyPostLaunchSetBreadth(entries);
    expect(metrics.get("cheap-0")?.setBreadthPct).toBe(100);
    expect(metrics.get("cheap-0")?.rankingBoost).toBe(0);
  });
});
