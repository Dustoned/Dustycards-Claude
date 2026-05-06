import { NextRequest, NextResponse } from "next/server";
import { generateSessionToken, hashSessionToken, isValidEmail, normalizeEmail } from "@/lib/auth-crypto";
import { db } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/mail";

export const runtime = "nodejs";

const RESET_TOKEN_TTL_MS = 1000 * 60 * 30;

function getPublicOrigin(req: NextRequest): string {
  const configuredUrl = process.env.APP_URL;
  if (configuredUrl) return configuredUrl;

  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost ?? req.headers.get("host") ?? new URL(req.url).host;
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const proto = forwardedProto ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function sentResponse(req: NextRequest, isFormPost: boolean) {
  if (!isFormPost) {
    return NextResponse.json({ ok: true });
  }

  const redirectUrl = new URL("/forgot-password", getPublicOrigin(req));
  redirectUrl.searchParams.set("sent", "1");
  return NextResponse.redirect(redirectUrl, { status: 303 });
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  const isFormPost =
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data");
  const body = isFormPost
    ? Object.fromEntries(await req.formData())
    : ((await req.json().catch(() => ({}))) as { email?: unknown });
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";

  if (!email || !isValidEmail(email)) {
    return sentResponse(req, isFormPost);
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, disabled: true },
  });

  if (!user || user.disabled) {
    return sentResponse(req, isFormPost);
  }

  const token = generateSessionToken();
  const resetUrl = new URL("/reset-password", getPublicOrigin(req));
  resetUrl.searchParams.set("token", token);

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

  return sentResponse(req, isFormPost);
}
