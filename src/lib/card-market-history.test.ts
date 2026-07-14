import { describe, expect, it } from "vitest";
import {
  isSafeCardMarketHistoryAlias,
  normalizeCardMarketCollectorNumber,
  type CardMarketAliasCandidate,
  type CardMarketHistoryIdentity,
} from "@/lib/card-market-history";

const identity: CardMarketHistoryIdentity = {
  id: "9908",
  game: "pokemon",
  episodeId: "68",
  name: "Metagross-GX",
  cardNumber: "157a",
  printedCardNumber: "157a",
  cardmarketId: "450878",
  cardmarketUrl:
    "https://www.cardmarket.com/Pokemon/Products?idProduct=450878&language=1",
};

function candidate(
  overrides: Partial<CardMarketAliasCandidate> = {}
): CardMarketAliasCandidate {
  return {
    id: "9907",
    game: "pokemon",
    episode_id: "68",
    name: "Metagross-GX",
    card_number: "157",
    printed_card_number: "157/145",
    cardmarket_id: "450878",
    cardmarket_url:
      "https://www.cardmarket.com/Pokemon/Products?idProduct=450878&language=1",
    ...overrides,
  };
}

describe("safe CardMarket history aliases", () => {
  it("normalizes provider-style collector-number handoffs", () => {
    expect(normalizeCardMarketCollectorNumber("157a")).toBe("157");
    expect(normalizeCardMarketCollectorNumber("157/145")).toBe("157");
    expect(normalizeCardMarketCollectorNumber("TG24/TG30")).toBe("tg24");
  });

  it("accepts the guarded 157 to 157a market-product handoff", () => {
    expect(isSafeCardMarketHistoryAlias(identity, candidate())).toBe(true);
  });

  it.each([
    ["different game", { game: "one-piece" }],
    ["different set", { episode_id: "other-set" }],
    ["different name", { name: "Rayquaza V" }],
    ["different collector number", { card_number: "194", printed_card_number: "194/203" }],
    ["different CardMarket product", { cardmarket_id: "273685" }],
    [
      "different product URL",
      {
        cardmarket_url:
          "https://www.cardmarket.com/Pokemon/Products?idProduct=999999&language=1",
      },
    ],
  ])("rejects a duplicate id with %s", (_label, overrides) => {
    expect(isSafeCardMarketHistoryAlias(identity, candidate(overrides))).toBe(false);
  });
});
