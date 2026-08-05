import { NextRequest, NextResponse } from "next/server";
import {
  createUserSession,
  setSessionCookie,
} from "@/lib/auth";
import { normalizeEmail, verifyPassword } from "@/lib/auth-crypto";
import {
  ACCOUNT_APPROVAL_ERROR_CODE,
  ACCOUNT_APPROVAL_MESSAGE,
} from "@/lib/auth-constants";
import { db } from "@/lib/db";
import { sendVerificationEmailForUser } from "@/lib/email-verification";
import { getMailPublicOrigin, getPublicOrigin } from "@/lib/public-origin";
import { getClientIp, isRateLimited, recordRateLimitHit } from "@/lib/rate-limit";
import { getSafeNextPath } from "@/lib/safe-next-path";

export const runtime = "nodejs";

const LOGIN_RATE_WINDOW_MS = 1000 * 60 * 15;
const LOGIN_RATE_LIMIT_PER_IP = 20;
const LOGIN_RATE_LIMIT_PER_EMAIL = 8;

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  const isFormPost =
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data");
  const body = isFormPost
    ? Object.fromEntries(await req.formData())
    : ((await req.json().catch(() => ({}))) as {
        email?: unknown;
        next?: unknown;
        password?: unknown;
      });
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const next = getSafeNextPath(body.next);
  const password = typeof body.password === "string" ? body.password : "";

  const ipKey = `login:ip:${getClientIp(req)}`;
  const emailKey = email ? `login:email:${email}` : null;
  if (
    isRateLimited(ipKey, LOGIN_RATE_LIMIT_PER_IP, LOGIN_RATE_WINDOW_MS) ||
    (emailKey && isRateLimited(emailKey, LOGIN_RATE_LIMIT_PER_EMAIL, LOGIN_RATE_WINDOW_MS))
  ) {
    if (isFormPost) {
      const redirectUrl = new URL("/login", getPublicOrigin(req));
      redirectUrl.searchParams.set("error", "throttled");
      redirectUrl.searchParams.set("next", next);
      return NextResponse.redirect(redirectUrl, { status: 303 });
    }

    return NextResponse.json(
      { error: "Too many login attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const user = email
    ? await db.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          email_verified_at: true,
          password_hash: true,
          role: true,
          disabled: true,
        },
      })
    : null;

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    recordRateLimitHit(ipKey);
    if (emailKey) recordRateLimitHit(emailKey);
    if (isFormPost) {
      const redirectUrl = new URL("/login", getPublicOrigin(req));
      redirectUrl.searchParams.set("error", "invalid");
      redirectUrl.searchParams.set("next", next);
      return NextResponse.redirect(redirectUrl, { status: 303 });
    }

    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  if (user.disabled) {
    try {
      await db.user.updateMany({
        where: {
          id: user.id,
          disabled: true,
          approval_requested_at: null,
        },
        data: { approval_requested_at: new Date() },
      });
    } catch (error) {
      // A notification failure must never weaken the account lock or expose
      // a different login response to the waiting user.
      console.error("Could not register pending account login", error);
    }

    if (isFormPost) {
      const redirectUrl = new URL("/login", getPublicOrigin(req));
      redirectUrl.searchParams.set("error", "pending");
      redirectUrl.searchParams.set("next", next);
      return NextResponse.redirect(redirectUrl, { status: 303 });
    }

    return NextResponse.json(
      {
        code: ACCOUNT_APPROVAL_ERROR_CODE,
        error: ACCOUNT_APPROVAL_MESSAGE,
      },
      { status: 403 }
    );
  }

  if (!user.email_verified_at) {
    try {
      await sendVerificationEmailForUser({
        baseUrl: getMailPublicOrigin(),
        email: user.email,
        nextPath: next,
        userId: user.id,
      });
    } catch (error) {
      console.error("Email verification resend failed", error);
    }

    if (isFormPost) {
      const redirectUrl = new URL("/login", getPublicOrigin(req));
      redirectUrl.searchParams.set("error", "unverified");
      redirectUrl.searchParams.set("email", user.email);
      redirectUrl.searchParams.set("next", next);
      return NextResponse.redirect(redirectUrl, { status: 303 });
    }

    return NextResponse.json(
      {
        code: "unverified",
        email: user.email,
        error: "Verify your email before logging in. We sent a new verification link.",
      },
      { status: 403 }
    );
  }

  const session = await createUserSession(user.id);
  await setSessionCookie(session.token, session.expiresAt);

  if (isFormPost) {
    return NextResponse.redirect(new URL(next, getPublicOrigin(req)), { status: 303 });
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  });
}
