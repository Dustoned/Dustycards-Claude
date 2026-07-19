import { expect, test, type Locator, type Page } from "@playwright/test";
import crypto from "node:crypto";
import * as zlib from "node:zlib";
import Database from "better-sqlite3";

type DisplaySize = "small" | "medium" | "large";

const SETTINGS_STORAGE_KEY = "dustycards-settings";
const SETTINGS_COOKIE_NAME = "dustycards-settings";
const SESSION_COOKIE_NAME = "dustycards-session";
const BASE_URL = `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3000"}`;
const CARD_DETAIL_SCREENSHOT_DIR = process.env.CARD_DETAIL_SCREENSHOT_DIR?.trim() || null;
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
  return new Database(process.env.DUSTYCARDS_DATABASE_PATH ?? "dustycards.db");
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

async function expectNoHorizontalOverflow(page: Page, shell?: Locator) {
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
  );
  expect(hasHorizontalOverflow).toBe(false);

  if (shell) {
    const overflows = await shell.evaluate((element) => {
      const regions = [
        element,
        element.querySelector("[data-card-detail-canvas]"),
        element.querySelector('[data-card-detail-region="identity"]'),
        element.querySelector('[data-card-detail-region="chart"]'),
        element.querySelector('[data-card-detail-region="panel"]'),
      ].filter((region): region is HTMLElement => region instanceof HTMLElement);
      return regions.map((region) => ({
        name:
          region.getAttribute("data-card-detail-region") ??
          (region.hasAttribute("data-card-detail-canvas") ? "canvas" : "shell"),
        overflow: region.scrollWidth - region.clientWidth,
      }));
    });
    for (const measurement of overflows) {
      expect(measurement.overflow, `${measurement.name} horizontal overflow`).toBeLessThanOrEqual(2);
    }
  }
}

async function requiredBounds(locator: Locator) {
  await expect(locator).toBeVisible();
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  return bounds!;
}

async function expectSingleHeroGradeSelector(shell: Locator): Promise<Locator> {
  const marketControls = shell.locator('[data-card-detail-market-mode="graded"]');
  const modeControl = marketControls.locator(":scope > div").first();
  const gradeControl = marketControls.locator("[data-card-detail-grade-control]");
  const gradeSelector = gradeControl.getByRole("combobox", {
    name: "Select graded slab",
    exact: true,
  });

  await expect(marketControls).toBeVisible();
  await expect(gradeControl).toBeVisible();
  await expect(gradeSelector).toBeVisible();
  await expect(
    shell.getByRole("combobox", { name: "Select graded slab", exact: true })
  ).toHaveCount(1);

  const [modeBounds, gradeBounds] = await Promise.all([
    requiredBounds(modeControl),
    requiredBounds(gradeControl),
  ]);
  expect(Math.abs(modeBounds.y - gradeBounds.y)).toBeLessThanOrEqual(2);
  expect(gradeBounds.x).toBeGreaterThanOrEqual(modeBounds.x + modeBounds.width - 2);

  return gradeSelector;
}

async function selectGradeStartingWith(selector: Locator, gradeLabel: string) {
  const options = await selector.locator("option").evaluateAll((elements) =>
    elements.map((element) => ({
      value: (element as HTMLOptionElement).value,
      label: element.textContent?.trim() ?? "",
    }))
  );
  const option = options.find(
    (candidate) =>
      candidate.label === gradeLabel || candidate.label.startsWith(`${gradeLabel} -`)
  );
  expect(option, `Expected a ${gradeLabel} option in the hero grade selector`).toBeDefined();
  await selector.selectOption(option!.value);
}

async function expectSelectedGradeInHistoryChart(
  shell: Locator,
  formattedPrice: string
) {
  const chart = shell.locator('[data-card-detail-region="chart"]');
  const chartImage = chart.getByRole("img", { name: "Historical price", exact: true });
  await expect(chartImage).toBeVisible();
  const bounds = await requiredBounds(chartImage);
  await chartImage.hover({
    position: {
      x: Math.max(1, Math.floor(bounds.width / 2)),
      y: Math.max(1, Math.floor(bounds.height / 2)),
    },
  });
  await expect(chart.getByText(formattedPrice, { exact: true })).toBeVisible();
}

async function resetDetailScroll(shell: Locator) {
  await shell.evaluate((element) => {
    let ancestor = element.parentElement;
    while (ancestor) {
      ancestor.scrollTop = 0;
      ancestor = ancestor.parentElement;
    }
    window.scrollTo(0, 0);
  });
}

