import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { sendFriendRequest, sendFriendRequestToUserId, SocialError } from "@/lib/social";

function socialErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof SocialError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as {
      email?: unknown;
      userId?: unknown;
    };
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const email = typeof body.email === "string" ? body.email : "";
    const result = userId
      ? await sendFriendRequestToUserId(user.id, userId)
      : await sendFriendRequest(user.id, email);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return (
      authErrorResponse(error) ??
      socialErrorResponse(error) ??
      NextResponse.json({ error: "Could not send friend request" }, { status: 500 })
    );
  }
}
