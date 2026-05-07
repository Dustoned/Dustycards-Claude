import { NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { runKnownUnavailablePriceCheck } from "@/lib/sync";
import { getScraperDisabledResponse } from "@/app/api/scraper-disabled-response";
import { getSyncErrorResponse } from "@/app/api/sync-error-response";

export async function POST() {
  const scraperDisabled = getScraperDisabledResponse();
  if (scraperDisabled) return scraperDisabled;

  try {
    await requireAdmin();
    const result = await runKnownUnavailablePriceCheck();
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return getSyncErrorResponse(error);
  }
}
