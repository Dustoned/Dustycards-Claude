import { expect, test, type Page } from "@playwright/test";
import crypto from "node:crypto";
import * as zlib from "node:zlib";
import Database from "better-sqlite3";

type DisplaySize = "small" | "medium" | "large";

const SETTINGS_STORAGE_KEY = "dustycards-settings";
const SETTINGS_COOKIE_NAME = "dustycards-settings";
const SESSION_COOKIE_NAME = "dustycards-session";
const BASE_URL = `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3000"}`;
const SMOKE_USER_ID = "playwright-smoke-admin";
const SMOKE_USER_EMAIL = "playwright-smoke-admin@example.test";
const SMOKE_SESSION_ID = "playwright-smoke-session";
const SMOKE_SESSION_TOKEN = "playwright-smoke-session-token";
let activeSessionIds: string[] = [];

const baseSettings = {
  theme: "system",
  widescreen: false,
  uiScale: "medium" as DisplaySize,
  mobileUiScale: "small" as DisplaySize,
  autoPriceRefresh: true,
  binderWatchMinPrice: 50,
  defaultView: "grid",
  mobileDefaultView: "grid",
  cardSize: "medium" as DisplaySize,
  mobileCardSize: "small" as DisplaySize,
  defaultRarities: [],
  defaultSupertypes: [],
  showOnlyPriced: false,
  primaryPriceSource: "cm_en",
  sortBy: "number",
  sortDir: "asc",
  modalSize: "medium" as DisplaySize,
  mobileModalSize: "small" as DisplaySize,
  card3dSize: "medium" as DisplaySize,
  mobileCard3dSize: "small" as DisplaySize,
};

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isoDate(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function openDb() {
  return new Database("dustycards.db");
}

function createAuthenticatedSmokeSession(): { id: string; token: string } {
  const db = openDb();
  const now = isoDate();

  db.prepare(`
    INSERT INTO "User" (
      id,
      email,
      password_hash,
      role,
      disabled,
      email_verified_at,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, 'admin', 0, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      role = 'admin',
      disabled = 0,
      email_verified_at = excluded.email_verified_at,
      updated_at = excluded.updated_at
  `).run(SMOKE_USER_ID, SMOKE_USER_EMAIL, "smoke-test-password-hash", now, now, now);

  const user = db.prepare<{ email: string }, { id: string }>(
    `SELECT id FROM "User" WHERE email = @email`
  ).get({ email: SMOKE_USER_EMAIL });
  if (!user) {
    db.close();
    throw new Error("Could not create smoke test user");
  }

  const token = SMOKE_SESSION_TOKEN;
  const id = SMOKE_SESSION_ID;

  db.prepare(`
    INSERT INTO "Session" (id, user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      user_id = excluded.user_id,
      token_hash = excluded.token_hash,
      expires_at = excluded.expires_at,
      created_at = excluded.created_at
  `).run(id, user.id, hashToken(token), isoDate(60 * 60 * 1000), now);
  db.close();

  return { id, token };
}

function cleanupSmokeSessions(sessionIds: string[]) {
  const uniqueSessionIds = [...new Set(sessionIds)];
  if (uniqueSessionIds.length === 0) return;
  const db = openDb();
  const placeholders = uniqueSessionIds.map(() => "?").join(",");
  db.prepare(`DELETE FROM "Session" WHERE id IN (${placeholders})`).run(...uniqueSessionIds);
  db.close();
}

function findEpisodeWithImageCards(): string | null {
  const db = openDb();
  const row = db.prepare<[], { episode_id: string }>(`
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

async function applyDisplaySettings(
  page: Page,
  settings: Partial<typeof baseSettings>
) {
  const nextSettings = { ...baseSettings, ...settings };
  const rawSettings = JSON.stringify(nextSettings);

  await page.context().addCookies([
    {
      name: SETTINGS_COOKIE_NAME,
      value: encodeURIComponent(rawSettings),
      url: BASE_URL,
      sameSite: "Lax",
    },
  ]);

  await page.addInitScript(
    ({ key, raw }) => {
      window.localStorage.setItem(key, raw);
    },
    { key: SETTINGS_STORAGE_KEY, raw: rawSettings }
  );

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await page.request.put("/api/account/settings", {
        data: { settings: nextSettings },
      });

      if (response.ok()) {
        return;
      }

      lastError = new Error(
        `Settings update failed with ${response.status()}: ${await response.text()}`
      );
    } catch (error) {
      lastError = error;
    }

    await page.waitForTimeout(250);
  }

  throw lastError;
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
  );
  expect(hasHorizontalOverflow).toBe(false);
}

async function expectCanvasHasPixels(page: Page) {
  const screenshot = await page.locator("canvas").first().screenshot();
  const sample = samplePng(screenshot);
  expect(sample.visiblePixels).toBeGreaterThan(24);
}

function samplePng(buffer: Buffer) {
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Canvas screenshot is not a PNG");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    offset += 4;
    const type = buffer.subarray(offset, offset + 4).toString("ascii");
    offset += 4;
    const data = buffer.subarray(offset, offset + length);
    offset += length + 4;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!width || !height || !channels) {
    throw new Error(`Unsupported PNG for canvas screenshot: ${width}x${height}, type ${colorType}`);
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * channels);
  let rawOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset++];
    const rowStart = y * stride;

    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? pixels[rowStart + x - channels] : 0;
      const up = y > 0 ? pixels[rowStart - stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[rowStart - stride + x - channels] : 0;
      let value = raw[rawOffset++];

      if (filter === 1) {
        value = (value + left) & 255;
      } else if (filter === 2) {
        value = (value + up) & 255;
      } else if (filter === 3) {
        value = (value + Math.floor((left + up) / 2)) & 255;
      } else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value = (value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 255;
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG filter ${filter}`);
      }

      pixels[rowStart + x] = value;
    }
  }

  let visiblePixels = 0;
  const stepX = Math.max(1, Math.floor(width / 40));
  const stepY = Math.max(1, Math.floor(height / 40));

  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const index = (y * width + x) * channels;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const a = channels === 4 ? pixels[index + 3] : 255;
      if (a > 0 && Math.max(r, g, b) > 28) {
        visiblePixels += 1;
      }
    }
  }

  return { width, height, visiblePixels };
}

