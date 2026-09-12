import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), snapshot: vi.fn(), scrape: vi.fn() }));
vi.mock("@/lib/db", () => {
  const tx = { sealedProduct: { findUnique: mocks.find, update: mocks.update }, sealedPriceSnapshot: { create: mocks.snapshot } };
  return { db: { ...tx, $transaction: (callback: (value: typeof tx) => unknown) => callback(tx) } };
});
vi.mock("@/lib/scrape-provider", () => ({ scrapePageWithFallback: mocks.scrape }));
import { runAdminSealedCardMarketPriceCheck, confirmAdminSealedCardMarketPriceCheck } from "./admin-sealed-cardmarket-price-check";
import { parseAdminCardMarketPriceCheckToken } from "./admin-cardmarket-price-check";
const product = { id: "sealed-1", name: "Test Booster Box", episode_id: "set-1", cardmarket_id: "123", cardmarket_url: null, cm_lowest: 100 };
function scrape(title = product.name, html = '<div id="articleRow1" class="row article-row"><span class="color-primary fw-bold">120,00 €</span></div>') {
  return { title, html, markdown: "", sourceUrl: "https://www.cardmarket.com/en/Pokemon/Products/Booster-Boxes/Test-Booster-Box?language=1", provider: "firecrawl" };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DUSTYCARDS_SYNC_SCHEDULER_SECRET", "test-secret");
  mocks.find.mockResolvedValue(product);
  mocks.scrape.mockResolvedValue(scrape());
});
describe("sealed live price check", () => {
  it("previews a price difference without writing and binds its token to sealed", async () => {
    const check = await runAdminSealedCardMarketPriceCheck(product.id);
    expect(check).toMatchObject({ currentPriceEur: 100, observedPriceEur: 120, differenceEur: 20, differencePercent: 20 });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.snapshot).not.toHaveBeenCalled();
    expect(() => parseAdminCardMarketPriceCheckToken(check.token, product.id)).toThrow();
  });
  it("retries a missing offer table", async () => {
    mocks.scrape.mockResolvedValueOnce(scrape(product.name, "<main>Loading</main>"));
    await expect(runAdminSealedCardMarketPriceCheck(product.id)).resolves.toMatchObject({ observedPriceEur: 120 });
    expect(mocks.scrape).toHaveBeenCalledTimes(2);
  });
  it("rejects a different product without saving", async () => {
    mocks.scrape.mockResolvedValue(scrape("Different Elite Trainer Box"));
    await expect(runAdminSealedCardMarketPriceCheck(product.id)).rejects.toThrow("different or unidentifiable");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("saves the signed quote and a matching history observation", async () => {
    const check = await runAdminSealedCardMarketPriceCheck(product.id);
    await confirmAdminSealedCardMarketPriceCheck(product.id, check.token, "changed");
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: product.id }, data: { cm_lowest: 120 } });
    expect(mocks.snapshot).toHaveBeenCalledWith({ data: expect.objectContaining({ product_id: product.id, cm_lowest: 120, fetched_at: new Date(check.observedAt) }) });
  });
  it("keeps the saved quote and timestamp when dismissed as unchanged", async () => {
    const check = await runAdminSealedCardMarketPriceCheck(product.id);
    await confirmAdminSealedCardMarketPriceCheck(product.id, check.token, "unchanged");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
});
