import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { listUserSubmittedCards } from "@/lib/card-submissions";

export async function GET() {
  try {
    const user = await requireUser();
    const result = await listUserSubmittedCards(user.id);
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
