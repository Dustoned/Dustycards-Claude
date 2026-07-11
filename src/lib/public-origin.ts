import type { NextRequest } from "next/server";

function normalizeOrigin(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function getConfiguredPublicOrigin(): string | null {
  return normalizeOrigin(process.env.APP_URL);
}

export function getPublicOrigin(req: NextRequest): string {
  const configuredOrigin = getConfiguredPublicOrigin();
  if (configuredOrigin) {
    return configuredOrigin;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_URL must be set to build public auth URLs.");
  }

  return new URL(req.url).origin;
}

export function getMailPublicOrigin(): string {
  const configuredOrigin = getConfiguredPublicOrigin();
  if (!configuredOrigin) {
    throw new Error("APP_URL must be set before sending auth email links.");
  }

  return configuredOrigin;
}
