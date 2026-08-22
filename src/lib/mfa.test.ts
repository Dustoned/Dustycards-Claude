import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildTotpUri,
  consumeRecoveryCode,
  decodeBase32,
  decryptMfaSecret,
  encodeBase32,
  encryptMfaSecret,
  generateRecoveryCodes,
  verifyTotp,
} from "@/lib/mfa";

describe("MFA helpers", () => {
  const previousKey = process.env.AUTH_MFA_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.AUTH_MFA_ENCRYPTION_KEY = "test-only-mfa-encryption-key-with-32-characters";
  });

  afterEach(() => {
    if (previousKey === undefined) delete process.env.AUTH_MFA_ENCRYPTION_KEY;
    else process.env.AUTH_MFA_ENCRYPTION_KEY = previousKey;
  });

  it("round-trips Base32 values", () => {
    const input = Buffer.from("DustyCards MFA secret", "utf8");
    expect(decodeBase32(encodeBase32(input))).toEqual(input);
  });

  it("encrypts authenticated secrets and rejects tampering", () => {
    const encrypted = encryptMfaSecret("JBSWY3DPEHPK3PXP");
    expect(encrypted).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptMfaSecret(encrypted)).toBe("JBSWY3DPEHPK3PXP");

    const parts = encrypted.split(".");
    parts[2] = `${parts[2].startsWith("A") ? "B" : "A"}${parts[2].slice(1)}`;
    const tampered = parts.join(".");
    expect(() => decryptMfaSecret(tampered)).toThrow();
  });

  it("accepts the RFC 6238 SHA1 vector as a six-digit TOTP", () => {
    const secret = encodeBase32(Buffer.from("12345678901234567890", "ascii"));
    expect(verifyTotp(secret, "287082", 59_000)).toBe(true);
    expect(verifyTotp(secret, "287083", 59_000)).toBe(false);
  });

  it("makes recovery codes one-time use", () => {
    const recovery = generateRecoveryCodes(3);
    const remaining = consumeRecoveryCode(recovery.plain[1], recovery.hashes);
    expect(remaining).toHaveLength(2);
    expect(consumeRecoveryCode(recovery.plain[1], remaining ?? [])).toBeNull();
  });

  it("builds an authenticator-compatible URI", () => {
    const uri = buildTotpUri("admin+dusty@example.com", "ABC234");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("secret=ABC234");
    expect(uri).toContain("issuer=DustyCards");
    expect(uri).toContain("digits=6");
  });
});
