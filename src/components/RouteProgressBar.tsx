"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ROUTE_PROGRESS_START_EVENT,
  type RouteProgressStartDetail,
} from "@/lib/route-progress";

const STATUS_DELAY_MS = 550;
const SLOW_NAVIGATION_MS = 3_500;
const SOFT_NAVIGATION_RETRY_MS = 5_000;
const HARD_NAVIGATION_FALLBACK_MS = 11_000;

export function isRouteProgressNavigation(
  href: string,
  currentHref: string,
  origin: string
): boolean {
  try {
    const target = new URL(href, origin);
    const current = new URL(currentHref, origin);
    return (
      target.origin === current.origin &&
      `${target.pathname}${target.search}` !== `${current.pathname}${current.search}`
    );
  } catch {
    return false;
  }
}

export function normalizeRouteProgressLabel(value?: string | null): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > 44 ? `${normalized.slice(0, 41).trimEnd()}…` : normalized;
}

// Gives every internal navigation one consistent lifecycle: immediate visual
// feedback, a clear slow-route message, and a reliable full-page fallback when
// an App Router request has genuinely stalled. The fallback intentionally only
// applies to a known link/programmatic destination, never to refreshes.
export default function RouteProgressBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [width, setWidth] = useState(0);
  const [message, setMessage] = useState("Opening page…");
  const loadingRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const navigationSequenceRef = useRef(0);
  const pendingHrefRef = useRef<string | null>(null);

  const routeKey = `${pathname}?${searchParams?.toString() ?? ""}`;

  useEffect(() => {
    const clearTimers = () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
    };

    const finish = () => {
      if (!loadingRef.current) return;
      loadingRef.current = false;
      pendingHrefRef.current = null;
      navigationSequenceRef.current += 1;
      clearTimers();
      setShowStatus(false);
      setWidth(100);
      timersRef.current.push(window.setTimeout(() => setVisible(false), 220));
      timersRef.current.push(window.setTimeout(() => setWidth(0), 480));
    };

    const start = (detail?: Partial<RouteProgressStartDetail>) => {
      const href = detail?.href
        ? new URL(detail.href, window.location.origin).href
        : null;
      if (
        href &&
        !isRouteProgressNavigation(href, window.location.href, window.location.origin)
      ) {
        return;
      }

      const label = normalizeRouteProgressLabel(detail?.label);
      if (loadingRef.current && href && href === pendingHrefRef.current) {
        setShowStatus(true);
        setMessage(label ? `Still opening ${label}…` : "Still opening page…");
        return;
      }

      loadingRef.current = true;
      pendingHrefRef.current = href;
      navigationSequenceRef.current += 1;
      const sequence = navigationSequenceRef.current;
      clearTimers();
      setVisible(true);
      setShowStatus(false);
      setWidth(7);
      setMessage(label ? `Opening ${label}…` : "Opening page…");

      const trickle = () => {
        if (!loadingRef.current || navigationSequenceRef.current !== sequence) return;
        setWidth((current) =>
          current >= 93 ? current : current + Math.max(0.5, (93 - current) * 0.075)
        );
        timersRef.current.push(window.setTimeout(trickle, 240));
      };

      timersRef.current.push(window.setTimeout(trickle, 180));
      timersRef.current.push(
        window.setTimeout(() => {
          if (!loadingRef.current || navigationSequenceRef.current !== sequence) return;
          setShowStatus(true);
        }, STATUS_DELAY_MS)
      );
      timersRef.current.push(
        window.setTimeout(() => {
          if (!loadingRef.current || navigationSequenceRef.current !== sequence) return;
          setShowStatus(true);
          setMessage(label ? `Still loading ${label}…` : "This page is taking a little longer…");
        }, SLOW_NAVIGATION_MS)
      );
      timersRef.current.push(
        window.setTimeout(() => {
          if (
            !loadingRef.current ||
            navigationSequenceRef.current !== sequence ||
            !pendingHrefRef.current
          ) {
            return;
          }

          const target = new URL(pendingHrefRef.current);
          setShowStatus(true);
          setWidth((current) => Math.max(current, 90));
          setMessage(label ? `Retrying ${label}…` : "Retrying navigation…");
          router.push(`${target.pathname}${target.search}${target.hash}`);
        }, SOFT_NAVIGATION_RETRY_MS)
      );
      timersRef.current.push(
        window.setTimeout(() => {
          if (
            !loadingRef.current ||
            navigationSequenceRef.current !== sequence ||
            !pendingHrefRef.current
          ) {
            return;
          }

          const fallbackHref = pendingHrefRef.current;
          setShowStatus(true);
          setWidth(96);
          setMessage("Restoring navigation…");
          timersRef.current.push(
            window.setTimeout(() => {
              if (loadingRef.current && navigationSequenceRef.current === sequence) {
                window.location.assign(fallbackHref);
              }
            }, 280)
          );
        }, HARD_NAVIGATION_FALLBACK_MS)
      );
    };

    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download") ||
        anchor.hasAttribute("data-no-route-progress")
      ) {
        return;
      }

      start({
        href: anchor.href,
        label:
          anchor.getAttribute("aria-label") ??
          anchor.querySelector("[data-route-progress-label], h1, h2, h3, p")?.textContent ??
          anchor.textContent,
      });
    };

    const onProgrammaticStart = (event: Event) => {
      start((event as CustomEvent<RouteProgressStartDetail>).detail);
    };

    const onPopState = () => start();

    document.addEventListener("click", onClick, true);
    window.addEventListener(ROUTE_PROGRESS_START_EVENT, onProgrammaticStart);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("pageshow", finish);
    window.addEventListener("pagehide", finish);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(ROUTE_PROGRESS_START_EVENT, onProgrammaticStart);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pageshow", finish);
      window.removeEventListener("pagehide", finish);
      clearTimers();
    };
  }, [router]);

  useEffect(() => {
    if (!loadingRef.current) return;
    loadingRef.current = false;
    pendingHrefRef.current = null;
    navigationSequenceRef.current += 1;
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    setShowStatus(false);
    setWidth(100);
    const hideTimer = window.setTimeout(() => setVisible(false), 220);
    const resetTimer = window.setTimeout(() => setWidth(0), 480);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(resetTimer);
    };
  }, [routeKey]);

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-[240] h-[3px]"
        style={{ opacity: visible ? 1 : 0, transition: "opacity 180ms ease" }}
      >
        <div
          className="h-full rounded-r-full motion-reduce:transition-none"
          style={{
            width: `${width}%`,
            background: "var(--dc-primary-gradient)",
            boxShadow: "0 0 12px rgb(var(--dc-primary-rgb) / 0.72)",
            transition: "width 220ms ease",
          }}
        />
      </div>

      {visible && showStatus ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top,0px)+10px)] z-[239] flex max-w-[min(88vw,24rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-white/12 bg-[#101118]/92 px-3 py-2 text-xs font-semibold text-white/82 shadow-2xl shadow-black/35 backdrop-blur-xl"
        >
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-[rgb(var(--dc-primary-rgb))] motion-reduce:animate-none"
          />
          <span className="truncate">{message}</span>
        </div>
      ) : null}
    </>
  );
}
