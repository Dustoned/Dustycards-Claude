import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const OUT_DIR = path.resolve(process.cwd(), "screenshots-ui");

const VIEWPORTS = [
  { key: "mobile", width: 390, height: 844 },
  { key: "desktop", width: 1440, height: 900 },
];

const SIZE_VARIANTS = [
  { key: "small", cardSize: "small", modalSize: "small", uiScale: "small", widescreen: false },
  { key: "medium", cardSize: "medium", modalSize: "medium", uiScale: "medium", widescreen: false },
  { key: "large", cardSize: "large", modalSize: "large", uiScale: "large", widescreen: false },
];

const ROUTES = ["/", "/expansions", "/movers", "/illustrators", "/settings"];

const BASE_SETTINGS = {
  theme: "system",
  widescreen: false,
  uiScale: "medium",
  autoPriceRefresh: false,
  binderWatchMinPrice: 50,
  defaultView: "grid",
  cardSize: "medium",
  defaultRarities: [],
  defaultSupertypes: [],
  showOnlyPriced: false,
  primaryPriceSource: "cm_en",
  sortBy: "number",
  sortDir: "asc",
  modalSize: "medium",
};

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const startedAt = Date.now();
  const errors = [];

  try {
    for (const viewport of VIEWPORTS) {
      for (const variant of SIZE_VARIANTS) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
        });

        const settings = { ...BASE_SETTINGS, ...variant };
        const raw = JSON.stringify(settings);

        await context.addCookies([
          {
            name: "dustycards-settings",
            value: encodeURIComponent(raw),
            url: BASE_URL,
            sameSite: "Lax",
          },
        ]);

        await context.addInitScript(
          ({ key, raw }) => {
            window.localStorage.setItem(key, raw);
          },
          { key: "dustycards-settings", raw }
        );

        const page = await context.newPage();

        for (const route of ROUTES) {
          const slug = route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "-");
          const filename = `${viewport.key}-${variant.key}-${slug}.png`;
          const filepath = path.join(OUT_DIR, filename);

          try {
            await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle", timeout: 30000 });
            await page.waitForTimeout(400);
            await page.screenshot({ path: filepath, fullPage: false });
            console.log(`  saved ${filename}`);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            errors.push(`${filename}: ${message}`);
            console.warn(`  failed ${filename}: ${message}`);
          }
        }

        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\nDone in ${Math.round((Date.now() - startedAt) / 1000)}s. Output: ${OUT_DIR}`);
  if (errors.length) {
    console.log(`Errors: ${errors.length}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
