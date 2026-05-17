import { type NextRequest, NextResponse } from "next/server";
import { areScraperRequestsDisabled, getScraperRequestsDisabledReason } from "@/lib/scraper-guard";

function getRequestHostname(req: NextRequest | undefined): string | null {
  if (!req) return null;
  const nextHostname = req.nextUrl.hostname;
  if (nextHostname) return nextHostname;

  const host = req.headers.get("host")?.trim();
  if (!host) return null;

  return host.startsWith("[")
    ? host.slice(1, host.indexOf("]") > 0 ? host.indexOf("]") : undefined)
    : host.split(":")[0] ?? null;
}

export function getScraperDisabledResponse(req?: NextRequest) {
  const disabledReason =
    getScraperRequestsDisabledReason(getRequestHostname(req)) ??
    (areScraperRequestsDisabled() ? getScraperRequestsDisabledReason() : null);

  if (!disabledReason) {
    return null;
  }

  return NextResponse.json(
    {
      ok: false,
      skipped: true,
      scraperDisabled: true,
      error: disabledReason,
    },
    { status: 503 }
  );
}
