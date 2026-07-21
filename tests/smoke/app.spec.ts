import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import crypto from "node:crypto";
import * as zlib from "node:zlib";
import Database from "better-sqlite3";
import {
  DEFAULT_APPEARANCE_SETTINGS,
  type AppearanceThemeId,
} from "@/lib/appearance-themes";

type DisplaySize = "small" | "medium" | "large";

const SETTINGS_STORAGE_KEY = "dustycards-settings";
const SETTINGS_COOKIE_NAME = "dustycards-settings";
const SESSION_COOKIE_NAME = "dustycards-session";
const BASE_URL = `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3000"}`;
const CARD_DETAIL_SCREENSHOT_DIR = process.env.CARD_DETAIL_SCREENSHOT_DIR?.trim() || null;
const CARD_DETAIL_APPEARANCE_PRESET = (() => {
  const value = process.env.CARD_DETAIL_APPEARANCE_PRESET?.trim();
  return value === "porcelain-studio" || value === "blush-petal"
    ? (value as AppearanceThemeId)
    : null;
})();
const SMOKE_USER_ID = "codex-test-account";
const SMOKE_USER_EMAIL = "codex-test@example.test";
const SMOKE_SESSION_ID = "playwright-smoke-session";
const SMOKE_SESSION_TOKEN = "playwright-smoke-session-token";
let activeSessionIds: string[] = [];

const baseSettings = {
  theme: "system",
  desktopNavigation: "top" as "top" | "sidebar",
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
  appearance: DEFAULT_APPEARANCE_SETTINGS,
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

async function expectInlineCardActions(card: Locator) {
  const actions = card.locator("[data-card-inline-actions]");
  await expect(actions).toHaveCount(1);
  await expect(actions).toBeVisible();

  const collection = actions.locator('[data-card-action="collection"] button');
  const want = actions.locator('[data-card-action="want"] button');
  await expect(collection).toHaveCount(1);
  await expect(want).toHaveCount(1);
  await expect(actions.getByRole("button")).toHaveCount(2);
  await expect(collection).toHaveAttribute("aria-label", /^Add .+ to collection$/);
  await expect(want).toHaveAttribute(
    "aria-label",
    /^(?:Add .+ to wants|Remove .+ from wants)$/
  );

  return { actions, collection, want };
}

async function expectMobileCardListTileContract(page: Page, tile: Locator) {
  expect(page.viewportSize()?.width).toBe(390);
  await expect(tile).toBeVisible();
  await expect(tile).toHaveAttribute("data-card-list-layout", "showcase");
  await expect(tile.locator("[data-card-list-media]")).toHaveCount(1);
  await expect(tile.locator("[data-card-list-price]")).toHaveCount(1);
  await expect(tile.locator("[data-card-inline-actions]")).toHaveCount(1);
  await expect(tile.locator("[data-card-analysis-link]")).toHaveCount(1);

  const media = tile.locator("[data-card-list-media]");
  const price = tile.locator("[data-card-list-price]");
  const analysis = tile.locator("[data-card-analysis-link]");
  const headingTitle = tile.locator("[data-card-list-body] h3.truncate").first();
  const title =
    (await headingTitle.count()) > 0
      ? headingTitle
      : tile.locator("[data-card-list-body] p.truncate").first();
  const { collection, want } = await expectInlineCardActions(tile);
  const [
    cardBounds,
    mediaBounds,
    priceBounds,
    titleBounds,
    analysisBounds,
    collectionBounds,
    wantBounds,
  ] =
    await Promise.all([
      requiredBounds(tile),
      requiredBounds(media),
      requiredBounds(price),
      requiredBounds(title),
      requiredBounds(analysis),
      requiredBounds(collection),
      requiredBounds(want),
    ]);

  expect(mediaBounds.width).toBeGreaterThanOrEqual(104);
  expect(titleBounds.height).toBeLessThanOrEqual(25);
  expect(analysisBounds.x).toBeLessThan(collectionBounds.x);
  expect(wantBounds.x + wantBounds.width).toBeLessThanOrEqual(
    cardBounds.x + cardBounds.width - 8
  );
  expect(
    cardBounds.y + cardBounds.height - (wantBounds.y + wantBounds.height)
  ).toBeLessThanOrEqual(18);
  for (const [label, bounds] of [
    ["Add", collectionBounds],
    ["Want", wantBounds],
  ] as const) {
    expect(bounds.width, `${label} target width`).toBeGreaterThanOrEqual(44);
    expect(bounds.height, `${label} target height`).toBeGreaterThanOrEqual(44);
  }

  const titleLayout = await title.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowX: styles.overflowX,
      textOverflow: styles.textOverflow,
      whiteSpace: styles.whiteSpace,
    };
  });
  expect(titleLayout.whiteSpace).toBe("nowrap");
  expect(titleLayout.overflowX).toBe("hidden");
  expect(titleLayout.textOverflow).toBe("ellipsis");
  expect(titleLayout.scrollHeight).toBeLessThanOrEqual(titleLayout.clientHeight + 1);

  const badgeLayout = await tile.locator("[data-card-list-badges]").evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    clippedChildren: Array.from(element.children).filter((child) => {
      const childBounds = child.getBoundingClientRect();
      if (childBounds.width === 0 && childBounds.height === 0) return false;
      const containerBounds = element.getBoundingClientRect();
      return childBounds.top < containerBounds.top - 1 || childBounds.bottom > containerBounds.bottom + 1;
    }).length,
  }));
  expect(badgeLayout.scrollHeight).toBeLessThanOrEqual(badgeLayout.clientHeight + 1);
  expect(badgeLayout.clippedChildren).toBe(0);

  const titleAndPriceOverlap = !(
    titleBounds.x + titleBounds.width <= priceBounds.x + 1 ||
    priceBounds.x + priceBounds.width <= titleBounds.x + 1 ||
    titleBounds.y + titleBounds.height <= priceBounds.y + 1 ||
    priceBounds.y + priceBounds.height <= titleBounds.y + 1
  );
  expect(titleAndPriceOverlap, "card title and price overlap").toBe(false);
  await expectNoHorizontalOverflow(page);
}

function expectBoundsToMatch(
  actual: { x: number; y: number; width: number; height: number },
  expected: { x: number; y: number; width: number; height: number },
  tolerance = 2
) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(tolerance);
}

async function expectSingleChartGradeSelector(shell: Locator): Promise<Locator> {
  const identity = shell.locator('[data-card-detail-region="identity"]');
  const chart = shell.locator('[data-card-detail-region="chart"]');
  const gradeControl = chart.locator('[data-card-detail-chart-series-control="grade"]');
  const gradeSelector = gradeControl.getByRole("combobox", {
    name: "Select graded slab",
    exact: true,
  });

  await expect(gradeControl).toBeVisible();
  await expect(gradeSelector).toBeVisible();
  await expect(
    identity.getByRole("combobox", { name: "Select graded slab", exact: true })
  ).toHaveCount(0);
  await expect(
    shell.getByRole("combobox", { name: "Select graded slab", exact: true })
  ).toHaveCount(1);

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
  const renderedPoints = chartImage.locator("circle");
  if ((await renderedPoints.count()) > 0) {
    await renderedPoints.last().hover();
  } else {
    const bounds = await requiredBounds(chartImage);
    await chartImage.hover({
      position: {
        x: Math.max(1, Math.floor(bounds.width - 24)),
        y: Math.max(1, Math.floor(bounds.height / 2)),
      },
    });
  }
  await expect(chart.getByText(formattedPrice, { exact: true })).toBeVisible();
}

async function resetDetailScroll(shell: Locator) {
  await shell.evaluate((element) => {
    const detailViewport = element.querySelector<HTMLElement>(
      "[data-card-detail-scroll-viewport]"
    );
    if (detailViewport) detailViewport.scrollTop = 0;
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

async function expectVisiblePriceStatusItems(shell: Locator) {
  const statusLine = shell.locator("[data-card-detail-price-status]");
  const items = statusLine.locator("[data-card-detail-price-status-item]");
  await expect(statusLine).toBeVisible();
  await expect(items).toHaveCount(5);
  expect(
    (await items.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-card-detail-price-status-item"))
    )).sort()
  ).toEqual(["coverage", "history", "next", "source", "updated"]);

  const chartBounds = await requiredBounds(shell.locator('[data-card-detail-region="chart"]'));
  for (let index = 0; index < 5; index += 1) {
    const item = items.nth(index);
    await expect(item).toBeVisible();
    const bounds = await requiredBounds(item);
    expect(bounds.x).toBeGreaterThanOrEqual(chartBounds.x - 1);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(
      chartBounds.x + chartBounds.width + 1
    );
    expect(bounds.y).toBeGreaterThanOrEqual(chartBounds.y - 1);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(
      chartBounds.y + chartBounds.height + 1
    );
  }

  return items.allTextContents();
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

async function captureCardDetailPanelScreenshot(page: Page, shell: Locator, fileName: string) {
  if (!CARD_DETAIL_SCREENSHOT_DIR) return;
  await shell.locator('[data-card-detail-region="panel"]').evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
  });
  await page.waitForTimeout(80);
  await page.screenshot({
    path: `${CARD_DETAIL_SCREENSHOT_DIR}/${fileName}`,
    animations: "disabled",
  });
}

async function captureCardDetailStatusScreenshot(page: Page, shell: Locator, fileName: string) {
  if (!CARD_DETAIL_SCREENSHOT_DIR) return;
  await shell.locator("[data-card-detail-price-status]").evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
  });
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

async function expectWideDetailTabsBesideMedia(shell: Locator) {
  await resetDetailScroll(shell);
  const [mediaBounds, identityBounds, chartBounds, tabsBounds] = await Promise.all([
    requiredBounds(shell.locator('[data-card-detail-region="media"]')),
    requiredBounds(shell.locator('[data-card-detail-region="identity"]')),
    requiredBounds(shell.locator('[data-card-detail-region="chart"]')),
    requiredBounds(shell.locator(".card-detail-tabs-shell")),
  ]);

  expect(tabsBounds.x).toBeGreaterThanOrEqual(identityBounds.x - 2);
  expect(Math.abs(tabsBounds.x + tabsBounds.width - (chartBounds.x + chartBounds.width))).toBeLessThanOrEqual(3);
  expect(tabsBounds.y).toBeGreaterThanOrEqual(
    Math.max(identityBounds.y + identityBounds.height, chartBounds.y + chartBounds.height) - 2
  );
  expect(tabsBounds.y).toBeLessThan(mediaBounds.y + mediaBounds.height);
}

