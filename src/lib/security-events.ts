import { createHmac } from "node:crypto";
import { db } from "@/lib/db";

export type SecurityEventSeverity = "info" | "warning" | "critical";

function eventHashKey(): string {
  return process.env.SECURITY_EVENT_HASH_KEY
    || process.env.AUTH_MFA_ENCRYPTION_KEY
    || "dustycards-local-security-events";
}

export function hashSecurityIp(ip: string | null | undefined): string | null {
  const value = ip?.trim();
  if (!value || value === "unknown") return null;
  return createHmac("sha256", eventHashKey()).update(value).digest("hex");
}

export async function recordSecurityEvent(input: {
  eventType: string;
  severity?: SecurityEventSeverity;
  userId?: string | null;
  ip?: string | null;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}): Promise<void> {
  const metadata = input.metadata
    ? Object.fromEntries(Object.entries(input.metadata).filter(([, value]) => value !== undefined))
    : undefined;
  try {
    await db.securityEvent.create({
      data: {
        event_type: input.eventType.slice(0, 120),
        severity: input.severity ?? "info",
        user_id: input.userId ?? null,
        ip_hash: hashSecurityIp(input.ip),
        metadata_json: metadata ? JSON.stringify(metadata).slice(0, 8_000) : null,
      },
    });
  } catch (error) {
    console.error("[security-event]", input.eventType, error);
  }
}
