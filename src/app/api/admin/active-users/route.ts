import { NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { getAdminActiveUsersSnapshot } from "@/lib/admin-active-users";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ ok: true, ...(await getAdminActiveUsersSnapshot()) });
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json({ ok: false, error: "Failed to load active users" }, { status: 500 })
    );
  }
}
