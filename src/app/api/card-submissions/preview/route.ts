import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import {
  CardSubmissionError,
  previewCardSubmission,
  type CardSubmissionInput,
} from "@/lib/card-submissions";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as CardSubmissionInput;
    const result = await previewCardSubmission(user.id, body);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    if (error instanceof CardSubmissionError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { ok: false, error: "Could not preview the submitted card." },
      { status: 500 }
    );
  }
}
