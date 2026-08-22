import { NextRequest, NextResponse } from "next/server";
import { isValidEmail, normalizeEmail } from "@/lib/auth-crypto";
import { db } from "@/lib/db";
import { sendVerificationEmailForUser } from "@/lib/email-verification";
import { getMailPublicOrigin } from "@/lib/public-origin";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";
import { getSafeNextPath } from "@/lib/safe-next-path";
import {
  AUTH_REQUEST_BODY_LIMIT_BYTES,
  requestBodyTooLarge,
  requestBodyTooLargeResponse,
} from "@/lib/request-limits";

export const runtime = "nodejs";

const RESEND_RATE_WINDOW_MS = 1000 * 60 * 15;
const RESEND_RATE_LIMIT_PER_IP = 5;
const RESEND_RATE_LIMIT_PER_EMAIL = 3;

export async function POST(req: NextRequest) {
  if (requestBodyTooLarge(req, AUTH_REQUEST_BODY_LIMIT_BYTES)) {
    return requestBodyTooLargeResponse();
  }
  const body = (await req.json().catch(() => ({}))) as { email?: unknown; next?: unknown };
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const nextPath = getSafeNextPath(body.next);

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ ok: true });
  }

  // Silent throttle: identical response, just skip the email work.
  const ipThrottled = await consumeRateLimit(
    `resend-verify:ip:${getClientIp(req)}`,
    RESEND_RATE_LIMIT_PER_IP,
    RESEND_RATE_WINDOW_MS
  );
  const emailThrottled = await consumeRateLimit(
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
      baseUrl: getMailPublicOrigin(),
      email: user.email,
      nextPath,
      userId: user.id,
    });
  } catch (error) {
    console.error("Email verification resend failed", error);
  }

  return NextResponse.json({ ok: true });
}
