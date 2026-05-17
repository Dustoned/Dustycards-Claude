import packageJson from "../../package.json";

const serverStartedAt = new Date();

export const serverStartedAtIso = serverStartedAt.toISOString();

const packageVersion =
  typeof packageJson.version === "string" && packageJson.version.trim()
    ? packageJson.version.trim()
    : "1.0.0";

export const appVersion =
  process.env.NEXT_PUBLIC_APP_DISPLAY_VERSION ??
  process.env.APP_DISPLAY_VERSION ??
  packageVersion;

export const buildVersion =
  process.env.NEXT_PUBLIC_APP_BUILD ??
  process.env.APP_BUILD ??
  process.env.NEXT_PUBLIC_APP_VERSION ??
  process.env.APP_VERSION ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.RAILWAY_GIT_COMMIT_SHA ??
  serverStartedAtIso;

function formatBuildLabel(value: string): string {
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const hour = String(date.getUTCHours()).padStart(2, "0");
    const minute = String(date.getUTCMinutes()).padStart(2, "0");
    return `build ${year}${month}${day}-${hour}${minute}`;
  }

  return `build ${value.slice(0, 12)}`;
}

export const appBuildLabel = formatBuildLabel(buildVersion);

export function getServerUptimeMs(now = new Date()): number {
  return Math.max(0, now.getTime() - serverStartedAt.getTime());
}
