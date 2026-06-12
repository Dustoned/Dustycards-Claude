import { NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { createManualBackup, listBackups } from "@/lib/backups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const { dir, backups } = await listBackups();
    return NextResponse.json({ ok: true, dir, backups });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("[admin/backups GET]", error);
    return NextResponse.json({ error: "Could not list backups" }, { status: 500 });
  }
}

export async function POST() {
  try {
    await requireAdmin();
    const backup = await createManualBackup();
    const { dir, backups } = await listBackups();
    return NextResponse.json({ ok: true, created: backup, dir, backups });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("[admin/backups POST]", error);
    return NextResponse.json({ error: "Could not create backup" }, { status: 500 });
  }
}
