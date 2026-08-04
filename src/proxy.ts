import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth-constants";

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password", "/share"];
const PUBLIC_METADATA_PATHS = ["/icon", "/apple-icon"];
const PUBLIC_API_PREFIXES = [
  "/api/app-version",
  "/api/health",
  "/api/image-cache",
  "/api/auth",
  "/api/internal/sync-scheduler",
  "/api/internal/sync-pricedex-pull-rates",
  "/api/internal/warm-signal-radar",
];

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
    PUBLIC_METADATA_PATHS.includes(pathname) ||
    /\.[^/]+$/.test(pathname)
  );
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
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
