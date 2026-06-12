import { NextRequest, NextResponse } from "next/server";
import {
  getConfiguredSchedulerSecret,
  getRequestSchedulerSecret,
  schedulerSecretsMatch,
} from "@/lib/scheduler-secret";
import { runSyncSchedulerTick } from "@/lib/sync/scheduler";
import { getScraperDisabledResponse } from "@/app/api/scraper-disabled-response";
import { getSyncErrorResponse } from "@/app/api/sync-error-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const scraperDisabled = getScraperDisabledResponse(req);
  if (scraperDisabled) return scraperDisabled;

  const configuredSecret = getConfiguredSchedulerSecret();
  const requestSecret = getRequestSchedulerSecret(req);

  if (!configuredSecret) {
    return NextResponse.json(
      { ok: false, error: "Sync scheduler secret is not configured." },
      { status: 503 }
    );
  }

  if (!requestSecret || !schedulerSecretsMatch(requestSecret, configuredSecret)) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  try {
    const result = await runSyncSchedulerTick();
    return NextResponse.json(result);
  } catch (error) {
    return getSyncErrorResponse(error);
  }
}
