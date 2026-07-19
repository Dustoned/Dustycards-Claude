import { NextRequest, NextResponse } from "next/server";
import { malformedJsonBodyResponse, readJsonBody } from "@/lib/api-json";
import { requireId, validationErrorResponse } from "@/lib/api-validation";
import { authErrorResponse, requireUser } from "@/lib/auth";
import {
  CardPriceAlertError,
  deleteCardPriceAlertForUser,
  getCardPriceAlertState,
  saveCardPriceAlertForUser,
} from "@/lib/card-price-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function priceAlertErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof CardPriceAlertError)) return null;
  return NextResponse.json({ error: error.message }, { status: error.status });
}

function unexpectedResponse(error: unknown): NextResponse {
  console.error("[card-price-alert] request failed", error);
  return NextResponse.json({ error: "Failed to update card price alert" }, { status: 500 });
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const cardId = requireId((await params).id, "card id");
    return NextResponse.json(await getCardPriceAlertState(cardId, user.id));
  } catch (error) {
    return (
      authErrorResponse(error) ??
      validationErrorResponse(error) ??
      priceAlertErrorResponse(error) ??
      unexpectedResponse(error)
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const cardId = requireId((await params).id, "card id");
    const body = await readJsonBody<{
      kind?: unknown;
      targetPriceEur?: unknown;
    }>(request);
    return NextResponse.json(
      await saveCardPriceAlertForUser({
        cardId,
        userId: user.id,
        kind: body.kind,
        targetPriceEur: body.targetPriceEur,
      })
    );
  } catch (error) {
    return (
      authErrorResponse(error) ??
      malformedJsonBodyResponse(error) ??
      validationErrorResponse(error) ??
      priceAlertErrorResponse(error) ??
      unexpectedResponse(error)
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const cardId = requireId((await params).id, "card id");
    return NextResponse.json(await deleteCardPriceAlertForUser(cardId, user.id));
  } catch (error) {
    return (
      authErrorResponse(error) ??
      validationErrorResponse(error) ??
      priceAlertErrorResponse(error) ??
      unexpectedResponse(error)
    );
  }
}
