import { NextRequest, NextResponse } from "next/server";
import { malformedJsonBodyResponse, readJsonBody } from "@/lib/api-json";
import { requireId, validationErrorResponse } from "@/lib/api-validation";
import { authErrorResponse, requireUser } from "@/lib/auth";
import {
  CollectionPriceAlertError,
  deleteCollectionPriceAlertForUser,
  getCollectionPriceAlertState,
  isCollectionPriceAlertTargetType,
  saveCollectionPriceAlertForUser,
} from "@/lib/collection-price-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ targetType: string; id: string }>;
};

function alertErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof CollectionPriceAlertError)) return null;
  return NextResponse.json({ error: error.message }, { status: error.status });
}

function unexpectedResponse(error: unknown): NextResponse {
  console.error("[collection-price-alert] request failed", error);
  return NextResponse.json({ error: "Failed to update price alert" }, { status: 500 });
}

async function parseTarget(params: RouteContext["params"]) {
  const { targetType, id } = await params;
  if (!isCollectionPriceAlertTargetType(targetType)) {
    throw new CollectionPriceAlertError("Unsupported price alert target", 404);
  }
  return { targetType, targetId: requireId(id, "target id") };
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const target = await parseTarget(params);
    return NextResponse.json(
      await getCollectionPriceAlertState(target.targetType, target.targetId, user.id)
    );
  } catch (error) {
    return (
      authErrorResponse(error) ??
      validationErrorResponse(error) ??
      alertErrorResponse(error) ??
      unexpectedResponse(error)
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const target = await parseTarget(params);
    const body = await readJsonBody<{ kind?: unknown; targetPriceEur?: unknown }>(request);
    return NextResponse.json(
      await saveCollectionPriceAlertForUser({
        ...target,
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
      alertErrorResponse(error) ??
      unexpectedResponse(error)
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const target = await parseTarget(params);
    return NextResponse.json(
      await deleteCollectionPriceAlertForUser(target.targetType, target.targetId, user.id)
    );
  } catch (error) {
    return (
      authErrorResponse(error) ??
      validationErrorResponse(error) ??
      alertErrorResponse(error) ??
      unexpectedResponse(error)
    );
  }
}
