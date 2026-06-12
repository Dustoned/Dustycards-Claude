// End-to-end verification of the live app: auth rate limiting, scheduler
// secrets, data-quality drill-down, backups, the eBay watch list, and search.
//
// Usage: start a FRESH server first (npm start), then `npm run e2e:verify`.
// A fresh server matters because the login checks intentionally consume
// in-memory rate-limit budget; running twice without a restart can trip the
// per-IP throttle. Creates one real manual backup per run (newest 5 are kept)
// and injects a temporary admin session that is removed afterwards.

import { chromium } from "playwright";
import crypto from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const OUT_DIR = path.resolve(process.cwd(), "screenshots-ui", "audit-desktop");
const SESSION_ID = "tmp-audit-session";

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function createSession() {
  const db = new Database("dustycards.db");
  const admin = db
    .prepare("SELECT id FROM User WHERE role = 'admin' AND disabled = 0 ORDER BY created_at LIMIT 1")
    .get();
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare(
    `INSERT INTO Session (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET token_hash = excluded.token_hash, expires_at = excluded.expires_at`
  ).run(
    SESSION_ID,
    admin.id,
    crypto.createHash("sha256").update(token).digest("hex"),
    new Date(Date.now() + 3600_000).toISOString(),
    new Date().toISOString()
  );
  db.close();
  return token;
}

function cleanup() {
  const db = new Database("dustycards.db");
  db.prepare("DELETE FROM Session WHERE id = ?").run(SESSION_ID);
  db.prepare("DELETE FROM EbayWatchedListing WHERE item_id LIKE 'e2e-test-%'").run();
  db.close();
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body, headers: response.headers };
}

const token = createSession();
const authHeaders = { Cookie: `dustycards-session=${token}` };
const authJsonHeaders = { ...authHeaders, "Content-Type": "application/json" };

// ---------- 1. Login rate limiting ----------
{
  const fakeEmail = "e2e-throttle-test@example.test";
  let lastStatus = 0;
  for (let i = 0; i < 8; i += 1) {
    const r = await jsonFetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: fakeEmail, password: "wrong-password" }),
    });
    lastStatus = r.status;
  }
  check("login: 8 failed attempts return 401", lastStatus === 401, `last=${lastStatus}`);

  const ninth = await jsonFetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: fakeEmail, password: "wrong-password" }),
  });
  check(
    "login: 9th attempt is throttled with 429",
    ninth.status === 429 && /too many/i.test(ninth.body?.error ?? ""),
    `status=${ninth.status} error=${ninth.body?.error}`
  );

  // Form-post variant should redirect with error=throttled.
  const formResponse = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: fakeEmail, password: "wrong", next: "/" }).toString(),
    redirect: "manual",
  });
  const location = formResponse.headers.get("location") ?? "";
  check(
    "login: throttled form post redirects with error=throttled",
    formResponse.status === 303 && location.includes("error=throttled"),
    `status=${formResponse.status} location=${location}`
  );

  // A different email from the same IP should still be allowed (IP limit is 20).
  const otherEmail = await jsonFetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "other-account@example.test", password: "wrong" }),
  });
  check(
    "login: other email same IP not yet throttled",
    otherEmail.status === 401,
    `status=${otherEmail.status}`
  );
}

