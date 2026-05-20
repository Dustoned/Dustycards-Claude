import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const OUT_DIR = path.resolve(
  process.cwd(),
  "screenshots-ui",
  process.env.OUT_DIR_NAME || "mobile-review-2026-05-20"
);

const SETTINGS_COOKIE_NAME = "dustycards-settings";
const SETTINGS_STORAGE_KEY = "dustycards-settings";
const SESSION_COOKIE_NAME = "dustycards-session";

const SMOKE_USER_ID = "ui-review-admin";
const SMOKE_USER_EMAIL = "ui-review-admin@example.test";
const SMOKE_SESSION_ID = "ui-review-session";
const SMOKE_SESSION_TOKEN = "ui-review-session-token";

const BASE_SETTINGS = {
  theme: "system",
  widescreen: false,
  uiScale: "medium",
  mobileUiScale: "small",
  autoPriceRefresh: false,
  binderWatchMinPrice: 50,
  defaultView: "grid",
  mobileDefaultView: "grid",
  cardSize: "medium",
  mobileCardSize: "small",
  defaultRarities: [],
  defaultSupertypes: [],
  showOnlyPriced: false,
  primaryPriceSource: "cm_en",
  sortBy: "number",
  sortDir: "asc",
  modalSize: "medium",
  mobileModalSize: "small",
  card3dSize: "medium",
  mobileCard3dSize: "small",
};

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isoDate(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function openDb() {
  return new Database("dustycards.db");
}

function ensureSession() {
  const db = openDb();
  const now = isoDate();

  db.prepare(`
    INSERT INTO "User" (
      id, email, password_hash, role, disabled,
      email_verified_at, created_at, updated_at
    )
    VALUES (?, ?, ?, 'admin', 0, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      role = 'admin',
      disabled = 0,
      email_verified_at = excluded.email_verified_at,
      updated_at = excluded.updated_at
  `).run(SMOKE_USER_ID, SMOKE_USER_EMAIL, "ui-review-password-hash", now, now, now);

  const user = db.prepare(`SELECT id FROM "User" WHERE email = ?`).get(SMOKE_USER_EMAIL);
  if (!user) {
    db.close();
    throw new Error("Could not create user");
  }

  db.prepare(`
    INSERT INTO "Session" (id, user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      user_id = excluded.user_id,
      token_hash = excluded.token_hash,
      expires_at = excluded.expires_at,
      created_at = excluded.created_at
  `).run(SMOKE_SESSION_ID, user.id, hashToken(SMOKE_SESSION_TOKEN), isoDate(60 * 60 * 1000), now);

  db.close();
}

function findEpisodeWithImageCards() {
  const db = openDb();
  const row = db.prepare(`
    SELECT episode_id
    FROM "Card"
    WHERE image_url IS NOT NULL AND image_url <> ''
    GROUP BY episode_id
    ORDER BY COUNT(*) DESC
    LIMIT 1
  `).get();
  db.close();
  return row?.episode_id ?? null;
}

function findCategorySlug() {
  const db = openDb();
  let row = null;
  try {
    row = db.prepare(`SELECT slug FROM "CardCategory" LIMIT 1`).get();
  } catch {
    row = null;
  }
  db.close();
  return row?.slug ?? null;
}

function findArtistName() {
  const db = openDb();
  let row = null;
  try {
    row = db.prepare(`
      SELECT illustrator FROM "Card"
      WHERE illustrator IS NOT NULL AND illustrator <> ''
      GROUP BY illustrator
      ORDER BY COUNT(*) DESC
      LIMIT 1
    `).get();
  } catch {
    row = null;
  }
  db.close();
  return row?.illustrator ?? null;
}

async function captureRoute(context, route, slug, options = {}) {
  const filename = `${slug}.png`;
  const filepath = path.join(OUT_DIR, filename);
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}${route}`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: filepath, fullPage: options.fullPage ?? false });
    console.log(`  saved ${filename}`);

    if (options.followups) {
      for (const followup of options.followups) {
        try {
          await followup(page, OUT_DIR);
        } catch (err) {
          console.warn(`    follow-up failed for ${slug}: ${err.message}`);
        }
      }
    }
  } catch (error) {
    console.warn(`  failed ${filename}: ${error.message}`);
  } finally {
    await page.close();
  }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  ensureSession();

  const episodeId = findEpisodeWithImageCards();
  const categorySlug = findCategorySlug();
  const artistName = findArtistName();

  console.log(`episode: ${episodeId}`);
  console.log(`category: ${categorySlug}`);
  console.log(`artist: ${artistName}`);

  const browser = await chromium.launch();

  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });

    const settingsRaw = JSON.stringify(BASE_SETTINGS);

    await context.addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: SMOKE_SESSION_TOKEN,
        url: BASE_URL,
        sameSite: "Lax",
      },
      {
        name: SETTINGS_COOKIE_NAME,
        value: encodeURIComponent(settingsRaw),
        url: BASE_URL,
        sameSite: "Lax",
      },
    ]);

    await context.addInitScript(
      ({ key, raw }) => {
        window.localStorage.setItem(key, raw);
      },
      { key: SETTINGS_STORAGE_KEY, raw: settingsRaw }
    );

    const routes = [
      { route: "/", slug: "01-home" },
      { route: "/wants", slug: "02-wants" },
      { route: "/expansions", slug: "03-expansions" },
      { route: "/movers", slug: "04-movers" },
      { route: "/movers/cheap-high-rarity", slug: "05-movers-cheap" },
      { route: "/movers/discount-watch", slug: "06-movers-discount" },
      { route: "/categories", slug: "07-categories" },
      { route: "/illustrators", slug: "08-illustrators" },
      { route: "/deals", slug: "09-deals" },
      { route: "/search?q=pikachu", slug: "10-search-pikachu" },
      { route: "/search", slug: "11-search-empty" },
      { route: "/settings", slug: "12-settings" },
      { route: "/account", slug: "13-account" },
      { route: "/one-piece", slug: "14-one-piece" },
      { route: "/one-piece/expansions", slug: "15-one-piece-expansions" },
    ];

    if (episodeId) {
      routes.push({ route: `/expansions/${episodeId}`, slug: "16-expansion-detail" });
    }
    if (categorySlug) {
      routes.push({ route: `/categories/${categorySlug}`, slug: "17-category-detail" });
    }
    if (artistName) {
      routes.push({
        route: `/illustrators/${encodeURIComponent(artistName)}`,
        slug: "18-illustrator-detail",
      });
    }

    // Logged-out routes
    routes.push(
      { route: "/login", slug: "19-login", logout: true },
      { route: "/register", slug: "20-register", logout: true },
      { route: "/forgot-password", slug: "21-forgot-password", logout: true }
    );

    for (const item of routes) {
      const useContext = item.logout
        ? await browser.newContext({
            viewport: { width: 390, height: 844 },
            deviceScaleFactor: 1,
            isMobile: true,
            hasTouch: true,
          })
        : context;

      await captureRoute(useContext, item.route, item.slug);

      if (item.logout) await useContext.close();
    }

    // Capture menu open state
    const menuPage = await context.newPage();
    try {
      await menuPage.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 30000 });
      await menuPage.waitForTimeout(500);
      const moreBtn = menuPage.locator('button[aria-label="Open menu"]');
      if ((await moreBtn.count()) > 0) {
        await moreBtn.first().click();
        await menuPage.waitForTimeout(400);
        await menuPage.screenshot({
          path: path.join(OUT_DIR, "22-mobile-menu-open.png"),
          fullPage: false,
        });
        console.log("  saved 22-mobile-menu-open.png");
      }
    } catch (err) {
      console.warn(`  menu capture failed: ${err.message}`);
    } finally {
      await menuPage.close();
    }

    // Capture search overlay open
    const searchPage = await context.newPage();
    try {
      await searchPage.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 30000 });
      await searchPage.waitForTimeout(500);
      const searchBtn = searchPage.locator('button[aria-label="Open search"]');
      if ((await searchBtn.count()) > 0) {
        await searchBtn.first().click();
        await searchPage.waitForTimeout(400);
        await searchPage.screenshot({
          path: path.join(OUT_DIR, "23-mobile-search-open.png"),
          fullPage: false,
        });
        console.log("  saved 23-mobile-search-open.png");
      }
    } catch (err) {
      console.warn(`  search capture failed: ${err.message}`);
    } finally {
      await searchPage.close();
    }

    // Capture card detail modal on expansion page
    if (episodeId) {
      const cardPage = await context.newPage();
      try {
        await cardPage.goto(`${BASE_URL}/expansions/${episodeId}`, {
          waitUntil: "networkidle",
          timeout: 30000,
        });
        await cardPage.waitForTimeout(800);
        const cardTile = cardPage.locator('main [role="button"]').filter({
          has: cardPage.locator("img"),
        }).first();
        if (await cardTile.count() > 0) {
          await cardTile.scrollIntoViewIfNeeded();
          await cardTile.click();
          await cardPage.waitForTimeout(700);
          await cardPage.screenshot({
            path: path.join(OUT_DIR, "24-card-detail-modal.png"),
            fullPage: false,
          });
          console.log("  saved 24-card-detail-modal.png");
        }
      } catch (err) {
        console.warn(`  card modal capture failed: ${err.message}`);
      } finally {
        await cardPage.close();
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }

  console.log(`\nDone. Output: ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
