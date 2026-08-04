import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const status = body.status === "closed" || body.status === "open" ? body.status : null;
    if (!status) return NextResponse.json({ error: "Valid session status required" }, { status: 400 });
    const updated = await db.sealedOpeningSession.updateMany({
      where: { id, user_id: user.id },
      data: { status },
    });
    if (!updated.count) return NextResponse.json({ error: "Opening session not found" }, { status: 404 });
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Could not update opening session" }, { status: 500 });
  }
}
