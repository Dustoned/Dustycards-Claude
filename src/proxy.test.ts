import { describe, expect, it } from "vitest";
import { isPublicFile, isPublicPath } from "@/proxy";

describe("public app metadata", () => {
  it.each([
    "/favicon.ico",
    "/manifest.webmanifest",
    "/icons/dustycards-pokeball-192.png",
    "/icons/dustycards-pokeball-apple-180.png",
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

describe("public binder sharing", () => {
  it("allows public read-only binder links without a session", () => {
    expect(isPublicPath("/share/binders/public-token")).toBe(true);
  });

  it("keeps binder management behind authentication", () => {
    expect(isPublicPath("/api/collection/binders/binder-1/share")).toBe(false);
  });
});
