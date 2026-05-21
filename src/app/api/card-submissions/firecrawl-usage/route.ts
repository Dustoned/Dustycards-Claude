import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { getCardSubmissionFirecrawlUsage } from "@/lib/card-submissions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const result = await getCardSubmissionFirecrawlUsage(user.id);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    return NextResponse.json(
      { ok: false, error: "Could not load Firecrawl usage." },
      { status: 500 }
    );
  }
}
