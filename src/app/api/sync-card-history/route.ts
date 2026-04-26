import { NextResponse } from "next/server";
import {
  getCardHistorySyncJobSnapshot,
  startCardHistorySyncJob,
} from "@/lib/sync/card-history-job";
import { getScraperDisabledResponse } from "@/app/api/scraper-disabled-response";
import { getSyncErrorResponse } from "@/app/api/sync-error-response";

export async function GET() {
  const snapshot = await getCardHistorySyncJobSnapshot();
  return NextResponse.json({
    ok: true,
    ...snapshot,
  });
}

export async function POST() {
  const scraperDisabled = getScraperDisabledResponse();
  if (scraperDisabled) return scraperDisabled;

  try {
    const result = await startCardHistorySyncJob();
    return NextResponse.json({
      ok: true,
      serverJob: true,
      ...result,
    });
  } catch (error) {
    return getSyncErrorResponse(error);
  }
}
