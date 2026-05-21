import { NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { listAdminCardSubmissions } from "@/lib/card-submissions";

export async function GET() {
  try {
    await requireAdmin();
    const result = await listAdminCardSubmissions();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { ok: false, error: "Could not load submitted cards." },
      { status: 500 }
    );
  }
}
