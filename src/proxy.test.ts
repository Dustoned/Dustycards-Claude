import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { isCrossSiteMutation, isPublicFile, isPublicPath } from "@/proxy";

function mutationRequest(
  method: string,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest("https://dustycards.example/api/collection/items", {
    method,
    headers: {
      host: "dustycards.example",
      "x-forwarded-host": "dustycards.example",
      "x-forwarded-proto": "https",
      ...headers,
    },
  });
}

describe("cross-site mutation protection", () => {
  it("allows safe reads regardless of their browser source", () => {
    expect(
      isCrossSiteMutation(mutationRequest("GET", { "sec-fetch-site": "cross-site" }))
    ).toBe(false);
  });

  it("allows same-origin browser mutations", () => {
    expect(
      isCrossSiteMutation(
        mutationRequest("POST", {
          origin: "https://dustycards.example",
          "sec-fetch-site": "same-origin",
        })
      )
    ).toBe(false);
  });

  it("uses the trusted public proxy origin instead of the internal Next URL", () => {
    const request = new NextRequest("http://127.0.0.1:3000/api/collection/items", {
      method: "POST",
      headers: {
        host: "dustycards.example",
        "x-forwarded-host": "dustycards.example",
        "x-forwarded-proto": "https",
        origin: "https://dustycards.example",
        "sec-fetch-site": "same-origin",
      },
    });

    expect(isCrossSiteMutation(request)).toBe(false);
  });

  it("blocks cross-site browser mutations even on public auth routes", () => {
    expect(
      isCrossSiteMutation(
        mutationRequest("POST", {
          origin: "https://attacker.example",
          "sec-fetch-site": "cross-site",
        })
      )
    ).toBe(true);
  });

  it("allows credentialed server workers that do not send browser origin headers", () => {
    expect(isCrossSiteMutation(mutationRequest("POST"))).toBe(false);
  });

  it("blocks malformed and opaque browser origins", () => {
    expect(isCrossSiteMutation(mutationRequest("PATCH", { origin: "null" }))).toBe(true);
    expect(isCrossSiteMutation(mutationRequest("DELETE", { origin: "not a URL" }))).toBe(true);
  });
});

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
    "/api/internal/warm-collection-overviews",
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
