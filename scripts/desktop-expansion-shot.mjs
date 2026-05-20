import { chromium } from "playwright";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import Database from "better-sqlite3";

const BASE_URL = "http://localhost:3000";
const OUT_DIR = path.resolve(process.cwd(), "screenshots-ui", "desktop-expansion-after");

const SESSION_COOKIE_NAME = "dustycards-session";
const SETTINGS_COOKIE_NAME = "dustycards-settings";
const SETTINGS_STORAGE_KEY = "dustycards-settings";
const SMOKE_USER_ID = "ui-review-admin";
const SMOKE_USER_EMAIL = "ui-review-admin@example.test";
const SMOKE_SESSION_ID = "ui-review-session";
const SMOKE_SESSION_TOKEN = "ui-review-session-token";

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
function isoDate(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function ensureSession() {
  const db = new Database("dustycards.db");
  const now = isoDate();
  db.prepare(`
    INSERT INTO "User" (id, email, password_hash, role, disabled, email_verified_at, created_at, updated_at)
    VALUES (?, ?, ?, 'admin', 0, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET role='admin', disabled=0, email_verified_at=excluded.email_verified_at, updated_at=excluded.updated_at
  `).run(SMOKE_USER_ID, SMOKE_USER_EMAIL, "x", now, now, now);
  const user = db.prepare(`SELECT id FROM "User" WHERE email = ?`).get(SMOKE_USER_EMAIL);
  db.prepare(`
    INSERT INTO "Session" (id, user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash, expires_at=excluded.expires_at
  `).run(SMOKE_SESSION_ID, user.id, hashToken(SMOKE_SESSION_TOKEN), isoDate(3600 * 1000), now);
  db.close();
}

const SETTINGS = {
  theme: "system", widescreen: true, uiScale: "medium", mobileUiScale: "small",
  autoPriceRefresh: false, binderWatchMinPrice: 50, defaultView: "grid",
  mobileDefaultView: "grid", cardSize: "medium", mobileCardSize: "small",
  defaultRarities: [], defaultSupertypes: [], showOnlyPriced: false,
  primaryPriceSource: "cm_en", sortBy: "number", sortDir: "asc",
  modalSize: "medium", mobileModalSize: "small",
  card3dSize: "medium", mobileCard3dSize: "small",
};

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  ensureSession();

  const targets = [
    { id: "396", slug: "ascended-heroes-desktop" },
    { id: "19", slug: "scarlet-violet-desktop" },
    { id: "18", slug: "paldea-evolved-desktop" },
  ];

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    });
    const raw = JSON.stringify(SETTINGS);
    await context.addCookies([
      { name: SESSION_COOKIE_NAME, value: SMOKE_SESSION_TOKEN, url: BASE_URL, sameSite: "Lax" },
      { name: SETTINGS_COOKIE_NAME, value: encodeURIComponent(raw), url: BASE_URL, sameSite: "Lax" },
    ]);
    await context.addInitScript(({ key, raw }) => {
      window.localStorage.setItem(key, raw);
    }, { key: SETTINGS_STORAGE_KEY, raw });

    for (const target of targets) {
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/expansions/${target.id}`, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(1000);
      const out = path.join(OUT_DIR, `${target.slug}.png`);
      await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1280, height: 700 } });
      console.log(`  saved ${target.slug}.png`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
