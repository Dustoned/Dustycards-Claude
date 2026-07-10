import { NextRequest, NextResponse } from "next/server";
import { hashSessionToken } from "@/lib/auth-crypto";
import { db } from "@/lib/db";
import { getPublicOrigin } from "@/lib/public-origin";

function loginRedirect(req: NextRequest, params: Record<string, string>) {
  const redirectUrl = new URL("/login", getPublicOrigin(req));
  Object.entries(params).forEach(([key, value]) => redirectUrl.searchParams.set(key, value));
  return NextResponse.redirect(redirectUrl, { status: 303 });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const record = token
    ? await db.emailVerificationToken.findUnique({
        where: { token_hash: hashSessionToken(token) },
        select: {
          expires_at: true,
          user_id: true,
          user: {
            select: {
              disabled: true,
              email_verified_at: true,
            },
          },
        },
      })
    : null;

  if (
    !record ||
    record.expires_at.getTime() <= Date.now() ||
    record.user.disabled
  ) {
    return loginRedirect(req, { verify: "invalid" });
  }

  if (!record.user.email_verified_at) {
    await db.user.update({
      where: { id: record.user_id },
      data: { email_verified_at: new Date() },
    });
  }

  await db.emailVerificationToken.deleteMany({ where: { user_id: record.user_id } });

  return loginRedirect(req, { verified: "1" });
}
