import { describe, expect, it } from "vitest";
import {
  getOlderHighRarityDisplayPrice,
  getOlderHighRarityValueProfile,
  isOlderHighRarityValueSignal,
  isOlderHighRarityValueSignalAtLeastAge,
  isStrictOlderHighRarity,
} from "@/lib/older-high-rarity-value";

const eligible = {
  game: "pokemon",
  rarity: "Rare Ultra",
  ageYears: 9,
  currentPrice: 45,
  rarityCohortSize: 12,
  historyPoints: 30,
};

describe("older high-rarity value discovery", () => {
  it("accepts a meaningful older chase with a small set rarity cohort", () => {
    expect(getOlderHighRarityValueProfile(eligible)).toEqual({
      kind: "older-high-rarity-value",
      ageYears: 9,
      rarityCohortSize: 12,
      historyPoints: 30,
    });
  });

  it.each(["Common", "Uncommon", "rare", "Rare Holo", "Double Rare", "Promo"])(
    "rejects ordinary or broad rarity %s",
    (rarity) => {
      expect(isStrictOlderHighRarity(rarity)).toBe(false);
      expect(
        getOlderHighRarityValueProfile({ ...eligible, rarity }),
      ).toBeNull();
    },
  );

  it("rejects low-value bulk, recent cards, large rarity cohorts and thin history", () => {
    expect(
      getOlderHighRarityValueProfile({ ...eligible, currentPrice: 8 }),
    ).toBeNull();
    expect(
      getOlderHighRarityValueProfile({ ...eligible, ageYears: 3 }),
    ).toBeNull();
    expect(
      getOlderHighRarityValueProfile({ ...eligible, rarityCohortSize: 21 }),
    ).toBeNull();
    expect(
      getOlderHighRarityValueProfile({ ...eligible, historyPoints: 4 }),
    ).toBeNull();
  });

  it("keeps the discovery lane Pokemon-only and below the premium ceiling", () => {
    expect(
      getOlderHighRarityValueProfile({ ...eligible, game: "one-piece" }),
    ).toBeNull();
    expect(
      getOlderHighRarityValueProfile({ ...eligible, currentPrice: 601 }),
    ).toBeNull();
    expect(
      getOlderHighRarityValueProfile({ ...eligible, currentPrice: 600 }),
    ).not.toBeNull();
  });

  it("recognizes tagged signals without re-deriving mutable market criteria", () => {
    const profile = getOlderHighRarityValueProfile(eligible);
    expect(
      isOlderHighRarityValueSignal({ olderHighRarityValue: profile }),
    ).toBe(true);
    expect(isOlderHighRarityValueSignal({ olderHighRarityValue: null })).toBe(
      false,
    );
  });

  it("filters the tagged cohort by a selectable minimum age", () => {
    const profile = getOlderHighRarityValueProfile(eligible);
    const signal = { olderHighRarityValue: profile };

    expect(isOlderHighRarityValueSignalAtLeastAge(signal, 5)).toBe(true);
    expect(isOlderHighRarityValueSignalAtLeastAge(signal, 7)).toBe(true);
    expect(isOlderHighRarityValueSignalAtLeastAge(signal, 10)).toBe(false);
    expect(
      isOlderHighRarityValueSignalAtLeastAge(
        { olderHighRarityValue: null },
        5,
      ),
    ).toBe(false);
  });

  it("switches between CardMarket EUR and TCGPlayer USD without losing the conversion", () => {
    const prices = {
      cardmarketEur: 85,
      tcgplayerUsd: 92,
      tcgplayerEur: 79.12,
      usdToEurRate: 0.86,
      usdToEurRateDate: "2026-08-17",
    };

    expect(getOlderHighRarityDisplayPrice(prices, "cardmarket")).toEqual({
      value: 85,
      currency: "EUR",
      convertedEur: 85,
    });
    expect(getOlderHighRarityDisplayPrice(prices, "tcgplayer")).toEqual({
      value: 92,
      currency: "USD",
      convertedEur: 79.12,
    });
  });

  it("does not show invalid or missing TCGPlayer quotes", () => {
    expect(
      getOlderHighRarityDisplayPrice(
        {
          cardmarketEur: 85,
          tcgplayerUsd: 9001,
          tcgplayerEur: null,
          usdToEurRate: 0.86,
          usdToEurRateDate: "2026-08-17",
        },
        "tcgplayer",
      ),
    ).toBeNull();
  });
});
