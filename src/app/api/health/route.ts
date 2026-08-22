import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getHealthSnapshot } from "@/lib/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const snapshot = await getHealthSnapshot();
  const readinessOnly = new URL(request.url).searchParams.get("readiness") === "1";
  const ok = readinessOnly ? snapshot.db.ok : snapshot.ok;
  const user = await getCurrentUser();
  const body = user && !readinessOnly ? snapshot : { ok };

  return NextResponse.json(body, {
    status: ok ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
