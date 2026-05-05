import { describe, expect, it } from "vitest";
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  isSessionExpired,
  normalizeEmail,
  verifyPassword,
} from "@/lib/auth-crypto";

describe("auth crypto helpers", () => {
  it("normalizes emails", () => {
    expect(normalizeEmail("  Dusty@Example.COM ")).toBe("dusty@example.com");
  });

  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).toMatch(/^scrypt\$v1\$/);
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("hashes session tokens deterministically without storing the raw token", () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);

    expect(token).not.toBe(hash);
    expect(hash).toBe(hashSessionToken(token));
    expect(hash).toHaveLength(64);
  });

  it("detects expired sessions", () => {
    const now = new Date("2026-05-05T12:00:00.000Z");

    expect(isSessionExpired(new Date("2026-05-05T11:59:59.999Z"), now)).toBe(true);
    expect(isSessionExpired(new Date("2026-05-05T12:00:00.000Z"), now)).toBe(true);
    expect(isSessionExpired(new Date("2026-05-05T12:00:00.001Z"), now)).toBe(false);
  });
});
