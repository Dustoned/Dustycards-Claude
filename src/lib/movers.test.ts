import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  getMoverRecentDropAmount,
  getMoverRecentDropPercent,
  getMovers,
  resolveMoverRarityWeight,
  resolveRawMoverRarityWeight,
  SUDDEN_DROP_DEAL_MIN_AMOUNT,
} from "@/lib/movers";
import { POKEMON_GAME } from "@/lib/games";

const TEST_PREFIX = "test-movers-fixture";
const TEST_USER_ID = `${TEST_PREFIX}-user`;
const TEST_EPISODE_ID = `${TEST_PREFIX}-episode`;
const TEST_OWNED_CARD_ID = `${TEST_PREFIX}-owned-card`;
const TEST_NON_OWNED_CARD_ID = `${TEST_PREFIX}-non-owned-card`;
const TEST_MIXED_LANGUAGE_CARD_ID = `${TEST_PREFIX}-mixed-language-card`;
const TEST_SENTINEL_CARD_ID = `${TEST_PREFIX}-sentinel-card`;
const TEST_SOLD_CARD_ID = `${TEST_PREFIX}-sold-card`;
const TEST_COLLECTION_ITEM_ID = `${TEST_PREFIX}-collection-item`;
const TEST_SOLD_COLLECTION_ITEM_ID = `${TEST_PREFIX}-sold-collection-item`;

const TEST_CARD_IDS = [
  TEST_OWNED_CARD_ID,
  TEST_NON_OWNED_CARD_ID,
  TEST_MIXED_LANGUAGE_CARD_ID,
  TEST_SENTINEL_CARD_ID,
  TEST_SOLD_CARD_ID,
];

