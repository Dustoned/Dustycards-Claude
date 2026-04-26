import { NextResponse } from "next/server";
import { runFullSync } from "@/lib/sync";
import { getScraperDisabledResponse } from "@/app/api/scraper-disabled-response";
import { getSyncErrorResponse } from "@/app/api/sync-error-response";

export async function POST() {
  const scraperDisabled = getScraperDisabledResponse();
  if (scraperDisabled) return scraperDisabled;

  try {
    const result = await runFullSync();
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return getSyncErrorResponse(error);
  }
}
