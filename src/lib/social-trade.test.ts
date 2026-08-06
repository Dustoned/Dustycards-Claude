import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectionFindMany: vi.fn(),
  connectionFindUnique: vi.fn(),
  cardCopiesFindMany: vi.fn(),
  wantsFindMany: vi.fn(),
  cardsFindMany: vi.fn(),
  queryRawUnsafe: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    socialConnection: {
      findMany: mocks.connectionFindMany,
      findUnique: mocks.connectionFindUnique,
    },
    collectionCard: { findMany: mocks.cardCopiesFindMany },
    collectionWant: { findMany: mocks.wantsFindMany },
    card: { findMany: mocks.cardsFindMany },
    $queryRawUnsafe: mocks.queryRawUnsafe,
  },
}));

import { getSocialTradeOpportunities } from "@/lib/social";

describe("social trade opportunities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectionFindMany.mockResolvedValue([
      {
        id: "connection-1",
        requester_id: "user-1",
        addressee_id: "friend-1",
        user_a_id: "friend-1",
        user_b_id: "user-1",
        status: "accepted",
        full_access_status: "accepted",
        requester: { id: "user-1", email: "me@example.com" },
        addressee: { id: "friend-1", email: "trade.friend@example.com" },
      },
    ]);
    mocks.connectionFindUnique.mockResolvedValue({
      status: "accepted",
      full_access_status: "accepted",
    });
    mocks.cardCopiesFindMany.mockImplementation(({ where }) =>
      Promise.resolve(
        where.user_id === "user-1"
          ? [
              { card_id: "card-yours", for_sale: false },
              { card_id: "card-yours", for_sale: false },
            ]
          : [
              { card_id: "card-theirs", for_sale: true },
            ]
      )
    );
    mocks.wantsFindMany.mockImplementation(({ where }) =>
      Promise.resolve([
        { card_id: where.user_id === "user-1" ? "card-theirs" : "card-yours" },
      ])
    );
    mocks.cardsFindMany.mockResolvedValue([
      {
        id: "card-yours",
        name: "Your duplicate",
        card_number: "1",
        image_url: null,
        episode: { name: "Test Set" },
      },
      {
        id: "card-theirs",
        name: "Their listed card",
        card_number: "2",
        image_url: null,
        episode: { name: "Test Set" },
      },
    ]);
    mocks.queryRawUnsafe.mockResolvedValue([
      { card_id: "card-yours", cm_en_lowest_nm: 20 },
      { card_id: "card-theirs", cm_en_lowest_nm: 25 },
    ]);
  });

  it("combines every Full Access friend and respects the active game", async () => {
    const result = await getSocialTradeOpportunities("user-1", "pokemon");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      friend: { id: "friend-1", displayName: "Trade Friend" },
      matches: {
        yourOfferValue: 20,
        theirOfferValue: 25,
        yourCardsTheyWant: [{ id: "card-yours", availableCopies: 1 }],
        theirCardsYouWant: [{ id: "card-theirs", availableCopies: 1 }],
        yourCollectionCards: [{ id: "card-yours", availableCopies: 2 }],
        theirCollectionCards: [{ id: "card-theirs", availableCopies: 1 }],
      },
    });
    for (const call of mocks.cardCopiesFindMany.mock.calls) {
      expect(call[0].where.card).toEqual({ game: "pokemon" });
    }
    for (const call of mocks.wantsFindMany.mock.calls) {
      expect(call[0].where.card).toEqual({ game: "pokemon" });
      expect(call[0].where.source).toBe("manual");
    }
  });
});
