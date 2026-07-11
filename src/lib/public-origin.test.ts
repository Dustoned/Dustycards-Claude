import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getMailPublicOrigin, getPublicOrigin } from "./public-origin";

function requestWithHeaders(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/auth/forgot-password", {
    headers,
  });
}

describe("public origin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses APP_URL for public auth URLs", () => {
    vi.stubEnv("APP_URL", "https://dustycards.example/settings");

    expect(getPublicOrigin(requestWithHeaders())).toBe("https://dustycards.example");
    expect(getMailPublicOrigin()).toBe("https://dustycards.example");
  });

  it("ignores forwarded host headers in development fallback", () => {
    vi.stubEnv("APP_URL", "");

    const req = requestWithHeaders({
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "https",
    });

    expect(getPublicOrigin(req)).toBe("http://localhost:3000");
  });

  it("fails closed for production auth URLs without APP_URL", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NODE_ENV", "production");

    expect(() => getPublicOrigin(requestWithHeaders())).toThrow(/APP_URL/);
    expect(() => getMailPublicOrigin()).toThrow(/APP_URL/);
  });
});
