import { expect, test, type Page } from "@playwright/test";

type DisplaySize = "small" | "medium" | "large";

const SETTINGS_STORAGE_KEY = "dustycards-settings";
const SETTINGS_COOKIE_NAME = "dustycards-settings";
const BASE_URL = `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3000"}`;

const baseSettings = {
  theme: "system",
  widescreen: false,
  uiScale: "medium" as DisplaySize,
  autoPriceRefresh: true,
  binderWatchMinPrice: 50,
  defaultView: "grid",
  cardSize: "medium" as DisplaySize,
  defaultRarities: [],
  defaultSupertypes: [],
  showOnlyPriced: false,
  primaryPriceSource: "cm_en",
  sortBy: "number",
  sortDir: "asc",
  modalSize: "medium" as DisplaySize,
};

async function applyDisplaySettings(
  page: Page,
  settings: { cardSize: DisplaySize; modalSize: DisplaySize; uiScale?: DisplaySize; widescreen: boolean }
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
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
  );
  expect(hasHorizontalOverflow).toBe(false);
}

test.describe("DustyCards smoke", () => {
  test("core pages render without scraper requests", async ({ page }) => {
    for (const path of ["/", "/settings", "/movers", "/expansions"]) {
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

  test("card and detail size settings keep core layouts within the viewport", async ({ page }) => {
    test.setTimeout(120_000);

    const viewports = [
      { width: 360, height: 800 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ];
    const displaySettings = [
      { cardSize: "small" as const, modalSize: "small" as const, uiScale: "small" as const, widescreen: false },
      { cardSize: "medium" as const, modalSize: "medium" as const, uiScale: "medium" as const, widescreen: false },
      { cardSize: "large" as const, modalSize: "large" as const, uiScale: "large" as const, widescreen: true },
    ];
    const routes = ["/", "/search?q=pikachu", "/expansions", "/movers", "/settings"];

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
