import { NextRequest, NextResponse } from "next/server";
import {
  createUserSession,
  setSessionCookie,
} from "@/lib/auth";
import { normalizeEmail, verifyPassword } from "@/lib/auth-crypto";
import { db } from "@/lib/db";
import { sendVerificationEmailForUser } from "@/lib/email-verification";
import { getClientIp, isRateLimited, recordRateLimitHit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const LOGIN_RATE_WINDOW_MS = 1000 * 60 * 15;
const LOGIN_RATE_LIMIT_PER_IP = 20;
const LOGIN_RATE_LIMIT_PER_EMAIL = 8;

function getPublicOrigin(req: NextRequest): string {
  const configuredUrl = process.env.APP_URL;
  if (configuredUrl) return configuredUrl;

  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost ?? req.headers.get("host") ?? new URL(req.url).host;
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const proto = forwardedProto ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

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
  const next =
    typeof body.next === "string" && body.next.startsWith("/") && !body.next.startsWith("//")
      ? body.next
      : "/";
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

  if (!user || user.disabled || !(await verifyPassword(password, user.password_hash))) {
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

  if (!user.email_verified_at) {
    try {
      await sendVerificationEmailForUser({
        baseUrl: getPublicOrigin(req),
        email: user.email,
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