async function expectSingleVisibleActionCluster(shell: Locator) {
  await expect(shell.locator('[data-card-detail-actions]:visible')).toHaveCount(1);
}

async function captureCardDetailScreenshot(page: Page, shell: Locator, fileName: string) {
  if (!CARD_DETAIL_SCREENSHOT_DIR) return;
  await resetDetailScroll(shell);
  await page.waitForTimeout(80);
  await page.screenshot({
    path: `${CARD_DETAIL_SCREENSHOT_DIR}/${fileName}`,
    animations: "disabled",
  });
}

async function expectDetailHeroLayout(
  shell: Locator,
  layout: "single" | "double" | "triple"
) {
  await resetDetailScroll(shell);

  const media = shell.locator('[data-card-detail-region="media"]');
  const identity = shell.locator('[data-card-detail-region="identity"]');
  const chart = shell.locator('[data-card-detail-region="chart"]');
  const [mediaBounds, identityBounds, chartBounds] = await Promise.all([
    requiredBounds(media),
    requiredBounds(identity),
    requiredBounds(chart),
  ]);

  if (layout === "single") {
    expect(mediaBounds.y).toBeLessThan(identityBounds.y);
    expect(chartBounds.y).toBeGreaterThan(identityBounds.y + identityBounds.height - 2);
    return;
  }

  expect(mediaBounds.x).toBeLessThan(identityBounds.x);
  expect(Math.abs(mediaBounds.y - identityBounds.y)).toBeLessThanOrEqual(4);

  if (layout === "double") {
    expect(chartBounds.y).toBeGreaterThan(
      Math.max(mediaBounds.y + mediaBounds.height, identityBounds.y + identityBounds.height) - 2
    );
    return;
  }

  expect(identityBounds.x).toBeLessThan(chartBounds.x);
  expect(Math.abs(identityBounds.y - chartBounds.y)).toBeLessThanOrEqual(4);
}

async function expectBoundedCenteredDetailCanvas(shell: Locator) {
  await resetDetailScroll(shell);
  const [shellBounds, canvasBounds] = await Promise.all([
    requiredBounds(shell),
    requiredBounds(shell.locator("[data-card-detail-canvas]")),
  ]);
  const leftInset = canvasBounds.x - shellBounds.x;
  const rightInset =
    shellBounds.x + shellBounds.width - (canvasBounds.x + canvasBounds.width);

  expect(canvasBounds.width).toBeLessThanOrEqual(2306);
  expect(Math.abs(leftInset - rightInset)).toBeLessThanOrEqual(3);
}

async function expectTouchSizedDetailControls(shell: Locator) {
  const controls = shell.locator([
    "[data-card-detail-back]:visible",
    "[data-card-detail-actions]:visible button:visible",
    "[data-card-detail-actions]:visible a:visible",
    "[data-card-detail-actions]:visible summary:visible",
    '[role="tab"]:visible',
    ".card-detail-market-link:visible",
  ].join(", "));
  expect(await controls.count()).toBeGreaterThanOrEqual(6);

  for (let index = 0; index < await controls.count(); index += 1) {
    const bounds = await requiredBounds(controls.nth(index));
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
}

async function expectReadableTooltipWithinViewport(page: Page) {
  const tooltip = page.locator("[data-readable-info-tooltip]:visible");
  await expect(tooltip).toHaveCount(1);
  const bounds = await requiredBounds(tooltip);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(bounds.x).toBeGreaterThanOrEqual(8);
  expect(bounds.y).toBeGreaterThanOrEqual(8);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport!.width - 8);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport!.height - 8);
  const typography = await tooltip.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      fontSize: Number.parseFloat(style.fontSize),
      lineHeight: Number.parseFloat(style.lineHeight),
      overflowY: style.overflowY,
    };
  });
  expect(typography.fontSize).toBeGreaterThanOrEqual(13);
  expect(typography.lineHeight).toBeGreaterThanOrEqual(19);
  expect(["auto", "scroll"]).toContain(typography.overflowY);
}

