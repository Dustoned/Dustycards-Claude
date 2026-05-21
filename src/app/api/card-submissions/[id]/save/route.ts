import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { CardSubmissionError, saveCardSubmission } from "@/lib/card-submissions";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const result = await saveCardSubmission(user.id, id);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    if (error instanceof CardSubmissionError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { ok: false, error: "Could not save the submitted card." },
      { status: 500 }
    );
  }
}
