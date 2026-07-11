import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getHealthSnapshot, type HealthSnapshot } from "@/lib/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toPublicHealthSnapshot(snapshot: HealthSnapshot) {
  return {
    ok: snapshot.ok,
    checkedAt: snapshot.checkedAt,
    db: {
      ok: snapshot.db.ok,
    },
    sqlite: {
      walBytes: snapshot.sqlite.walBytes,
      shmBytes: snapshot.sqlite.shmBytes,
    },
    scheduler: {
      ok: snapshot.scheduler.ok,
      status: snapshot.scheduler.status,
      heartbeatAt: snapshot.scheduler.heartbeatAt,
      heartbeatAgeSeconds: snapshot.scheduler.heartbeatAgeSeconds,
    },
  };
}

export async function GET() {
  const snapshot = await getHealthSnapshot();
  const user = await getCurrentUser();
  const body = user ? snapshot : toPublicHealthSnapshot(snapshot);

  return NextResponse.json(body, {
    status: snapshot.ok ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