async function expectTouchSizedDetailControls(shell: Locator) {
  const controls = shell.locator([
    "[data-card-detail-back]:visible",
    "[data-card-detail-actions]:visible button:visible",
    "[data-card-detail-actions]:visible a:visible",
    "[data-card-detail-actions]:visible summary:visible",
    "[data-card-detail-primary-actions]:visible button:visible",
    "[data-card-detail-primary-actions]:visible a:visible",
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
      const detailViewport = element.querySelector<HTMLElement>(
        "[data-card-detail-scroll-viewport]"
      );
      if (detailViewport && detailViewport.scrollHeight > detailViewport.clientHeight) {
        detailViewport.scrollTop = detailViewport.scrollHeight;
        return;
      }
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
    const primaryActions = shell.locator("[data-card-detail-primary-actions]");
    const actionsBounds = await requiredBounds(primaryActions);
    const actionsPosition = await primaryActions.evaluate(
      (element) => window.getComputedStyle(element).position
    );
    expect(actionsBounds.height).toBeGreaterThanOrEqual(44);
    if (actionsPosition === "fixed") {
      expect(actionsBounds.y + actionsBounds.height).toBeLessThanOrEqual(viewport!.height - 4);
      const panelBounds = await requiredBounds(shell.locator('[data-card-detail-region="panel"]'));
      expect(panelBounds.y + panelBounds.height).toBeLessThanOrEqual(actionsBounds.y + 2);
    }
  }

  await resetDetailScroll(shell);
}

async function expectMobileActionClusterNeverCoversDetail(
  page: Page,
  shell: Locator,
  { requireScrollable = true }: { requireScrollable?: boolean } = {}
) {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (viewport!.width > 767) return;

  const primaryActions = shell.locator("[data-card-detail-primary-actions]:visible");
  await expect(primaryActions).toHaveCount(1);
  const reachedScrollPositions: number[] = [];
  let availableScroll = 0;

  for (const progress of [0, 0.35, 0.7, 1]) {
    await shell.evaluate((element, scrollProgress) => {
      const detailViewport = element.querySelector<HTMLElement>(
        "[data-card-detail-scroll-viewport]"
      );
      if (detailViewport && detailViewport.scrollHeight > detailViewport.clientHeight) {
        detailViewport.scrollTop = Math.round(
          (detailViewport.scrollHeight - detailViewport.clientHeight) * scrollProgress
        );
        return;
      }
      const dialog = element.closest<HTMLElement>("[role='dialog']");
      if (dialog && dialog.scrollHeight > dialog.clientHeight) {
        dialog.scrollTop = Math.round(
          (dialog.scrollHeight - dialog.clientHeight) * scrollProgress
        );
        return;
      }
      const root = document.scrollingElement;
      window.scrollTo({
        top: Math.round(((root?.scrollHeight ?? 0) - window.innerHeight) * scrollProgress),
        behavior: "auto",
      });
    }, progress);
    await page.waitForTimeout(50);

    const overlapState = await shell.evaluate((element) => {
      const actionsCandidates = Array.from(
        element.querySelectorAll<HTMLElement>("[data-card-detail-primary-actions]")
      ).filter((candidate) => {
        const bounds = candidate.getBoundingClientRect();
        const style = window.getComputedStyle(candidate);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          bounds.width > 0 &&
          bounds.height > 0
        );
      });
      const actions = actionsCandidates[0];
      const detailViewport = element.querySelector<HTMLElement>(
        "[data-card-detail-scroll-viewport]"
      );
      if (!actions || !detailViewport) {
        return {
          actionCount: actionsCandidates.length,
          maxScroll: 0,
          scrollTop: 0,
          actionsVisible: false,
          controlsHitTestable: false,
          viewportRunsBehindDock: false,
          lastPanelClearsDock: false,
        };
      }
      const actionsBounds = actions.getBoundingClientRect();
      const detailViewportBounds = detailViewport.getBoundingClientRect();
      const actionsVisible =
        actionsBounds.bottom > 0 &&
        actionsBounds.top < window.innerHeight &&
        actionsBounds.right > 0 &&
        actionsBounds.left < window.innerWidth;
      const maxScroll = Math.max(0, detailViewport.scrollHeight - detailViewport.clientHeight);
      if (!actionsVisible) {
        return {
          actionCount: actionsCandidates.length,
          maxScroll,
          scrollTop: detailViewport.scrollTop,
          actionsVisible: false,
          controlsHitTestable: false,
          viewportRunsBehindDock: false,
          lastPanelClearsDock: false,
        };
      }

      const controls = Array.from(
        actions.querySelectorAll<HTMLElement>("button, a[href], summary")
      ).filter((control) => {
        const bounds = control.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0;
      });
      const controlsHitTestable = controls.length === 3 && controls.every((control) => {
        const bounds = control.getBoundingClientRect();
        const x = Math.min(window.innerWidth - 1, Math.max(0, bounds.left + bounds.width / 2));
        const y = Math.min(window.innerHeight - 1, Math.max(0, bounds.top + bounds.height / 2));
        return document.elementsFromPoint(x, y).some(
          (candidate) => candidate === control || control.contains(candidate)
        );
      });
      const panel = element.querySelector<HTMLElement>('[data-card-detail-region="panel"]');
      const atEnd = detailViewport.scrollTop >= maxScroll - 2;
      const lastPanelClearsDock = !atEnd || !panel
        ? true
        : panel.getBoundingClientRect().bottom <= actionsBounds.top + 2;

      return {
        actionCount: actionsCandidates.length,
        maxScroll,
        scrollTop: detailViewport.scrollTop,
        actionsVisible: true,
        controlsHitTestable,
        viewportRunsBehindDock: detailViewportBounds.bottom >= actionsBounds.bottom - 2,
        lastPanelClearsDock,
      };
    });
    expect(overlapState.actionCount).toBe(1);
    expect(overlapState.actionsVisible).toBe(true);
    expect(overlapState.controlsHitTestable).toBe(true);
    expect(overlapState.viewportRunsBehindDock).toBe(true);
    expect(
      overlapState.lastPanelClearsDock,
      `Last panel is covered at ${progress * 100}% scroll`
    ).toBe(true);
    availableScroll = overlapState.maxScroll;
    reachedScrollPositions.push(overlapState.scrollTop);
  }

  if (requireScrollable) {
    expect(availableScroll).toBeGreaterThan(20);
    // Very short scroll ranges can round two quarter-points into the same
    // 10px bucket; three distinct positions still exercise top/middle/bottom.
    expect(
      new Set(reachedScrollPositions.map((value) => Math.round(value / 10))).size
    ).toBeGreaterThanOrEqual(3);
    expect(reachedScrollPositions.at(-1)).toBeGreaterThanOrEqual(availableScroll - 2);
  }

  await resetDetailScroll(shell);
}

async function expectMobileDetailTabsKeepScrollAnchor(
  page: Page,
  shell: Locator,
  tabLabels: string[]
) {
  const primed = await shell.evaluate((element) => {
    const tabsShell = element.querySelector<HTMLElement>(".card-detail-tabs-shell");
    const detailViewport = element.querySelector<HTMLElement>(
      "[data-card-detail-scroll-viewport]"
    );
    const scrollingElement =
      detailViewport && detailViewport.scrollHeight > detailViewport.clientHeight
        ? detailViewport
        : document.scrollingElement instanceof HTMLElement
          ? document.scrollingElement
          : document.documentElement;
    if (!tabsShell) return null;
    const maxScroll = Math.max(0, scrollingElement.scrollHeight - scrollingElement.clientHeight);
    scrollingElement.scrollTop = Math.min(
      maxScroll,
      tabsShell.offsetTop + tabsShell.offsetHeight + 64
    );
    return { maxScroll, scrollTop: scrollingElement.scrollTop };
  });
  expect(primed).not.toBeNull();
  expect(primed!.maxScroll).toBeGreaterThan(primed!.scrollTop - 1);

  for (const tabLabel of tabLabels) {
    const readScrollState = () => shell.evaluate((element) => {
      const tabsShell = element.querySelector<HTMLElement>(".card-detail-tabs-shell");
      const detailViewport = element.querySelector<HTMLElement>(
        "[data-card-detail-scroll-viewport]"
      );
      const scrollingElement =
        detailViewport && detailViewport.scrollHeight > detailViewport.clientHeight
          ? detailViewport
          : document.scrollingElement instanceof HTMLElement
          ? document.scrollingElement
          : document.documentElement;
      if (!tabsShell) return null;
      return {
        top: tabsShell.getBoundingClientRect().top,
        scrollTop: scrollingElement.scrollTop,
        maxScroll: Math.max(
          0,
          scrollingElement.scrollHeight - scrollingElement.clientHeight
        ),
      };
    });
    const tab = shell.getByRole("tab", { name: tabLabel, exact: true });
    await tab.evaluate((element) => {
      const htmlElement = element as HTMLElement;
      const tabList = element.parentElement;
      if (!tabList) return;
      tabList.scrollLeft = Math.max(
        0,
        htmlElement.offsetLeft - (tabList.clientWidth - htmlElement.clientWidth) / 2
      );
    });
    const before = await readScrollState();
    expect(before, `Missing mobile scroll state before ${tabLabel}`).not.toBeNull();

    // Use physical coordinates on the already-visible sticky rail. DOM click
    // skips native pointer focus, while Locator.click() performs its own
    // scroll-into-view before pointerdown and would contaminate this metric.
    const bounds = await requiredBounds(tab);
    await page.mouse.click(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2
    );
    await tab.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));

    const after = await readScrollState();

    expect(after, `Missing mobile scroll state after ${tabLabel}`).not.toBeNull();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    expect(Math.abs(after!.top - before!.top)).toBeLessThanOrEqual(2);
    expect(
      Math.abs(after!.scrollTop - before!.scrollTop),
      `${tabLabel} changed the mobile card-detail vertical scroll position`
    ).toBeLessThanOrEqual(2);
    expect(after!.scrollTop).toBeGreaterThan(20);
    expect(after!.maxScroll).toBeGreaterThanOrEqual(after!.scrollTop - 1);
  }
}

