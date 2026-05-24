import { NextRequest, NextResponse } from "next/server";
import { fetchAndImportThePriceDexPullRates } from "@/lib/pull-rates";

export const dynamic = "force-dynamic";

function readPositiveLimit(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.DUSTYCARDS_SYNC_SCHEDULER_SECRET;
  const providedSecret = req.headers.get("x-dustycards-scheduler-secret");

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      missingOnly?: unknown;
      limit?: unknown;
    };
    const result = await fetchAndImportThePriceDexPullRates({
      missingOnly: body.missingOnly !== false,
      limit: readPositiveLimit(body.limit),
    });

    return NextResponse.json({
      ok: result.requestedSets === 0 || result.fetchedSets > 0,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
