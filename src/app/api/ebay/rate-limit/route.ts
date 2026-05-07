import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { getEbayBrowseRateLimitStatus, getEbayRuntimeConfig } from "@/lib/ebay";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireUser();
    const status = await getEbayBrowseRateLimitStatus(getEbayRuntimeConfig());
    return NextResponse.json(status);
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
