import { NextResponse } from "next/server";
import { areScraperRequestsDisabled, SCRAPER_DISABLED_ENV } from "@/lib/scraper-guard";

export function getScraperDisabledResponse() {
  if (!areScraperRequestsDisabled()) {
    return null;
  }

  return NextResponse.json(
    {
      ok: false,
      skipped: true,
      scraperDisabled: true,
      error: `Scraper requests are disabled by ${SCRAPER_DISABLED_ENV}.`,
    },
    { status: 503 }
  );
}
