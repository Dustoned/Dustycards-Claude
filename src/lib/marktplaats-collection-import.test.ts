import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  cards: vi.fn(), save: vi.fn(), remove: vi.fn(),
  tx: { marktplaatsScanRun: { upsert: vi.fn(), update: vi.fn() }, marktplaatsDeal: { upsert: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 0 }) } },
}));
vi.mock("@/lib/db", () => ({ db: {
  card: { findMany: mocks.cards }, episode: { findMany: vi.fn() }, marktplaatsDeal: { findMany: vi.fn() },
  $transaction: (fn: (tx: unknown) => unknown) => fn({ ...mocks.tx, marktplaatsCollectionInspection: { upsert: mocks.save, updateMany: mocks.remove } }),
} }));
import { importMarktplaatsReport } from "./marktplaats-deals-store";

function report() {
  return { schemaVersion: 1, scan: { id: "test", startedAt: "2026-09-04T10:00:00Z", finishedAt: "2026-09-04T11:00:00Z" }, deals: [], collections: [{
    listingUrl: "https://www.marktplaats.nl/v/verzamelen/pokemon/m123-binder", title: "Binder", description: "Checked full description",
    totalPhotos: 1, highestBidEur: 50, photos: [{ id: "p1", url: "https://images.marktplaats.com/test.jpg", width: 1000, height: 800, inspected: true, visibleCards: 1 }],
    cards: [{ id: "a", cardId: "pokemon-card", label: "Card", crops: [{ photoId: "p1", side: "front", x: 0, y: 0, width: 1, height: 1 }] }],
  }] };
}
beforeEach(() => { vi.clearAllMocks(); mocks.cards.mockResolvedValue([{ id: "pokemon-card" }]); });
it("imports bid-only collection evidence independently and never imports model prices", async () => {
  const result = await importMarktplaatsReport(report());
  expect(result.collectionsInspected).toBe(1);
  expect(mocks.cards).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["pokemon-card"] }, game: "pokemon" } }));
  const saved = mocks.save.mock.calls[0][0];
  expect(saved.where).toEqual({ external_id: "m123" });
  expect(JSON.parse(saved.create.report_json)).toMatchObject({ highestBidEur: 50, askingPriceEur: null });
  expect(saved.update.removed_at).toBeNull();
});
it("rejects missing/non-Pokémon catalogue matches before writing any inspection", async () => {
  mocks.cards.mockResolvedValue([]);
  await expect(importMarktplaatsReport(report())).rejects.toThrow(/existing Pokémon/);
  expect(mocks.save).not.toHaveBeenCalled();
});
it("does not remove inspections just because a normal report did not revisit them", async () => {
  await importMarktplaatsReport({ ...report(), collections: undefined });
  expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
});
it("applies only explicit collection removals", async () => {
  await importMarktplaatsReport({ ...report(), removedCollectionIds: ["m456"] });
  expect(mocks.remove).toHaveBeenCalledWith({ where: { external_id: { in: ["m456"] } }, data: { removed_at: new Date("2026-09-04T11:00:00Z") } });
});
