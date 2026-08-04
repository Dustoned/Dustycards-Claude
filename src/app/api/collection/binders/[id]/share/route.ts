import { NextRequest, NextResponse } from "next/server";
import { requireId, validationErrorResponse } from "@/lib/api-validation";
import { authErrorResponse, requireUser } from "@/lib/auth";
import {
  BinderShareError,
  createBinderShare,
  getBinderShareState,
  revokeBinderShare,
} from "@/lib/binder-sharing";
import { getPublicOrigin } from "@/lib/public-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function shareErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof BinderShareError)) return null;
  return NextResponse.json({ error: error.message }, { status: error.status });
}

function unexpectedResponse(error: unknown): NextResponse {
  console.error("[binder-share] request failed", error);
  return NextResponse.json({ error: "Failed to update binder link" }, { status: 500 });
}

function withUrl<T extends { share: { token: string } | null }>(
  state: T,
  request: NextRequest
) {
  return {
    ...state,
    share: state.share
      ? {
          ...state.share,
          url: new URL(
            `/share/binders/${encodeURIComponent(state.share.token)}`,
            getPublicOrigin(request)
          ).toString(),
        }
      : null,
  };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const binderId = requireId((await params).id, "binder id");
    return NextResponse.json(withUrl(await getBinderShareState(binderId, user.id), request));
  } catch (error) {
    return authErrorResponse(error) ?? validationErrorResponse(error) ?? shareErrorResponse(error) ?? unexpectedResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const binderId = requireId((await params).id, "binder id");
    return NextResponse.json(withUrl(await createBinderShare(binderId, user.id), request));
  } catch (error) {
    return authErrorResponse(error) ?? validationErrorResponse(error) ?? shareErrorResponse(error) ?? unexpectedResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const binderId = requireId((await params).id, "binder id");
    return NextResponse.json(await revokeBinderShare(binderId, user.id));
  } catch (error) {
    return authErrorResponse(error) ?? validationErrorResponse(error) ?? shareErrorResponse(error) ?? unexpectedResponse(error);
  }
}
