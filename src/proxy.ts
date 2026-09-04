import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth-constants";

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password", "/share"];
const PUBLIC_API_PREFIXES = [
  "/api/app-version",
  "/api/health",
  "/api/image-cache",
  "/api/auth",
  "/api/internal/sync-scheduler",
  "/api/internal/sync-pricedex-pull-rates",
  "/api/internal/warm-collection-overviews",
  "/api/internal/warm-signal-radar",
];
const SAFE_REQUEST_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function buildContentSecurityPolicy(nonce: string): string {
  const developmentEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentEval}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "media-src 'self' blob: https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function secureResponse(response: NextResponse, nonce: string): NextResponse {
  response.headers.set("Content-Security-Policy", buildContentSecurityPolicy(nonce));
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=()");
  return response;
}

function getPublicRequestOrigin(
  request: Pick<NextRequest, "headers" | "nextUrl">
): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || request.nextUrl.protocol.replace(/:$/, "");

  if (host && (protocol === "https" || protocol === "http")) {
    return `${protocol}://${host}`;
  }
  return request.nextUrl.origin;
}

/**
 * Reject browser-initiated cross-site mutations before they reach public auth
 * endpoints, server actions or authenticated APIs. Requests from systemd jobs
 * and other non-browser clients normally omit both browser headers and remain
 * protected by their route-specific credentials.
 */
export function isCrossSiteMutation(
  request: Pick<NextRequest, "headers" | "method" | "nextUrl">
): boolean {
  if (SAFE_REQUEST_METHODS.has(request.method.toUpperCase())) return false;

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") return true;

  const origin = request.headers.get("origin")?.trim();
  if (!origin) return false;
  if (origin === "null") return true;

  try {
    return new URL(origin).origin !== getPublicRequestOrigin(request);
  } catch {
    return true;
  }
}

export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    PUBLIC_API_PREFIXES.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  );
}

export function isPublicFile(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    /\.[^/]+$/.test(pathname)
  );
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const nonce = crypto.randomUUID().replaceAll("-", "");
  if (isCrossSiteMutation(request)) {
    if (pathname.startsWith("/api/")) {
      return secureResponse(NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 }), nonce);
    }
    return secureResponse(new NextResponse("Cross-site request blocked", { status: 403 }), nonce);
  }

  if (isPublicFile(pathname) || isPublicPath(pathname)) {
    const headers = new Headers(request.headers);
    headers.set("x-dustycards-pathname", pathname);
    headers.set("x-nonce", nonce);
    // Next.js reads the request CSP to apply the same nonce to its framework
    // scripts. Setting it only on the response would block those scripts.
    headers.set("Content-Security-Policy", buildContentSecurityPolicy(nonce));
    return secureResponse(NextResponse.next({
      request: { headers },
    }), nonce);
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return secureResponse(NextResponse.json({ error: "Authentication required" }, { status: 401 }), nonce);
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return secureResponse(NextResponse.redirect(loginUrl), nonce);
  }

  const headers = new Headers(request.headers);
  headers.set("x-dustycards-pathname", pathname);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", buildContentSecurityPolicy(nonce));
  return secureResponse(NextResponse.next({
    request: { headers },
  }), nonce);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
