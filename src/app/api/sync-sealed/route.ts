import { NextResponse } from "next/server";
import { SyncCancelledError, SyncConflictError, runSealedSync } from "@/lib/sync";

export async function POST() {
  try {
    const result = await runSealedSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof SyncCancelledError) {
      return NextResponse.json(
        {
          ok: false,
          cancelled: true,
          error: error.message,
        },
        { status: 409 }
      );
    }

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