function daysAgo(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

async function cleanupMoverFixtures() {
  await db.collectionCard.deleteMany({
    where: {
      OR: [
        { id: TEST_COLLECTION_ITEM_ID },
        { id: TEST_SOLD_COLLECTION_ITEM_ID },
        { user_id: TEST_USER_ID },
      ],
    },
  });
  await db.cardGradedPrice.deleteMany({
    where: { card_id: { in: TEST_CARD_IDS } },
  });
  await db.price.deleteMany({
    where: { card_id: { in: TEST_CARD_IDS } },
  });
  await db.card.deleteMany({
    where: { id: { in: TEST_CARD_IDS } },
  });
  await db.episode.deleteMany({ where: { id: TEST_EPISODE_ID } });
  await db.user.deleteMany({ where: { id: TEST_USER_ID } });
}

beforeAll(async () => {
  await cleanupMoverFixtures();

  await db.user.create({
    data: {
      id: TEST_USER_ID,
      email: `${TEST_PREFIX}@example.test`,
      password_hash: "test",
    },
  });
  await db.episode.create({
    data: {
      id: TEST_EPISODE_ID,
      game: POKEMON_GAME,
      name: "Mover Fixture Set",
      code: "MVF",
      release_date: "2016-01-01",
    },
  });
  await db.card.createMany({
    data: [
      {
        id: TEST_OWNED_CARD_ID,
        game: POKEMON_GAME,
        episode_id: TEST_EPISODE_ID,
        name: "Mover Fixture Owned",
        card_number: "1",
        rarity: "Secret Rare",
      },
      {
        id: TEST_NON_OWNED_CARD_ID,
        game: POKEMON_GAME,
        episode_id: TEST_EPISODE_ID,
        name: "Mover Fixture Non Owned",
        card_number: "2",
        rarity: "Secret Rare",
      },
      {
        id: TEST_MIXED_LANGUAGE_CARD_ID,
        game: POKEMON_GAME,
        episode_id: TEST_EPISODE_ID,
        name: "Mover Fixture English Only",
        card_number: "3",
        rarity: "Secret Rare",
      },
      {
        id: TEST_SENTINEL_CARD_ID,
        game: POKEMON_GAME,
        episode_id: TEST_EPISODE_ID,
        name: "Mover Fixture Sentinel",
        card_number: "4",
        rarity: "Secret Rare",
      },
      {
        id: TEST_SOLD_CARD_ID,
        game: POKEMON_GAME,
        episode_id: TEST_EPISODE_ID,
        name: "Mover Fixture Sold",
        card_number: "5",
        rarity: "Secret Rare",
      },
    ],
  });
  await db.price.createMany({
    data: [
      {
        card_id: TEST_OWNED_CARD_ID,
        fetched_at: daysAgo(10),
        cm_en_lowest_nm: 20,
        cm_en_avg_7d: 20,
        cm_en_avg_30d: 20,
      },
      {
        card_id: TEST_OWNED_CARD_ID,
        fetched_at: daysAgo(1),
        cm_en_lowest_nm: 55,
        cm_en_avg_7d: 55,
        cm_en_avg_30d: 55,
      },
      {
        card_id: TEST_NON_OWNED_CARD_ID,
        fetched_at: daysAgo(10),
        cm_en_lowest_nm: 18,
        cm_en_avg_7d: 18,
        cm_en_avg_30d: 18,
      },
      {
        card_id: TEST_NON_OWNED_CARD_ID,
        fetched_at: daysAgo(1),
        cm_en_lowest_nm: 90,
        cm_en_avg_7d: 90,
        cm_en_avg_30d: 90,
      },
      {
        card_id: TEST_MIXED_LANGUAGE_CARD_ID,
        fetched_at: daysAgo(10),
        cm_en_lowest_nm: 20,
        cm_en_avg_7d: 20,
        cm_en_avg_30d: 20,
      },
      {
        card_id: TEST_MIXED_LANGUAGE_CARD_ID,
        fetched_at: daysAgo(2),
        cm_en_lowest_nm: 55,
        cm_en_avg_7d: 55,
        cm_en_avg_30d: 55,
      },
      {
        card_id: TEST_MIXED_LANGUAGE_CARD_ID,
        fetched_at: daysAgo(1),
        cm_de_lowest_nm: 999,
        tcp_market: 60,
      },
      {
        card_id: TEST_SENTINEL_CARD_ID,
        fetched_at: daysAgo(10),
        cm_en_lowest_nm: 20,
        cm_en_avg_7d: 20,
        cm_en_avg_30d: 20,
      },
      {
        card_id: TEST_SENTINEL_CARD_ID,
        fetched_at: daysAgo(2),
        cm_en_lowest_nm: 50,
        cm_en_avg_7d: 50,
        cm_en_avg_30d: 50,
      },
      {
        card_id: TEST_SENTINEL_CARD_ID,
        fetched_at: daysAgo(1),
        cm_en_lowest_nm: 9001,
      },
      {
        card_id: TEST_SOLD_CARD_ID,
        fetched_at: daysAgo(10),
        cm_en_lowest_nm: 15,
        cm_en_avg_7d: 15,
        cm_en_avg_30d: 15,
      },
      {
        card_id: TEST_SOLD_CARD_ID,
        fetched_at: daysAgo(1),
        cm_en_lowest_nm: 45,
        cm_en_avg_7d: 45,
        cm_en_avg_30d: 45,
      },
    ],
  });
  await db.cardGradedPrice.create({
    data: {
      card_id: TEST_NON_OWNED_CARD_ID,
      label: "PSA 10",
      price: 350,
    },
  });
  await db.collectionCard.create({
    data: {
      id: TEST_COLLECTION_ITEM_ID,
      user_id: TEST_USER_ID,
      card_id: TEST_OWNED_CARD_ID,
      for_sale: false,
    },
  });
  await db.collectionCard.create({
    data: {
      id: TEST_SOLD_COLLECTION_ITEM_ID,
      user_id: TEST_USER_ID,
      card_id: TEST_SOLD_CARD_ID,
      for_sale: false,
      sold_at: daysAgo(1),
    },
  });
});

afterAll(async () => {
  await cleanupMoverFixtures();
});

describe("sudden drop mover helpers", () => {
  it("uses the largest recent absolute drop across the 7d and 30d windows", () => {
    const item = {
      change7d: -52,
      change7dPct: -18,
      change30d: -125,
      change30dPct: -42,
    };

    expect(getMoverRecentDropAmount(item)).toBeGreaterThanOrEqual(SUDDEN_DROP_DEAL_MIN_AMOUNT);
    expect(getMoverRecentDropAmount(item)).toBe(125);
    expect(getMoverRecentDropPercent(item)).toBe(-42);
  });
});

describe("mover pull-rate weighting", () => {
  it("uses pull-rate weight before rarity fallback", () => {
    expect(resolveMoverRarityWeight("Common", 1.82)).toBe(1.82);
  });

  it("falls back to rarity order when pull-rate data is missing", () => {
    expect(resolveMoverRarityWeight("Hyper Rare", null)).toBeGreaterThan(
      resolveMoverRarityWeight("Common", null)
    );
  });

  it("caps bulk rarity pull-rate boosts for raw movers", () => {
    expect(resolveRawMoverRarityWeight("Common", 1.82)).toBe(0.9);
    expect(resolveRawMoverRarityWeight("Uncommon", 1.82)).toBe(1);
    expect(resolveRawMoverRarityWeight("Rare", 1.82)).toBe(1.82);
  });
});

describe("mover scopes", () => {
  it(
    "keeps CardMarket on valid English NM data and excludes sold or sentinel ownership data",
    async () => {
      const [collectionData, allData] = await Promise.all([
        getMovers("cm_en", "collection", "collection", TEST_USER_ID),
        getMovers("cm_en", "all", "all", TEST_USER_ID),
      ]);
      const mixedLanguage = allData.movers.find(
        (item) => item.cardId === TEST_MIXED_LANGUAGE_CARD_ID
      );
      const sentinel = allData.movers.find((item) => item.cardId === TEST_SENTINEL_CARD_ID);
      const sold = allData.movers.find((item) => item.cardId === TEST_SOLD_CARD_ID);

      expect(mixedLanguage).toMatchObject({
        source: "cardmarket",
        currency: "EUR",
        currentPrice: 55,
        cardmarketPrice: 55,
        tcgplayerPrice: 60,
      });
      expect(sentinel).toMatchObject({
        currentPrice: 50,
        cardmarketPrice: 50,
        highPrice: 50,
      });
      expect(sentinel?.cardmarketHistoryPoints).toBe(2);
      expect(sold?.ownedCount).toBe(0);
      expect(collectionData.movers.some((item) => item.cardId === TEST_SOLD_CARD_ID)).toBe(false);
    },
    30000
  );

  it(
    "keeps collection movers collection-only and includes non-owned cards in all-card movers",
    async () => {
      const [collectionData, allData] = await Promise.all([
        getMovers("cm_en", "collection", "collection", TEST_USER_ID),
        getMovers("cm_en", "all", "all", TEST_USER_ID),
      ]);
      const nonOwnedFixture = allData.movers.find(
        (item) => item.cardId === TEST_NON_OWNED_CARD_ID
      );

      expect(collectionData.scope).toBe("collection");
      expect(allData.scope).toBe("all");
      expect(collectionData.trackedCards).toBeGreaterThan(0);
      expect(allData.trackedCards).toBeGreaterThan(collectionData.trackedCards);
      expect(collectionData.movers.length).toBeGreaterThan(0);
      expect(allData.movers.length).toBeGreaterThan(0);
      expect(collectionData.movers.every((item) => item.ownedCount > 0)).toBe(true);
      expect(nonOwnedFixture?.ownedCount).toBe(0);
      expect(collectionData.movers.every((item) => Array.isArray(item.gradedPrices))).toBe(true);
      expect(allData.movers.every((item) => Array.isArray(item.gradedPrices))).toBe(true);
    },
    30000
  );

  it(
    "keeps micro-priced raw cards out of the regular movers lists",
    async () => {
      const [collectionData, allData] = await Promise.all([
        getMovers("cm_en", "collection", "collection", TEST_USER_ID),
        getMovers("cm_en", "all", "all", TEST_USER_ID),
      ]);

      expect(collectionData.movers.length).toBeGreaterThan(0);
      expect(allData.movers.length).toBeGreaterThan(0);
      expect(collectionData.movers.every((item) => item.currentPrice >= 3)).toBe(true);
      expect(allData.movers.every((item) => item.currentPrice >= 3)).toBe(true);
    },
    30000
  );

  it(
    "includes all current graded prices for all-card movers without changing raw mover scope",
    async () => {
      const allData = await getMovers("cm_en", "all", "all", TEST_USER_ID);
      const gradedMover = allData.movers.find((item) => item.cardId === TEST_NON_OWNED_CARD_ID);

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
        db.cardGradedPrice.count({ where: { card: { game: POKEMON_GAME } } }),
      ]);
      const gradedMover = gradedData.movers.find((item) => item.gradedLabel);

      expect(gradedData.scope).toBe("graded");
      expect(gradedData.trackedCards).toBe(currentGradedCount);
      expect(gradedData.eligibleCards).toBe(currentGradedCount);
      // The serialized all-cards list is capped at 500 to keep the page payload sane.
      expect(gradedData.movers.length).toBe(Math.min(currentGradedCount, 500));
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
    "shows risk-adjusted grade targets sorted by opportunity score",
    async () => {
      const [gradingData, currentGradedCount] = await Promise.all([
        getMovers("cm_en", "grading"),
        db.cardGradedPrice.count({ where: { card: { game: POKEMON_GAME } } }),
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
            item.grading.marketPrice === item.currentPrice &&
            item.grading.gradedPrice <= item.currentPrice &&
            item.grading.expectedGain > 0 &&
            item.grading.priceStatus !== "suspicious" &&
            item.priceQuality.status !== "suspicious" &&
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
