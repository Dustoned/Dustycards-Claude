import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { AdminCardMarketPriceCheckError } from "@/lib/admin-cardmarket-price-check";
import { runAdminSealedCardMarketPriceCheck, confirmAdminSealedCardMarketPriceCheck } from "@/lib/admin-sealed-cardmarket-price-check";
import { getScraperDisabledResponse } from "@/app/api/scraper-disabled-response";
import { GET as getSealedDetail } from "../route";

export const maxDuration = 90;
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const body = await request.json();
    const action = body?.action ?? "preview";
    if (action === "preview") {
      const disabled = getScraperDisabledResponse(request);
      if (disabled) return disabled;
      return NextResponse.json({ check: await runAdminSealedCardMarketPriceCheck(id) });
    }
    if ((action !== "changed" && action !== "unchanged") || typeof body?.token !== "string") {
      return NextResponse.json({ error: "Run the live CardMarket check first and choose a valid action." }, { status: 400 });
    }
    await confirmAdminSealedCardMarketPriceCheck(id, body.token, action);
    const detail = await getSealedDetail(request, context);
    if (!detail.ok) return detail;
    return NextResponse.json({ card: await detail.json() });
  } catch (error) {
    if (error instanceof AdminCardMarketPriceCheckError) return NextResponse.json({ error: error.message }, { status: error.status });
    const auth = authErrorResponse(error);
    if (auth) return auth;
    console.error("[sealed-cardmarket-price-check]", error);
    return NextResponse.json({ error: "The live CardMarket check failed. Please retry." }, { status: 500 });
  }
}
