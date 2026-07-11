import { NextRequest, NextResponse } from "next/server";
import { hashPassword, hashSessionToken } from "@/lib/auth-crypto";
import { db } from "@/lib/db";
import { getPublicOrigin } from "@/lib/public-origin";
import { getSafeNextPath } from "@/lib/safe-next-path";

function resetRedirect(req: NextRequest, token: string, error: string, nextPath: string) {
  const redirectUrl = new URL("/reset-password", getPublicOrigin(req));
  if (token) redirectUrl.searchParams.set("token", token);
  redirectUrl.searchParams.set("error", error);
  redirectUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(redirectUrl, { status: 303 });
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  const isFormPost =
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data");
  const body = isFormPost
    ? Object.fromEntries(await req.formData())
    : ((await req.json().catch(() => ({}))) as {
        password?: unknown;
        passwordConfirm?: unknown;
        token?: unknown;
        next?: unknown;
      });
  const token = typeof body.token === "string" ? body.token : "";
  const nextPath = getSafeNextPath(body.next);
  const password = typeof body.password === "string" ? body.password : "";
  const passwordConfirm =
    typeof body.passwordConfirm === "string" ? body.passwordConfirm : "";

  if (password.length < 8) {
    if (isFormPost) return resetRedirect(req, token, "short", nextPath);
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  if (password !== passwordConfirm) {
    if (isFormPost) return resetRedirect(req, token, "mismatch", nextPath);
    return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
  }

  const record = token
    ? await db.passwordResetToken.findUnique({
        where: { token_hash: hashSessionToken(token) },
        select: {
          user_id: true,
          expires_at: true,
          used_at: true,
          user: {
            select: {
              disabled: true,
            },
          },
        },
      })
    : null;

  if (
    !record ||
    record.used_at ||
    record.expires_at.getTime() <= Date.now() ||
    record.user.disabled
  ) {
    if (isFormPost) return resetRedirect(req, token, "invalid", nextPath);
    return NextResponse.json({ error: "Reset link is invalid or expired" }, { status: 400 });
  }

  await db.$transaction([
    db.user.update({
      where: { id: record.user_id },
      data: { password_hash: await hashPassword(password) },
    }),
    db.passwordResetToken.deleteMany({ where: { user_id: record.user_id } }),
    db.session.deleteMany({ where: { user_id: record.user_id } }),
  ]);

  if (isFormPost) {
    const redirectUrl = new URL("/login", getPublicOrigin(req));
    redirectUrl.searchParams.set("reset", "1");
    redirectUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(redirectUrl, { status: 303 });
  }

  return NextResponse.json({ ok: true });
}
