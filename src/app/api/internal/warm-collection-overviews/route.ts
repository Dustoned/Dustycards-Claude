import { NextRequest, NextResponse } from "next/server";
import { getBackgroundLoadSnapshot } from "@/lib/background-load-guard";
import { warmCollectionOverviewCaches } from "@/lib/collection-overview-warmer";
import { isAuthorizedSchedulerRequest } from "@/lib/scheduler-secret";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAuthorizedSchedulerRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  try {
    const force = request.nextUrl.searchParams.get("force") === "1";
    const backgroundLoad = await getBackgroundLoadSnapshot();
    if (!force && backgroundLoad.deferred) {
      return NextResponse.json({
        ok: true,
        deferred: true,
        reason: backgroundLoad.activeUsers > 0 ? "active-users" : "system-load",
      });
    }

    const summary = await warmCollectionOverviewCaches();
    return NextResponse.json({ ok: true, deferred: false, ...summary });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Collection overview warm-up failed",
      },
      { status: 500 }
    );
  }
}
