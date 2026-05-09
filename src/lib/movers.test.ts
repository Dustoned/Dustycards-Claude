import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
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
      expect(collectionData.movers.every((item) => Array.isArray(item.gradedPrices))).toBe(true);
      expect(allData.movers.every((item) => Array.isArray(item.gradedPrices))).toBe(true);
    },
    30000
  );

  it(
    "keeps micro-priced raw cards out of the regular movers lists",
    async () => {
      const [collectionData, allData] = await Promise.all([
        getMovers("cm_en", "collection"),
        getMovers("cm_en", "all"),
      ]);

      expect(collectionData.movers.every((item) => item.currentPrice >= 3)).toBe(true);
      expect(allData.movers.every((item) => item.currentPrice >= 3)).toBe(true);
    },
    30000
  );

  it(
    "includes all current graded prices for all-card movers without changing raw mover scope",
    async () => {
      const allData = await getMovers("cm_en", "all");
      const gradedMover = allData.movers.find((item) => item.gradedPrices.length > 0);

      expect(gradedMover).toBeDefined();
      if (!gradedMover) {
        throw new Error("Expected at least one all-card mover with graded prices.");
      }

      const expected = await db.cardGradedPrice.findMany({
        where: { card_id: gradedMover.cardId },
        orderBy: [{ price: "desc" }, { label: "asc" }],
        select: {
          label: true,
          price: true,
        },
      });

      expect(gradedMover.gradedPrices).toEqual(expected);
    },
    30000
  );

  it(
    "shows current graded labels as their own graded movers",
    async () => {
      const [gradedData, currentGradedCount] = await Promise.all([
        getMovers("cm_en", "graded"),
        db.cardGradedPrice.count(),
      ]);
      const gradedMover = gradedData.movers.find((item) => item.gradedLabel);

      expect(gradedData.scope).toBe("graded");
      expect(gradedData.trackedCards).toBe(currentGradedCount);
      expect(gradedData.movers.length).toBe(currentGradedCount);
      expect(gradedData.movers.every((item) => item.source === "graded")).toBe(true);
      expect(gradedData.movers.every((item) => item.currency === "EUR")).toBe(true);
      expect(gradedMover).toBeDefined();
      expect(gradedMover?.gradedPrices.some((price) => price.label === gradedMover.gradedLabel)).toBe(
        true
      );
    },
    30000
  );

  it(
    "shows raw-to-graded grade targets sorted by opportunity score",
    async () => {
      const [gradingData, currentGradedCount] = await Promise.all([
        getMovers("cm_en", "grading"),
        db.cardGradedPrice.count(),
      ]);

      expect(gradingData.scope).toBe("grading");
      expect(gradingData.trackedCards).toBe(currentGradedCount);
      expect(gradingData.movers.length).toBeGreaterThan(0);
      expect(gradingData.movers.every((item) => item.source === "graded")).toBe(true);
      expect(gradingData.movers.every((item) => item.grading !== null)).toBe(true);
      expect(
        gradingData.movers.every(
          (item) =>
            item.grading &&
            item.grading.gradedPrice === item.currentPrice &&
            item.grading.valueGap > 0 &&
            item.moverScore === item.grading.score
        )
      ).toBe(true);

      for (let index = 1; index < gradingData.movers.length; index += 1) {
        expect(gradingData.movers[index - 1].moverScore).toBeGreaterThanOrEqual(
          gradingData.movers[index].moverScore
        );
      }
    },
    30000
  );
});
