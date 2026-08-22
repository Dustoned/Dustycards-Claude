import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser, authErrorResponse } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/auth-constants";
import { hashSessionToken, verifyPassword } from "@/lib/auth-crypto";
import { db } from "@/lib/db";
import {
  buildTotpUri,
  decryptMfaSecret,
  encryptMfaSecret,
  generateMfaSecret,
  generateRecoveryCodes,
  verifyTotp,
} from "@/lib/mfa";
import { recordSecurityEvent } from "@/lib/security-events";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";

const MFA_RATE_WINDOW_MS = 15 * 60_000;
const MFA_RATE_LIMIT = 10;

async function rejectThrottledMfa(request: NextRequest, userId: string): Promise<NextResponse | null> {
  const limited = await consumeRateLimit(
    `mfa:${userId}:${getClientIp(request)}`,
    MFA_RATE_LIMIT,
    MFA_RATE_WINDOW_MS
  );
  return limited
    ? NextResponse.json({ error: "Too many MFA attempts. Try again later." }, { status: 429 })
    : null;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const throttled = await rejectThrottledMfa(request, user.id);
    if (throttled) return throttled;
    const body = (await request.json().catch(() => ({}))) as { action?: unknown; code?: unknown };
    const action = body.action === "enable" ? "enable" : "prepare";
    const record = await db.user.findUnique({
      where: { id: user.id },
      select: { email: true, mfa_secret_encrypted: true, mfa_enabled_at: true },
    });
    if (!record) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    if (action === "prepare") {
      if (record.mfa_enabled_at) return NextResponse.json({ enabled: true });
      const secret = generateMfaSecret();
      await db.user.update({
        where: { id: user.id },
        data: { mfa_secret_encrypted: encryptMfaSecret(secret), mfa_recovery_codes_json: null },
      });
      return NextResponse.json({
        enabled: false,
        secret,
        uri: buildTotpUri(record.email, secret),
      });
    }

    const code = typeof body.code === "string" ? body.code : "";
    if (!record.mfa_secret_encrypted || !verifyTotp(decryptMfaSecret(record.mfa_secret_encrypted), code)) {
      return NextResponse.json({ error: "Invalid authenticator code" }, { status: 400 });
    }
    const recovery = generateRecoveryCodes();
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: {
          mfa_enabled_at: new Date(),
          mfa_recovery_codes_json: JSON.stringify(recovery.hashes),
        },
      }),
      ...(token
        ? [db.session.updateMany({
            where: { token_hash: hashSessionToken(token), user_id: user.id },
            data: { mfa_verified_at: new Date() },
          })]
        : []),
    ]);
    await recordSecurityEvent({ eventType: "auth.mfa.enabled", userId: user.id });
    return NextResponse.json({ enabled: true, recoveryCodes: recovery.plain });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "MFA update failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser();
    const throttled = await rejectThrottledMfa(request, user.id);
    if (throttled) return throttled;
    const body = (await request.json().catch(() => ({}))) as { password?: unknown; code?: unknown };
    const password = typeof body.password === "string" ? body.password : "";
    const code = typeof body.code === "string" ? body.code : "";
    const record = await db.user.findUnique({
      where: { id: user.id },
      select: { password_hash: true, mfa_secret_encrypted: true, mfa_enabled_at: true },
    });
    if (!record?.mfa_enabled_at || !record.mfa_secret_encrypted) {
      return NextResponse.json({ enabled: false });
    }
    if (!(await verifyPassword(password, record.password_hash))
      || !verifyTotp(decryptMfaSecret(record.mfa_secret_encrypted), code)) {
      return NextResponse.json({ error: "Password or authenticator code is incorrect" }, { status: 400 });
    }
    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: {
          mfa_secret_encrypted: null,
          mfa_recovery_codes_json: null,
          mfa_enabled_at: null,
        },
      }),
      db.session.deleteMany({ where: { user_id: user.id } }),
    ]);
    await recordSecurityEvent({ eventType: "auth.mfa.disabled", severity: "warning", userId: user.id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "MFA update failed" }, { status: 500 });
  }
}