async function swipeBackFromMobileViewportEdge(
  page: Page,
  options: {
    targetSelector?: string;
    finishWithCancel?: boolean;
    durationMs?: number;
  } = {}
) {
  await page.evaluate(async (gestureOptions) => {
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = ((query: string) => {
      const result = originalMatchMedia(query);
      if (query !== "(pointer: coarse)") return result;
      return new Proxy(result, {
        get(target, property) {
          if (property === "matches") return true;
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    }) as typeof window.matchMedia;

    const dispatchTouch = (
      target: EventTarget,
      type: "touchstart" | "touchmove" | "touchend" | "touchcancel",
      x: number
    ) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", {
        value:
          type === "touchend" || type === "touchcancel"
            ? []
            : [{ clientX: x, clientY: 240 }],
      });
      Object.defineProperty(event, "changedTouches", {
        value: [{ clientX: x, clientY: 240 }],
      });
      target.dispatchEvent(event);
    };

    try {
      const target = gestureOptions.targetSelector
        ? document.querySelector(gestureOptions.targetSelector)
        : window;
      if (!target) throw new Error("Mobile edge-back target was not found");

      dispatchTouch(target, "touchstart", 2);
      dispatchTouch(target, "touchmove", 56);
      await new Promise((resolve) => window.setTimeout(resolve, gestureOptions.durationMs ?? 20));
      dispatchTouch(target, "touchmove", 142);
      dispatchTouch(
        target,
        gestureOptions.finishWithCancel ? "touchcancel" : "touchend",
        142
      );
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  }, options);
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

async function expectReadyCardHoloMask(viewer: Locator) {
  await expect(viewer).toHaveAttribute("data-card-holo-mask", "ready");
  const size = await viewer.getAttribute("data-card-holo-mask-size");
  const coverage = Number(await viewer.getAttribute("data-card-holo-mask-coverage"));
  const dimensions = size?.match(/^(\d+)x(\d+)$/);

  expect(dimensions).not.toBeNull();
  expect(Math.max(Number(dimensions?.[1]), Number(dimensions?.[2]))).toBeLessThanOrEqual(448);
  expect(coverage).toBeGreaterThan(0);
  expect(coverage).toBeLessThan(0.35);
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

  test("touch card detail actions keep equal contained widths", async ({ browser }) => {
    test.setTimeout(60_000);
    const touchContext = await browser.newContext({
      ...devices["iPhone 13"],
      baseURL: BASE_URL,
      viewport: { width: 390, height: 844 },
    });
    const rawSettings = JSON.stringify(baseSettings);

    try {
      await touchContext.addCookies([
        {
          name: SESSION_COOKIE_NAME,
          value: SMOKE_SESSION_TOKEN,
          url: BASE_URL,
          sameSite: "Lax",
        },
        {
          name: SETTINGS_COOKIE_NAME,
          value: encodeURIComponent(rawSettings),
          url: BASE_URL,
          sameSite: "Lax",
        },
      ]);
      const touchPage = await touchContext.newPage();
      await touchPage.addInitScript(
        ({ key, raw }) => window.localStorage.setItem(key, raw),
        { key: SETTINGS_STORAGE_KEY, raw: rawSettings }
      );
      await touchPage.goto("/search?q=seismitoad&game=pokemon&autoswitch=0");

      const firstCard = touchPage
        .locator(".dc-wide-grid-zone > [role='button']")
        .filter({ hasText: "Seismitoad" })
        .filter({ hasText: "#105/86" })
        .first();
      await expect(firstCard).toBeVisible({ timeout: 15_000 });
      await firstCard.click({ position: { x: 10, y: 10 } });

      const shell = touchPage
        .getByRole("dialog", { name: "Seismitoad", exact: true })
        .locator('[data-card-detail-shell][data-card-detail-mode="standard"]');
      await expect(shell).toBeVisible({ timeout: 15_000 });
      const dock = shell.locator("[data-card-detail-primary-actions]:visible");
      await expect(dock).toHaveCount(1);

      const layout = await dock.evaluate((element) => {
        const dockBounds = element.getBoundingClientRect();
        const slots = Array.from(element.children).map((slot) => {
          const slotElement = slot as HTMLElement;
          const control = slotElement.matches("button, a")
            ? slotElement
            : slotElement.querySelector<HTMLElement>(":scope > button, :scope > a");
          const slotBounds = slotElement.getBoundingClientRect();
          const controlBounds = control?.getBoundingClientRect() ?? null;
          return {
            slot: {
              left: slotBounds.left,
              right: slotBounds.right,
              width: slotBounds.width,
              height: slotBounds.height,
            },
            control: controlBounds
              ? {
                  left: controlBounds.left,
                  right: controlBounds.right,
                  width: controlBounds.width,
                  height: controlBounds.height,
                  scrollWidth: control?.scrollWidth ?? 0,
                  clientWidth: control?.clientWidth ?? 0,
                }
              : null,
          };
        });
        const marketTrigger = element.querySelector<HTMLElement>(
          "[data-card-detail-mobile-market] > a, [data-card-detail-mobile-market] > button"
        );
        const marketLabel = element.querySelector<HTMLElement>(
          "[data-card-detail-mobile-market-label]"
        );
        const marketTriggerBounds = marketTrigger?.getBoundingClientRect() ?? null;
        const marketLabelBounds = marketLabel?.getBoundingClientRect() ?? null;

        return {
          coarsePointer: window.matchMedia("(pointer: coarse)").matches,
          dockStyle: {
            display: window.getComputedStyle(element).display,
            gridAutoColumns: window.getComputedStyle(element).gridAutoColumns,
          },
          dock: {
            left: dockBounds.left,
            right: dockBounds.right,
            width: dockBounds.width,
          },
          slots,
          marketTrigger: marketTriggerBounds
            ? { left: marketTriggerBounds.left, right: marketTriggerBounds.right }
            : null,
          marketLabel: marketLabelBounds
            ? { left: marketLabelBounds.left, right: marketLabelBounds.right }
            : null,
        };
      });

      expect(layout.coarsePointer).toBe(true);
      expect(layout.slots).toHaveLength(3);
      const slotWidthDifference =
        Math.max(...layout.slots.map(({ slot }) => slot.width)) -
        Math.min(...layout.slots.map(({ slot }) => slot.width));
      expect(slotWidthDifference, JSON.stringify(layout)).toBeLessThanOrEqual(2);
      for (const { slot, control } of layout.slots) {
        expect(control).not.toBeNull();
        expect(slot.left).toBeGreaterThanOrEqual(layout.dock.left - 1);
        expect(slot.right).toBeLessThanOrEqual(layout.dock.right + 1);
        expect(slot.height).toBeGreaterThanOrEqual(44);
        expect(Math.abs(control!.left - slot.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(control!.right - slot.right)).toBeLessThanOrEqual(1);
        expect(control!.height).toBeGreaterThanOrEqual(44);
        expect(control!.scrollWidth).toBeLessThanOrEqual(control!.clientWidth + 1);
      }
      expect(layout.marketTrigger).not.toBeNull();
      expect(layout.marketLabel).not.toBeNull();
      expect(layout.marketLabel!.left).toBeGreaterThanOrEqual(layout.marketTrigger!.left - 1);
      expect(layout.marketLabel!.right).toBeLessThanOrEqual(layout.marketTrigger!.right + 1);
      await expectNoHorizontalOverflow(touchPage, shell);
    } finally {
      await touchContext.close();
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

    const appearance = preferencesPanel.locator("[data-appearance-section]");
    await appearance.locator('[data-theme-preset="custom"]').click();
    await expect(appearance.locator('[data-custom-theme-open="true"]')).toBeVisible();
    await expect(appearance.locator('[data-theme-preview-viewport="phone"]')).toBeVisible();

    const shortTouchTargets = await appearance.locator("button, summary, input").evaluateAll(
      (elements) =>
        elements
          .filter((element) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.visibility !== "hidden" && style.display !== "none" && rect.height > 0;
          })
          .filter((element) => element.getBoundingClientRect().height < 43.5)
          .map((element) => ({
            label: element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName,
            height: element.getBoundingClientRect().height,
          }))
    );
    expect(shortTouchTargets).toEqual([]);

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
    const sidebar = page.locator("[data-desktop-sidebar]");
    const desktopTopNavigation = page.locator("[data-desktop-top-navigation]");

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
    await expect(desktopTopNavigation).toBeHidden();

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(headerMenu).toBeHidden();
    await expect(sidebar).toBeHidden();
    await expect(desktopTopNavigation).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-desktop-navigation", "top");

    const topNavigationLinks = page.locator("[data-desktop-top-navigation-links]");
    const topNavigationAccount = page.locator("[data-desktop-top-navigation-account]");
    const desktopSearchShell = page.locator("form.dc-search-shell");
    const [navigationLinksBox, navigationAccountBox, desktopSearchShellBox, desktopBrandBox] = await Promise.all([
      topNavigationLinks.boundingBox(),
      topNavigationAccount.boundingBox(),
      desktopSearchShell.boundingBox(),
      page.getByRole("link", { name: "DustyCards" }).boundingBox(),
    ]);
    expect(navigationLinksBox).not.toBeNull();
    expect(navigationAccountBox).not.toBeNull();
    expect(desktopSearchShellBox).not.toBeNull();
    expect(desktopBrandBox).not.toBeNull();
    expect(
      Math.abs(
        navigationLinksBox!.x + navigationLinksBox!.width / 2 -
          (desktopSearchShellBox!.x + desktopSearchShellBox!.width / 2)
      )
    ).toBeLessThanOrEqual(1);
    expect(navigationLinksBox!.x + navigationLinksBox!.width).toBeLessThanOrEqual(
      navigationAccountBox!.x
    );
    const searchCenterY = desktopSearchShellBox!.y + desktopSearchShellBox!.height / 2;
    expect(
      Math.abs(desktopBrandBox!.y + desktopBrandBox!.height / 2 - searchCenterY)
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(navigationAccountBox!.y + navigationAccountBox!.height / 2 - searchCenterY)
    ).toBeLessThanOrEqual(1);
    expect(desktopSearchShellBox!.y + desktopSearchShellBox!.height).toBeLessThanOrEqual(
      navigationLinksBox!.y
    );
    const accountButtonRadius = await page
      .locator("[data-top-navigation-account]")
      .evaluate((element) => Number.parseFloat(window.getComputedStyle(element).borderTopRightRadius));
    expect(accountButtonRadius).toBeGreaterThanOrEqual(17);

    const topHeaderBox = await page.locator("[data-app-header]").boundingBox();
    expect(topHeaderBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(98);
    const navigationDivider = await page.locator("[data-app-header]").evaluate((element) => {
      const style = window.getComputedStyle(element, "::after");
      const headerStyle = window.getComputedStyle(element);
      return {
        width: Number.parseFloat(style.height),
        color: style.backgroundColor,
        left: Number.parseFloat(style.left),
        right: Number.parseFloat(style.right),
        headerBottomWidth: Number.parseFloat(headerStyle.borderBottomWidth),
      };
    });
    expect(navigationDivider.width).toBeGreaterThanOrEqual(1);
    expect(navigationDivider.color).not.toBe("rgba(0, 0, 0, 0)");
    expect(navigationDivider.left).toBe(0);
    expect(navigationDivider.right).toBe(0);
    expect(navigationDivider.headerBottomWidth).toBe(0);
    const collectionMenuTrigger = topNavigationLinks.getByRole("button", {
      name: "Collection",
      exact: true,
    });
    await collectionMenuTrigger.press("ArrowDown");
    const collectionMenu = page.getByRole("menu", { name: "Collection navigation" });
    await expect(collectionMenu).toBeVisible();
    await expect(collectionMenu.getByRole("menuitem", { name: /Wants/u })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(collectionMenu).toBeHidden();
    const topAccountButton = page.locator("[data-top-navigation-account]");
    await topAccountButton.click();
    const topAccountPanel = page.locator("#desktop-top-account-panel");
    await expect(topAccountPanel).toBeVisible();
    const topAccountPanelBox = await topAccountPanel.boundingBox();
    expect(topAccountPanelBox).not.toBeNull();
    expect(topAccountPanelBox!.y).toBeGreaterThanOrEqual(
      (topHeaderBox?.y ?? 0) + (topHeaderBox?.height ?? 0)
    );
    await topAccountButton.click();
    await expect(topAccountPanel).toBeHidden();
    const topMainPadding = await page.locator("[data-app-main]").evaluate((element) =>
      Number.parseFloat(window.getComputedStyle(element).paddingLeft)
    );
    expect(topHeaderBox?.x ?? Number.NaN).toBeLessThanOrEqual(1);
    expect(topMainPadding).toBeLessThanOrEqual(1);

    await applyDisplaySettings(page, { desktopNavigation: "sidebar" });
    await page.reload();

    await expect(page.locator("html")).toHaveAttribute("data-desktop-navigation", "sidebar");
    await expect(page.locator("[data-desktop-top-navigation]")).toBeHidden();
    await expect(page.locator("[data-desktop-sidebar]")).toBeVisible();
    const sidebarHeaderBox = await page.locator("[data-app-header]").boundingBox();
    const sidebarMainPadding = await page.locator("[data-app-main]").evaluate((element) =>
      Number.parseFloat(window.getComputedStyle(element).paddingLeft)
    );
    expect(sidebarHeaderBox?.x ?? Number.NaN).toBeGreaterThanOrEqual(255);
    expect(sidebarMainPadding).toBeGreaterThanOrEqual(255);
    await expectNoHorizontalOverflow(page);

    await applyDisplaySettings(page, { desktopNavigation: "top" });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-desktop-navigation", "top");
    await expect(page.locator("[data-desktop-top-navigation]")).toBeVisible();
    await expect(page.locator("[data-desktop-sidebar]")).toBeHidden();
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
    const headerContainerBounds = await page.locator("[data-app-header-container]").boundingBox();
    expect(headerContainerBounds).not.toBeNull();
    expect(headerContainerBounds!.width).toBeGreaterThanOrEqual(5100);
    expect(
      Math.abs(headerContainerBounds!.x + headerContainerBounds!.width / 2 - 2560)
    ).toBeLessThanOrEqual(1);
    const [wideBrandBox, wideAccountBox] = await Promise.all([
      page.getByRole("link", { name: "DustyCards" }).boundingBox(),
      page.locator("[data-desktop-top-navigation-account]").boundingBox(),
    ]);
    expect(wideBrandBox).not.toBeNull();
    expect(wideAccountBox).not.toBeNull();
    expect(wideBrandBox!.x).toBeLessThanOrEqual(40);
    expect(wideAccountBox!.x + wideAccountBox!.width).toBeGreaterThanOrEqual(5080);
    const pageBottomPadding = await canvas.evaluate((element) =>
      Number.parseFloat(window.getComputedStyle(element).paddingBottom)
    );
    expect(pageBottomPadding).toBeLessThanOrEqual(8.1);
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
    const shaderErrors: string[] = [];
    page.on("console", (message) => {
      const text = message.text();
      if (/THREE\.WebGLProgram|Shader Error|VALIDATE_STATUS/i.test(text)) {
        shaderErrors.push(text);
      }
    });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await applyDisplaySettings(page, {
      widescreen: true,
      modalSize: "medium",
      ...(CARD_DETAIL_APPEARANCE_PRESET
        ? {
            appearance: {
              ...DEFAULT_APPEARANCE_SETTINGS,
              preset: CARD_DETAIL_APPEARANCE_PRESET,
            },
          }
        : {}),
    });
    let mockedCardPriceAlert: {
      id: string;
      kind: "drop" | "target";
      targetPriceEur: number | null;
      baselinePriceEur: number | null;
      enabled: boolean;
    } | null = null;
    await page.route("**/api/cards/*/price-alert", async (route) => {
      const method = route.request().method();
      if (method === "PUT") {
        const body = route.request().postDataJSON() as {
          kind: "drop" | "target";
          targetPriceEur?: number;
        };
        mockedCardPriceAlert = {
          id: "playwright-price-alert",
          kind: body.kind,
          targetPriceEur: body.targetPriceEur ?? null,
          baselinePriceEur: 169.95,
          enabled: true,
        };
      } else if (method === "DELETE") {
        mockedCardPriceAlert = null;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alert: mockedCardPriceAlert,
          currentPriceEur: 169.95,
          currentPriceAt: "2026-07-19T12:00:00.000Z",
          mailConfigured: true,
        }),
      });
    });
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

    const priceAlertTrigger = shell.locator("[data-card-price-alert-trigger]");
    await expect(priceAlertTrigger).toBeVisible();
    await expect(priceAlertTrigger).toHaveAttribute(
      "aria-label",
      "Set price alert for Seismitoad"
    );
    await priceAlertTrigger.click();
    const priceAlertDialog = page.locator("[data-card-price-alert-dialog]");
    await expect(priceAlertDialog).toBeVisible();
    await expect(priceAlertDialog.getByText("CardMarket EN / Near Mint", { exact: false })).toBeVisible();
    await priceAlertDialog.getByRole("radio", { name: /Target price/ }).click();
    await priceAlertDialog.getByLabel("Your target").fill("149.95");
    if (CARD_DETAIL_SCREENSHOT_DIR) {
      await page.screenshot({
        path: `${CARD_DETAIL_SCREENSHOT_DIR}/standard-price-alert-1920x1080.png`,
        animations: "disabled",
      });
    }
    await priceAlertDialog.getByRole("button", { name: "Create alert" }).click();
    await expect(priceAlertDialog).toBeHidden();
    await expect(priceAlertTrigger).toHaveAttribute(
      "aria-label",
      "Edit price alert for Seismitoad"
    );

    const heroMarketControls = shell.locator("[data-card-detail-market-mode]");
    const rawHeroMode = heroMarketControls.getByRole("button", { name: "Raw", exact: true });
    const gradedHeroMode = heroMarketControls.getByRole("button", {
      name: "Graded",
      exact: true,
    });
    const heroPriceLabel = shell.locator(".card-detail-price-label");
    const heroPrice = shell.locator(".card-detail-price");
    const heroMarketToggle = shell.locator("[data-card-detail-market-toggle]");
    const identityRegion = shell.locator('[data-card-detail-region="identity"]');
    const rawLanguageControl = shell.locator(
      '[data-card-detail-chart-series-control="language"]'
    );
    await expect(rawHeroMode).toHaveAttribute("aria-pressed", "true");
    const rawPriceStatusLabels = await expectVisiblePriceStatusItems(shell);
    await expect(
      shell.getByRole("combobox", { name: "Select graded slab", exact: true })
    ).toHaveCount(0);
    const [rawMarketToggleBounds, rawIdentityBounds, rawLanguageBounds] = await Promise.all([
      requiredBounds(heroMarketToggle),
      requiredBounds(identityRegion),
      requiredBounds(rawLanguageControl),
    ]);

    await gradedHeroMode.click();
    await expect(gradedHeroMode).toHaveAttribute("aria-pressed", "true");
    const heroGradeSelector = await expectSingleChartGradeSelector(shell);
    const [gradedMarketToggleBounds, gradedIdentityBounds, gradedSeriesBounds] =
      await Promise.all([
        requiredBounds(heroMarketToggle),
        requiredBounds(identityRegion),
        requiredBounds(
          shell.locator('[data-card-detail-chart-series-control="grade"]')
        ),
      ]);
    expectBoundsToMatch(gradedMarketToggleBounds, rawMarketToggleBounds);
    expectBoundsToMatch(gradedIdentityBounds, rawIdentityBounds);
    expectBoundsToMatch(gradedSeriesBounds, rawLanguageBounds);
    const gradedOptionLabels = await heroGradeSelector.locator("option").allTextContents();
    expect(gradedOptionLabels.some((label) => label.includes("CardMarket"))).toBe(true);
    expect(gradedOptionLabels.some((label) => label.includes("eBay sold"))).toBe(true);
    await expect(
      shell.locator('[data-card-detail-region="chart"] .card-modal-source-toggle')
    ).toHaveCount(0);

    await selectGradeStartingWith(heroGradeSelector, "BGS 10");
    await expect(heroPriceLabel).toContainText("BGS 10");
    await expect(heroPrice).toHaveText(/^€[\d,.]+$/);
    const bgsPriceText = (await heroPrice.textContent())?.trim();
    expect(bgsPriceText).toBeTruthy();
    await expectSelectedGradeInHistoryChart(shell, bgsPriceText!);

    await selectGradeStartingWith(heroGradeSelector, "PSA 10");
    await expect(heroPriceLabel).toContainText("PSA 10");
    await expect(heroPrice).toHaveText(/^€[\d,.]+$/);
    const psaPriceText = (await heroPrice.textContent())?.trim();
    expect(psaPriceText).toBeTruthy();
    expect(psaPriceText).not.toBe(bgsPriceText);
    await expectSelectedGradeInHistoryChart(shell, psaPriceText!);
    expect(await expectVisiblePriceStatusItems(shell)).toEqual(rawPriceStatusLabels);
    await expect(
      shell.getByRole("combobox", { name: "Select graded slab", exact: true })
    ).toHaveCount(1);
    await captureCardDetailScreenshot(page, shell, "standard-graded-1920x1080.png");

    await rawHeroMode.click();
    await expect(rawHeroMode).toHaveAttribute("aria-pressed", "true");
    expectBoundsToMatch(await requiredBounds(heroMarketToggle), rawMarketToggleBounds);
    expectBoundsToMatch(await requiredBounds(identityRegion), rawIdentityBounds);
    await expect(
      shell.getByRole("combobox", { name: "Select graded slab", exact: true })
    ).toHaveCount(0);

    const tcgPlayerSource = shell
      .locator('[data-card-detail-region="chart"]')
      .getByRole("button", { name: "TCGPlayer", exact: true });
    if ((await tcgPlayerSource.count()) > 0) {
      await tcgPlayerSource.click();
      await expect(tcgPlayerSource).toHaveAttribute("aria-pressed", "true");
      expectBoundsToMatch(await requiredBounds(heroMarketToggle), rawMarketToggleBounds);
      expectBoundsToMatch(await requiredBounds(identityRegion), rawIdentityBounds);
      await shell
        .locator('[data-card-detail-region="chart"]')
        .getByRole("button", { name: "CardMarket", exact: true })
        .click();
    }

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
    await expectReadyCardHoloMask(mediaSwitcher.locator(".card-detail-inline-three-viewer"));
    await page.waitForTimeout(750);
    await expectCanvasHasPixels(page, inlineCanvas, 350);
    expect(shaderErrors).toEqual([]);
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
    const analysisTab = shell.getByRole("tab", { name: "Analysis", exact: true });
    const evidenceTab = shell.getByRole("tab", { name: "Evidence", exact: true });
    await expect(overviewTab).toHaveAttribute("aria-selected", "true");
    await overviewTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(marketTab).toHaveAttribute("aria-selected", "true");
    await expect(marketTab).toBeFocused();
    await page.keyboard.press("End");
    await expect(evidenceTab).toHaveAttribute("aria-selected", "true");
    await expect(evidenceTab).toBeFocused();
    await page.keyboard.press("Home");
    await expect(overviewTab).toHaveAttribute("aria-selected", "true");
    await expect(overviewTab).toBeFocused();
    await forecastTab.click();
    await expect(shell).toHaveAttribute("data-active-tab", "forecast");
    await expect(shell.getByRole("heading", { name: "Forecast targets", exact: true })).toBeVisible();
    await captureCardDetailScreenshot(page, shell, "standard-forecast-1920x1080.png");
    await analysisTab.click();
    await expect(shell).toHaveAttribute("data-active-tab", "analysis");
    await expect(shell.getByRole("heading", { name: "Sealed and scarcity", exact: true })).toBeVisible();
    await evidenceTab.click();
    await expect(shell).toHaveAttribute("data-active-tab", "evidence");
    await expect(shell.getByRole("heading", { name: "External proof", exact: true })).toBeVisible();
    await expect(shell.locator("[data-card-detail-research]:visible")).toHaveCount(1);
    await captureCardDetailScreenshot(page, shell, "standard-evidence-1920x1080.png");
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
    await expectWideDetailTabsBesideMedia(shell);
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

    await page.setViewportSize({ width: 700, height: 900 });
    const tabletScrollLayers = await shell.evaluate((element) => {
      const dialog = element.closest<HTMLElement>("[role='dialog']");
      const detailViewport = element.querySelector<HTMLElement>(
        "[data-card-detail-scroll-viewport]"
      );
      return {
        dialog: dialog ? getComputedStyle(dialog).overflowY : null,
        detailViewport: detailViewport ? getComputedStyle(detailViewport).overflowY : null,
      };
    });
    expect(tabletScrollLayers).toEqual({ dialog: "hidden", detailViewport: "auto" });
    await expectNoHorizontalOverflow(page, shell);

    await page.setViewportSize({ width: 390, height: 844 });
    await marketTab.click();
    await gradedHeroMode.click();
    await expect(gradedHeroMode).toHaveAttribute("aria-pressed", "true");
    await expectVisiblePriceStatusItems(shell);
    await captureCardDetailStatusScreenshot(
      page,
      shell,
      "standard-graded-status-390x844.png"
    );
    await rawHeroMode.click();
    await expect(rawHeroMode).toHaveAttribute("aria-pressed", "true");
    await overviewTab.click();
    await captureCardDetailScreenshot(page, shell, "standard-390x844.png");
    await expectMobileActionClusterNeverCoversDetail(page, shell);
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
    await expectMobileDetailTabsKeepScrollAnchor(page, shell, [
      "Overview",
      "Market",
      "Collection",
      "Evidence",
      "Market",
    ]);
    await expectMobileActionClusterNeverCoversDetail(page, shell, {
      requireScrollable: false,
    });
    await expectDetailHeroLayout(shell, "single");
    await expect(shell.locator("[data-card-detail-media-switch]")).toBeHidden();
    await expectDetailScrollLayersClear(page, shell, "standard");
    await expectTouchSizedDetailControls(shell);
    await expectSingleVisibleActionCluster(shell);
    await expect(shell.locator(".card-detail-media-actions")).toBeHidden();
    await expect(
      shell.locator("[data-card-detail-primary-actions]").getByText("CardMarket", { exact: true })
    ).toHaveCount(1);
    const mobileMarketAction = shell.locator("[data-card-detail-mobile-market]");
    const mobileMarketTrigger = mobileMarketAction.locator(
      '[aria-label="Open CardMarket. Hold for eBay Deals."]'
    );
    await expect(mobileMarketTrigger).toBeVisible();
    const mobileCardMarketHref = await mobileMarketTrigger.getAttribute("href");
    expect(mobileCardMarketHref).toMatch(/^https:\/\/www\.cardmarket\.com\//u);
    const mobileCardMarketUrl = new URL(mobileCardMarketHref!);
    expect(mobileCardMarketUrl.searchParams.get("language")).toBe("1");
    expect(mobileCardMarketUrl.searchParams.get("minCondition")).toBe("2");
    const mobileMarketTriggerBounds = await requiredBounds(mobileMarketTrigger);
    await page.mouse.move(
      mobileMarketTriggerBounds.x + mobileMarketTriggerBounds.width / 2,
      mobileMarketTriggerBounds.y + mobileMarketTriggerBounds.height / 2
    );
    await page.mouse.down();
    await page.waitForTimeout(450);
    const mobileMarketMenu = mobileMarketAction.locator(
      "[data-card-detail-mobile-market-menu]"
    );
    await expect(mobileMarketMenu).toBeVisible();
    const mobileMarketMenuBounds = await requiredBounds(mobileMarketMenu);
    expect(
      mobileMarketMenuBounds.y + mobileMarketMenuBounds.height
    ).toBeLessThanOrEqual(mobileMarketTriggerBounds.y);
    if (CARD_DETAIL_SCREENSHOT_DIR) {
      await page.screenshot({
        path: `${CARD_DETAIL_SCREENSHOT_DIR}/standard-market-hold-390x844.png`,
        animations: "disabled",
      });
    }
    await page.mouse.up();
    await page.keyboard.press("Escape");
    await expect(mobileMarketMenu).toBeHidden();
    const mobileBackBounds = await requiredBounds(shell.locator("[data-card-detail-back]"));
    const mobileOverflowBounds = await requiredBounds(
      shell.locator("[data-card-detail-overflow-actions] > summary")
    );
    const mobilePriceAlertBounds = await requiredBounds(priceAlertTrigger);
    expect(Math.abs(mobileBackBounds.y - mobileOverflowBounds.y)).toBeLessThanOrEqual(4);
    expect(Math.abs(mobileBackBounds.y - mobilePriceAlertBounds.y)).toBeLessThanOrEqual(4);
    const mobilePrimaryActionStyle = await shell
      .locator("[data-card-detail-primary-actions]")
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          borderTopWidth: style.borderTopWidth,
          borderRadius: Number.parseFloat(style.borderRadius),
          boxShadow: style.boxShadow,
          position: style.position,
        };
      });
    expect(mobilePrimaryActionStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(mobilePrimaryActionStyle.backgroundImage).not.toBe("none");
    expect(mobilePrimaryActionStyle.borderTopWidth).toBe("1px");
    expect(mobilePrimaryActionStyle.borderRadius).toBeGreaterThanOrEqual(16);
    expect(mobilePrimaryActionStyle.boxShadow).not.toBe("none");
    expect(mobilePrimaryActionStyle.position).toBe("fixed");
    const mobileActionHostStyle = await shell
      .locator("[data-card-detail-mobile-actions-host]")
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          pointerEvents: style.pointerEvents,
        };
      });
    expect(mobileActionHostStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(mobileActionHostStyle.pointerEvents).toBe("none");
    const mobilePrimaryButtons = shell
      .locator("[data-card-detail-primary-actions]")
      .locator("button, a[href]");
    await expect(mobilePrimaryButtons).toHaveCount(3);
    const mobilePrimaryWidths = await mobilePrimaryButtons.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().width)
    );
    expect(Math.max(...mobilePrimaryWidths) - Math.min(...mobilePrimaryWidths)).toBeLessThanOrEqual(2);
    await shell.evaluate((element) => {
      (element as HTMLElement).style.setProperty("--card-detail-safe-area-left", "31px");
      (element as HTMLElement).style.setProperty("--card-detail-safe-area-right", "5px");
    });
    const asymmetricDockBounds = await requiredBounds(
      shell.locator("[data-card-detail-primary-actions]:visible")
    );
    expect(asymmetricDockBounds.x).toBeCloseTo(35, 0);
    expect(390 - asymmetricDockBounds.x - asymmetricDockBounds.width).toBeCloseTo(12, 0);
    await shell.evaluate((element) => {
      (element as HTMLElement).style.removeProperty("--card-detail-safe-area-left");
      (element as HTMLElement).style.removeProperty("--card-detail-safe-area-right");
    });
    const [mobileFrameBackground, mobileShellBackground] = await Promise.all([
      dialog.evaluate((element) => getComputedStyle(element).backgroundColor),
      shell.evaluate((element) => getComputedStyle(element).backgroundColor),
    ]);
    expect(mobileFrameBackground).toBe(mobileShellBackground);

    await priceAlertTrigger.click();
    await expect(priceAlertDialog).toBeVisible();
    const mobilePriceAlertClose = priceAlertDialog.getByRole("button", {
      name: "Close price alert",
    });
    const mobilePriceAlertCloseBounds = await requiredBounds(mobilePriceAlertClose);
    expect(mobilePriceAlertCloseBounds.width).toBeGreaterThanOrEqual(44);
    expect(mobilePriceAlertCloseBounds.height).toBeGreaterThanOrEqual(44);
    if (CARD_DETAIL_SCREENSHOT_DIR) {
      await page.screenshot({
        path: `${CARD_DETAIL_SCREENSHOT_DIR}/standard-price-alert-390x844.png`,
        animations: "disabled",
      });
    }
    await mobilePriceAlertClose.click();
    await expect(priceAlertDialog).toBeHidden();
    await expectNoHorizontalOverflow(page, shell);
    await forecastTab.click();
    await captureCardDetailPanelScreenshot(page, shell, "standard-forecast-390x844.png");
    await evidenceTab.click();
    await captureCardDetailPanelScreenshot(page, shell, "standard-evidence-390x844.png");
    await expectMobileActionClusterNeverCoversDetail(page, shell, {
      requireScrollable: false,
    });

    await page.setViewportSize({ width: 5120, height: 1440 });
    await overviewTab.click();
    await expectDetailHeroLayout(shell, "triple");
    await expectBoundedCenteredDetailCanvas(shell);
    await expectWideDetailTabsBesideMedia(shell);
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
    await expect(reopenedShell.getByRole("tab")).toHaveCount(6);
    await reopenedShell.getByRole("tab", { name: "Evidence", exact: true }).click();
    const mobileResearchAction = reopenedShell.locator("[data-card-detail-research]:visible");
    await expect(mobileResearchAction).toHaveCount(1);
    await mobileResearchAction.click();
    await expect(reopenedShell.locator('[data-card-detail-signal-state="error"]')).toContainText(
      "Simulated research failure"
    );
    const urlBeforeModalEdgeBack = page.url();
    const lockedUnderlyingScrollY = await page.evaluate(() => {
      const lockedTop = Number.parseFloat(document.body.style.top);
      return Number.isFinite(lockedTop) ? Math.max(0, -lockedTop) : window.scrollY;
    });
    await swipeBackFromMobileViewportEdge(page, {
      // Real iPhone gestures often start over this large interactive control.
      // WebKit can finish the sequence as touchcancel after edge overscroll.
      targetSelector: "[data-card-modal-root] [data-card-detail-back]",
      finishWithCancel: true,
      durationMs: 700,
    });
    await expect(reopenedDialog).toBeHidden();
    expect(page.url()).toBe(urlBeforeModalEdgeBack);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeCloseTo(lockedUnderlyingScrollY, 0);
    await expect(page).toHaveURL(/\/search\?q=seismitoad&game=pokemon&autoswitch=0$/);
  });

  test("Signal Radar shows a responsive new-release chase read", async ({ page }) => {
    test.setTimeout(180_000);
    const episodeId = findPokemonEpisodeWithImageCards();
    expect(episodeId).not.toBeNull();
    if (!episodeId) return;

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      `/movers/signal-radar?game=pokemon&set=${encodeURIComponent(episodeId)}#new-release-chases`,
      {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      }
    );

    const chasePanel = page.getByTestId("new-release-chase-radar");
    await expect(chasePanel).toBeVisible({ timeout: 60_000 });
    await expect(chasePanel.getByText("New set chase radar", { exact: true })).toBeVisible();
    await expect(
      chasePanel.getByRole("heading", { name: /: what Radar thinks$/ })
    ).toBeVisible();
    await expect(chasePanel.getByText("Price coverage", { exact: true })).toBeVisible();
    await expect(chasePanel.getByText("Latest market read", { exact: true })).toBeVisible();
    await expect(chasePanel).toHaveAttribute("id", "new-release-chases");

    const chaseCard = chasePanel.locator("[data-chase-card-id]").first();
    if ((await chaseCard.count()) > 0) {
      const chaseCardLink = chaseCard.locator("[data-chase-card-link]");
      await expect(chaseCardLink).toBeVisible();
      await expect(chaseCardLink).toHaveAttribute(
        "aria-label",
        /^Open full chase analysis for /u
      );
      await expect(chaseCardLink).toHaveAttribute(
        "href",
        /^\/movers\/signal-radar\/[^?]+\?game=pokemon&fromSet=/u
      );
    }

    const mobileBounds = await requiredBounds(chasePanel);
    expect(mobileBounds.x).toBeGreaterThanOrEqual(-1);
    expect(mobileBounds.x + mobileBounds.width).toBeLessThanOrEqual(391);
    expect(
      await chasePanel.evaluate((element) => element.scrollWidth - element.clientWidth)
    ).toBeLessThanOrEqual(2);
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 320, height: 844 });
    await expect(chasePanel).toBeVisible();
    expect(
      await chasePanel.evaluate((element) => element.scrollWidth - element.clientWidth)
    ).toBeLessThanOrEqual(2);
    await expectNoHorizontalOverflow(page);
    if ((await chaseCard.count()) > 0) {
      const footer = chaseCard.locator("[data-chase-card-footer]");
      const analysis = chaseCard.locator("[data-chase-analysis-link]");
      const actions = chaseCard.locator("[data-chase-card-actions]");
      await expect(footer).toBeVisible();
      if ((await actions.count()) > 0) {
        const analysisBounds = await requiredBounds(analysis);
        const actionBounds = await requiredBounds(actions);
        expect(analysisBounds.y + analysisBounds.height).toBeLessThanOrEqual(
          actionBounds.y + 1
        );
      }
    }

    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(chasePanel).toBeVisible();
    const desktopBounds = await requiredBounds(chasePanel);
    expect(desktopBounds.x).toBeGreaterThanOrEqual(-1);
    expect(desktopBounds.x + desktopBounds.width).toBeLessThanOrEqual(1921);
    expect(
      await chasePanel.evaluate((element) => element.scrollWidth - element.clientWidth)
    ).toBeLessThanOrEqual(2);
    await expectNoHorizontalOverflow(page);

    if ((await chaseCard.count()) > 0) {
      await page.setViewportSize({ width: 390, height: 844 });
      const cardId = await chaseCard.getAttribute("data-chase-card-id");
      expect(cardId).toBeTruthy();
      await chaseCard.click({ position: { x: 16, y: 16 } });
      await expect(page).toHaveURL(
        new RegExp(`/movers/signal-radar/${cardId}\\?game=pokemon&fromSet=`),
        { timeout: 60_000 }
      );
      await expect(
        page.locator('[data-card-detail-shell][data-card-detail-mode="radar"]')
      ).toBeVisible({ timeout: 60_000 });

      await swipeBackFromMobileViewportEdge(page);
      await expect(page).toHaveURL(
        new RegExp(
          `/movers/signal-radar\\?game=pokemon&set=${encodeURIComponent(episodeId)}#new-release-chases$`
        ),
        { timeout: 60_000 }
      );
    }
  });

  test("appearance presets and custom colours apply, preview, and persist", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    try {
      await page.goto("/settings");
      const appearance = page.locator("[data-appearance-section]:visible");
      const root = page.locator("html");
      await expect(appearance).toBeVisible();

      const lightPresets = appearance.locator('[data-theme-tone="light"]');
      await expect(lightPresets).toHaveCount(2);
      await expect(appearance.locator('[data-theme-preset="amber-archive"]')).toHaveCount(0);
      await expect(
        appearance.locator('[data-theme-preset="porcelain-studio"]')
      ).toContainText("Light");
      await expect(
        appearance.locator('[data-theme-preset="blush-petal"]')
      ).toContainText("Light");

      await appearance.locator('[data-theme-preset="porcelain-studio"]').click();
      await expect(root).toHaveAttribute("data-appearance", "porcelain-studio");
      await expect
        .poll(() =>
          page.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue("--dc-bg-main").trim()
          )
        )
        .toBe("#F5F6FA");
      await expect(root).toHaveAttribute("data-appearance-scheme", "light");
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme))
        .toContain("light");
      await expectNoHorizontalOverflow(page);
      if (CARD_DETAIL_SCREENSHOT_DIR) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `${CARD_DETAIL_SCREENSHOT_DIR}/porcelain-settings-1280x900.png`,
          animations: "disabled",
        });
      }

      await appearance.locator('[data-theme-preset="blush-petal"]').click();
      await expect(root).toHaveAttribute("data-appearance", "blush-petal");
      await expect(root).toHaveAttribute("data-appearance-scheme", "light");
      await expect
        .poll(() =>
          page.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue("--dc-bg-main").trim()
          )
        )
        .toBe("#FFF5FA");
      if (CARD_DETAIL_SCREENSHOT_DIR) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `${CARD_DETAIL_SCREENSHOT_DIR}/blush-settings-1280x900.png`,
          animations: "disabled",
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => window.scrollTo(0, 0));
        await expectNoHorizontalOverflow(page);
        await page.screenshot({
          path: `${CARD_DETAIL_SCREENSHOT_DIR}/blush-settings-390x844.png`,
          animations: "disabled",
        });
        await page.setViewportSize({ width: 1280, height: 900 });
      }

      const rose = appearance.locator('[data-theme-preset="rose-quartz"]');
      await rose.click();
      await expect(root).toHaveAttribute("data-appearance", "rose-quartz");
      await expect
        .poll(() =>
          page.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue("--dc-primary").trim()
          )
        )
        .toBe("#B83E7A");

      await appearance.locator('[data-theme-preset="custom"]').click();
      await expect(appearance.locator('[data-custom-theme-open="true"]')).toBeVisible();
      await expect(appearance.locator('[data-theme-preview="true"]')).toBeVisible();

      const primaryHex = appearance.locator(
        '[data-theme-color-field="primary"] input[type="text"]'
      );
      await primaryHex.fill("#2457A6");
      await expect(root).toHaveAttribute("data-appearance", "rose-quartz");

      await appearance.getByRole("button", { name: "Phone preview" }).click();
      await expect(
        appearance.locator('[data-theme-preview-viewport="phone"]')
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await appearance.locator("[data-theme-apply]").click();
      await expect(root).toHaveAttribute("data-appearance", "custom");
      await expect
        .poll(() =>
          page.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue("--dc-primary").trim()
          )
        )
        .toBe("#2457A6");

      await page.reload();
      await expect(root).toHaveAttribute("data-appearance", "custom");
      await expect
        .poll(() =>
          page.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue("--dc-primary").trim()
          )
        )
        .toBe("#2457A6");
    } finally {
      await page.request.put("/api/account/settings", { data: { settings: baseSettings } });
    }
  });

  test("Signal Radar cards expose inline collection and want actions without navigating", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/wants/cards", async (route) => {
      const method = route.request().method();
      if (method !== "POST" && method !== "DELETE") {
        await route.fallback();
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          method === "POST"
            ? { item: { id: "playwright-radar-want", created_at: isoDate() } }
            : {}
        ),
      });
    });
    await page.goto("/movers/signal-radar?game=pokemon", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    // The first twelve cards arrive through the progressive feed when there is
    // no immediately renderable persisted cohort. Wait for that honest loading
    // state to resolve before deciding that this database has no Radar cards.
    await page
      .locator("[data-chase-card-id], [data-signal-card-id]")
      .first()
      .waitFor({ state: "attached", timeout: 60_000 })
      .catch(() => undefined);

    const chaseCard = page.locator("[data-chase-card-id]").first();
    const signalCard = page.locator("[data-signal-card-id]").first();
    const eligibleCards = [chaseCard, signalCard];
    let coveredCardKinds = 0;
    let interactiveCard: Locator | null = null;

    for (const card of eligibleCards) {
      if ((await card.count()) === 0) continue;
      await expectMobileCardListTileContract(page, card);
      coveredCardKinds += 1;
      interactiveCard ??= card;
    }

    if (!interactiveCard) {
      test.skip(true, "No Signal Radar cards are available in this local database.");
      return;
    }
    expect(coveredCardKinds).toBeGreaterThan(0);

    const { actions, collection, want } = await expectInlineCardActions(interactiveCard);
    const [cardBounds, actionBounds] = await Promise.all([
      requiredBounds(interactiveCard),
      requiredBounds(actions),
    ]);
    expect(actionBounds.x).toBeGreaterThanOrEqual(cardBounds.x - 1);
    expect(actionBounds.x + actionBounds.width).toBeLessThanOrEqual(
      cardBounds.x + cardBounds.width + 1
    );

    const search = page.getByPlaceholder("Search cards...");
    const sort = page.getByLabel("Sort signals");
    const signalName =
      (await signalCard.count()) > 0
        ? (await signalCard
            .locator('[data-card-action="collection"] button')
            .getAttribute("aria-label"))
            ?.replace(/^Add /, "")
            .replace(/ to collection$/, "") ?? null
        : null;
    if (signalName) {
      await search.fill(signalName);
      await expect(search).toHaveValue(signalName);
    }
    const originalSort = await sort.inputValue();
    const alternateSort = await sort.locator("option").evaluateAll(
      (options, current) =>
        options
          .map((option) => (option as HTMLOptionElement).value)
          .find((value) => value !== current) ?? current,
      originalSort
    );
    await sort.selectOption(alternateSort);

    const urlBefore = page.url();
    const pressedBefore = await want.getAttribute("aria-pressed");
    await want.click();
    await expect(want).toHaveAttribute(
      "aria-pressed",
      pressedBefore === "true" ? "false" : "true"
    );
    expect(page.url()).toBe(urlBefore);
    if (signalName) await expect(search).toHaveValue(signalName);
    await expect(sort).toHaveValue(alternateSort);
    await expect(page.locator("[data-card-detail-shell]")).toHaveCount(0);

    await collection.click();
    const addDialog = page.locator('[data-collection-add-modal="true"]');
    await expect(addDialog).toBeVisible();
    expect(page.url()).toBe(urlBefore);
    await expect(page.locator("[data-card-detail-shell]")).toHaveCount(0);
    await addDialog.getByRole("button", { name: "Close add card" }).click();
    await expectNoHorizontalOverflow(page);
  });

  test("Signal Radar detail shares the responsive card detail shell", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await applyDisplaySettings(page, {
      widescreen: true,
      modalSize: "medium",
    });
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
    const radarVerdict = shell.getByTestId("signal-radar-verdict");
    await expect(radarVerdict).toBeVisible();
    await expect(radarVerdict).toContainText("Radar verdict");
    await expect(radarVerdict).toContainText(/Strong watch|Building|Cooling|Price discovery|Data stale|Stable - wait/);
    await expect(shell.getByText("Collector snapshot", { exact: true })).toHaveCount(0);
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
    const radarMarketToggle = shell.locator("[data-card-detail-market-toggle]");
    const radarIdentityRegion = shell.locator('[data-card-detail-region="identity"]');
    const radarRawLanguageControl = shell.locator(
      '[data-card-detail-chart-series-control="language"]'
    );
    const radarRawHeroPrice = (await radarHeroPrice.textContent())?.trim() ?? "";
    expect(radarRawHeroPrice).not.toBe("");
    await expect(radarRawMode).toHaveAttribute("aria-pressed", "true");
    await expect(
      shell.getByRole("combobox", { name: "Select graded slab", exact: true })
    ).toHaveCount(0);
    const [radarRawToggleBounds, radarRawIdentityBounds, radarRawLanguageBounds] =
      await Promise.all([
        requiredBounds(radarMarketToggle),
        requiredBounds(radarIdentityRegion),
        requiredBounds(radarRawLanguageControl),
      ]);

    await radarGradedMode.click();
    await expect(radarGradedMode).toHaveAttribute("aria-pressed", "true");
    const radarGradeSelector = await expectSingleChartGradeSelector(shell);
    expectBoundsToMatch(await requiredBounds(radarMarketToggle), radarRawToggleBounds);
    expectBoundsToMatch(await requiredBounds(radarIdentityRegion), radarRawIdentityBounds);
    expectBoundsToMatch(
      await requiredBounds(shell.locator('[data-card-detail-chart-series-control="grade"]')),
      radarRawLanguageBounds
    );
    const radarSelectedGrade = await radarGradeSelector.inputValue();
    expect(radarSelectedGrade).toMatch(/(?:BGS|CGC|PSA|graded)/i);
    await expect(radarHeroPriceLabel).toHaveText(`${radarSelectedGrade} market`);
    await expect(radarHeroPrice).not.toHaveText(radarRawHeroPrice);
    await expect(shell.locator('[data-card-detail-region="chart"]')).toContainText(
      radarSelectedGrade
    );
    await expect(
      shell.getByRole("combobox", { name: "Select graded slab", exact: true })
    ).toHaveCount(1);
    await captureCardDetailScreenshot(page, shell, "radar-graded-1920x1080.png");

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
    await expectReadyCardHoloMask(radarMediaSwitcher.locator(".card-detail-inline-three-viewer"));
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
    await captureCardDetailScreenshot(page, shell, "radar-forecast-1920x1080.png");
    await evidenceTab.click();
    await captureCardDetailScreenshot(page, shell, "radar-evidence-1920x1080.png");

    await overviewTab.click();
    await captureCardDetailScreenshot(page, shell, "radar-1920x1080.png");
    await expectDetailHeroLayout(shell, "triple");
    await expectWideDetailTabsBesideMedia(shell);
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
    await radarGradedMode.click();
    await expect(radarGradedMode).toHaveAttribute("aria-pressed", "true");
    await captureCardDetailScreenshot(page, shell, "radar-graded-390x844.png");
    await radarRawMode.click();
    await expect(radarRawMode).toHaveAttribute("aria-pressed", "true");
    await overviewTab.click();
    await expect(shell.locator('[data-card-detail-region="chart"]')).toBeHidden();
    await captureCardDetailScreenshot(page, shell, "radar-390x844.png");
    await expectMobileActionClusterNeverCoversDetail(page, shell);
    await forecastTab.click();
    await expect(shell.locator('[data-card-detail-region="chart"]')).toBeVisible();
    await expectMobileDetailTabsKeepScrollAnchor(page, shell, [
      "Overview",
      "Market",
      "Collection",
      "Evidence",
      "Forecast",
    ]);
    await expectMobileActionClusterNeverCoversDetail(page, shell, {
      requireScrollable: false,
    });
    await expectDetailHeroLayout(shell, "single");
    await expectDetailScrollLayersClear(page, shell, "radar");
    await expectTouchSizedDetailControls(shell);
    await expectSingleVisibleActionCluster(shell);
    await expect(shell.locator(".card-detail-media-actions")).toBeHidden();
    await expect(
      shell.locator("[data-card-detail-primary-actions]").getByText("CardMarket", { exact: true })
    ).toHaveCount(1);
    const radarMobileBackBounds = await requiredBounds(shell.locator("[data-card-detail-back]"));
    const radarMobileOverflowBounds = await requiredBounds(
      shell.locator("[data-card-detail-overflow-actions] > summary")
    );
    expect(Math.abs(radarMobileBackBounds.y - radarMobileOverflowBounds.y)).toBeLessThanOrEqual(4);
    await expectNoHorizontalOverflow(page, shell);
    await captureCardDetailPanelScreenshot(page, shell, "radar-forecast-390x844.png");
    await evidenceTab.click();
    await captureCardDetailPanelScreenshot(page, shell, "radar-evidence-390x844.png");
    await expectMobileActionClusterNeverCoversDetail(page, shell, {
      requireScrollable: false,
    });

    await page.setViewportSize({ width: 5120, height: 1440 });
    await overviewTab.click();
    await expectDetailHeroLayout(shell, "triple");
    await expectBoundedCenteredDetailCanvas(shell);
    await expectWideDetailTabsBesideMedia(shell);
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

    await page.goto("/search?q=Mew&game=pokemon&autoswitch=0");
    await page.getByRole("button", { name: "Open search" }).click();
    const resumedSearch = page.getByPlaceholder("Search cards...");
    await expect(resumedSearch).toHaveValue("Mew");

    // A route update may finish while the user pauses mid-query. The mobile
    // search overlay must remain mounted and accept the rest of the text.
    await page.waitForTimeout(450);
    await expect(resumedSearch).toBeVisible();
    await resumedSearch.type(" ex");
    await expect(resumedSearch).toHaveValue("Mew ex");
    await expect(page).toHaveURL(/q=Mew(?:\+|%20)ex&game=pokemon&autoswitch=0/);
    await expect(page.getByRole("heading", { name: 'Results for "Mew ex"' })).toBeVisible();
    await expect(resumedSearch).toBeVisible();
  });

  test("mobile More hub stays accessible, contained, and free of primary-nav duplicates", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const moreTrigger = page.getByRole("button", { name: "More", exact: true });
    await moreTrigger.click();

    const dialog = page.locator('[data-mobile-navigation-root][role="dialog"]');
    const sheet = page.locator("[data-mobile-more-sheet]");
    const scrollRegion = page.locator("[data-mobile-more-scroll]");
    const header = page.locator("[data-mobile-more-header]");
    const bottomNav = page.locator("[data-mobile-bottom-nav]");
    const closeButton = page.getByRole("button", { name: "Close navigation menu" });

    await expect(dialog).toBeVisible();
    await expect(sheet).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(bottomNav).toBeVisible();
    await expect(closeButton).toBeFocused();
    await expect(sheet.locator('a[href="/movers/signal-radar"]')).toBeVisible();
    await expect(sheet.getByRole("link", { name: /Submit card/ })).toBeVisible();
    await expect(sheet.getByRole("link", { name: /For sale/ })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Account", exact: true })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Settings", exact: true })).toBeVisible();

    for (const primaryHref of ["/", "/?tab=complete", "/wants", "/movers"]) {
      await expect(sheet.locator(`a[href="${primaryHref}"]`)).toHaveCount(0);
    }

    const undersizedTargets = await dialog.locator("a, button").evaluateAll((targets) =>
      targets
        .map((target) => ({
          label: target.getAttribute("aria-label") || target.textContent?.trim() || "unnamed",
          height: target.getBoundingClientRect().height,
        }))
        .filter((target) => target.height < 43.5)
    );
    expect(undersizedTargets).toEqual([]);

    const pageScrollBeforeSheetScroll = await page.evaluate(() => window.scrollY);
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    );
    expect(await scrollRegion.evaluate((element) => element.scrollTop)).toBe(0);

    const headerTopBeforeScroll = (await header.boundingBox())?.y ?? Number.NaN;
    await scrollRegion.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect.poll(() => scrollRegion.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    );
    const bottomScrollEdge = await scrollRegion.evaluate((element) => ({
      scrollTop: element.scrollTop,
      maxScrollTop: element.scrollHeight - element.clientHeight,
    }));
    expect(Math.abs(bottomScrollEdge.scrollTop - bottomScrollEdge.maxScrollTop)).toBeLessThanOrEqual(
      0.5
    );
    const headerTopAfterScroll = (await header.boundingBox())?.y ?? Number.NaN;
    expect(Math.abs(headerTopAfterScroll - headerTopBeforeScroll)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => window.scrollY)).toBe(pageScrollBeforeSheetScroll);
    const logoutButton = sheet.getByRole("button", { name: "Log out", exact: true });
    await expect(logoutButton).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await logoutButton.click();
    const cancelLogoutButton = sheet.getByRole("button", { name: "Cancel", exact: true });
    await expect(cancelLogoutButton).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(logoutButton).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(moreTrigger).toBeFocused();

    await moreTrigger.click();
    await expect(sheet).toBeVisible();

    await sheet.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(`${BASE_URL}/settings`);
    await expect(sheet).toHaveCount(0);
    await expect(moreTrigger).not.toBeFocused();

    await moreTrigger.click();
    await expect(sheet).toBeVisible();

    await page.locator("[data-mobile-more-backdrop]").click({ position: { x: 2, y: 120 } });

    await expect(sheet).toHaveCount(0);
    await expect(moreTrigger).toBeVisible();
  });

  test("mobile More hub clears the bottom navigation and remains readable in a light theme", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await applyDisplaySettings(page, {
      appearance: {
        ...DEFAULT_APPEARANCE_SETTINGS,
        preset: "porcelain-studio",
      },
    });
    await page.goto("/");
    await page.getByRole("button", { name: "More", exact: true }).click();

    const sheet = page.locator("[data-mobile-more-sheet]");
    const bottomNav = page.locator("[data-mobile-bottom-nav]");
    await expect(sheet).toBeVisible();
    await expect(bottomNav).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-appearance-scheme", "light");

    const [sheetBox, bottomNavBox] = await Promise.all([
      sheet.boundingBox(),
      bottomNav.boundingBox(),
    ]);
    expect(sheetBox).not.toBeNull();
    expect(bottomNavBox).not.toBeNull();
    expect((sheetBox?.y ?? 0) + (sheetBox?.height ?? 0)).toBeLessThanOrEqual(
      (bottomNavBox?.y ?? 0) + 1
    );

    const sheetMetrics = await sheet.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        right: element.getBoundingClientRect().right,
        viewportWidth: window.innerWidth,
        background: style.backgroundImage || style.backgroundColor,
        text: style.color,
      };
    });
    expect(sheetMetrics.right).toBeLessThanOrEqual(sheetMetrics.viewportWidth + 1);
    expect(sheetMetrics.background).not.toBe("none");
    expect(sheetMetrics.text).not.toBe("rgba(0, 0, 0, 0)");
    await expectNoHorizontalOverflow(page);
  });

  test("mobile collection add dialogs stay fixed in the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?tab=complete");
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

  test("want heart updates in place without losing expansion filters, sort, or scroll", async ({ page }) => {
    const episodeId = findPokemonEpisodeWithImageCards();
    if (!episodeId) {
      test.skip(true, "No cards with images are available in this local database.");
      return;
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await applyDisplaySettings(page, {
      mobileUiScale: "small",
      mobileCardSize: "small",
      mobileDefaultView: "grid",
      sortBy: "number",
      sortDir: "asc",
    });
    await page.goto(`/expansions/${episodeId}`);

    const availableWant = page
      .locator('main button[aria-label^="Add "][aria-label$=" to wants"]')
      .first();
    await expect(availableWant).toBeVisible();
    const wantLabel = await availableWant.getAttribute("aria-label");
    const cardName = wantLabel?.match(/^Add (.+) to wants$/)?.[1];
    expect(cardName).toBeTruthy();

    const search = page.getByPlaceholder("Search name, number, rarity...");
    await search.fill(cardName!);
    await expect(search).toHaveValue(cardName!);

    const cardMarketSort = page
      .getByTitle("Sort by CardMarket and use CardMarket as main prices")
      .filter({ visible: true });
    await cardMarketSort.click();
    await expect(cardMarketSort).toHaveClass(/bg-violet-600/);

    const filteredWant = page.getByRole("button", {
      name: `Add ${cardName} to wants`,
      exact: true,
    }).first();
    await expect(filteredWant).toBeVisible();
    await filteredWant.evaluate((element) =>
      element.scrollIntoView({ block: "center", inline: "nearest" })
    );
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    let routeRefreshRequests = 0;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        request.method() === "GET" &&
        url.pathname === `/expansions/${episodeId}` &&
        request.resourceType() === "fetch"
      ) {
        routeRefreshRequests += 1;
      }
    });
    await page.route("**/api/wants/cards", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          item: { id: "playwright-inline-want", created_at: isoDate() },
        }),
      });
    });

    const urlBefore = page.url();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await filteredWant.click();
    await expect(
      page.getByRole("button", {
        name: `Remove ${cardName} from wants`,
        exact: true,
      }).first()
    ).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(250);

    expect(page.url()).toBe(urlBefore);
    await expect(search).toHaveValue(cardName!);
    await expect(cardMarketSort).toHaveClass(/bg-violet-600/);
    await expect
      .poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore))
      .toBeLessThanOrEqual(2);
    expect(routeRefreshRequests).toBe(0);
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

  test("mobile market pockets reuse the premium mover tile contract", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/movers?scope=all", { waitUntil: "domcontentloaded", timeout: 60_000 });

    const pockets = page.locator("[data-market-pocket-preview]");
    const pocketCount = await pockets.count();
    if (pocketCount === 0) {
      test.skip(true, "No Market Pocket previews are available in this local database.");
      return;
    }
    expect(pocketCount).toBeLessThanOrEqual(3);
    const pocketTiles = pockets.locator("[data-card-list-tile]");
    if ((await pocketTiles.count()) === 0) {
      test.skip(true, "No Market Pocket cards are available in this local database.");
      return;
    }

    await expectMobileCardListTileContract(page, pocketTiles.first());
    await expect(pocketTiles.locator("[data-card-list-media]")).toHaveCount(
      await pocketTiles.count()
    );
    await expectNoHorizontalOverflow(page);
  });

  test("raw, graded, and target mover cards expose inline actions without losing list state", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/wants/cards", async (route) => {
      const method = route.request().method();
      if (method !== "POST" && method !== "DELETE") {
        await route.fallback();
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          method === "POST"
            ? { item: { id: "playwright-mover-want", created_at: isoDate() } }
            : {}
        ),
      });
    });

    const modes = [
      { label: "raw", href: "/movers?scope=all" },
      { label: "graded", href: "/movers?scope=graded" },
      { label: "targets", href: "/movers?scope=grading" },
    ] as const;
    let coveredModes = 0;
    let checkedInteraction = false;

    for (const mode of modes) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(mode.href, { waitUntil: "domcontentloaded", timeout: 60_000 });
      const firstCard = page.locator("[data-mover-card-id]").first();
      const emptyState = page
        .getByText(/No (?:grade targets|graded market items|market moves) found/, { exact: true })
        .first();
      await Promise.race([
        firstCard.waitFor({ state: "attached", timeout: 45_000 }),
        emptyState.waitFor({ state: "visible", timeout: 45_000 }),
      ]).catch(() => undefined);
      if ((await firstCard.count()) === 0) continue;

      await expectMobileCardListTileContract(page, firstCard);
      await page.setViewportSize({ width: 1280, height: 900 });
      const { collection } = await expectInlineCardActions(firstCard);
      coveredModes += 1;

      if (checkedInteraction) continue;
      checkedInteraction = true;

      const collectionLabel = await collection.getAttribute("aria-label");
      const cardName = collectionLabel
        ?.replace(/^Add /, "")
        .replace(/ to collection$/, "");
      expect(cardName).toBeTruthy();

      const search = page.getByPlaceholder("Card, set, number");
      await search.fill(cardName!);
      await expect(search).toHaveValue(cardName!);

      const sort = page
        .locator("label")
        .filter({ has: page.getByText("Sort", { exact: true }) })
        .locator("select");
      const originalSort = await sort.inputValue();
      const alternateSort = await sort.locator("option").evaluateAll(
        (options, current) =>
          options
            .map((option) => (option as HTMLOptionElement).value)
            .find((value) => value !== current) ?? current,
        originalSort
      );
      await sort.selectOption(alternateSort);

      const filteredCard = page.locator("[data-mover-card-id]").first();
      const filteredActions = await expectInlineCardActions(filteredCard);
      const urlBefore = page.url();
      const pressedBefore = await filteredActions.want.getAttribute("aria-pressed");
      await filteredActions.want.click();
      await expect(filteredActions.want).toHaveAttribute(
        "aria-pressed",
        pressedBefore === "true" ? "false" : "true"
      );
      expect(page.url()).toBe(urlBefore);
      await expect(search).toHaveValue(cardName!);
      await expect(sort).toHaveValue(alternateSort);
      await expect(page.locator("[data-card-detail-shell]")).toHaveCount(0);

      await filteredActions.collection.click();
      const addDialog = page.locator('[data-collection-add-modal="true"]');
      await expect(addDialog).toBeVisible();
      expect(page.url()).toBe(urlBefore);
      await expect(page.locator("[data-card-detail-shell]")).toHaveCount(0);
      await addDialog.getByRole("button", { name: "Close add card" }).click();
    }

    if (coveredModes === 0) {
      test.skip(true, "No eligible mover cards are available in this local database.");
      return;
    }

    expect(checkedInteraction).toBe(true);
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
