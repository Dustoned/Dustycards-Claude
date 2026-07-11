import { NextResponse } from "next/server";
import { malformedJsonBodyResponse, readJsonBody } from "@/lib/api-json";
import { authErrorResponse, requireUser } from "@/lib/auth";
import {
  CardSubmissionError,
  previewCardSubmission,
  type CardSubmissionInput,
} from "@/lib/card-submissions";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readJsonBody<CardSubmissionInput>(req);
    const result = await previewCardSubmission(user.id, body);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    const malformedResponse = malformedJsonBodyResponse(error);
    if (malformedResponse) return malformedResponse;

    if (error instanceof CardSubmissionError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { ok: false, error: "Could not preview the submitted card." },
      { status: 500 }
    );
  }
}
