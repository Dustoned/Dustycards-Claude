import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({ cards: vi.fn(), upsert: vi.fn(), create: vi.fn(), admin: vi.fn(), find: vi.fn(), update: vi.fn(), remove: vi.fn(), relations: vi.fn(), overrides: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.admin, authErrorResponse: () => NextResponse.json({ error: "Forbidden" }, { status: 403 }) }));
vi.mock("@/lib/card-printings", () => ({ CARD_REPRINT_MODEL_VERSION: "current", haveSameKnownPrintingArtist: () => true, isEligiblePrintFamilyPair: () => false }));
vi.mock("@/lib/db", () => ({ db: {
  card: { findMany: mocks.cards }, cardPrintingRelation: { findMany: mocks.relations }, cardPrintingOverride: { findMany: mocks.overrides },
  $transaction: (fn: (tx: unknown) => unknown) => fn({ cardPrintingOverride: { upsert: mocks.upsert, findFirst: mocks.find, updateMany: mocks.update }, cardPrintingRelation: { createMany: mocks.create, deleteMany: mocks.remove } }),
} }));
import { DELETE, GET, POST } from "./route";
const date = new Date("2026-09-05T14:38:25.940Z");
const record = { id: "review1", user_id: "admin1", source_card_id: "a", target_card_id: "b", decision: "include", updated_at: date };
const request = (body: unknown = { id: "review1", updatedAt: date.toISOString() }) => new NextRequest("http://localhost/api/admin/reprint-review", { method: "DELETE", body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.admin.mockResolvedValue({ id: "admin1" }); mocks.find.mockResolvedValue(record); mocks.update.mockResolvedValue({ count: 1 });
  mocks.relations.mockResolvedValue([]); mocks.overrides.mockResolvedValue([]);
});
it("returns an owned decision to review and removes both published directions", async () => {
  expect((await DELETE(request())).status).toBe(200);
  expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ user_id: "admin1", id: "review1" }) }));
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ decision: "review" }) }));
  expect(mocks.remove).toHaveBeenCalledWith({ where: { OR: [{ source_card_id: "a", target_card_id: "b" }, { source_card_id: "b", target_card_id: "a" }] } });
});
it("refuses stale decisions without mutating them", async () => {
  expect((await DELETE(request({ id: "review1", updatedAt: "2026-09-05T14:30:00Z" }))).status).toBe(409);
  expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
});
it("rejects absent or another admin's decisions", async () => {
  mocks.find.mockResolvedValue(null);
  expect((await DELETE(request())).status).toBe(409);
  expect(mocks.update).not.toHaveBeenCalled();
});
it("requires admin access and a valid version", async () => {
  expect((await DELETE(request({ id: "review1", updatedAt: "invalid" }))).status).toBe(400);
  mocks.admin.mockRejectedValue(new Error("Forbidden"));
  expect((await DELETE(request())).status).toBe(403); expect(mocks.update).not.toHaveBeenCalled();
});
it("keeps undone pairs in the queue without automated relations and omits them from undo history", async () => {
  const card = { id: "a", name: "Copycat", artist: null, image_url: null, card_number: "73", episode: { name: "Set" } };
  mocks.overrides.mockResolvedValue([{ ...record, decision: "review", sourceCard: card, targetCard: { ...card, id: "b" } }]);
  const body = await (await GET()).json();
  expect(body.count).toBe(1); expect(body.reviewedCount).toBe(0); expect(body.history).toEqual([]);
  expect(body.items[0].matchMethod).toBe("returned-for-review");
});

it.each([null, "", "   "])("allows manual confirmation with missing artist %s", async (artist) => {
  mocks.cards.mockResolvedValue([{ name: "Grass Energy", game: "pokemon", artist }, { name: "Grass Energy", game: "pokemon", artist: "Keiji Kinebuchi" }]);
  const response = await POST(new NextRequest("http://localhost/api/admin/reprint-review", { method: "POST", body: JSON.stringify({ sourceCardId: "a", targetCardId: "b", decision: "include" }) }));
  expect(response.status).toBe(200);
  expect(mocks.upsert).toHaveBeenCalled();
  expect(mocks.create).toHaveBeenCalledWith({ data: expect.arrayContaining([expect.objectContaining({ match_method: "manual-include" })]) });
});
it("rejects conflicting known illustrators without saving", async () => {
  mocks.cards.mockResolvedValue([{ name: "Card", game: "pokemon", artist: "Artist A" }, { name: "Card", game: "pokemon", artist: "Artist B" }]);
  expect((await POST(new NextRequest("http://localhost/api/admin/reprint-review", { method: "POST", body: JSON.stringify({ sourceCardId: "a", targetCardId: "b", decision: "include" }) }))).status).toBe(400);
  expect(mocks.upsert).not.toHaveBeenCalled();
});
