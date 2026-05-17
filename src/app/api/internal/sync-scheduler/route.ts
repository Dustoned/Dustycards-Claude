import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runSyncSchedulerTick } from "@/lib/sync/scheduler";
import { getScraperDisabledResponse } from "@/app/api/scraper-disabled-response";
import { getSyncErrorResponse } from "@/app/api/sync-error-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getConfiguredSecret(): string | null {
  return process.env.DUSTYCARDS_SYNC_SCHEDULER_SECRET?.trim() || null;
}

function getRequestSecret(req: NextRequest): string | null {
  const headerSecret = req.headers.get("x-dustycards-scheduler-secret")?.trim();
  if (headerSecret) return headerSecret;

  const authorization = req.headers.get("authorization")?.trim();
  if (!authorization?.toLowerCase().startsWith("bearer ")) return null;

  return authorization.slice("bearer ".length).trim() || null;
}

function secretsMatch(requestSecret: string, configuredSecret: string): boolean {
  const requestBuffer = Buffer.from(requestSecret);
  const configuredBuffer = Buffer.from(configuredSecret);
  if (requestBuffer.length !== configuredBuffer.length) return false;

  return timingSafeEqual(requestBuffer, configuredBuffer);
}

export async function POST(req: NextRequest) {
  const scraperDisabled = getScraperDisabledResponse(req);
  if (scraperDisabled) return scraperDisabled;

  const configuredSecret = getConfiguredSecret();
  const requestSecret = getRequestSecret(req);

  if (!configuredSecret) {
    return NextResponse.json(
      { ok: false, error: "Sync scheduler secret is not configured." },
      { status: 503 }
    );
  }

  if (!requestSecret || !secretsMatch(requestSecret, configuredSecret)) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  try {
    const result = await runSyncSchedulerTick();
    return NextResponse.json(result);
  } catch (error) {
    return getSyncErrorResponse(error);
  }
}
