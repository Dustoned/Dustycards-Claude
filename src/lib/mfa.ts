import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_STEP_SECONDS = 30;

function encryptionKey(): Buffer {
  const configured = process.env.AUTH_MFA_ENCRYPTION_KEY?.trim();
  if (!configured || configured.length < 32) {
    throw new Error("AUTH_MFA_ENCRYPTION_KEY must contain at least 32 characters");
  }
  return createHash("sha256").update(configured).digest();
}

export function encodeBase32(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function decodeBase32(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const character of input.toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function generateMfaSecret(): string {
  return encodeBase32(randomBytes(20));
}

export function encryptMfaSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptMfaSecret(value: string): string {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) throw new Error("Invalid MFA secret");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function hotp(secret: string, counter: number): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

export function verifyTotp(secret: string, candidate: string, now = Date.now()): boolean {
  const normalized = candidate.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const counter = Math.floor(now / 1000 / TOTP_STEP_SECONDS);
  return [-1, 0, 1].some((offset) => {
    const expected = Buffer.from(hotp(secret, counter + offset));
    const actual = Buffer.from(normalized);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  });
}

function recoveryHash(code: string): string {
  return createHmac("sha256", encryptionKey()).update(code.toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex");
}

export function generateRecoveryCodes(count = 10): { plain: string[]; hashes: string[] } {
  const plain = Array.from({ length: count }, () => {
    const raw = randomBytes(8).toString("hex").toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12)}`;
  });
  return { plain, hashes: plain.map(recoveryHash) };
}

export function consumeRecoveryCode(candidate: string, hashes: string[]): string[] | null {
  const target = recoveryHash(candidate);
  const index = hashes.findIndex((hash) => {
    const expected = Buffer.from(hash);
    const actual = Buffer.from(target);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  });
  if (index < 0) return null;
  return hashes.filter((_, current) => current !== index);
}

export function buildTotpUri(email: string, secret: string): string {
  const issuer = "DustyCards";
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${email}`)}?secret=${encodeURIComponent(secret)}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}
