import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getHealthSnapshot } from "@/lib/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const snapshot = await getHealthSnapshot();
  const user = await getCurrentUser();
  const body = user ? snapshot : { ok: snapshot.ok };

  return NextResponse.json(body, {
    status: snapshot.ok ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
