import { NextRequest, NextResponse } from "next/server";
import {
  createUserSession,
  setSessionCookie,
} from "@/lib/auth";
import { normalizeEmail, verifyPassword } from "@/lib/auth-crypto";
import {
  ACCOUNT_APPROVAL_ERROR_CODE,
  ACCOUNT_APPROVAL_MESSAGE,
  MFA_REQUIRED_ERROR_CODE,
} from "@/lib/auth-constants";
import { db } from "@/lib/db";
import { sendVerificationEmailForUser } from "@/lib/email-verification";
import { getMailPublicOrigin, getPublicOrigin } from "@/lib/public-origin";
import { getClientIp, isRateLimited, recordRateLimitHit } from "@/lib/rate-limit";
import { consumeRecoveryCode, decryptMfaSecret, verifyTotp } from "@/lib/mfa";
import { recordSecurityEvent } from "@/lib/security-events";
import { getSafeNextPath } from "@/lib/safe-next-path";
import {
  AUTH_REQUEST_BODY_LIMIT_BYTES,
  MAX_PASSWORD_LENGTH,
  requestBodyTooLarge,
  requestBodyTooLargeResponse,
} from "@/lib/request-limits";

export const runtime = "nodejs";

const LOGIN_RATE_WINDOW_MS = 1000 * 60 * 15;
const LOGIN_RATE_LIMIT_PER_IP = 20;
const LOGIN_RATE_LIMIT_PER_EMAIL = 8;

export async function POST(req: NextRequest) {
  if (requestBodyTooLarge(req, AUTH_REQUEST_BODY_LIMIT_BYTES)) {
    return requestBodyTooLargeResponse();
  }
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
        mfaCode?: unknown;
      });
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const next = getSafeNextPath(body.next);
  const password = typeof body.password === "string" ? body.password : "";
  const mfaCode = typeof body.mfaCode === "string" ? body.mfaCode.trim() : "";
  const clientIp = getClientIp(req);

  if (password.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const ipKey = `login:ip:${clientIp}`;
  const emailKey = email ? `login:email:${email}` : null;
  if (
    (await isRateLimited(ipKey, LOGIN_RATE_LIMIT_PER_IP, LOGIN_RATE_WINDOW_MS)) ||
    (emailKey && (await isRateLimited(emailKey, LOGIN_RATE_LIMIT_PER_EMAIL, LOGIN_RATE_WINDOW_MS)))
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
          mfa_secret_encrypted: true,
          mfa_recovery_codes_json: true,
          mfa_enabled_at: true,
        },
      })
    : null;

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    await recordRateLimitHit(ipKey, LOGIN_RATE_WINDOW_MS);
    if (emailKey) await recordRateLimitHit(emailKey, LOGIN_RATE_WINDOW_MS);
    await recordSecurityEvent({
      eventType: "auth.login.failed",
      severity: "warning",
      userId: user?.id,
      ip: clientIp,
      metadata: { emailProvided: Boolean(email) },
    });
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

  let mfaVerified = false;
  if (user.mfa_enabled_at) {
    if (!mfaCode) {
      return NextResponse.json(
        { code: MFA_REQUIRED_ERROR_CODE, error: "Enter your authenticator or recovery code" },
        { status: 403 }
      );
    }
    let valid = false;
    if (user.mfa_secret_encrypted) {
      try {
        valid = verifyTotp(decryptMfaSecret(user.mfa_secret_encrypted), mfaCode);
      } catch {
        valid = false;
      }
    }
    if (!valid && user.mfa_recovery_codes_json) {
      let hashes: string[] = [];
      try {
        const parsed = JSON.parse(user.mfa_recovery_codes_json) as unknown;
        hashes = Array.isArray(parsed)
          ? parsed.filter((entry): entry is string => typeof entry === "string")
          : [];
      } catch {
        hashes = [];
      }
      const remaining = consumeRecoveryCode(mfaCode, hashes);
      if (remaining) {
        valid = true;
        await db.user.update({
          where: { id: user.id },
          data: { mfa_recovery_codes_json: JSON.stringify(remaining) },
        });
      }
    }
    if (!valid) {
      await recordRateLimitHit(ipKey, LOGIN_RATE_WINDOW_MS);
      if (emailKey) await recordRateLimitHit(emailKey, LOGIN_RATE_WINDOW_MS);
      await recordSecurityEvent({
        eventType: "auth.mfa.failed",
        severity: "warning",
        userId: user.id,
        ip: clientIp,
      });
      return NextResponse.json({ error: "Invalid authenticator or recovery code" }, { status: 401 });
    }
    mfaVerified = true;
  }

  const session = await createUserSession(user.id, {
    isAdmin: user.role === "admin",
    mfaVerified,
  });
  await setSessionCookie(session.token, session.expiresAt);
  await recordSecurityEvent({
    eventType: "auth.login.succeeded",
    userId: user.id,
    ip: clientIp,
    metadata: { mfaVerified, role: user.role },
  });

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
