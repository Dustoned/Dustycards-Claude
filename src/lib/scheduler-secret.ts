import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export function getConfiguredSchedulerSecret(): string | null {
  return process.env.DUSTYCARDS_SYNC_SCHEDULER_SECRET?.trim() || null;
}

export function getRequestSchedulerSecret(req: NextRequest): string | null {
  const headerSecret = req.headers.get("x-dustycards-scheduler-secret")?.trim();
  if (headerSecret) return headerSecret;

  const authorization = req.headers.get("authorization")?.trim();
  if (!authorization?.toLowerCase().startsWith("bearer ")) return null;

  return authorization.slice("bearer ".length).trim() || null;
}

export function schedulerSecretsMatch(requestSecret: string, configuredSecret: string): boolean {
  const requestBuffer = Buffer.from(requestSecret);
  const configuredBuffer = Buffer.from(configuredSecret);
  if (requestBuffer.length !== configuredBuffer.length) return false;

  return timingSafeEqual(requestBuffer, configuredBuffer);
}

/** True when the request carries the configured scheduler secret (timing-safe). */
export function isAuthorizedSchedulerRequest(req: NextRequest): boolean {
  const configuredSecret = getConfiguredSchedulerSecret();
  if (!configuredSecret) return false;

  const requestSecret = getRequestSchedulerSecret(req);
  return Boolean(requestSecret && schedulerSecretsMatch(requestSecret, configuredSecret));
}
