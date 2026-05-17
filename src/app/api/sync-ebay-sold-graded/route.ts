import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import {
  getEbaySoldGradedPriceSyncJobSnapshot,
  startEbaySoldGradedPriceSyncJob,
} from "@/lib/sync/ebay-sold-graded-price-job";
import { getScraperDisabledResponse } from "@/app/api/scraper-disabled-response";
import { getSyncErrorResponse } from "@/app/api/sync-error-response";

export async function GET() {
  try {
    await requireAdmin();
    const snapshot = await getEbaySoldGradedPriceSyncJobSnapshot();
    return NextResponse.json({
      ok: true,
      ...snapshot,
    });
  } catch (error) {
    return authErrorResponse(error) ?? getSyncErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  const scraperDisabled = getScraperDisabledResponse(req);
  if (scraperDisabled) return scraperDisabled;

  try {
    await requireAdmin();
    const result = await startEbaySoldGradedPriceSyncJob();
    return NextResponse.json({
      ok: true,
      serverJob: true,
      ...result,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return getSyncErrorResponse(error);
  }
}
