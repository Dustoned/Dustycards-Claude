import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PLAYWRIGHT_PORT ?? "3000";
const baseURL = `http://127.0.0.1:${PORT}`;
const serverMode = process.env.PLAYWRIGHT_SERVER_MODE === "production" ? "start" : "dev";

export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--enable-webgl", "--use-gl=swiftshader"],
        },
      },
    },
  ],
  webServer: {
    command: `npm run ${serverMode} -- --hostname 127.0.0.1 --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      ...process.env,
      DUSTYCARDS_DISABLE_SCRAPER_REQUESTS: "1",
    },
  },
});
