import { describe, expect, it } from "vitest";
import { getMovers, resolveMoverRarityWeight } from "@/lib/movers";

describe("mover pull-rate weighting", () => {
  it("uses pull-rate weight before rarity fallback", () => {
    expect(resolveMoverRarityWeight("Common", 1.82)).toBe(1.82);
  });

  it("falls back to rarity order when pull-rate data is missing", () => {
    expect(resolveMoverRarityWeight("Hyper Rare", null)).toBeGreaterThan(
      resolveMoverRarityWeight("Common", null)
    );
  });
});

describe("mover scopes", () => {
  it(
    "keeps collection movers collection-only and includes non-owned cards in all-card movers",
    async () => {
      const [collectionData, allData] = await Promise.all([
        getMovers("cm_en", "collection"),
        getMovers("cm_en", "all"),
      ]);

      expect(collectionData.scope).toBe("collection");
      expect(allData.scope).toBe("all");
      expect(collectionData.trackedCards).toBeGreaterThan(0);
      expect(allData.trackedCards).toBeGreaterThan(collectionData.trackedCards);
      expect(collectionData.movers.every((item) => item.ownedCount > 0)).toBe(true);
      expect(allData.movers.some((item) => item.ownedCount === 0)).toBe(true);
    },
    30000
  );
});
