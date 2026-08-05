import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authMock, cryptoMock, dbMock, mailMock, originMock, rateLimitMock } = vi.hoisted(() => ({
  authMock: {
    createUserSession: vi.fn(),
    setSessionCookie: vi.fn(),
  },
  cryptoMock: {
    normalizeEmail: vi.fn((value: string) => value.trim().toLowerCase()),
    verifyPassword: vi.fn(),
  },
  dbMock: {
    user: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  mailMock: {
    sendVerificationEmailForUser: vi.fn(),
  },
  originMock: {
    getMailPublicOrigin: vi.fn(() => "http://localhost:3000"),
    getPublicOrigin: vi.fn(() => "http://localhost:3000"),
  },
  rateLimitMock: {
    getClientIp: vi.fn(() => "127.0.0.1"),
    isRateLimited: vi.fn(() => false),
    recordRateLimitHit: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => authMock);
vi.mock("@/lib/auth-crypto", () => cryptoMock);
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/email-verification", () => mailMock);
vi.mock("@/lib/public-origin", () => originMock);
vi.mock("@/lib/rate-limit", () => rateLimitMock);
vi.mock("@/lib/safe-next-path", () => ({ getSafeNextPath: vi.fn(() => "/") }));

import { POST } from "@/app/api/auth/login/route";

const pendingUser = {
  id: "pending-user",
  email: "pending@example.com",
  email_verified_at: new Date("2026-08-05T08:00:00.000Z"),
  password_hash: "stored-hash",
  role: "user",
  disabled: true,
};

describe("login account approval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.isRateLimited.mockReturnValue(false);
    dbMock.user.findUnique.mockResolvedValue(pendingUser);
    cryptoMock.verifyPassword.mockResolvedValue(true);
    dbMock.user.updateMany.mockResolvedValue({ count: 1 });
  });

  it("returns a dedicated approval response after valid credentials", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingUser.email, password: "correct-password" }),
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: "pending_approval",
      error: "Your account is waiting for admin approval.",
    });
    expect(authMock.createUserSession).not.toHaveBeenCalled();
    expect(mailMock.sendVerificationEmailForUser).not.toHaveBeenCalled();
    expect(rateLimitMock.recordRateLimitHit).not.toHaveBeenCalled();
    expect(dbMock.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: pendingUser.id,
        disabled: true,
        approval_requested_at: null,
      },
      data: { approval_requested_at: expect.any(Date) },
    });
  });

  it("does not reveal approval status when the password is wrong", async () => {
    cryptoMock.verifyPassword.mockResolvedValue(false);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingUser.email, password: "wrong-password" }),
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Invalid email or password" });
    expect(rateLimitMock.recordRateLimitHit).toHaveBeenCalledTimes(2);
    expect(dbMock.user.updateMany).not.toHaveBeenCalled();
  });

  it("redirects form logins to the approval popup state", async () => {
    const form = new URLSearchParams({
      email: pendingUser.email,
      password: "correct-password",
    });
    const response = await POST(
      new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?error=pending&next=%2F"
    );
  });
});
