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

function findPokemonEpisodeWithImageCards(): string | null {
  const db = openDb();
  const row = db.prepare<[], { episode_id: string }>(`
    SELECT c.episode_id
    FROM "Card" c
    JOIN "Episode" e ON e.id = c.episode_id
    WHERE c.image_url IS NOT NULL
      AND c.image_url <> ''
      AND e.game = 'pokemon'
    GROUP BY c.episode_id
    ORDER BY COUNT(*) DESC
    LIMIT 1
  `).get();
  db.close();

  return row?.episode_id ?? null;
}

function findSealedProductWithCards(): {
  id: string;
  episode_id: string;
  name: string;
} | null {
  const db = openDb();
  const row = db.prepare<[], { id: string; episode_id: string; name: string }>(`
    SELECT sp.id, sp.episode_id, sp.name
    FROM "SealedProduct" sp
    WHERE sp.image_url IS NOT NULL
      AND sp.image_url <> ''
      AND EXISTS (
        SELECT 1
        FROM "Card" c
        WHERE c.episode_id = sp.episode_id
          AND c.image_url IS NOT NULL
          AND c.image_url <> ''
      )
    ORDER BY (
      SELECT COUNT(*)
      FROM "Card" c
      WHERE c.episode_id = sp.episode_id
    ) DESC
    LIMIT 1
  `).get();
  db.close();

  return row ?? null;
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

async function openSettingsTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name, exact: true });
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
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
    await openSettingsTab(page, "Sync");

    await expect(page.getByRole("heading", { name: "Sync Control Center" })).toBeVisible();
    await expect(page.getByText("Background Price Refresh", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sync Automation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Check Known Unavailable" })).toBeVisible();
  });

  test("settings mobile layout does not overflow horizontally", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Preferences" })).toBeVisible();
    await expect(page.getByText("Phone overrides", { exact: true })).toBeVisible();
    await expect(page.getByText("Default view", { exact: true })).toBeVisible();

    await expectNoHorizontalOverflow(page);
  });

  test("admin users and illustrators use progressive master-detail layouts", async ({ page }) => {
    await page.goto("/account");
    await page.getByRole("tab", { name: "Users" }).click();

    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset password..." })).toHaveCount(1);
    await expectNoHorizontalOverflow(page);

    await page.goto("/illustrators");
    const initialIllustrators = page.locator('main a[href^="/illustrators/"]');
    await expect(initialIllustrators).toHaveCount(24);
    await expect(page.getByRole("button", { name: /Load more illustrators/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("authenticated navigation covers tablet widths and clears the mobile bottom bar", async ({ page }) => {
    await page.setViewportSize({ width: 767, height: 900 });
    await page.goto("/settings");

    const headerMenu = page.getByRole("button", { name: "Open menu" });
    const bottomNav = page.locator("[data-mobile-bottom-nav]");
    const sidebar = page.locator("aside").first();

    await expect(bottomNav).toBeVisible();
    await expect(headerMenu).toBeHidden();
    await expect(sidebar).toBeHidden();
    const mobileMainPadding = await page.locator("main").evaluate((element) =>
      Number.parseFloat(window.getComputedStyle(element).paddingBottom)
    );
    expect(mobileMainPadding).toBeGreaterThanOrEqual(90);

    await page.setViewportSize({ width: 768, height: 900 });
    await expect(bottomNav).toBeHidden();
    await expect(headerMenu).toBeVisible();
    await expect(sidebar).toBeHidden();
    const brandBox = await page.getByRole("link", { name: "DustyCards" }).boundingBox();
    const menuBox = await headerMenu.boundingBox();
    const compactSearchBox = await page.getByRole("button", { name: "Open search" }).boundingBox();
    expect(brandBox).not.toBeNull();
    expect(menuBox).not.toBeNull();
    expect(compactSearchBox).not.toBeNull();
    expect(menuBox?.x ?? 0).toBeGreaterThan((brandBox?.x ?? 0) + (brandBox?.width ?? 0));
    expect(compactSearchBox?.x ?? 0).toBeGreaterThan((menuBox?.x ?? 0) + (menuBox?.width ?? 0));
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 1024, height: 900 });
    const fullSearch = page.getByPlaceholder("Search cards, sealed, expansions...");
    await expect(headerMenu).toBeVisible();
    await expect(fullSearch).toBeVisible();
    const desktopMenuBox = await headerMenu.boundingBox();
    const fullSearchBox = await fullSearch.boundingBox();
    expect(desktopMenuBox).not.toBeNull();
    expect(fullSearchBox).not.toBeNull();
    expect(fullSearchBox?.x ?? 0).toBeGreaterThan(
      (desktopMenuBox?.x ?? 0) + (desktopMenuBox?.width ?? 0)
    );
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 1279, height: 900 });
    await expect(headerMenu).toBeVisible();
    await expect(sidebar).toBeHidden();

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(headerMenu).toBeHidden();
    await expect(sidebar).toBeVisible();
  });

  test("widescreen keeps headers and grids inside one page canvas", async ({ page }) => {
    await page.setViewportSize({ width: 5120, height: 1440 });
    await applyDisplaySettings(page, { widescreen: true, defaultView: "grid" });
    await page.goto("/");

    await expect(page.locator("html")).toHaveClass(/widescreen/);
    const appHeader = page.getByRole("banner");
    const canvas = page.locator("main > .page-container");
    const [headerBounds, bounds] = await Promise.all([
      appHeader.boundingBox(),
      canvas.boundingBox(),
    ]);

    expect(headerBounds).not.toBeNull();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThan(4500);
    expect(Math.abs(bounds!.x - headerBounds!.x)).toBeLessThanOrEqual(1);
    expect(
      Math.abs(bounds!.x + bounds!.width - (headerBounds!.x + headerBounds!.width))
    ).toBeLessThanOrEqual(1);
    await expectNoHorizontalOverflow(page);

    await page.goto("/search?q=pikachu");
    const detailCanvas = page.locator("main > .page-container");
    const cardGrid = page.locator(".dc-wide-grid-zone").first();
    await expect(cardGrid).toBeVisible({ timeout: 15_000 });
    const detailBounds = await detailCanvas.boundingBox();
    const gridBounds = await cardGrid.boundingBox();

    expect(detailBounds).not.toBeNull();
    expect(gridBounds).not.toBeNull();
    expect(gridBounds!.x).toBeGreaterThanOrEqual(detailBounds!.x - 1);
    expect(gridBounds!.x + gridBounds!.width).toBeLessThanOrEqual(
      detailBounds!.x + detailBounds!.width + 1
    );
    const cardBounds = await cardGrid.locator(":scope > [role='button']").evaluateAll((cards) =>
      cards.map((card) => {
        const bounds = card.getBoundingClientRect();
        return { x: bounds.x, y: bounds.y, width: bounds.width };
      })
    );
    const firstRowY = Math.min(...cardBounds.map((card) => card.y));
    const firstRowCards = cardBounds
      .filter((card) => Math.abs(card.y - firstRowY) <= 2)
      .sort((left, right) => left.x - right.x);
    expect(firstRowCards.length).toBeGreaterThan(2);
    expect(Math.abs(firstRowCards[0]!.x - gridBounds!.x)).toBeLessThanOrEqual(2);
    const lastCard = firstRowCards.at(-1)!;
    expect(
      Math.abs(lastCard.x + lastCard.width - (gridBounds!.x + gridBounds!.width))
    ).toBeLessThanOrEqual(2);
    await expectNoHorizontalOverflow(page);
  });

  test("card detail uses an aligned responsive workspace", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await applyDisplaySettings(page, { widescreen: true, modalSize: "medium" });
    await page.route("**/api/cards/*/signal-preview", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "Simulated preview failure" }),
      });
    });
    await page.goto("/search?q=pikachu");

    const firstCard = page.locator(".dc-wide-grid-zone [role='button']").first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    await firstCard.click();

    const dialog = page.getByRole("dialog");
    const detailGrid = dialog.locator(".card-modal-layout-grid");
    await expect(detailGrid).toBeVisible({ timeout: 15_000 });
    const desktopMarketSignal = detailGrid.locator(
      "[data-card-market-stats][data-signal-summary-panel]"
    );
    await expect(desktopMarketSignal).toHaveCount(1);
    await expect(desktopMarketSignal).toBeVisible();
    await expect(desktopMarketSignal).toContainText("DustyCards Market Score");
    await expect(desktopMarketSignal).toContainText("Signal summary");
    await expect(
      desktopMarketSignal.getByRole("button", { name: /^Momentum:/ })
    ).toBeVisible();
    await expect(desktopMarketSignal).toHaveAttribute("data-signal-source", "market");
    const desktopMarketDetails = desktopMarketSignal.locator("details");
    await expect(desktopMarketDetails).not.toHaveAttribute("open", "");
    await desktopMarketSignal.getByText("More market details", { exact: true }).click();
    await expect(desktopMarketDetails).toHaveAttribute("open", "");
    await expect(desktopMarketDetails).toContainText("Graded vs raw");
    await desktopMarketSignal.getByText("More market details", { exact: true }).click();

    const preview = detailGrid.locator(".card-modal-area-preview");
    const hero = detailGrid.locator(".card-modal-area-hero");
    const history = detailGrid.locator(".card-modal-area-history");
    const [previewBounds, heroBounds, historyBounds] = await Promise.all([
      preview.boundingBox(),
      hero.boundingBox(),
      history.boundingBox(),
    ]);

    expect(previewBounds).not.toBeNull();
    expect(heroBounds).not.toBeNull();
    expect(historyBounds).not.toBeNull();
    expect(previewBounds!.x).toBeLessThan(heroBounds!.x);
    expect(heroBounds!.x).toBeLessThan(historyBounds!.x);
    expect(heroBounds!.x - (previewBounds!.x + previewBounds!.width)).toBeLessThanOrEqual(180);
    expect(Math.abs(heroBounds!.y - historyBounds!.y)).toBeLessThanOrEqual(2);
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 1280, height: 900 });
    const compactPreviewBounds = await preview.boundingBox();
    const compactHeroBounds = await hero.boundingBox();
    const compactHistoryBounds = await history.boundingBox();
    expect(compactPreviewBounds).not.toBeNull();
    expect(compactHeroBounds).not.toBeNull();
    expect(compactHistoryBounds).not.toBeNull();
    expect(compactPreviewBounds!.x).toBeLessThan(compactHeroBounds!.x);
    expect(Math.abs(compactHistoryBounds!.x - compactHeroBounds!.x)).toBeLessThanOrEqual(2);
    expect(compactHistoryBounds!.y).toBeGreaterThan(compactHeroBounds!.y);
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 768, height: 900 });
    const tabletPreviewBounds = await preview.boundingBox();
    const tabletHeroBounds = await hero.boundingBox();
    expect(tabletPreviewBounds).not.toBeNull();
    expect(tabletHeroBounds).not.toBeNull();
    expect(tabletPreviewBounds!.x).toBeLessThan(tabletHeroBounds!.x);
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(detailGrid).toBeHidden();
    await expect(dialog).toHaveAttribute("data-mobile-showcase", "true");
    const mobileMarketSignal = dialog.locator(
      ".md\\:hidden [data-card-market-stats][data-signal-summary-panel]"
    );
    await expect(mobileMarketSignal).toHaveCount(1);
    await expect(mobileMarketSignal).toBeVisible();
    await expect(mobileMarketSignal).toContainText("DustyCards Market Score");
    await expect(mobileMarketSignal).toContainText("Signal summary");
    await mobileMarketSignal.getByRole("button", { name: /^Momentum:/ }).click();
    await expect(mobileMarketSignal.getByRole("tooltip")).toContainText(
      "Price direction from saved"
    );
    await expect(mobileMarketSignal).toHaveAttribute("data-signal-source", "market");
    await expectNoHorizontalOverflow(page);
  });

  test("sealed detail aligns left and embeds featured set cards", async ({ page }) => {
    const sealedProduct = findSealedProductWithCards();
    expect(sealedProduct).not.toBeNull();
    if (!sealedProduct) return;

    const detailResponse = await page.request.get(`/api/sealed/${sealedProduct.id}`);
    expect(detailResponse.ok()).toBe(true);
    const detail = (await detailResponse.json()) as {
      release_date: string | null;
      episode: { release_date: string | null };
      featured_cards: Array<{
        id: string;
        name: string;
        market_price: number | null;
        rarity: string | null;
        pull_rate_info: unknown | null;
      }>;
    };
    expect(detail.featured_cards.length).toBeGreaterThan(0);
    expect(detail.featured_cards.length).toBeLessThanOrEqual(24);
    expect(detail.featured_cards.some((card) => card.rarity != null)).toBe(true);
    expect(detail.episode.release_date).not.toBeNull();

    await page.setViewportSize({ width: 1920, height: 1080 });
    await applyDisplaySettings(page, { widescreen: true });
    await page.goto(`/expansions/${sealedProduct.episode_id}?tab=sealed`);

    const productTile = page.locator("[role='button']").filter({ hasText: sealedProduct.name }).first();
    await expect(productTile).toBeVisible({ timeout: 15_000 });
    await productTile.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Product release|Set release/)).toBeVisible();
    const backButton = dialog.getByRole("button", { name: "Back to Collection" });
    const [dialogBounds, backBounds] = await Promise.all([
      dialog.boundingBox(),
      backButton.boundingBox(),
    ]);
    expect(dialogBounds).not.toBeNull();
    expect(backBounds).not.toBeNull();
    expect(backBounds!.x - dialogBounds!.x).toBeLessThanOrEqual(40);

    await expect(dialog.getByRole("heading", { name: "Featured Cards" })).toBeVisible();
    await expect(dialog.locator("[data-featured-card]")).toHaveCount(detail.featured_cards.length);
    await expect(dialog.getByRole("tab")).toHaveCount(0);
    const desktopModalHeight = await dialog.evaluate((element) => element.scrollHeight);
    expect(desktopModalHeight).toBeLessThanOrEqual(1082);
    await expectNoHorizontalOverflow(page);

    await dialog.locator("[data-featured-card]").first().click();
    const dialogs = page.getByRole("dialog");
    await expect(dialogs).toHaveCount(2);
    await expect(dialogs.last()).toHaveAttribute("aria-label", detail.featured_cards[0]!.name);
    await dialogs.last().getByRole("button", { name: "Back to Collection" }).click();
    await expect(dialogs).toHaveCount(1);

    await page.setViewportSize({ width: 5120, height: 1440 });
    const ultrawideFeaturedCard = await dialog.locator("[data-featured-card]").first().boundingBox();
    expect(ultrawideFeaturedCard).not.toBeNull();
    expect(ultrawideFeaturedCard!.width).toBeLessThanOrEqual(194);
    const visibleUltrawideCards = await dialog.locator("[data-featured-card]").evaluateAll((cards) =>
      cards.filter((card) => window.getComputedStyle(card).display !== "none").length
    );
    expect(visibleUltrawideCards).toBe(24);
    const ultrawideModalHeight = await dialog.evaluate((element) => element.scrollHeight);
    expect(ultrawideModalHeight).toBeLessThanOrEqual(1442);
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(dialog.locator("[data-sealed-featured-cards]")).toBeVisible();
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
    await expect(page).toHaveURL(`${BASE_URL}/search`);
    await expect(headerSearch).toBeVisible();

    await headerSearch.fill("charizard");
    await expect(page).toHaveURL(/\/search\?q=charizard/);
  });

  test("mobile menu closes when tapping outside the menu", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await page.getByRole("button", { name: "More" }).click();
    await expect(page.locator("[data-mobile-more-sheet]")).toBeVisible();

    await page.locator("[data-mobile-more-backdrop]").click({ position: { x: 4, y: 4 } });

    await expect(page.locator("[data-mobile-more-sheet]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "More" })).toBeVisible();
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
    const episodeId = findPokemonEpisodeWithImageCards();
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

      await expect(freshPage.getByText("Phone overrides", { exact: true })).toBeVisible();
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

    const episodeId = findPokemonEpisodeWithImageCards();
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
        isMobile: viewport.width <= 767,
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

        if (viewport.width <= 767) {
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

        const openThreeDButton = dialog
          .locator('button[aria-label^="Open "][aria-label$=" in 3D"]')
          .filter({ visible: true })
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
    await openSettingsTab(page, "Sync");

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

  test("sealed market shows the upcoming release watch without overflow", async ({ page }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/movers?scope=sealed");

      const releaseWatch = page.getByRole("region", { name: "Upcoming sealed releases" });
      await expect(releaseWatch).toBeVisible();
      await expect(
        releaseWatch.getByRole("heading", { name: "Upcoming sealed products" })
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);

      const releaseCards = releaseWatch.locator("article");
      if ((await releaseCards.count()) > 0) {
        await expect(releaseCards.first()).toContainText(/days|Today/);
        const showAllButton = releaseWatch.getByRole("button", { name: /Show all \d+ products/ });
        if ((await showAllButton.count()) > 0) {
          await showAllButton.click();
          expect(await releaseCards.count()).toBeGreaterThan(12);
          await expectNoHorizontalOverflow(page);
        }
      } else {
        await expect(releaseWatch).toContainText("No confirmed upcoming products yet");
      }
    }
  });

  test("movers can open a card detail modal when data is available", async ({ page }) => {
    await page.goto("/movers");

    const cardButton = page.locator('[role="button"][aria-label^="Open details for"]').first();

    if ((await cardButton.count()) === 0) {
      test.skip(true, "No mover cards available in this local database.");
    }

    await cardButton.click();
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
