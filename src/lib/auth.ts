import { cache } from "react";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ADMIN_REAUTH_MAX_AGE_MS,
  ADMIN_SESSION_DURATION_MS,
  MFA_SETUP_REQUIRED_ERROR_CODE,
  REAUTH_REQUIRED_ERROR_CODE,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
} from "@/lib/auth-constants";
import { db } from "@/lib/db";
import {
  generateSessionToken,
  hashSessionToken,
  isSessionExpired,
} from "@/lib/auth-crypto";

export type UserRole = "admin" | "user";
const SESSION_ACTIVITY_WRITE_INTERVAL_MS = 60_000;
const recentlyTouchedSessions = new Map<string, number>();

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  disabled: boolean;
  mfaEnabled: boolean;
  mfaVerified: boolean;
  sessionCreatedAt: Date;
}

export class AuthenticationError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  constructor(message = "Admin access required") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class MfaSetupRequiredError extends Error {
  code = MFA_SETUP_REQUIRED_ERROR_CODE;
  constructor() {
    super("Admin MFA must be enabled before using admin controls");
    this.name = "MfaSetupRequiredError";
  }
}

export class ReauthenticationRequiredError extends Error {
  code = REAUTH_REQUIRED_ERROR_CODE;
  constructor() {
    super("Log in again before performing this sensitive action");
    this.name = "ReauthenticationRequiredError";
  }
}

function toAuthUser(user: {
  id: string;
  email: string;
  email_verified_at: Date | null;
  role: string;
  disabled: boolean;
  mfa_enabled_at: Date | null;
}, session: { created_at: Date; mfa_verified_at: Date | null }): AuthUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role === "admin" ? "admin" : "user",
    disabled: user.disabled,
    mfaEnabled: Boolean(user.mfa_enabled_at),
    mfaVerified: Boolean(session.mfa_verified_at),
    sessionCreatedAt: session.created_at,
  };
}

function sessionCookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(expires ? { expires } : {}),
  };
}

export async function createUserSession(userId: string, options?: {
  isAdmin?: boolean;
  mfaVerified?: boolean;
}): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + (options?.isAdmin ? ADMIN_SESSION_DURATION_MS : SESSION_DURATION_MS));

  await db.session.create({
    data: {
      user_id: userId,
      token_hash: hashSessionToken(token),
      expires_at: expiresAt,
      mfa_verified_at: options?.mfaVerified ? new Date() : null,
    },
  });

  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(expiresAt));
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(new Date(0)),
    maxAge: 0,
  });
}

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await db.session.deleteMany({
      where: { token_hash: hashSessionToken(token) },
    });
  }
  await clearSessionCookie();
}

// Memoized per request (React cache): the layout and requirePageUser both need
// the current user, so this collapses the repeated session lookup into one.
export const getCurrentUser = cache(async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { token_hash: hashSessionToken(token) },
    select: {
      id: true,
      created_at: true,
      mfa_verified_at: true,
      expires_at: true,
      last_seen_at: true,
      user: {
        select: {
          id: true,
          email: true,
          email_verified_at: true,
          role: true,
          disabled: true,
          mfa_enabled_at: true,
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  if (isSessionExpired(session.expires_at) || session.user.disabled || !session.user.email_verified_at) {
    await db.session.deleteMany({ where: { id: session.id } });
    return null;
  }

  const now = Date.now();
  const lastTouchedAt = recentlyTouchedSessions.get(session.id) ?? 0;
  if (
    now - session.last_seen_at.getTime() >= SESSION_ACTIVITY_WRITE_INTERVAL_MS &&
    now - lastTouchedAt >= SESSION_ACTIVITY_WRITE_INTERVAL_MS
  ) {
    recentlyTouchedSessions.set(session.id, now);
    await db.session.updateMany({
      where: {
        id: session.id,
        last_seen_at: { lte: new Date(now - SESSION_ACTIVITY_WRITE_INTERVAL_MS) },
      },
      data: { last_seen_at: new Date(now) },
    }).catch(() => {
      recentlyTouchedSessions.delete(session.id);
    });
  }

  return toAuthUser(session.user, session);
});

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthenticationError();
  }
  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new AuthorizationError();
  }
  if (process.env.DUSTYCARDS_REQUIRE_ADMIN_MFA === "true" && !user.mfaEnabled) {
    throw new MfaSetupRequiredError();
  }
  if (user.mfaEnabled && !user.mfaVerified) {
    throw new MfaSetupRequiredError();
  }
  return user;
}

export async function requireRecentAdmin(maxAgeMs = ADMIN_REAUTH_MAX_AGE_MS): Promise<AuthUser> {
  const user = await requireAdmin();
  if (Date.now() - user.sessionCreatedAt.getTime() > maxAgeMs) {
    throw new ReauthenticationRequiredError();
  }
  return user;
}

export function authErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof AuthenticationError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  if (error instanceof AuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof MfaSetupRequiredError || error instanceof ReauthenticationRequiredError) {
    return NextResponse.json({ code: error.code, error: error.message }, { status: 403 });
  }

  return null;
}
