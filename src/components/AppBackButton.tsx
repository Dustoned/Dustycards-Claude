"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const CURRENT_ROUTE_KEY = "dustycards:current-route";
const PREVIOUS_ROUTE_KEY = "dustycards:previous-route";

function buildHref(pathname: string, search: string): string {
  return search ? `${pathname}?${search}` : pathname;
}

function isSafeLocalRoute(value: string | null): value is string {
  return Boolean(value && value.startsWith("/") && !value.startsWith("//"));
}

function getBackFallback(pathname: string): string | null {
  if (pathname === "/search") return "/";
  if (pathname.startsWith("/expansions/")) return "/expansions";
  if (pathname.startsWith("/one-piece/expansions/")) return "/one-piece/expansions";
  if (pathname.startsWith("/binders/")) return "/?tab=binders";
  if (pathname.startsWith("/wants/binders/")) return "/wants";
  if (pathname.startsWith("/categories/")) return "/categories";
  if (pathname.startsWith("/illustrators/")) return "/illustrators";
  if (pathname.startsWith("/movers/")) return "/movers";

  return null;
}

function shouldShowBackButton(pathname: string, search: string): boolean {
  if (pathname === "/search") return Boolean(new URLSearchParams(search).get("q"));
  return getBackFallback(pathname) != null;
}

export default function AppBackButton() {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const router = useRouter();
  const search = searchParams.toString();
  const currentHref = buildHref(pathname, search);
  const fallbackHref = getBackFallback(pathname);
  const visible = shouldShowBackButton(pathname, search);

  useEffect(() => {
    try {
      const previousCurrent = window.sessionStorage.getItem(CURRENT_ROUTE_KEY);
      if (previousCurrent && previousCurrent !== currentHref) {
        window.sessionStorage.setItem(PREVIOUS_ROUTE_KEY, previousCurrent);
      }
      window.sessionStorage.setItem(CURRENT_ROUTE_KEY, currentHref);
    } catch {
      // Session storage is only a convenience; the fallback route keeps this button usable.
    }
  }, [currentHref]);

  if (!visible) return null;

  function goBack() {
    let target: string | null = null;

    try {
      const previousRoute = window.sessionStorage.getItem(PREVIOUS_ROUTE_KEY);
      if (isSafeLocalRoute(previousRoute) && previousRoute !== currentHref) {
        target = previousRoute;
      }
    } catch {
      target = null;
    }

    router.push(target ?? fallbackHref ?? "/");
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Go back"
      title="Go back"
      className="inline-flex h-[calc(var(--ui-header-search-height)-0.35rem)] shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.055] px-2 text-white/72 shadow-sm shadow-black/20 transition-colors hover:border-white/18 hover:bg-white/[0.085] hover:text-white sm:px-3"
    >
      <ArrowLeft className="h-4 w-4" />
      <span className="hidden text-sm font-semibold sm:inline">Back</span>
    </button>
  );
}
