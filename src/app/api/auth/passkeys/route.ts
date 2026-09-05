import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse, type RegistrationResponseJSON, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { requireUser, authErrorResponse, setSessionCookie, clearSessionCookie } from "@/lib/auth";
import { generateSessionToken, hashSessionToken, verifyPassword } from "@/lib/auth-crypto";
import { SESSION_COOKIE_NAME, SESSION_DURATION_MS, ADMIN_SESSION_DURATION_MS } from "@/lib/auth-constants";
import { decryptMfaSecret, verifyTotp } from "@/lib/mfa";
import { getPublicOrigin } from "@/lib/public-origin";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";
import { readAuthRequestBody, RequestBodyLimitExceededError, MAX_PASSWORD_LENGTH } from "@/lib/request-limits";
import { recordSecurityEvent } from "@/lib/security-events";

const COOKIE = "dustycards-passkey-challenge";
const TTL = 5 * 60_000;
class PasskeyError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
const stamp = (user: { password_hash: string; mfa_secret_encrypted: string | null; mfa_enabled_at: Date | null }) => createHash("sha256").update(JSON.stringify([user.password_hash, user.mfa_secret_encrypted, user.mfa_enabled_at])).digest("hex");
function config(request: NextRequest) {
  const origin = getPublicOrigin(request);
  const url = new URL(origin);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new PasskeyError("Passkeys require HTTPS.", 503);
  if (request.headers.get("origin") !== origin) throw new PasskeyError("Request origin does not match this site.", 403);
  return { origin, rpID: url.hostname };
}
async function currentSessionHash() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return token ? hashSessionToken(token) : null;
}
async function authorizeManagement(body: Record<string, unknown>) {
  const auth = await requireUser();
  const user = await db.user.findUniqueOrThrow({ where: { id: auth.id } });
  if (!user.mfa_enabled_at && auth.mfaEnabled && !auth.mfaVerified) {
    throw new PasskeyError("Sign in with your existing passkey before managing passkeys.", 403);
  }
  const password = typeof body.password === "string" ? body.password : "";
  const code = typeof body.code === "string" ? body.code : "";
  let validMfa = !user.mfa_enabled_at;
  if (user.mfa_enabled_at && user.mfa_secret_encrypted) {
    try { validMfa = verifyTotp(decryptMfaSecret(user.mfa_secret_encrypted), code); } catch { validMfa = false; }
  }
  if (password.length > MAX_PASSWORD_LENGTH || !await verifyPassword(password, user.password_hash) || !validMfa) {
    throw new PasskeyError("Check your current password and authenticator code.", 401);
  }
  return user;
}
async function saveChallenge(challenge: string, purpose: string, user?: Awaited<ReturnType<typeof authorizeManagement>>) {
  const cookieStore = await cookies();
  const oldToken = cookieStore.get(COOKIE)?.value;
  const token = generateSessionToken();
  await db.passkeyChallenge.deleteMany({ where: { OR: [ { expires_at: { lte: new Date() } }, ...(oldToken ? [{ id: hashSessionToken(oldToken) }] : []) ] } });
  await db.passkeyChallenge.create({ data: {
    id: hashSessionToken(token), challenge, purpose, user_id: user?.id,
    session_hash: user ? await currentSessionHash() : null, security_stamp: user ? stamp(user) : null,
    expires_at: new Date(Date.now() + TTL),
  } });
  cookieStore.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/auth/passkeys", maxAge: TTL / 1000 });
}
async function takeChallenge(purpose: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  cookieStore.delete({ name: COOKIE, path: "/api/auth/passkeys" });
  if (!token) throw new PasskeyError("This passkey request expired. Try again.");
  const id = hashSessionToken(token);
  const challenge = await db.passkeyChallenge.findUnique({ where: { id } });
  // Delete is the atomic reservation: only one request may verify this challenge.
  const taken = await db.passkeyChallenge.deleteMany({ where: { id, purpose, expires_at: { gt: new Date() } } });
  if (!challenge || taken.count !== 1) throw new PasskeyError("This passkey request expired. Try again.");
  return challenge;
}

