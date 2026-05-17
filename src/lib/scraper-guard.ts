export const SCRAPER_DISABLED_ENV = "DUSTYCARDS_DISABLE_SCRAPER_REQUESTS";
export const LOCAL_SYNC_ENABLED_ENV = "DUSTYCARDS_ENABLE_LOCAL_SYNC";

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export class ScraperRequestsDisabledError extends Error {
  constructor(reason = getScraperRequestsDisabledReason() ?? `Scraper requests are disabled.`) {
    super(reason);
    this.name = "ScraperRequestsDisabledError";
  }
}

function isEnvEnabled(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value ? ENABLED_VALUES.has(value) : false;
}

function isLocalRuntime(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function isLocalSyncHostname(hostname: string | null | undefined): boolean {
  const normalized = hostname?.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    Boolean(normalized?.endsWith(".localhost"))
  );
}

export function areLocalSyncRequestsEnabled(): boolean {
  return isEnvEnabled(LOCAL_SYNC_ENABLED_ENV);
}

export function getScraperRequestsDisabledReason(
  requestHostname?: string | null | undefined
): string | null {
  if (isEnvEnabled(SCRAPER_DISABLED_ENV)) {
    return `Scraper requests are disabled by ${SCRAPER_DISABLED_ENV}.`;
  }

  if (!areLocalSyncRequestsEnabled() && isLocalRuntime()) {
    const localHostContext = isLocalSyncHostname(requestHostname)
      ? " from localhost"
      : "";
    return `Local scraper/API sync requests${localHostContext} are disabled by default. Set ${LOCAL_SYNC_ENABLED_ENV}=1 to allow local sync explicitly.`;
  }

  return null;
}

export function areScraperRequestsDisabled(): boolean {
  return getScraperRequestsDisabledReason() != null;
}

export function assertScraperRequestsEnabled() {
  const disabledReason = getScraperRequestsDisabledReason();
  if (disabledReason) {
    throw new ScraperRequestsDisabledError(disabledReason);
  }
}

export function isScraperRequestsDisabledError(
  error: unknown
): error is ScraperRequestsDisabledError {
  return error instanceof ScraperRequestsDisabledError;
}
