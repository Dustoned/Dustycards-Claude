import { test as base, expect } from "@playwright/test";
import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { DEFAULT_HOME_DASHBOARD_MODULE_ORDER, HOME_DASHBOARD_VIEW_MODULES } from "../../src/lib/dashboard-module-preferences";

const test = base.extend<{ uiAccount: string }>({
  uiAccount: [async ({ context, baseURL }, provideAccount) => {
    if (!process.env.DUSTYCARDS_DATABASE_PATH || !baseURL || new URL(baseURL).hostname !== "127.0.0.1") {
      throw new Error("UI regressions require a local server and a migrated disposable DUSTYCARDS_DATABASE_PATH.");
    }
    const db = new Database(process.env.DUSTYCARDS_DATABASE_PATH, { fileMustExist: true });
    db.pragma("busy_timeout=5000");
    db.pragma("foreign_keys=ON");
    const id = `ui-polish-${randomUUID()}`;
    const token = randomUUID();
    const now = new Date().toISOString();
    try {
      db.prepare("INSERT INTO User (id,email,password_hash,role,disabled,email_verified_at,created_at,updated_at) VALUES (?,?,'test-only','admin',0,?,?,?)")
        .run(id, `${id}@example.test`, now, now, now);
      db.prepare("INSERT INTO Session (id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)")
        .run(id, id, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 3600_000).toISOString(), now, now);
      const card = db.prepare("SELECT id FROM Card WHERE game='pokemon' LIMIT 1").get() as { id: string };
      db.prepare("INSERT INTO CollectionCard (id,user_id,card_id,for_sale,added_at,updated_at) VALUES (?,?,?,1,?,?)")
        .run(id, id, card.id, now, now);
      db.prepare("INSERT INTO CollectionCard (id,user_id,card_id,for_sale,added_at,updated_at) VALUES (?,?,?,0,?,?)")
        .run(`${id}-loose`, id, card.id, now, now);
      await context.addCookies([{ name: "dustycards-session", value: token, url: baseURL }]);
      await provideAccount(id);
    } finally {
      db.prepare("DELETE FROM User WHERE id=?").run(id);
      db.close();
    }
  }, { auto: true }],
});

// Fault-injection routes must reach Playwright, including in production builds.
test.use({ serviceWorkers: "block" });

