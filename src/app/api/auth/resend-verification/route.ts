import { NextRequest, NextResponse } from "next/server";
import { isValidEmail, normalizeEmail } from "@/lib/auth-crypto";
import { db } from "@/lib/db";
import { sendVerificationEmailForUser } from "@/lib/email-verification";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const RESEND_RATE_WINDOW_MS = 1000 * 60 * 15;
const RESEND_RATE_LIMIT_PER_IP = 5;
const RESEND_RATE_LIMIT_PER_EMAIL = 3;

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
  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ ok: true });
  }

  // Silent throttle: identical response, just skip the email work.
  const ipThrottled = consumeRateLimit(
    `resend-verify:ip:${getClientIp(req)}`,
    RESEND_RATE_LIMIT_PER_IP,
    RESEND_RATE_WINDOW_MS
  );
  const emailThrottled = consumeRateLimit(
    `resend-verify:email:${email}`,
    RESEND_RATE_LIMIT_PER_EMAIL,
    RESEND_RATE_WINDOW_MS
  );
  if (ipThrottled || emailThrottled) {
    return NextResponse.json({ ok: true });
  }

  const user = await db.user.findUnique({
    where: { email },
    select: {
      disabled: true,
      email: true,
      email_verified_at: true,
      id: true,
    },
  });

  if (!user || user.disabled || user.email_verified_at) {
    return NextResponse.json({ ok: true });
  }

  try {
    await sendVerificationEmailForUser({
      baseUrl: getPublicOrigin(req),
      email: user.email,
      userId: user.id,
    });
  } catch (error) {
    console.error("Email verification resend failed", error);
  }

  return NextResponse.json({ ok: true });
}
