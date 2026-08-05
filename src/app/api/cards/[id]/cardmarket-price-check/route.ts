import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { getCardDetailPayload } from "@/lib/card-detail-data";
import {
  AdminCardMarketPriceCheckError,
  confirmAdminCardMarketPriceCheck,
  runAdminCardMarketPriceCheck,
} from "@/lib/admin-cardmarket-price-check";
import { getScraperDisabledResponse } from "@/app/api/scraper-disabled-response";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin();
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      action?: "preview" | "changed" | "unchanged";
      token?: string;
    };
    const action = body.action ?? "preview";

    if (action === "preview") {
      const scraperDisabled = getScraperDisabledResponse(request);
      if (scraperDisabled) return scraperDisabled;
      const check = await runAdminCardMarketPriceCheck(id);
      return NextResponse.json({ check });
    }

    if (!body.token) {
      throw new AdminCardMarketPriceCheckError("Run the live CardMarket check first.");
    }
    const result = await confirmAdminCardMarketPriceCheck({
      cardId: id,
      token: body.token,
      decision: action,
    });
    const card = await getCardDetailPayload(id, user.id);
    if (!card) throw new AdminCardMarketPriceCheckError("Card not found.", 404);
    return NextResponse.json({ result, card });
  } catch (error) {
    if (error instanceof AdminCardMarketPriceCheckError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("[cardmarket-price-check]", error);
    return NextResponse.json({ error: "The live CardMarket check failed." }, { status: 500 });
  }
}