export async function GET() {
  try {
    const user = await requireUser();
    return json({ passkeys: await db.passkey.findMany({ where: { user_id: user.id }, select: { id: true, name: true, created_at: true, last_used_at: true }, orderBy: { created_at: "desc" } }) });
  } catch (error) { return authErrorResponse(error) ?? json({ error: "Could not load passkeys." }, 500); }
}
export async function POST(request: NextRequest) {
  try {
    const { origin, rpID } = config(request);
    if (await consumeRateLimit(`passkey:ip:${getClientIp(request)}`, 30, 15 * 60_000)) return json({ error: "Too many passkey attempts. Try again later." }, 429);
    const { body } = await readAuthRequestBody<Record<string, unknown>>(request);
    if (body.action === "register-options" || body.action === "delete") {
      const auth = await requireUser();
      if (await consumeRateLimit(`passkey:manage:${auth.id}`, 10, 15 * 60_000)) return json({ error: "Too many attempts. Try again later." }, 429);
      const user = await authorizeManagement(body);
      if (body.action === "delete") {
        const id = typeof body.id === "string" ? body.id : "";
        const sessionHash = await currentSessionHash();
        const activeSession = sessionHash ? await db.session.findUnique({ where: { token_hash: sessionHash }, select: { passkey_id: true } }) : null;
        const signedOut = activeSession?.passkey_id === id;
        const removed = await db.passkey.deleteMany({ where: { id, user_id: user.id } });
        if (removed.count !== 1) throw new PasskeyError("Passkey not found.", 404);
        await recordSecurityEvent({ eventType: "auth.passkey.removed", userId: user.id });
        if (signedOut) await clearSessionCookie();
        return json({ ok: true, signedOut });
      }
      const existing = await db.passkey.findMany({ where: { user_id: user.id }, select: { id: true } });
      if (existing.length >= 10) throw new PasskeyError("Remove an unused passkey before adding another.");
      const options = await generateRegistrationOptions({ rpName: "DustyCards", rpID, userName: user.email, userID: new TextEncoder().encode(user.id), attestationType: "none", excludeCredentials: existing, authenticatorSelection: { residentKey: "required", userVerification: "required" } });
      await saveChallenge(options.challenge, "register", user);
      return json(options);
    }
    if (body.action === "register-verify") {
      const auth = await requireUser();
      const challenge = await takeChallenge("register");
      const sessionHash = await currentSessionHash();
      const user = await db.user.findUniqueOrThrow({ where: { id: auth.id } });
      if (challenge.user_id !== user.id || challenge.session_hash !== sessionHash || challenge.security_stamp !== stamp(user)) throw new PasskeyError("Account verification expired. Start again.", 403);
      const verified = await verifyRegistrationResponse({ response: body.response as RegistrationResponseJSON, expectedChallenge: challenge.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
      if (!verified.verified || !verified.registrationInfo) throw new PasskeyError("Passkey verification failed.");
      const { credential, credentialBackedUp } = verified.registrationInfo;
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
      await db.$transaction(async tx => {
        const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
        const session = await tx.session.findUnique({ where: { token_hash: sessionHash! } });
        if (current.disabled || !current.email_verified_at || stamp(current) !== challenge.security_stamp || !session || session.expires_at <= new Date()) throw new PasskeyError("Account verification expired.", 403);
        if (await tx.passkey.count({ where: { user_id: user.id } }) >= 10) throw new PasskeyError("Passkey limit reached.");
        await tx.passkey.create({ data: { id: credential.id, user_id: user.id, public_key: Buffer.from(credential.publicKey).toString("base64url"), counter: BigInt(credential.counter), name: name || "My passkey", transports_json: JSON.stringify(credential.transports ?? []), backed_up: credentialBackedUp } });
      });
      await recordSecurityEvent({ eventType: "auth.passkey.added", userId: user.id });
      return json({ ok: true });
    }
    if (body.action === "login-options") {
      const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
      await saveChallenge(options.challenge, "login");
      return json(options);
    }
    if (body.action === "login-verify") {
      const challenge = await takeChallenge("login");
      const response = body.response as AuthenticationResponseJSON;
      if (!response || typeof response.id !== "string") throw new PasskeyError("Passkey sign-in failed.", 401);
      const passkey = await db.passkey.findUnique({ where: { id: response.id }, include: { user: true } });
      if (!passkey || passkey.user.disabled || !passkey.user.email_verified_at || response.response?.userHandle !== Buffer.from(passkey.user_id).toString("base64url")) throw new PasskeyError("Passkey sign-in failed.", 401);
      const verified = await verifyAuthenticationResponse({ response, expectedChallenge: challenge.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true, credential: { id: passkey.id, publicKey: new Uint8Array(Buffer.from(passkey.public_key, "base64url")), counter: Number(passkey.counter) } });
      if (!verified.verified) throw new PasskeyError("Passkey sign-in failed.", 401);
      const token = generateSessionToken();
      const expiresAt = new Date(Date.now() + (passkey.user.role === "admin" ? ADMIN_SESSION_DURATION_MS : SESSION_DURATION_MS));
      await db.$transaction(async tx => {
        const current = await tx.user.findUniqueOrThrow({ where: { id: passkey.user_id } });
        if (current.disabled || !current.email_verified_at || stamp(current) !== stamp(passkey.user)) throw new PasskeyError("Account changed. Sign in again.", 401);
        const updated = await tx.passkey.updateMany({ where: { id: passkey.id, counter: passkey.counter }, data: { counter: BigInt(verified.authenticationInfo.newCounter), last_used_at: new Date(), backed_up: verified.authenticationInfo.credentialBackedUp } });
        if (updated.count !== 1) throw new PasskeyError("Passkey changed. Try again.", 401);
        await tx.session.create({ data: { user_id: current.id, token_hash: hashSessionToken(token), expires_at: expiresAt, mfa_verified_at: new Date(), passkey_id: passkey.id } });
      });
      await setSessionCookie(token, expiresAt);
      await recordSecurityEvent({ eventType: "auth.login.succeeded", userId: passkey.user_id, ip: getClientIp(request), metadata: { method: "passkey", mfaVerified: true } });
      return json({ ok: true });
    }
    throw new PasskeyError("Unknown passkey action.");
  } catch (error) {
    if (error instanceof RequestBodyLimitExceededError) return json({ error: "Request body too large." }, 413);
    if (error instanceof PasskeyError) return json({ error: error.message }, error.status);
    const authError = authErrorResponse(error);
    if (authError) return authError;
    // Do not return verifier internals or credential material to the browser.
    return json({ error: "Passkey verification failed. Try again or use your password." }, 400);
  }
}
