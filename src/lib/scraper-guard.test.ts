import { afterEach, describe, expect, it, vi } from "vitest";
import {
  areScraperRequestsDisabled,
  areLocalSyncRequestsEnabled,
  assertScraperRequestsEnabled,
  getScraperRequestsDisabledReason,
  LOCAL_SYNC_ENABLED_ENV,
  SCRAPER_DISABLED_ENV,
  ScraperRequestsDisabledError,
} from "@/lib/scraper-guard";

describe("scraper guard", () => {
  const originalValue = process.env[SCRAPER_DISABLED_ENV];
  const originalLocalSyncValue = process.env[LOCAL_SYNC_ENABLED_ENV];

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalValue == null) {
      delete process.env[SCRAPER_DISABLED_ENV];
    } else {
      process.env[SCRAPER_DISABLED_ENV] = originalValue;
    }
    if (originalLocalSyncValue == null) {
      delete process.env[LOCAL_SYNC_ENABLED_ENV];
    } else {
      process.env[LOCAL_SYNC_ENABLED_ENV] = originalLocalSyncValue;
    }
  });

  it("treats common enabled values as disabled scraper mode", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env[SCRAPER_DISABLED_ENV] = "true";

    expect(areScraperRequestsDisabled()).toBe(true);
    expect(() => assertScraperRequestsEnabled()).toThrow(ScraperRequestsDisabledError);
  });

  it("allows scraper requests in production when the disabled flag is absent or off", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env[SCRAPER_DISABLED_ENV] = "0";

    expect(areScraperRequestsDisabled()).toBe(false);
    expect(() => assertScraperRequestsEnabled()).not.toThrow();
  });

  it("does not treat production loopback scheduler traffic as local dev sync", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env[SCRAPER_DISABLED_ENV] = "0";
    delete process.env[LOCAL_SYNC_ENABLED_ENV];

    expect(getScraperRequestsDisabledReason("127.0.0.1")).toBeNull();
    expect(areScraperRequestsDisabled()).toBe(false);
  });

  it("blocks local scraper requests by default", () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env[SCRAPER_DISABLED_ENV] = "0";
    delete process.env[LOCAL_SYNC_ENABLED_ENV];

    expect(areLocalSyncRequestsEnabled()).toBe(false);
    expect(areScraperRequestsDisabled()).toBe(true);
    expect(() => assertScraperRequestsEnabled()).toThrow(ScraperRequestsDisabledError);
  });

  it("allows local scraper requests only after explicit opt-in", () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env[SCRAPER_DISABLED_ENV] = "0";
    process.env[LOCAL_SYNC_ENABLED_ENV] = "1";

    expect(areLocalSyncRequestsEnabled()).toBe(true);
    expect(areScraperRequestsDisabled()).toBe(false);
    expect(() => assertScraperRequestsEnabled()).not.toThrow();
  });
});
