import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import { randomBytes, createHash } from "node:crypto";
import path from "node:path";

const baseURL = `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3000"}`;
const databasePath = process.env.DUSTYCARDS_DATABASE_PATH ?? "dustycards.db";
const userId = "codex-collection-photo-smoke";
const token = randomBytes(32).toString("hex");
test.describe.configure({ mode: "serial" });
test.beforeAll(() => {
  // These fixtures are only allowed in this checkout's disposable snapshot database.
  if (path.resolve(databasePath) !== path.join(process.cwd(), "dustycards.db")) throw new Error("Use a local snapshot for this smoke test.");
  const db = new Database(databasePath);
  const now = new Date().toISOString();
  db.prepare(`INSERT OR REPLACE INTO User (id,email,password_hash,role,disabled,email_verified_at,created_at,updated_at) VALUES (?,?,?,'user',0,?,?,?)`).run(userId, "collection-photo-smoke@example.test", "not-a-login-password", now, now, now);
  db.prepare(`INSERT INTO Session (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)`).run(userId, userId, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 3_600_000).toISOString(), now);
  const card = db.prepare(`SELECT c.id FROM Card c WHERE c.game='pokemon' AND EXISTS (SELECT 1 FROM Price p WHERE p.card_id=c.id AND p.cm_en_lowest_nm > 0 AND p.cm_en_lowest_nm <> 9001) LIMIT 1`).get() as { id: string };
  for (const [id, bid, totalPhotos] of [["m9000000001", 150, 2], ["m9000000002", null, 3]] as const) {
    const report = {
      listingUrl: `https://www.marktplaats.nl/v/verzamelen/pokemon/${id}-smoke`, title: `TEST binder ${id}`, description: "Local test fixture, never a real listing.",
      highestBidEur: bid, totalPhotos,
      photos: [1,2].map((n) => ({ id: `p${n}`, url: `https://images.marktplaats.com/smoke-${n}.jpg`, width: 1000, height: 800, inspected: true, visibleCards: 1 })),
      cards: [{ id: "card-1", cardId: card.id, label: "Test Pokémon card", language: "English", identityConfidence: 0.95, identityEvidence: "Fixture only", condition: "EX", conditionConfidence: 0.8, conditionNotes: "Test edge wear", crops: [{ photoId: "p1", side: "front", x: 0.1, y: 0.1, width: 0.4, height: 0.8 }, { photoId: "p2", side: "back", x: 0.1, y: 0.1, width: 0.4, height: 0.8 }] }],
    };
    db.prepare(`INSERT OR REPLACE INTO MarktplaatsCollectionInspection (external_id, scan_run_id, report_json, observed_at) VALUES (?, 'smoke', ?, ?)`).run(id, JSON.stringify(report), now);
  }
  db.close();
});
test.afterAll(() => {
  const db = new Database(databasePath);
  db.prepare(`DELETE FROM MarktplaatsCollectionInspection WHERE external_id IN ('m9000000001','m9000000002') AND scan_run_id='smoke'`).run();
  db.prepare(`DELETE FROM Session WHERE id=?`).run(userId);
  db.prepare(`DELETE FROM User WHERE id=?`).run(userId);
  db.close();
});
for (const width of [390, 1440]) {
  test(`collection tab filters, crop zoom and navigation at ${width}px`, async ({ page, context }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await context.addCookies([{ name: "dustycards-session", value: token, url: baseURL }]);
    // Deterministic image content; never fetch an invented listing or send fixture data outside.
    await page.route("https://images.marktplaats.com/smoke-*", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800"><rect width="1000" height="800" fill="#283448"/><rect x="100" y="80" width="400" height="640" rx="20" fill="#ddba72"/><text x="130" y="200" fill="#10141c" font-size="38">TEST CARD</text></svg>' }));
    await page.goto(`${baseURL}/?tab=selling&sellingView=collections`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Pokémon Collecties", exact: true })).toBeVisible({ timeout: 90_000 });
    const originalUrl = page.url();
    await page.getByRole("button", { name: "Met biedingen (1)", exact: true }).click();
    await expect(page.getByRole("heading", { name: "TEST binder m9000000001" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "TEST binder m9000000002" })).toHaveCount(0);
    expect(page.url()).toBe(originalUrl);
    await page.getByRole("button", { name: /Bekijk foto's & kaarten/ }).click();
    await expect(page.getByRole("heading", { name: "Alle advertentiefoto’s" })).toBeVisible();
    await expect(page.getByText(/Foto-inschatting: €/)).toBeVisible();
    const detailResponse = page.waitForResponse((response) => /\/api\/cards\/[^/?]+$/.test(response.url()) && response.status() === 200);
    await page.getByRole("button", { name: /Bekijk .+ in DustyCards/ }).click();
    await detailResponse;
    await page.getByRole("button", { name: /Back to Home/ }).click();
    await page.getByRole("button", { name: "Vergroot uitsnede van Test Pokémon card" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.screenshot({ path: `.codex-screenshots/collection-inspections-${width}.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
    await page.getByRole("button", { name: "Verder controleren (1)", exact: true }).click();
    await expect(page.getByRole("heading", { name: "TEST binder m9000000002" })).toBeVisible();
    await page.getByRole("button", { name: "Alles (2)", exact: true }).click();
    await page.getByRole("searchbox", { name: "Zoek collecties of kaarten" }).fill("m9000000001");
    await expect(page.getByRole("heading", { name: "TEST binder m9000000002" })).toHaveCount(0);
    await page.getByRole("button", { name: "Marktplaats Deals", exact: false }).first().click();
    await page.getByRole("button", { name: "Pokémon Collecties", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Pokémon Collecties", exact: true })).toBeVisible();
    expect(page.url()).toBe(originalUrl);
  });
}
