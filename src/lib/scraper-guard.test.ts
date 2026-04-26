import { afterEach, describe, expect, it } from "vitest";
import {
  areScraperRequestsDisabled,
  assertScraperRequestsEnabled,
  SCRAPER_DISABLED_ENV,
  ScraperRequestsDisabledError,
} from "@/lib/scraper-guard";

describe("scraper guard", () => {
  const originalValue = process.env[SCRAPER_DISABLED_ENV];

  afterEach(() => {
    if (originalValue == null) {
      delete process.env[SCRAPER_DISABLED_ENV];
    } else {
      process.env[SCRAPER_DISABLED_ENV] = originalValue;
    }
  });

  it("treats common enabled values as disabled scraper mode", () => {
    process.env[SCRAPER_DISABLED_ENV] = "true";

    expect(areScraperRequestsDisabled()).toBe(true);
    expect(() => assertScraperRequestsEnabled()).toThrow(ScraperRequestsDisabledError);
  });

  it("allows scraper requests when the flag is absent or off", () => {
    process.env[SCRAPER_DISABLED_ENV] = "0";

    expect(areScraperRequestsDisabled()).toBe(false);
    expect(() => assertScraperRequestsEnabled()).not.toThrow();
  });
});