async function expectDetailScrollLayersClear(
  page: Page,
  shell: Locator,
  mode: "standard" | "radar"
) {
  for (let pass = 0; pass < 2; pass += 1) {
    await shell.evaluate((element) => {
      const dialog = element.closest<HTMLElement>("[role='dialog']");
      if (dialog && dialog.scrollHeight > dialog.clientHeight) {
        dialog.scrollTop = dialog.scrollHeight;
        return;
      }
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
    });
    await page.waitForTimeout(80);
  }

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const tabsBounds = await requiredBounds(shell.locator(".card-detail-tabs-shell"));
  if (mode === "radar") {
    const headerBounds = await requiredBounds(page.locator("[data-app-header]"));
    expect(tabsBounds.y).toBeGreaterThanOrEqual(headerBounds.y + headerBounds.height - 1);
  }

  const overlapState = await shell.evaluate((element) => {
    const media = element.querySelector<HTMLElement>('[data-card-detail-region="media"]');
    const tabs = element.querySelector<HTMLElement>(".card-detail-tabs-shell");
    if (!media || !tabs) return null;
    const mediaBounds = media.getBoundingClientRect();
    const tabsBounds = tabs.getBoundingClientRect();
    const mediaVisible = mediaBounds.bottom > 0 && mediaBounds.top < window.innerHeight;
    const overlaps =
      mediaVisible &&
      mediaBounds.left < tabsBounds.right &&
      mediaBounds.right > tabsBounds.left &&
      mediaBounds.top < tabsBounds.bottom &&
      mediaBounds.bottom > tabsBounds.top;
    return { mediaVisible, overlaps };
  });
  expect(overlapState?.overlaps ?? false).toBe(false);

  if (viewport!.width <= 767) {
    await expect(page.locator("[data-mobile-bottom-nav]")).toBeHidden();
    const actionsBounds = await requiredBounds(
      shell.locator("[data-card-detail-primary-actions]")
    );
    expect(actionsBounds.y + actionsBounds.height).toBeLessThanOrEqual(viewport!.height - 4);
    const panelBounds = await requiredBounds(shell.locator('[data-card-detail-region="panel"]'));
    expect(panelBounds.y + panelBounds.height).toBeLessThanOrEqual(actionsBounds.y + 2);
  }

  await resetDetailScroll(shell);
}

async function openSettingsTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name, exact: true });
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

