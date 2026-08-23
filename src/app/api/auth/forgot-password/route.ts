import { NextRequest, NextResponse } from "next/server";
import { generateSessionToken, hashSessionToken, isValidEmail, normalizeEmail } from "@/lib/auth-crypto";
import { db } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/mail";
import { getMailPublicOrigin, getPublicOrigin } from "@/lib/public-origin";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";
import { getSafeNextPath } from "@/lib/safe-next-path";
import {
  AUTH_REQUEST_BODY_LIMIT_BYTES,
  readAuthRequestBody,
  RequestBodyLimitExceededError,
  requestBodyTooLargeResponse,
} from "@/lib/request-limits";

export const runtime = "nodejs";

const RESET_TOKEN_TTL_MS = 1000 * 60 * 30;
const RESET_RATE_WINDOW_MS = 1000 * 60 * 15;
const RESET_RATE_LIMIT_PER_IP = 5;
const RESET_RATE_LIMIT_PER_EMAIL = 3;

function sentResponse(req: NextRequest, isFormPost: boolean, nextPath: string) {
  if (!isFormPost) {
    return NextResponse.json({ ok: true });
  }

  const redirectUrl = new URL("/forgot-password", getPublicOrigin(req));
  redirectUrl.searchParams.set("sent", "1");
  redirectUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(redirectUrl, { status: 303 });
}

export async function POST(req: NextRequest) {
  let parsed: Awaited<ReturnType<typeof readAuthRequestBody<{
    email?: unknown;
    next?: unknown;
  }>>>;
  try {
    parsed = await readAuthRequestBody(req, AUTH_REQUEST_BODY_LIMIT_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyLimitExceededError) {
      return requestBodyTooLargeResponse();
    }
    throw error;
  }
  const { body, isFormPost } = parsed;
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const nextPath = getSafeNextPath(body.next);

  if (!email || !isValidEmail(email)) {
    return sentResponse(req, isFormPost, nextPath);
  }

  // Silent throttle: respond as if sent so the limiter leaks nothing about
  // account existence, but skip the token + email work.
  const ipThrottled = await consumeRateLimit(
    `forgot:ip:${getClientIp(req)}`,
    RESET_RATE_LIMIT_PER_IP,
    RESET_RATE_WINDOW_MS
  );
  const emailThrottled = await consumeRateLimit(
    `forgot:email:${email}`,
    RESET_RATE_LIMIT_PER_EMAIL,
    RESET_RATE_WINDOW_MS
  );
  if (ipThrottled || emailThrottled) {
    return sentResponse(req, isFormPost, nextPath);
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, disabled: true },
  });

  if (!user || user.disabled) {
    return sentResponse(req, isFormPost, nextPath);
  }

  const token = generateSessionToken();
  const resetUrl = new URL("/reset-password", getMailPublicOrigin());
  resetUrl.searchParams.set("token", token);
  resetUrl.searchParams.set("next", nextPath);

  await db.passwordResetToken.deleteMany({ where: { user_id: user.id } });
  await db.passwordResetToken.create({
    data: {
      user_id: user.id,
      token_hash: hashSessionToken(token),
      expires_at: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  try {
    await sendPasswordResetEmail({
      resetUrl: resetUrl.toString(),
      to: user.email,
    });
  } catch (error) {
    console.error("Password reset email failed", error);
  }

  return sentResponse(req, isFormPost, nextPath);
}
