import { describe, expect, it } from "vitest";
import { isPublicFile, isPublicPath } from "@/proxy";

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

describe("scheduler-authenticated internal APIs", () => {
  it.each([
    "/api/internal/sync-scheduler",
    "/api/internal/sync-pricedex-pull-rates",
    "/api/internal/warm-signal-radar",
  ])("lets %s reach its own secret check without a session cookie", (pathname) => {
    expect(isPublicPath(pathname)).toBe(true);
  });

  it("keeps other internal APIs behind session authentication", () => {
    expect(isPublicPath("/api/internal/not-allowed")).toBe(false);
  });
});
