import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { cryptoMock, dbMock, mailMock, originMock, rateLimitMock } = vi.hoisted(() => ({
  cryptoMock: {
    hashPassword: vi.fn(),
    isValidEmail: vi.fn(() => true),
    normalizeEmail: vi.fn((value: string) => value.trim().toLowerCase()),
  },
  dbMock: {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
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
    consumeRateLimit: vi.fn(() => false),
    getClientIp: vi.fn(() => "127.0.0.1"),
  },
}));

vi.mock("@/lib/auth-crypto", () => cryptoMock);
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/email-verification", () => mailMock);
vi.mock("@/lib/public-origin", () => originMock);
vi.mock("@/lib/rate-limit", () => rateLimitMock);
vi.mock("@/lib/safe-next-path", () => ({ getSafeNextPath: vi.fn(() => "/") }));

import { POST } from "@/app/api/auth/register/route";

describe("registration account approval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cryptoMock.isValidEmail.mockReturnValue(true);
    cryptoMock.hashPassword.mockResolvedValue("new-hash");
    rateLimitMock.consumeRateLimit.mockReturnValue(false);
    dbMock.user.findUnique.mockResolvedValue(null);
    dbMock.user.create.mockResolvedValue({
      id: "new-user",
      email: "new@example.com",
      role: "user",
    });
    mailMock.sendVerificationEmailForUser.mockResolvedValue(undefined);
  });

  it("creates every new account disabled until an admin approves it", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "NEW@example.com",
          password: "password-123",
          passwordConfirm: "password-123",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(dbMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          disabled: true,
          email: "new@example.com",
          password_hash: "new-hash",
          role: "user",
        },
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      approvalRequired: true,
      verifyEmail: true,
      verificationSent: true,
    });
  });
});