for (const width of [390, 1440]) {
  test(`market filters stay usable with a quieter layout at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    const routes = ["/movers?scope=all", "/movers?scope=graded", "/movers?scope=sealed", "/movers/discount-watch?scope=all", "/movers/cheap-high-rarity?scope=all"];
    for (let index = 0; index < routes.length; index++) {
      await page.goto(routes[index]);
      const toolbar = page.locator("[data-market-filter-toolbar]");
      await expect(toolbar.getByLabel("Search", { exact: true })).toBeVisible();
      await expect(toolbar.getByLabel("Sort", { exact: true })).toBeVisible();
      // Use fixed options so this also exercises empty market snapshots.
      const filter = toolbar.getByLabel(index === 2 ? "Trend" : "Buy Signal", { exact: true });
      if (width === 390) {
        await expect(filter).toBeHidden();
        await toolbar.getByRole("button", { name: "More filters", exact: true }).click();
      }
      await expect(filter).toBeVisible();
      const value = await filter.locator("option").last().getAttribute("value");
      await filter.selectOption(value!);
      if (width === 390) {
        await toolbar.getByRole("button", { name: "Fewer filters (1)", exact: true }).click();
        await expect(filter).toBeHidden();
        await toolbar.getByRole("button", { name: "More filters (1)", exact: true }).click();
        await expect(filter).toHaveValue(value!);
      }
      await toolbar.getByRole("button", { name: "Reset", exact: true }).click();
      await expect(filter).toHaveValue("all");
      if (width === 390) await toolbar.getByRole("button", { name: "Fewer filters", exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      if (process.env.UI_DENSITY_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.UI_DENSITY_SCREENSHOT_DIR}/${width}-market-${index}.png` });
    }
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
    await expect(page.getByText("Account ID", { exact: true })).toBeHidden();
    await page.getByText("Account details", { exact: true }).click();
    await expect(page.getByText("Account ID", { exact: true })).toBeVisible();
    await page.getByText("Account details", { exact: true }).click();
    if (width === 390) expect((await page.getByRole("tab", { name: "Security", exact: true }).boundingBox())!.y).toBeLessThan(300);
    if (process.env.UI_DENSITY_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.UI_DENSITY_SCREENSHOT_DIR}/${width}-account.png` });
  });
}

for (const width of [390, 1440]) {
  test(`all Home widgets can be configured and persist at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Customize page", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Customize Home" });
    await expect(dialog).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await expect(dialog.locator("[data-home-widget-setting]")).toHaveCount(DEFAULT_HOME_DASHBOARD_MODULE_ORDER.length);
    for (const key of DEFAULT_HOME_DASHBOARD_MODULE_ORDER) {
      const row = dialog.locator(`[data-home-widget-setting="${key}"]`);
      const show = row.getByRole("button", { name: /^Show / });
      if (await show.count()) await show.click();
      await row.getByRole("button", { name: /^Hide / }).click();
      await row.getByRole("button", { name: /^Show / }).click();
      await row.getByRole("button", { name: /^Collapse / }).click();
      await expect(row.getByRole("button", { name: /^Expand / })).toHaveAttribute("aria-pressed", "true");
      await row.getByRole("button", { name: /^Expand / }).click();
      if (key !== "overview") await row.getByRole("button", { name: /^Use compact size/ }).click();
      if (HOME_DASHBOARD_VIEW_MODULES.has(key)) {
        await row.getByRole("button", { name: "List", exact: true }).click();
        await expect(row.getByRole("button", { name: "List", exact: true })).toHaveAttribute("aria-pressed", "true");
      }
      const heights = await row.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
      expect(heights.every((height) => height >= 44)).toBe(true);
    }
    const finder = dialog.getByRole("searchbox", { name: "Find a Home widget" });
    await finder.fill("Market Movers");
    await expect(dialog.locator("[data-home-widget-setting]")).toHaveCount(1);
    await dialog.getByRole("button", { name: "Move Market Movers up", exact: true }).click();
    await finder.fill("nothing-matches-this");
    await expect(dialog.getByRole("status")).toHaveText("No widgets match your search.");
    await finder.fill("");
    expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect.poll(async () => (await (await page.request.get("/api/account/settings")).json()).settings.homeDashboardHiddenModules).toEqual([]);
    await page.reload();
    await trigger.click();
    const rows = dialog.locator("[data-home-widget-setting]");
    await expect(rows).toHaveCount(19);
    expect(await rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-home-widget-setting")))).toEqual([
      "overview", "value-drivers", "market-movers", "sudden-drops", ...DEFAULT_HOME_DASHBOARD_MODULE_ORDER.slice(4),
    ]);
    for (const key of HOME_DASHBOARD_VIEW_MODULES) {
      await expect(dialog.locator(`[data-home-widget-setting="${key}"]`).getByRole("button", { name: "List", exact: true })).toHaveAttribute("aria-pressed", "true");
    }
    const saved = (await (await page.request.get("/api/account/settings")).json()).settings;
    expect(saved.homeDashboardCompactModules).toHaveLength(18);
    await dialog.getByRole("button", { name: "Reset layout", exact: true }).click();
    await expect(rows.first()).toHaveAttribute("data-home-widget-setting", "overview");
  });

  test(`nested collection forms keep focus and only close the top dialog at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/search?q=charizard");
    await page.getByText("Charizard", { exact: true }).first().click();
    await expect(page.getByRole("dialog", { name: "Charizard", exact: true })).toBeVisible();
    let binderAttempts = 0;
    await page.route("**/api/collection/binders", (route) => route.fulfill({
      status: ++binderAttempts === 1 ? 500 : 200,
      contentType: "application/json",
      body: JSON.stringify(binderAttempts === 1 ? { error: "Test outage" } : { binders: [] }),
    }));
    await page.getByRole("button", { name: /Add .* to collection/ }).last().click();
    const form = page.locator("[data-collection-add-modal]");
    await expect(form).toBeVisible();
    await expect.poll(() => form.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Shift+Tab");
    expect(await form.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await expect(form.getByRole("alert")).toContainText("Could not load binders");
    await form.getByRole("button", { name: "Retry loading binders" }).click();
    await expect(form.getByRole("alert")).toHaveCount(0);
    const close = await form.getByRole("button", { name: "Close add card" }).boundingBox();
    expect(close!.width).toBeGreaterThanOrEqual(44);
    expect(close!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Escape");
    await expect(form).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Charizard", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Add .* to collection/ }).last()).toBeFocused();
  });
}

test("phone navigation, display controls and section labels stay usable", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await page.goto("/?tab=singles");
  await expect(page.locator('[data-mobile-bottom-nav] a[aria-current="page"]')).toHaveAttribute("href", "/?tab=complete");
  const sections = page.getByRole("navigation", { name: "Collection sections" });
  const graded = sections.getByText("Graded", { exact: true });
  await graded.click();
  await expect(page.getByRole("heading", { name: "Graded Collection" })).toBeVisible();
  const labels = await sections.locator("a,button").evaluateAll((elements) => elements.map((element) => {
    const text = element.querySelector("span")!;
    return { clipped: text.scrollWidth > text.clientWidth, height: element.getBoundingClientRect().height };
  }));
  expect(labels.every((label) => !label.clipped && label.height >= 44)).toBe(true);
  await page.goto("/?tab=singles");
  const toolbar = page.locator(".card-browser-toolbar");
  await expect(toolbar.getByRole("button", { name: "Grid", exact: true })).toHaveCount(0);
  await toolbar.getByRole("button", { name: "Display", exact: true }).click();
  await expect(toolbar.getByRole("button", { name: "Grid", exact: true })).toBeVisible();
  await toolbar.getByRole("button", { name: "M", exact: true }).click();
  await expect(toolbar.getByRole("button", { name: "M", exact: true })).toHaveAttribute("aria-pressed", "true");
  await toolbar.getByRole("button", { name: "Display", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
});

test("Home settings show failed saves inside the dialog and retry the latest layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Customize page", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Customize Home" });
  let fail = true;
  await page.route("**/api/account/settings", async (route) => {
    if (fail && route.request().method() === "PUT") await route.fulfill({ status: 500, json: { error: "Simulated save failure" } });
    else await route.continue();
  });
  await dialog.getByRole("searchbox", { name: "Find a Home widget" }).fill("Market Movers");
  await dialog.getByRole("button", { name: "Show Market Movers", exact: true }).click();
  const retry = dialog.getByRole("button", { name: "Retry saving settings", exact: true });
  await expect(retry).toBeVisible();
  await expect(dialog.getByRole("status")).toContainText("could not be saved");
  fail = false;
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect.poll(async () => (await (await page.request.get("/api/account/settings")).json()).settings.homeDashboardHiddenModules.includes("market-movers")).toBe(false);
  await page.reload();
  await expect(page.locator('[data-home-widget="market-movers"]')).toBeVisible();
});

test("Home featured card failures are visible and a second attempt opens details", async ({ page, uiAccount }) => {
  const db = new Database(process.env.DUSTYCARDS_DATABASE_PATH!, { fileMustExist: true });
  db.prepare("UPDATE CollectionCard SET card_id='18530' WHERE id=? AND user_id=?").run(`${uiAccount}-loose`, uiAccount);
  db.close();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const widget = page.locator('[data-home-widget="featured"]');
  const card = widget.getByRole("button", { name: /^Open .* details$/ }).first();
  await expect(card).toBeVisible();
  await page.route("**/api/cards/*", (route) => route.fulfill({ status: 500, json: { error: "Simulated detail failure" } }));
  await card.click();
  await expect(widget.getByRole("alert")).toBeVisible();
  await page.unroute("**/api/cards/*");
  await card.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(errors).toEqual([]);
});

for (const width of [390, 1440]) {
  test(`card detail sections and collection shortcut work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/search?q=charizard", "/movers/signal-radar/18530?game=pokemon"]) {
      await page.goto(route);
      if (route.startsWith("/search")) await page.getByText("Charizard", { exact: true }).first().click();
      const shell = page.locator("[data-card-detail-shell]");
      await expect(shell).toBeVisible();
      const tabs = shell.getByRole("tab");
      await expect(tabs).toHaveCount(6);
      for (const name of ["Overview", "Market", "Collection & Reprints", "Forecast", "Analysis", "Evidence"]) {
        const tab = tabs.filter({ hasText: name });
        await tab.click();
        await expect(tab).toHaveAttribute("aria-selected", "true");
        await expect(shell.getByRole("tabpanel")).toBeVisible();
        const overflow = await shell.evaluate((element) => element.scrollWidth - element.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
      }
      await tabs.filter({ hasText: "Market" }).click();
      await shell.locator('.card-detail-kpi--link:visible').filter({ hasText: "Not owned" }).first().click();
      await expect(tabs.filter({ hasText: "Collection & Reprints" })).toHaveAttribute("aria-selected", "true");
      await tabs.first().focus();
      await page.keyboard.press("End");
      await expect(tabs.last()).toBeFocused();
      await expect(tabs.last()).toHaveAttribute("aria-selected", "true");
    }
  });
}

