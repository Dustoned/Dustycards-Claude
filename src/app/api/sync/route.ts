import { NextResponse } from "next/server";
import { SyncConflictError, runFullSync } from "@/lib/sync";

export async function POST() {
  try {
    const result = await runFullSync();
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof SyncConflictError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          activeType: error.activeType,
          startedAt: error.startedAt.toISOString(),
        },
        { status: 409 }
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
