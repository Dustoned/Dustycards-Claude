import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { requestSyncCancellation } from "@/lib/sync";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const result = await requestSyncCancellation(id);

    if (result.status === "not-found") {
      return NextResponse.json({ ok: false, error: "Sync not found." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      status: result.status,
      sync: result.sync,
    });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ ok: false, error: "Cancel failed" }, { status: 500 });
  }
}