// ---------- 2. Forgot-password silent throttle ----------
{
  const statuses = new Set();
  const bodies = new Set();
  for (let i = 0; i < 6; i += 1) {
    const r = await jsonFetch(`${BASE_URL}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `e2e-forgot-${i % 2}@example.test` }),
    });
    statuses.add(r.status);
    bodies.add(JSON.stringify(r.body));
  }
  check(
    "forgot-password: throttled and non-throttled responses identical",
    statuses.size === 1 && bodies.size === 1 && statuses.has(200),
    `statuses=${[...statuses]} bodies=${bodies.size}`
  );
}

// ---------- 3. Internal scheduler secret ----------
{
  const noSecret = await jsonFetch(`${BASE_URL}/api/internal/sync-pricedex-pull-rates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const wrongSecret = await jsonFetch(`${BASE_URL}/api/internal/sync-pricedex-pull-rates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-dustycards-scheduler-secret": "definitely-wrong-secret",
    },
    body: "{}",
  });
  check(
    "internal pull-rates: unauthorized without/with wrong secret",
    noSecret.status === 401 && wrongSecret.status === 401,
    `none=${noSecret.status} wrong=${wrongSecret.status}`
  );
}

// ---------- 4. Admin data-quality API ----------
{
  const noAuth = await jsonFetch(`${BASE_URL}/api/admin/data-quality?issue=card-duplicates`);
  check("data-quality: rejects unauthenticated", noAuth.status === 401, `status=${noAuth.status}`);

  const issues = [
    "card-images",
    "card-source",
    "card-prices",
    "card-price-unavailable",
    "card-rarity",
    "card-duplicates",
    "card-empty-history",
    "card-stale-prices",
    "sealed-images",
    "sealed-source",
    "sealed-prices",
  ];
  let allOk = true;
  const counts = {};
  for (const issue of issues) {
    const r = await jsonFetch(`${BASE_URL}/api/admin/data-quality?issue=${issue}&limit=5`, {
      headers: authHeaders,
    });
    counts[issue] = r.body?.items?.length ?? -1;
    if (r.status !== 200 || !Array.isArray(r.body?.items)) allOk = false;
  }
  check(
    "data-quality: all 11 issue endpoints return item lists",
    allOk,
    Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ")
  );

  const unknown = await jsonFetch(`${BASE_URL}/api/admin/data-quality?issue=nope`, {
    headers: authHeaders,
  });
  check("data-quality: unknown issue returns 400", unknown.status === 400, `status=${unknown.status}`);
}

// ---------- 5. Backups API ----------
{
  const before = await jsonFetch(`${BASE_URL}/api/admin/backups`, { headers: authHeaders });
  const beforeCount = before.body?.backups?.length ?? -1;
  check(
    "backups: list returns directory and entries",
    before.status === 200 && Boolean(before.body?.dir) && beforeCount >= 0,
    `dir=${before.body?.dir} count=${beforeCount}`
  );

  console.log("  creating real backup via POST (takes ~10s)...");
  const created = await jsonFetch(`${BASE_URL}/api/admin/backups`, {
    method: "POST",
    headers: authHeaders,
  });
  const createdName = created.body?.created?.name ?? "";
  const createdSize = created.body?.created?.sizeBytes ?? 0;
  check(
    "backups: Backup now creates a manual restore point",
    created.status === 200 && createdName.startsWith("dustycards-manual-") && createdSize > 100_000_000,
    `${createdName} ${(createdSize / 1048576).toFixed(0)}MB`
  );

  const after = await jsonFetch(`${BASE_URL}/api/admin/backups`, { headers: authHeaders });
  check(
    "backups: new backup appears at top of list",
    after.body?.backups?.[0]?.name === createdName,
    `top=${after.body?.backups?.[0]?.name}`
  );
}

// ---------- 6. Watch list API ----------
{
  const payload = {
    marketplaceId: "EBAY_NL",
    itemId: "e2e-test-item-1",
    title: "E2E Test Listing",
    itemWebUrl: "https://www.ebay.nl/itm/e2e-test",
    priceEur: 12.5,
    referenceEur: 20,
    discountPercent: 37.5,
    sellerUsername: "e2e-seller",
  };
  const saved = await jsonFetch(`${BASE_URL}/api/ebay/watched-listings`, {
    method: "POST",
    headers: authJsonHeaders,
    body: JSON.stringify(payload),
  });
  check(
    "watch list: save listing",
    saved.status === 200 && saved.body?.listing?.itemId === "e2e-test-item-1",
    `status=${saved.status}`
  );

  const list = await jsonFetch(`${BASE_URL}/api/ebay/watched-listings`, { headers: authHeaders });
  const found = (list.body?.listings ?? []).some((l) => l.itemId === "e2e-test-item-1");
  check("watch list: GET returns saved listing", found);

  const badUrl = await jsonFetch(`${BASE_URL}/api/ebay/watched-listings`, {
    method: "POST",
    headers: authJsonHeaders,
    body: JSON.stringify({ ...payload, itemId: "e2e-test-item-2", itemWebUrl: "javascript:alert(1)" }),
  });
  check("watch list: rejects non-http itemWebUrl", badUrl.status === 400, `status=${badUrl.status}`);

  const removed = await jsonFetch(`${BASE_URL}/api/ebay/watched-listings`, {
    method: "DELETE",
    headers: authJsonHeaders,
    body: JSON.stringify({ marketplaceId: "EBAY_NL", itemId: "e2e-test-item-1" }),
  });
  const listAfter = await jsonFetch(`${BASE_URL}/api/ebay/watched-listings`, { headers: authHeaders });
  const stillThere = (listAfter.body?.listings ?? []).some((l) => l.itemId === "e2e-test-item-1");
  check("watch list: DELETE removes listing", removed.status === 200 && !stillThere);
}

// ---------- 6b. Collection mutation (add then remove) ----------
{
  const lookup = new Database("dustycards.db", { readonly: true });
  const candidate = lookup
    .prepare(
      `SELECT id, name FROM Card
       WHERE id NOT IN (SELECT card_id FROM CollectionCard)
       ORDER BY id LIMIT 1`
    )
    .get();
  lookup.close();

  if (!candidate) {
    check("collection: add/remove cycle", false, "no un-owned card found to test with");
  } else {
    const added = await jsonFetch(`${BASE_URL}/api/collection/cards`, {
      method: "POST",
      headers: authJsonHeaders,
      body: JSON.stringify({ cardId: candidate.id }),
    });
    const itemId = added.body?.item?.id ?? null;
    check(
      "collection: add card creates an item",
      added.status === 200 && Boolean(itemId),
      `card=${candidate.name} item=${itemId}`
    );

    if (itemId) {
      const removed = await jsonFetch(`${BASE_URL}/api/collection/cards`, {
        method: "DELETE",
        headers: authJsonHeaders,
        body: JSON.stringify({ itemId }),
      });
      const verifyDb = new Database("dustycards.db", { readonly: true });
      const stillThere = verifyDb
        .prepare("SELECT COUNT(*) AS c FROM CollectionCard WHERE id = ?")
        .get(itemId).c;
      verifyDb.close();
      check(
        "collection: remove card deletes the item",
        removed.status === 200 && stillThere === 0,
        `status=${removed.status} remaining=${stillThere}`
      );
    }
  }
}

// ---------- 7. Search API ----------
{
  const search = await jsonFetch(`${BASE_URL}/api/search?q=charizard`, { headers: authHeaders });
  const firstSingle = search.body?.singles?.[0];
  check(
    "search: returns results with episode_release_date",
    search.status === 200 &&
      (search.body?.singles?.length ?? 0) > 0 &&
      firstSingle != null &&
      "episode_release_date" in firstSingle,
    `singles=${search.body?.singles?.length} release=${firstSingle?.episode_release_date}`
  );

  const weird = await jsonFetch(
    `${BASE_URL}/api/search?q=${encodeURIComponent("')); DROP TABLE Card;--")}`,
    { headers: authHeaders }
  );
  check(
    "search: hostile query returns 200 with empty-ish results, not 500",
    weird.status === 200,
    `status=${weird.status} total=${weird.body?.total}`
  );

  const missingCard = await jsonFetch(`${BASE_URL}/api/cards/definitely-not-a-card`, {
    headers: authHeaders,
  });
  check(
    "cards: missing card returns 404 Not found",
    missingCard.status === 404 && missingCard.body?.error === "Not found",
    `status=${missingCard.status}`
  );
}

// ---------- 8. UI spot checks (Playwright) ----------
{
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([
    { name: "dustycards-session", value: token, url: BASE_URL, httpOnly: true, sameSite: "Lax" },
  ]);
  const page = await context.newPage();

  // Data Quality drill-down: a signal with items lists them; the (clean)
  // Dupes signal reports a clean state instead.
  await page.goto(`${BASE_URL}/settings`, { waitUntil: "networkidle", timeout: 45000 });
  await page.getByRole("tab", { name: "System" }).click().catch(async () => {
    await page.getByText("System", { exact: true }).first().click();
  });
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /Rarity/ }).first().click();
  await page.waitForTimeout(1500);
  const openSetLinks = await page.getByRole("link", { name: "Open set" }).count();
  check("UI data-quality: Rarity drill-down lists items with set links", openSetLinks > 0, `links=${openSetLinks}`);
  await page.screenshot({ path: path.join(OUT_DIR, "verify-dq-drilldown.png"), fullPage: false });

  await page.getByRole("button", { name: /Dupes/ }).first().click();
  await page.waitForTimeout(1200);
  const dupesClean = await page
    .getByText("No affected items. This signal is clean.")
    .isVisible()
    .catch(() => false);
  check("UI data-quality: Dupes signal is clean (variants excluded)", dupesClean);

  // Backups panel shows the new manual backup.
  const manualVisible = await page.getByText(/dustycards-manual-/).first().isVisible().catch(() => false);
  check("UI backups: manual backup visible in panel", manualVisible);
  await page.screenshot({ path: path.join(OUT_DIR, "verify-backups-panel.png"), fullPage: false });

  await browser.close();
}

cleanup();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
  console.log("FAILED CHECKS:");
  for (const f of failed) console.log(`  - ${f.name} ${f.detail}`);
  process.exitCode = 1;
}
