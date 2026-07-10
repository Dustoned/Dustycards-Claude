import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { requireId, validationErrorResponse } from "@/lib/api-validation";
import {
  acceptFriendRequest,
  acceptSocialFullAccess,
  removeSocialConnection,
  requestSocialFullAccess,
  resetSocialFullAccess,
  SocialError,
} from "@/lib/social";

function socialErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof SocialError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id: rawId } = await params;
    const id = requireId(rawId, "friend request id");
    const body = (await req.json().catch(() => ({}))) as { action?: unknown };

    const result =
      body.action === "accept"
        ? await acceptFriendRequest(user.id, id)
        : body.action === "request_full_access"
          ? await requestSocialFullAccess(user.id, id)
          : body.action === "accept_full_access"
            ? await acceptSocialFullAccess(user.id, id)
            : body.action === "revoke_full_access"
              ? await resetSocialFullAccess(user.id, id)
              : null;

    if (!result) {
      return NextResponse.json({ error: "Invalid friend action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return (
      authErrorResponse(error) ??
      validationErrorResponse(error) ??
      socialErrorResponse(error) ??
      NextResponse.json({ error: "Could not update friend request" }, { status: 500 })
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id: rawId } = await params;
    const id = requireId(rawId, "friend connection id");
    await removeSocialConnection(user.id, id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return (
      authErrorResponse(error) ??
      validationErrorResponse(error) ??
      socialErrorResponse(error) ??
      NextResponse.json({ error: "Could not remove friend connection" }, { status: 500 })
    );
  }
}
