import { NextResponse } from "next/server";
import { runSealedSync } from "@/lib/sync";

export async function POST() {
  try {
    const result = await runSealedSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
