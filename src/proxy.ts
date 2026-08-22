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
  if (isCrossSiteMutation(request)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
    }
    return new NextResponse("Cross-site request blocked", { status: 403 });
  }

  if (isPublicFile(pathname) || isPublicPath(pathname)) {
    const headers = new Headers(request.headers);
    headers.set("x-dustycards-pathname", pathname);
    return NextResponse.next({
      request: { headers },
    });
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  const headers = new Headers(request.headers);
  headers.set("x-dustycards-pathname", pathname);
  return NextResponse.next({
    request: { headers },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
