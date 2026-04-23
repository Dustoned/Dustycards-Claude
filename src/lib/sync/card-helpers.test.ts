import { beforeEach, describe, expect, it, vi } from "vitest";

const tcgdexMock = vi.hoisted(() => ({
  categoryToSupertype: vi.fn(),
  findTcgdexSetIdForEpisode: vi.fn(),
  getTcgdexIllustratorLookupForCards: vi.fn(),
  getTcgdexSupertypeLookupForSet: vi.fn(),
}));

vi.mock("@/lib/tcgdex", () => tcgdexMock);

import { loadEpisodeCardEnrichmentLookups } from "@/lib/sync/card-helpers";

describe("loadEpisodeCardEnrichmentLookups", () => {
  beforeEach(() => {
    tcgdexMock.categoryToSupertype.mockReset();
    tcgdexMock.findTcgdexSetIdForEpisode.mockReset();
    tcgdexMock.getTcgdexIllustratorLookupForCards.mockReset();
    tcgdexMock.getTcgdexSupertypeLookupForSet.mockReset();
  });

  it("falls back to an empty illustrator lookup when TCGdex enrichment fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    tcgdexMock.findTcgdexSetIdForEpisode.mockResolvedValue("sv1");
    tcgdexMock.getTcgdexSupertypeLookupForSet.mockResolvedValue(
      new Map([["card-1", "Pokemon"]])
    );
    tcgdexMock.getTcgdexIllustratorLookupForCards.mockRejectedValue(
      new Error("TCGdex timeout")
    );

    const result = await loadEpisodeCardEnrichmentLookups(
      {
        code: "sv1",
        name: "Scarlet & Violet",
        card_count: 198,
      },
      [
        {
          id: "card-1",
          name: "Pikachu",
          card_number: "25",
          tcgid: "sv1-25",
          artist: null,
        },
      ]
    );

    expect(result.tcgdexSupertypeLookup.get("card-1")).toBe("Pokemon");
    expect(result.tcgdexIllustratorLookup.size).toBe(0);
    expect(tcgdexMock.getTcgdexIllustratorLookupForCards).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to load TCGdex illustrator lookup for Scarlet & Violet",
      expect.any(Error)
    );
  });
});
