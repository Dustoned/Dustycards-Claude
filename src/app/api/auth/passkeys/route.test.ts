import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({
  user: { findUniqueOrThrow: vi.fn() }, passkey: { findMany: vi.fn(), findUnique: vi.fn() },
  passkeyChallenge: { findUnique: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
  requireUser: vi.fn(), limited: vi.fn(), password: vi.fn(), totp: vi.fn(),
  cookieGet: vi.fn(), cookieSet: vi.fn(), cookieDelete: vi.fn(),
  register: vi.fn(), authOptions: vi.fn(), verify: vi.fn(), verifyAuth: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { user: m.user, passkey: m.passkey, passkeyChallenge: m.passkeyChallenge } }));
vi.mock("@/lib/auth", () => ({ requireUser: m.requireUser, authErrorResponse: () => null, setSessionCookie: vi.fn(), clearSessionCookie: vi.fn() }));
vi.mock("@/lib/auth-crypto", () => ({ verifyPassword: m.password, generateSessionToken: () => "random-token", hashSessionToken: (value: string) => `hash:${value}` }));
vi.mock("@/lib/mfa", () => ({ decryptMfaSecret: () => "secret", verifyTotp: m.totp }));
vi.mock("@/lib/public-origin", () => ({ getPublicOrigin: () => "https://cards.example" }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: m.limited, getClientIp: () => "test" }));
vi.mock("@/lib/security-events", () => ({ recordSecurityEvent: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: m.cookieGet, set: m.cookieSet, delete: m.cookieDelete }) }));
vi.mock("@simplewebauthn/server", () => ({ generateRegistrationOptions: m.register, verifyRegistrationResponse: m.verify, generateAuthenticationOptions: m.authOptions, verifyAuthenticationResponse: m.verifyAuth }));
import { POST } from "./route";
function post(body: object, origin = "https://cards.example") { return POST(new NextRequest("https://cards.example/api/auth/passkeys", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) })); }
beforeEach(() => {
  vi.resetAllMocks(); m.limited.mockResolvedValue(false); m.requireUser.mockResolvedValue({ id: "user" }); m.password.mockResolvedValue(true); m.totp.mockReturnValue(true);
  m.user.findUniqueOrThrow.mockResolvedValue({ id: "user", email: "user@example.test", password_hash: "hash", mfa_enabled_at: new Date(), mfa_secret_encrypted: "encrypted" });
  m.passkey.findMany.mockResolvedValue([]); m.register.mockResolvedValue({ challenge: "challenge" }); m.cookieGet.mockReturnValue({ value: "session" });
});
it("requires current password and MFA before issuing enrollment", async () => {
  m.totp.mockReturnValue(false); expect((await post({ action: "register-options", password: "correct" })).status).toBe(401); expect(m.register).not.toHaveBeenCalled();
});
it("requires discoverable credentials and device verification", async () => {
  expect((await post({ action: "register-options", password: "correct", code: "123456" })).status).toBe(200);
  expect(m.register).toHaveBeenCalledWith(expect.objectContaining({ rpID: "cards.example", authenticatorSelection: { residentKey: "required", userVerification: "required" } }));
  expect(m.cookieSet).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ httpOnly: true, sameSite: "strict" }));
});
it("rejects a different browser origin", async () => { expect((await post({ action: "login-options" }, "https://attacker.example")).status).toBe(403); expect(m.authOptions).not.toHaveBeenCalled(); });
it("limits requests before issuing a challenge", async () => { m.limited.mockResolvedValue(true); expect((await post({ action: "login-options" })).status).toBe(429); expect(m.authOptions).not.toHaveBeenCalled(); });
it("does not verify a challenge already consumed by another request", async () => {
  m.passkeyChallenge.findUnique.mockResolvedValue({ challenge: "old" }); m.passkeyChallenge.deleteMany.mockResolvedValue({ count: 0 });
  expect((await post({ action: "login-verify", response: {} })).status).toBe(400); expect(m.verifyAuth).not.toHaveBeenCalled();
});
it("binds enrollment to the account and initiating session", async () => {
  m.passkeyChallenge.findUnique.mockResolvedValue({ challenge: "challenge", user_id: "other", session_hash: "hash:session" }); m.passkeyChallenge.deleteMany.mockResolvedValue({ count: 1 });
  expect((await post({ action: "register-verify", response: {} })).status).toBe(403); expect(m.verify).not.toHaveBeenCalled();
});
it("rejects a credential belonging to a disabled user", async () => {
  m.passkeyChallenge.findUnique.mockResolvedValue({ challenge: "challenge" }); m.passkeyChallenge.deleteMany.mockResolvedValue({ count: 1 });
  m.passkey.findUnique.mockResolvedValue({ user: { disabled: true } });
  expect((await post({ action: "login-verify", response: { id: "credential" } })).status).toBe(401); expect(m.verifyAuth).not.toHaveBeenCalled();
});
