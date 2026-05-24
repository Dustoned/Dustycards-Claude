import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import {
  THEPRICEDEX_PULL_RATE_SOURCE,
  fetchAndImportCollectricsPullRates,
  fetchAndImportThePriceDexPullRates,
} from "@/lib/pull-rates";

export const dynamic = "force-dynamic";

function readSetCodes(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(/[,\n]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as {
      setCode?: unknown;
      setCodes?: unknown;
      missingOnly?: unknown;
      limit?: unknown;
      source?: unknown;
    };
    const explicitSetCodes = body.setCode ? [body.setCode] : readSetCodes(body.setCodes);
    const limit =
      typeof body.limit === "number" && Number.isFinite(body.limit) && body.limit > 0
        ? body.limit
        : null;
    const source =
      typeof body.source === "string" && body.source.trim().toLowerCase() === THEPRICEDEX_PULL_RATE_SOURCE
        ? THEPRICEDEX_PULL_RATE_SOURCE
        : "collectrics";

    const result =
      source === THEPRICEDEX_PULL_RATE_SOURCE
        ? await fetchAndImportThePriceDexPullRates({
            setCodes: explicitSetCodes,
            missingOnly: body.missingOnly !== false,
            limit,
            source,
          })
        : await fetchAndImportCollectricsPullRates({
            setCodes: explicitSetCodes,
            missingOnly: body.missingOnly !== false,
            limit,
            source,
          });

    return NextResponse.json({
      ok: result.requestedSets === 0 || result.fetchedSets > 0,
      ...result,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