test.describe("DustyCards smoke", () => {
  test.beforeEach(async ({ context }) => {
    const session = createAuthenticatedSmokeSession();
    activeSessionIds.push(session.id);

    await context.addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: session.token,
        url: BASE_URL,
        sameSite: "Lax",
      },
    ]);
  });

  test.afterEach(() => {
    cleanupSmokeSessions(activeSessionIds);
    activeSessionIds = [];
  });

  test("core pages render without scraper requests", async ({ page }) => {
    for (const path of ["/", "/wants", "/settings", "/movers", "/expansions"]) {
      await page.goto(path);
      await expect(page.locator("body")).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Application error");
    }
  });

  test("settings shows background refresh status", async ({ page }) => {
    await page.goto("/settings");

    await expect(page.getByText("Background Price Refresh", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Scraper Requests", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Known Unavailable", { exact: true }).first()).toBeVisible();
  });

  test("settings mobile layout does not overflow horizontally", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByText("Automation", { exact: true })).toBeVisible();
    await expect(page.getByText("Sync Status", { exact: true })).toBeVisible();

    await expectNoHorizontalOverflow(page);
  });

  test("mobile header search opens in the top bar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await page.evaluate(() => window.scrollTo(0, 900));
    const headerBox = await page.locator("[data-app-header]").boundingBox();
    expect(headerBox?.y ?? Number.NaN).toBeGreaterThanOrEqual(-1);
    expect(headerBox?.y ?? Number.NaN).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "Open search" }).click();
    const headerSearch = page.getByPlaceholder("Search cards...");
    await expect(headerSearch).toBeVisible();

    await headerSearch.fill("pikachu");
    await expect(page).toHaveURL(/\/search\?q=pikachu/);
    await expect(page.getByPlaceholder("Search name, set code, card number...")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    await headerSearch.fill("");
    await expect(page).toHaveURL(`${BASE_URL}/`);
  });

  test("mobile menu closes when tapping outside the menu", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("menu", { name: "Main navigation" })).toBeVisible();

    await page.mouse.click(360, 760);

    await expect(page.getByRole("menu", { name: "Main navigation" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  });

  test("mobile collection add dialogs stay fixed in the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    await page.getByRole("button", { name: "Add Binder" }).click();
    const binderDialog = page.locator('[data-create-binder-modal="true"]');
    await expect(binderDialog).toBeVisible();
    const binderBox = await binderDialog.boundingBox();
    expect(binderBox).not.toBeNull();
    expect(binderBox?.y ?? Number.NaN).toBeGreaterThanOrEqual(-1);
    expect((binderBox?.y ?? 0) + (binderBox?.height ?? 0)).toBeLessThanOrEqual(844 + 2);
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "Close create binder" }).click();
  });

  test("mobile add card dialog opens as a fixed sheet", async ({ page }) => {
    const episodeId = findEpisodeWithImageCards();
    if (!episodeId) {
      test.skip(true, "No cards with images are available in this local database.");
      return;
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await applyDisplaySettings(page, {
      mobileUiScale: "small",
      mobileCardSize: "small",
      mobileModalSize: "small",
      mobileCard3dSize: "small",
      mobileDefaultView: "grid",
    });
    await page.goto(`/expansions/${episodeId}`);

    const addButtons = page.locator('main button[aria-label^="Add "][aria-label$=" to collection"]');
    await expect(addButtons.first()).toBeVisible();
    const addButton = (await addButtons.count()) > 5 ? addButtons.nth(5) : addButtons.first();
    await addButton.scrollIntoViewIfNeeded();
    await addButton.click();

    const addDialog = page.locator('[data-collection-add-modal="true"]');
    await expect(addDialog).toBeVisible();
    const addDialogBox = await addDialog.boundingBox();
    expect(addDialogBox).not.toBeNull();
    expect(addDialogBox?.y ?? Number.NaN).toBeGreaterThanOrEqual(-1);
    expect((addDialogBox?.y ?? 0) + (addDialogBox?.height ?? 0)).toBeLessThanOrEqual(844 + 2);
    await expectNoHorizontalOverflow(page);
  });

  test("account settings load in a fresh browser context", async ({ page, browser }) => {
    await applyDisplaySettings(page, {
      cardSize: "large",
      modalSize: "small",
      uiScale: "large",
      widescreen: true,
    });

    const freshSession = createAuthenticatedSmokeSession();
    activeSessionIds.push(freshSession.id);
    const freshContext = await browser.newContext({ baseURL: BASE_URL });

    try {
      await freshContext.addCookies([
        {
          name: SESSION_COOKIE_NAME,
          value: freshSession.token,
          url: BASE_URL,
          sameSite: "Lax",
        },
      ]);

      const freshPage = await freshContext.newPage();
      await freshPage.goto("/settings");

      await expect
        .poll(() => freshPage.evaluate(() => document.documentElement.dataset.uiScale))
        .toBe("large");
      await expect
        .poll(() =>
          freshPage.evaluate((key) => {
            const raw = window.localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
          }, SETTINGS_STORAGE_KEY)
        )
        .toMatchObject({
          cardSize: "large",
          modalSize: "small",
          uiScale: "large",
          widescreen: true,
        });
    } finally {
      await freshContext.close();
    }
  });

  test("mobile display settings load in a fresh phone context", async ({ page, browser }) => {
    await applyDisplaySettings(page, {
      cardSize: "large",
      modalSize: "large",
      uiScale: "large",
      widescreen: true,
      mobileUiScale: "small",
      mobileCardSize: "small",
      mobileModalSize: "small",
      mobileCard3dSize: "small",
      mobileDefaultView: "grid",
    });

    const freshSession = createAuthenticatedSmokeSession();
    activeSessionIds.push(freshSession.id);
    const freshContext = await browser.newContext({
      baseURL: BASE_URL,
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });

    try {
      await freshContext.addCookies([
        {
          name: SESSION_COOKIE_NAME,
          value: freshSession.token,
          url: BASE_URL,
          sameSite: "Lax",
        },
      ]);

      const freshPage = await freshContext.newPage();
      await freshPage.goto("/settings");

      await expect(freshPage.getByText("Mobile Display", { exact: true })).toBeVisible();
      await expect
        .poll(() => freshPage.evaluate(() => document.documentElement.dataset.uiScale))
        .toBe("small");
      await expect
        .poll(() =>
          freshPage.evaluate((key) => {
            const raw = window.localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
          }, SETTINGS_STORAGE_KEY)
        )
        .toMatchObject({
          mobileUiScale: "small",
          mobileCardSize: "small",
          mobileModalSize: "small",
          mobileCard3dSize: "small",
          mobileDefaultView: "grid",
        });
      await expectNoHorizontalOverflow(freshPage);
    } finally {
      await freshContext.close();
    }
  });

  test("card and detail size settings keep core layouts within the viewport", async ({ page }) => {
    test.setTimeout(180_000);

    const viewports = [
      { width: 360, height: 800 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ];
    const displaySettings = [
      { cardSize: "small" as const, modalSize: "small" as const, uiScale: "small" as const, widescreen: false },
      { cardSize: "medium" as const, modalSize: "medium" as const, uiScale: "medium" as const, widescreen: false, mobileCardSize: "small" as const, mobileModalSize: "small" as const, mobileUiScale: "small" as const },
      { cardSize: "large" as const, modalSize: "large" as const, uiScale: "large" as const, widescreen: true, mobileCardSize: "small" as const, mobileModalSize: "small" as const, mobileUiScale: "small" as const },
    ];
    const routes = ["/", "/wants", "/search?q=pikachu", "/expansions", "/movers", "/settings"];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);

      for (const settings of displaySettings) {
        await applyDisplaySettings(page, settings);

        for (const route of routes) {
          await page.goto(route);
          await expect(page.locator("body")).toBeVisible();
          await expect(page.locator("body")).not.toContainText("Application error");
          await expectNoHorizontalOverflow(page);
        }
      }
    }
  });

  test("mobile expansion grid and 3D viewer stay compact", async ({ browser, page }) => {
    test.setTimeout(180_000);

    const episodeId = findEpisodeWithImageCards();
    if (!episodeId) {
      test.skip(true, "No cards with images are available in this local database.");
      return;
    }

    await applyDisplaySettings(page, {
      cardSize: "large",
      modalSize: "large",
      uiScale: "large",
      widescreen: true,
      mobileUiScale: "small",
      mobileCardSize: "small",
      mobileModalSize: "small",
      mobileCard3dSize: "small",
      mobileDefaultView: "grid",
    });

    for (const viewport of [
      { width: 360, height: 800 },
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ]) {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        viewport,
        isMobile: viewport.width <= 640,
      });

      const session = createAuthenticatedSmokeSession();
      activeSessionIds.push(session.id);
      await context.addCookies([
        {
          name: SESSION_COOKIE_NAME,
          value: session.token,
          url: BASE_URL,
          sameSite: "Lax",
        },
      ]);

      try {
        const checkPage = await context.newPage();
        await checkPage.goto(`/expansions/${episodeId}`);
        await checkPage.waitForLoadState("networkidle").catch(() => undefined);
        await expectNoHorizontalOverflow(checkPage);

        const cardTiles = checkPage.locator('main [role="button"]').filter({
          has: checkPage.locator("img"),
        });
        await expect(cardTiles.first()).toBeVisible();
        await cardTiles.first().scrollIntoViewIfNeeded();

        if (viewport.width <= 640) {
          await expect
            .poll(() => checkPage.evaluate(() => document.documentElement.dataset.uiScale))
            .toBe("small");

          const visibleCardTiles = await checkPage.evaluate(() =>
            Array.from(document.querySelectorAll('main [role="button"]')).filter((element) => {
              const rect = element.getBoundingClientRect();
              return (
                element.querySelector("img") &&
                rect.width >= 80 &&
                rect.height >= 110 &&
                rect.top >= 0 &&
                rect.top < window.innerHeight
              );
            }).length
          );
          expect(visibleCardTiles).toBeGreaterThanOrEqual(3);
        }

        await cardTiles.first().click();
        const dialog = checkPage.locator('[role="dialog"]').first();
        await expect(dialog).toBeVisible();
        await expectNoHorizontalOverflow(checkPage);

        const dialogBox = await dialog.boundingBox();
        expect(dialogBox?.width ?? 0).toBeLessThanOrEqual(viewport.width + 2);

        const openThreeDButton = checkPage
          .locator('button[aria-label^="Open "][aria-label$=" in 3D"]')
          .first();
        await expect(openThreeDButton).toBeVisible();
        await checkPage.waitForTimeout(500);
        await openThreeDButton.click({ position: { x: 24, y: 24 } });
        await expect(checkPage.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
        await checkPage.waitForTimeout(1_000);
        await expectNoHorizontalOverflow(checkPage);
        await expectCanvasHasPixels(checkPage);

        const detailsBox = await checkPage.locator('[data-three-details="true"]').boundingBox();
        expect(detailsBox).not.toBeNull();
        expect((detailsBox?.x ?? 0) + (detailsBox?.width ?? 0)).toBeLessThanOrEqual(
          viewport.width + 2
        );
        expect((detailsBox?.y ?? 0) + (detailsBox?.height ?? 0)).toBeLessThanOrEqual(
          viewport.height + 2
        );
      } finally {
        await context.close();
      }
    }
  });

  test("settings exposes no-scraper mode when the test server has it enabled", async ({ page }) => {
    await page.goto("/settings");

    const disabledNotice = page.getByText("Scraper requests are disabled by").first();
    if (!(await disabledNotice.isVisible().catch(() => false))) {
      test.skip(true, "Existing dev server was reused without no-scraper mode.");
    }

    await expect(disabledNotice).toBeVisible();
    await expect(page.getByRole("button", { name: "Sync Expansions" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Sync Card History" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Sync Sealed Products" })).toBeDisabled();
  });

  test("movers secondary views render", async ({ page }) => {
    for (const path of ["/movers/cheap-high-rarity", "/movers/discount-watch"]) {
      await page.goto(path);
      await expect(page.locator("body")).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Application error");
    }
  });

  test("movers can open a card detail modal when data is available", async ({ page }) => {
    await page.goto("/movers");

    const cardButton = page.locator('[role="button"][aria-label^="Open details for"]').first();

    if ((await cardButton.count()) === 0) {
      test.skip(true, "No mover cards available in this local database.");
    }

    await cardButton.click();
    await expect(page.locator('[role="dialog"]').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