async function expectCanvasHasPixels(
  page: Page,
  canvas: Locator = page.locator("canvas").first(),
  minimumVisiblePixels = 24
) {
  const screenshot = await canvas.screenshot();
  const sample = samplePng(screenshot);
  expect(sample.visiblePixels).toBeGreaterThan(minimumVisiblePixels);
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

    const syncPanel = page.getByRole("tabpanel", { name: "Sync" });
    await expect(syncPanel.getByRole("heading", { name: "Sync Control Center" })).toBeVisible();
    await expect(syncPanel.getByText("Background price refresh", { exact: true })).toBeVisible();
    await expect(syncPanel.getByRole("heading", { name: "Sync Automation" })).toBeVisible();
    await expect(syncPanel.getByRole("button", { name: "Check Known Unavailable" })).toBeVisible();
  });

  test("settings mobile layout does not overflow horizontally", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Preferences" })).toBeVisible();
    const preferencesPanel = page.getByRole("tabpanel", { name: "Preferences" });
    await expect(preferencesPanel.getByText("Phone overrides", { exact: true })).toBeVisible();
    await expect(preferencesPanel.getByText("Default view", { exact: true })).toBeVisible();

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
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await applyDisplaySettings(page, { widescreen: true, modalSize: "medium" });
    await page.route("**/api/cards/*/signal-preview", async (route) => {
      if (route.request().url().includes("/api/cards/23190/signal-preview")) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "Simulated preview failure" }),
      });
    });
    await page.route("**/api/movers/signal-radar/*/research", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "Simulated research failure" }),
      });
    });
    await page.goto("/search?q=seismitoad&game=pokemon&autoswitch=0");

    const firstCard = page
      .locator(".dc-wide-grid-zone > [role='button']")
      .filter({ hasText: "Seismitoad" })
      .filter({ hasText: "#105/86" })
      .first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    await firstCard.click({ position: { x: 10, y: 10 } });

    const dialog = page.getByRole("dialog", { name: "Seismitoad", exact: true });
    const shell = dialog.locator(
      '[data-card-detail-shell][data-card-detail-mode="standard"]'
    );
    await expect(shell).toBeVisible({ timeout: 15_000 });
    await expect(shell.locator("[data-card-detail-back]")).toContainText("Back to Search");
    await expectSingleVisibleActionCluster(shell);

    const heroMarketControls = shell.locator("[data-card-detail-market-mode]");
    const rawHeroMode = heroMarketControls.getByRole("button", { name: "Raw", exact: true });
    const gradedHeroMode = heroMarketControls.getByRole("button", {
      name: "Graded",
      exact: true,
    });
    const heroPriceLabel = shell.locator(".card-detail-price-label");
    const heroPrice = shell.locator(".card-detail-price");
    await expect(rawHeroMode).toHaveAttribute("aria-pressed", "true");
    await expect(
      shell.getByRole("combobox", { name: "Select graded slab", exact: true })
    ).toHaveCount(0);

    await gradedHeroMode.click();
    await expect(gradedHeroMode).toHaveAttribute("aria-pressed", "true");
    const heroGradeSelector = await expectSingleHeroGradeSelector(shell);

    await selectGradeStartingWith(heroGradeSelector, "BGS 10");
    await expect(heroPriceLabel).toContainText("BGS 10");
    await expect(heroPrice).toHaveText("€169.00");
    await expectSelectedGradeInHistoryChart(shell, "€169.00");

    await selectGradeStartingWith(heroGradeSelector, "PSA 10");
    await expect(heroPriceLabel).toContainText("PSA 10");
    await expect(heroPrice).toHaveText("€1,699.00");
    await expectSelectedGradeInHistoryChart(shell, "€1,699.00");
    await expect(
      shell.getByRole("combobox", { name: "Select graded slab", exact: true })
    ).toHaveCount(1);

    await rawHeroMode.click();
    await expect(rawHeroMode).toHaveAttribute("aria-pressed", "true");
    await expect(
      shell.getByRole("combobox", { name: "Select graded slab", exact: true })
    ).toHaveCount(0);

    const mediaSwitcher = shell.locator(".card-detail-media-switcher");
    const mediaSwitch = mediaSwitcher.locator("[data-card-detail-media-switch]");
    await expect(mediaSwitch).toBeVisible();
    const mediaSwitchBounds = await requiredBounds(mediaSwitch);
    expect(mediaSwitchBounds.width).toBeLessThanOrEqual(120);
    expect(mediaSwitchBounds.height).toBeLessThanOrEqual(48);
    const twoDimensionalButton = mediaSwitch.getByRole("button", { name: "2D", exact: true });
    const threeDimensionalButton = mediaSwitch.getByRole("button", { name: "3D", exact: true });
    const twoDimensionalBounds = await requiredBounds(
      mediaSwitcher.locator(".card-detail-media-two-dimensional")
    );
    await threeDimensionalButton.click();
    await expect(mediaSwitcher).toHaveAttribute("data-card-detail-media-mode", "3d");
    const inlineThreeDimensionalBounds = await requiredBounds(
      mediaSwitcher.locator(".card-detail-inline-three-viewer")
    );
    expect(Math.abs(inlineThreeDimensionalBounds.width - twoDimensionalBounds.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(inlineThreeDimensionalBounds.height - twoDimensionalBounds.height)).toBeLessThanOrEqual(3);
    const inlineCanvas = mediaSwitcher.locator(".card-detail-inline-three-viewer canvas");
    await expect(inlineCanvas).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(750);
    await expectCanvasHasPixels(page, inlineCanvas, 350);
    await expect(
      mediaSwitcher.getByText("3D view unavailable", { exact: true })
    ).toHaveCount(0);
    await page.waitForTimeout(1_000);
    await expect(
      mediaSwitcher.getByText("3D view unavailable", { exact: true })
    ).toHaveCount(0);
    await captureCardDetailScreenshot(page, shell, "standard-1920x1080-3d.png");
    expect(
      await page.evaluate(() => window.localStorage.getItem("dustycards-card-detail-media-mode"))
    ).toBe("3d");
    await twoDimensionalButton.click();
    await expect(mediaSwitcher).toHaveAttribute("data-card-detail-media-mode", "2d");

    const tabs = shell.getByRole("tab");
    await expect(tabs).toHaveCount(3);
    expect(await tabs.allTextContents()).toEqual(["Overview", "Market", "Collection"]);
    const overviewTab = shell.getByRole("tab", { name: "Overview", exact: true });
    const marketTab = shell.getByRole("tab", { name: "Market", exact: true });
    const collectionTab = shell.getByRole("tab", { name: "Collection", exact: true });
    await expect(overviewTab).toHaveAttribute("aria-selected", "true");
    await overviewTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(marketTab).toHaveAttribute("aria-selected", "true");
    await expect(marketTab).toBeFocused();
    await page.keyboard.press("End");
    await expect(collectionTab).toHaveAttribute("aria-selected", "true");
    await expect(collectionTab).toBeFocused();
    await page.keyboard.press("Home");
    await expect(overviewTab).toHaveAttribute("aria-selected", "true");
    await expect(overviewTab).toBeFocused();
    await marketTab.click();
    await expect(shell).toHaveAttribute("data-active-tab", "market");

    const marketSignal = shell.locator(
      "[data-card-market-stats][data-signal-summary-panel]"
    );
    await expect(marketSignal).toHaveCount(1);
    await expect(marketSignal).toBeVisible();
    await expect(marketSignal).toContainText("Market intelligence");
    await expect(marketSignal).toContainText("Data confidence");
    await expect(
      marketSignal.getByRole("button", { name: "Momentum", exact: true })
    ).toBeVisible();
    await expect(marketSignal).toHaveAttribute("data-signal-source", /^(market|external)$/);
    const marketDetails = marketSignal.locator("details");
    await expect(marketDetails).not.toHaveAttribute("open", "");
    await marketSignal.getByText("More market details", { exact: true }).click();
    await expect(marketDetails).toHaveAttribute("open", "");
    await expect(marketDetails).toContainText("Graded vs raw");
    await marketDetails.getByRole("button", { name: "ATH", exact: true }).hover();
    const visibleMarketTooltips = page.locator('[data-readable-info-tooltip]:visible');
    await expect(visibleMarketTooltips).toHaveCount(1);
    await expect(visibleMarketTooltips).toContainText("Highest saved English NM");
    await expectReadableTooltipWithinViewport(page);
    await marketSignal.getByText("More market details", { exact: true }).click();
    for (const metric of ["liquidity", "demand"] as const) {
      const metricRow = marketSignal.locator(`[data-market-metric="${metric}"]`);
      await expect(metricRow).toBeVisible();
      await expect(metricRow).not.toContainText("--");
      await expect(metricRow.locator("[style]")).not.toHaveAttribute("style", /width:\s*0%/);
    }

    await overviewTab.click();
    await captureCardDetailScreenshot(page, shell, "standard-1920x1080.png");
    await expectDetailHeroLayout(shell, "triple");
    await expectDetailScrollLayersClear(page, shell, "standard");
    await expectSingleVisibleActionCluster(shell);
    await expectNoHorizontalOverflow(page, shell);

    await page.setViewportSize({ width: 1280, height: 900 });
    await expectDetailHeroLayout(shell, "double");
    await captureCardDetailScreenshot(page, shell, "standard-1280x900.png");
    await expectSingleVisibleActionCluster(shell);
    await expectNoHorizontalOverflow(page, shell);

    await page.setViewportSize({ width: 1024, height: 900 });
    await expectDetailHeroLayout(shell, "double");
    await captureCardDetailScreenshot(page, shell, "standard-1024x900.png");
    await expectSingleVisibleActionCluster(shell);
    await expectNoHorizontalOverflow(page, shell);

    await page.setViewportSize({ width: 768, height: 900 });
    await captureCardDetailScreenshot(page, shell, "standard-768x900.png");
    await marketTab.click();
    await expectDetailHeroLayout(shell, "double");
    await expect(shell.locator("[data-card-detail-media-switch]")).toBeHidden();
    await expectSingleVisibleActionCluster(shell);
    await expectNoHorizontalOverflow(page, shell);

    await page.setViewportSize({ width: 390, height: 844 });
    await overviewTab.click();
    await captureCardDetailScreenshot(page, shell, "standard-390x844.png");
    await marketTab.click();
    await expect(marketSignal).toHaveCount(1);
    await expect(marketSignal).toBeVisible();
    await expect(marketSignal).toContainText("Market intelligence");
    await expect(marketSignal).toContainText("Data confidence");
    const mobileMomentumTrigger = marketSignal.getByRole("button", {
      name: "Momentum",
      exact: true,
    });
    await mobileMomentumTrigger.click();
    await expect(page.locator("[data-readable-info-tooltip]:visible")).toContainText(
      "Price direction from saved"
    );
    await expectReadableTooltipWithinViewport(page);
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-readable-info-tooltip]:visible")).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(marketSignal).toHaveAttribute("data-signal-source", /^(market|external)$/);
    await overviewTab.click();
    await expect(shell.locator('[data-card-detail-region="chart"]')).toBeHidden();
    await marketTab.click();
    await expect(shell.locator('[data-card-detail-region="chart"]')).toBeVisible();
    await expectDetailHeroLayout(shell, "single");
    await expect(shell.locator("[data-card-detail-media-switch]")).toBeHidden();
    await expectDetailScrollLayersClear(page, shell, "standard");
    await expectTouchSizedDetailControls(shell);
    await expectSingleVisibleActionCluster(shell);
    await expect(shell.locator(".card-detail-media-actions")).toBeHidden();
    await expect(
      shell.locator("[data-card-detail-actions]").getByText("CardMarket", { exact: true })
    ).toHaveCount(1);
    const mobileBackBounds = await requiredBounds(shell.locator("[data-card-detail-back]"));
    const mobileOverflowBounds = await requiredBounds(
      shell.locator("[data-card-detail-overflow-actions] > summary")
    );
    expect(Math.abs(mobileBackBounds.y - mobileOverflowBounds.y)).toBeLessThanOrEqual(4);
    await expectNoHorizontalOverflow(page, shell);

    await page.setViewportSize({ width: 5120, height: 1440 });
    await overviewTab.click();
    await expectDetailHeroLayout(shell, "triple");
    await expectBoundedCenteredDetailCanvas(shell);
    await expectSingleVisibleActionCluster(shell);
    await expectNoHorizontalOverflow(page, shell);
    await captureCardDetailScreenshot(page, shell, "standard-5120x1440.png");

    await shell
      .locator("[data-card-detail-media-switch]")
      .getByRole("button", { name: "3D", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    const secondCard = page
      .locator(".dc-wide-grid-zone > [role='button']")
      .filter({ hasText: "Seismitoad-EX" })
      .filter({ hasText: "#106/111" })
      .first();
    await expect(secondCard).toBeVisible();
    await secondCard.click({ position: { x: 10, y: 10 } });
    const reopenedDialog = page.getByRole("dialog", { name: "Seismitoad-EX", exact: true });
    const reopenedShell = reopenedDialog.locator(
      '[data-card-detail-shell][data-card-detail-mode="standard"]'
    );
    await expect(reopenedShell).toBeVisible({ timeout: 15_000 });
    await expect(reopenedShell.locator(".card-detail-media-switcher")).toHaveAttribute(
      "data-card-detail-media-mode",
      "3d"
    );
    await reopenedShell
      .locator("[data-card-detail-media-switch]")
      .getByRole("button", { name: "2D", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    const reopenedOverflow = reopenedShell.locator("[data-card-detail-overflow-actions]");
    await reopenedOverflow.locator("summary").click();
    await reopenedOverflow.getByRole("button", { name: "Research signal", exact: true }).click();
    await expect(reopenedShell.locator(".card-detail-mobile-status")).toContainText(
      "Simulated research failure"
    );
    await expect(reopenedShell.locator(".card-detail-mobile-status")).toBeVisible();
    await reopenedOverflow.locator("summary").click();
    await reopenedShell.locator("[data-card-detail-back]").click();
    await expect(reopenedDialog).toBeHidden();
    await expect(page).toHaveURL(/\/search\?q=seismitoad&game=pokemon&autoswitch=0$/);
  });

  test("Signal Radar detail shares the responsive card detail shell", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await applyDisplaySettings(page, { widescreen: true, modalSize: "medium" });
    await page.addInitScript(() => {
      window.localStorage.setItem("dustycards-card-detail-media-mode", "3d");
    });
    await page.goto("/movers/signal-radar/18530?game=pokemon", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    const shell = page.locator(
      '[data-card-detail-shell][data-card-detail-mode="radar"]'
    );
    await expect(shell).toBeVisible({ timeout: 60_000 });
    await expect(
      shell.getByRole("heading", { name: "Shining Gyarados", exact: true })
    ).toBeVisible();
    await expect(shell.locator("[data-card-detail-back]")).toContainText(
      "Back to Signal Radar"
    );
    await expectSingleVisibleActionCluster(shell);

    const radarMarketControls = shell.locator("[data-card-detail-market-mode]");
    const radarRawMode = radarMarketControls.getByRole("button", {
      name: "Raw",
      exact: true,
    });
    const radarGradedMode = radarMarketControls.getByRole("button", {
      name: "Graded",
      exact: true,
    });
    const radarHeroPriceLabel = shell.locator(".card-detail-price-label");
    const radarHeroPrice = shell.locator(".card-detail-price");
    const radarRawHeroPrice = (await radarHeroPrice.textContent())?.trim() ?? "";
    expect(radarRawHeroPrice).not.toBe("");
    await expect(radarRawMode).toHaveAttribute("aria-pressed", "true");
    await expect(
      shell.getByRole("combobox", { name: "Select graded slab", exact: true })
    ).toHaveCount(0);

    await radarGradedMode.click();
    await expect(radarGradedMode).toHaveAttribute("aria-pressed", "true");
    const radarGradeSelector = await expectSingleHeroGradeSelector(shell);
    const radarSelectedGrade = await radarGradeSelector.inputValue();
    expect(radarSelectedGrade).toMatch(/(?:BGS|CGC|PSA|graded)/i);
    await expect(radarHeroPriceLabel).toHaveText("Current graded market");
    await expect(radarHeroPrice).not.toHaveText(radarRawHeroPrice);
    await expect(shell.locator('[data-card-detail-region="chart"]')).toContainText(
      radarSelectedGrade
    );
    await expect(
      shell.getByRole("combobox", { name: "Select graded slab", exact: true })
    ).toHaveCount(1);

    await radarRawMode.click();
    await expect(radarRawMode).toHaveAttribute("aria-pressed", "true");
    await expect(
      shell.getByRole("combobox", { name: "Select graded slab", exact: true })
    ).toHaveCount(0);

    const radarMediaSwitcher = shell.locator(".card-detail-media-switcher");
    const radarMediaSwitch = radarMediaSwitcher.locator("[data-card-detail-media-switch]");
    await expect(radarMediaSwitch).toBeVisible();
    await expect(radarMediaSwitcher).toHaveAttribute("data-card-detail-media-mode", "3d");
    const radarInlineCanvas = radarMediaSwitcher.locator(".card-detail-inline-three-viewer canvas");
    await expect(radarInlineCanvas).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(750);
    await expectCanvasHasPixels(page, radarInlineCanvas, 350);
    await radarMediaSwitch.getByRole("button", { name: "2D", exact: true }).click();
    await expect(radarMediaSwitcher).toHaveAttribute("data-card-detail-media-mode", "2d");

    const tabs = shell.getByRole("tab");
    await expect(tabs).toHaveCount(6);
    expect(await tabs.allTextContents()).toEqual([
      "Overview",
      "Market",
      "Collection",
      "Forecast",
      "Analysis",
      "Evidence",
    ]);
    const overviewTab = shell.getByRole("tab", { name: "Overview", exact: true });
    const marketTab = shell.getByRole("tab", { name: "Market", exact: true });
    const forecastTab = shell.getByRole("tab", { name: "Forecast", exact: true });
    const evidenceTab = shell.getByRole("tab", { name: "Evidence", exact: true });
    await expect(overviewTab).toHaveAttribute("aria-selected", "true");
    await overviewTab.focus();
    await page.keyboard.press("End");
    await expect(evidenceTab).toHaveAttribute("aria-selected", "true");
    await expect(evidenceTab).toBeFocused();
    await page.keyboard.press("Home");
    await expect(overviewTab).toHaveAttribute("aria-selected", "true");
    await expect(overviewTab).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(marketTab).toHaveAttribute("aria-selected", "true");
    await expect(marketTab).toBeFocused();
    await forecastTab.click();
    await expect(shell).toHaveAttribute("data-active-tab", "forecast");

    await overviewTab.click();
    await captureCardDetailScreenshot(page, shell, "radar-1920x1080.png");
    await expectDetailHeroLayout(shell, "triple");
    await expectDetailScrollLayersClear(page, shell, "radar");
    await expectSingleVisibleActionCluster(shell);
    await expectNoHorizontalOverflow(page, shell);

    await page.setViewportSize({ width: 1280, height: 900 });
    await expectDetailHeroLayout(shell, "double");
    await captureCardDetailScreenshot(page, shell, "radar-1280x900.png");
    await expectSingleVisibleActionCluster(shell);
    await expectNoHorizontalOverflow(page, shell);

    await page.setViewportSize({ width: 1024, height: 900 });
    await expectDetailHeroLayout(shell, "double");
    await captureCardDetailScreenshot(page, shell, "radar-1024x900.png");
    await expectSingleVisibleActionCluster(shell);
    await expectNoHorizontalOverflow(page, shell);

    await page.setViewportSize({ width: 768, height: 900 });
    await captureCardDetailScreenshot(page, shell, "radar-768x900.png");
    await forecastTab.click();
    await expectDetailHeroLayout(shell, "double");
    await expectSingleVisibleActionCluster(shell);
    await expectNoHorizontalOverflow(page, shell);

    await page.setViewportSize({ width: 390, height: 844 });
    await overviewTab.click();
    await expect(shell.locator('[data-card-detail-region="chart"]')).toBeHidden();
    await captureCardDetailScreenshot(page, shell, "radar-390x844.png");
    await forecastTab.click();
    await expect(shell.locator('[data-card-detail-region="chart"]')).toBeVisible();
    await expectDetailHeroLayout(shell, "single");
    await expectDetailScrollLayersClear(page, shell, "radar");
    await expectTouchSizedDetailControls(shell);
    await expectSingleVisibleActionCluster(shell);
    await expect(shell.locator(".card-detail-media-actions")).toBeHidden();
    await expect(
      shell.locator("[data-card-detail-actions]").getByText("CardMarket", { exact: true })
    ).toHaveCount(1);
    const radarMobileBackBounds = await requiredBounds(shell.locator("[data-card-detail-back]"));
    const radarMobileOverflowBounds = await requiredBounds(
      shell.locator("[data-card-detail-overflow-actions] > summary")
    );
    expect(Math.abs(radarMobileBackBounds.y - radarMobileOverflowBounds.y)).toBeLessThanOrEqual(4);
    await expectNoHorizontalOverflow(page, shell);

    await page.setViewportSize({ width: 5120, height: 1440 });
    await overviewTab.click();
    await expectDetailHeroLayout(shell, "triple");
    await expectBoundedCenteredDetailCanvas(shell);
    await expectSingleVisibleActionCluster(shell);
    await expectNoHorizontalOverflow(page, shell);
    await captureCardDetailScreenshot(page, shell, "radar-5120x1440.png");

    const backLink = shell.locator("[data-card-detail-back]");
    await Promise.all([
      page.waitForURL(/\/movers\/signal-radar\?game=pokemon$/, {
        waitUntil: "commit",
        timeout: 60_000,
      }),
      backLink.click(),
    ]);
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
    await dialogs.last().getByRole("button", { name: "Back to Sealed Product" }).click();
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

      const preferencesPanel = freshPage.getByRole("tabpanel", { name: "Preferences" });
      await expect(preferencesPanel.getByText("Phone overrides", { exact: true })).toBeVisible();
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
          .locator('button[aria-label^="Open fullscreen 3D viewer for "]')
          .filter({ visible: true })
          .first();
        await expect(openThreeDButton).toBeVisible();
        await checkPage.waitForTimeout(500);
        await openThreeDButton.click({ position: { x: 24, y: 24 } });
        const threeDDialog = checkPage.locator('[data-card-three-modal="true"]');
        await expect(threeDDialog).toHaveAttribute("role", "dialog");
        await expect(threeDDialog).toHaveAttribute("aria-modal", "true");
        const closeThreeDButton = threeDDialog.getByRole("button", {
          name: "Close 3D view",
          exact: true,
        });
        await expect(closeThreeDButton).toBeFocused();
        await checkPage.keyboard.press("Tab");
        expect(
          await threeDDialog.evaluate((dialog) => dialog.contains(document.activeElement))
        ).toBe(true);
        await checkPage.keyboard.press("Shift+Tab");
        await expect(closeThreeDButton).toBeFocused();

        await expect(threeDDialog.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
        await checkPage.waitForTimeout(1_000);
        await expectNoHorizontalOverflow(checkPage);
        await expectCanvasHasPixels(checkPage, threeDDialog.locator("canvas").first());

        const detailsBox = await checkPage.locator('[data-three-details="true"]').boundingBox();
        expect(detailsBox).not.toBeNull();
        expect((detailsBox?.x ?? 0) + (detailsBox?.width ?? 0)).toBeLessThanOrEqual(
          viewport.width + 2
        );
        expect((detailsBox?.y ?? 0) + (detailsBox?.height ?? 0)).toBeLessThanOrEqual(
          viewport.height + 2
        );

        await checkPage.keyboard.press("Escape");
        await expect(threeDDialog).toHaveCount(0);
        await expect(openThreeDButton).toBeFocused();
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
