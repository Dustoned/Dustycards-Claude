import { describe, expect, it } from "vitest";
import { isPublicFile } from "@/proxy";

describe("public app metadata", () => {
  it.each([
    "/favicon.ico",
    "/manifest.webmanifest",
    "/icon",
    "/apple-icon",
    "/_next/static/chunks/app.js",
  ])("allows %s before authentication", (pathname) => {
    expect(isPublicFile(pathname)).toBe(true);
  });

  it("does not turn application routes into public files", () => {
    expect(isPublicFile("/movers/signal-radar")).toBe(false);
  });
});
