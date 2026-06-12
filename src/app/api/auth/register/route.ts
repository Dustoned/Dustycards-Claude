import { NextRequest, NextResponse } from "next/server";
import { hashPassword, isValidEmail, normalizeEmail } from "@/lib/auth-crypto";
import { db } from "@/lib/db";
import { sendVerificationEmailForUser } from "@/lib/email-verification";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const REGISTER_RATE_WINDOW_MS = 1000 * 60 * 60;
const REGISTER_RATE_LIMIT_PER_IP = 10;

function getPublicOrigin(req: NextRequest): string {
  const configuredUrl = process.env.APP_URL;
  if (configuredUrl) return configuredUrl;

  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost ?? req.headers.get("host") ?? new URL(req.url).host;
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const proto = forwardedProto ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function registerRedirect(req: NextRequest, error: string) {
  const redirectUrl = new URL("/register", getPublicOrigin(req));
  redirectUrl.searchParams.set("error", error);
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
        email?: unknown;
        password?: unknown;
        passwordConfirm?: unknown;
      });
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const passwordConfirm =
    typeof body.passwordConfirm === "string" ? body.passwordConfirm : "";

  if (!isValidEmail(email)) {
    if (isFormPost) return registerRedirect(req, "email");
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  if (password.length < 8) {
    if (isFormPost) return registerRedirect(req, "short");
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  if (password !== passwordConfirm) {
    if (isFormPost) return registerRedirect(req, "mismatch");
    return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
  }

  if (
    consumeRateLimit(
      `register:ip:${getClientIp(req)}`,
      REGISTER_RATE_LIMIT_PER_IP,
      REGISTER_RATE_WINDOW_MS
    )
  ) {
    if (isFormPost) return registerRedirect(req, "throttled");
    return NextResponse.json(
      { error: "Too many registration attempts. Try again later." },
      { status: 429 }
    );
  }

  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    if (isFormPost) return registerRedirect(req, "exists");
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const user = await db.user.create({
    data: {
      email,
      password_hash: await hashPassword(password),
      role: "user",
    },
    select: {
      id: true,
      email: true,
      role: true,
    },
  });

  let verificationSent = true;
  try {
    await sendVerificationEmailForUser({
      baseUrl: getPublicOrigin(req),
      email: user.email,
      userId: user.id,
    });
  } catch (error) {
    verificationSent = false;
    console.error("Email verification send failed", error);
  }

  if (isFormPost) {
    const redirectUrl = new URL("/login", getPublicOrigin(req));
    redirectUrl.searchParams.set("verify", verificationSent ? "sent" : "failed");
    redirectUrl.searchParams.set("email", user.email);
    return NextResponse.redirect(redirectUrl, { status: 303 });
  }

  return NextResponse.json({ ok: true, user, verifyEmail: true, verificationSent });
}
