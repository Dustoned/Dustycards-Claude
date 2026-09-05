import { beforeEach, expect, it, vi } from "vitest";
const { findMany, overrides } = vi.hoisted(() => ({ findMany: vi.fn(), overrides: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { cardPrintingRelation: { findMany }, cardPrintingOverride: { findMany: overrides } } }));
import { loadRelatedCardPrintings, type PrintingLookupCard } from "./card-printings";

const source: PrintingLookupCard = {
  id: "31720", game: "pokemon", name: "Mega Gengar ex", hp: 350,
  artist: "Taiga Kasai", image_url: null, supertype: "Pokemon",
  episode: { id: "ascended", name: "Ascended Heroes", code: null, release_date: "2026-01-30" },
};
function row(id: string, artist: string | null, method = "rules-exact", similarity = 0.99) {
  return { match_method: method, image_similarity: similarity, targetCard: {
    id, artist, name: source.name, card_number: "56", version: null, rarity: null,
    image_url: null, cardmarket_url: null, prices: [],
    episode: { id: "phantasmal", name: "Phantasmal Flames", code: null, release_date: "2025-11-14" },
  } };
}
beforeEach(() => { findMany.mockReset(); overrides.mockResolvedValue([]); });
it("removes legacy Mega Gengar different-illustrator and weak-artwork rows at read time", async () => {
  findMany.mockResolvedValue([
    row("24063", "5ban Graphics"), row("manual-conflict", "5ban Graphics", "manual-include"),
    row("unknown", null), row("weak", "Taiga Kasai", "rules-exact", 0.74),
    row("review", "Taiga Kasai", "likely-art"), row("verified-reissue", "Taiga Kasai"),
  ]);
  expect((await loadRelatedCardPrintings(source)).map(card => card.id)).toEqual(["verified-reissue"]);
});
it("retains verified same-illustrator regular reissues across sets", async () => {
  findMany.mockResolvedValue([row("24063", "5ban Graphics", "strong-art", 0.98)]);
  expect((await loadRelatedCardPrintings({ ...source, id: "31576", artist: "5ban Graphics" })).map(card => card.id)).toEqual(["24063"]);
});
it("does not republish an undone pair from a stale worker relation", async () => {
  findMany.mockResolvedValue([row("returned", "Taiga Kasai", "manual-include")]);
  overrides.mockResolvedValue([{ source_card_id: "returned", target_card_id: source.id }]);
  expect(await loadRelatedCardPrintings(source)).toEqual([]);
  expect(overrides).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ decision: { in: ["exclude", "review"] } }) }));
});
