export const SCRAPER_DISABLED_ENV = "DUSTYCARDS_DISABLE_SCRAPER_REQUESTS";

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export class ScraperRequestsDisabledError extends Error {
  constructor() {
    super(`Scraper requests are disabled by ${SCRAPER_DISABLED_ENV}.`);
    this.name = "ScraperRequestsDisabledError";
  }
}

export function areScraperRequestsDisabled(): boolean {
  const value = process.env[SCRAPER_DISABLED_ENV]?.trim().toLowerCase();
  return value ? ENABLED_VALUES.has(value) : false;
}

export function assertScraperRequestsEnabled() {
  if (areScraperRequestsDisabled()) {
    throw new ScraperRequestsDisabledError();
  }
}

export function isScraperRequestsDisabledError(
  error: unknown
): error is ScraperRequestsDisabledError {
  return error instanceof ScraperRequestsDisabledError;
}