test("phone sales and market results precede optional overviews", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?tab=selling");
  const search = page.getByPlaceholder("Search name, number, set...");
  await expect(search).toBeVisible();
  expect((await search.boundingBox())!.y).toBeLessThan(780);
  await expect(page.getByRole("heading", { name: "Trade center" })).toHaveCount(0);
  await page.getByText("Compare cards & find trades", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Trade center" })).toBeVisible();
  await page.getByText("Compare cards & find trades", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Trade center" })).toBeHidden();
  await page.getByText("Compare cards & find trades", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Trade center" })).toBeVisible();
  await page.goto("/movers?scope=all");
  const overview = page.getByRole("button", { name: /^Market overview/ });
  await expect(overview).toHaveAttribute("aria-expanded", "false");
  await overview.click();
  await expect(overview).toHaveAttribute("aria-expanded", "true");
});

test("empty wants stay compact and every phone settings section is directly selectable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/wants");
  await expect(page.getByText("No wants yet", { exact: true })).toBeVisible();
  expect((await page.getByText("No wants yet", { exact: true }).boundingBox())!.y).toBeLessThan(500);
  await page.goto("/settings");
  const picker = page.getByRole("combobox", { name: "Settings section" });
  await expect(picker.locator("option")).toHaveCount(7);
  await picker.selectOption({ label: "Sync" });
  await expect(page.getByRole("tabpanel", { name: "Sync" })).toBeVisible();
  const refreshTabs = page.getByRole("tablist", { name: "Background refresh views" }).getByRole("tab");
  await refreshTabs.first().click();
  await page.keyboard.press("End");
  await expect(refreshTabs.last()).toBeFocused();
  await expect(refreshTabs.last()).toHaveAttribute("aria-selected", "true");
  expect((await refreshTabs.last().boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Home");
  await expect(refreshTabs.first()).toHaveAttribute("aria-selected", "true");
  await picker.selectOption({ label: "Preferences" });
  await expect(page.getByRole("tabpanel", { name: "Preferences" })).toBeVisible();
});
