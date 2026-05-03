import { NextResponse } from "next/server";
import {
  getEbaySoldGradedPriceSyncJobSnapshot,
  startEbaySoldGradedPriceSyncJob,
} from "@/lib/sync/ebay-sold-graded-price-job";
import { getScraperDisabledResponse } from "@/app/api/scraper-disabled-response";
import { getSyncErrorResponse } from "@/app/api/sync-error-response";

export async function GET() {
  const snapshot = await getEbaySoldGradedPriceSyncJobSnapshot();
  return NextResponse.json({
    ok: true,
    ...snapshot,
  });
}

export async function POST() {
  const scraperDisabled = getScraperDisabledResponse();
  if (scraperDisabled) return scraperDisabled;

  try {
    const result = await startEbaySoldGradedPriceSyncJob();
    return NextResponse.json({
      ok: true,
      serverJob: true,
      ...result,
    });
  } catch (error) {
    return getSyncErrorResponse(error);
  }
}
