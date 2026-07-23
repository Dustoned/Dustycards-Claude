"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const MAX_PROGRESS_DURATION_MS = 8_000;

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

// A thin top progress bar that appears the moment an internal navigation starts
// (link click or back/forward) and completes when the route actually changes.
// This gives immediate feedback on slow server-rendered pages, which otherwise
// look frozen because the old page stays until the new one is ready.
export default function RouteProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const loadingRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const navigationSequenceRef = useRef(0);

  const routeKey = `${pathname}?${searchParams?.toString() ?? ""}`;

  useEffect(() => {
    const clearTimers = () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
    };

    const trickle = () => {
      setWidth((current) => (current >= 92 ? current : current + Math.max(0.6, (92 - current) * 0.09)));
      timersRef.current.push(window.setTimeout(trickle, 220));
    };

    const finish = () => {
      if (!loadingRef.current) return;
      loadingRef.current = false;
      navigationSequenceRef.current += 1;
      clearTimers();
      setWidth(100);
      timersRef.current.push(window.setTimeout(() => setVisible(false), 240));
      timersRef.current.push(window.setTimeout(() => setWidth(0), 520));
    };

    const start = () => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      navigationSequenceRef.current += 1;
      const sequence = navigationSequenceRef.current;
      clearTimers();
      setVisible(true);
      setWidth(8);
      timersRef.current.push(window.setTimeout(trickle, 220));
      timersRef.current.push(
        window.setTimeout(() => {
          if (loadingRef.current && navigationSequenceRef.current === sequence) {
            finish();
          }
        }, MAX_PROGRESS_DURATION_MS)
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
      ) return;
      if (isRouteProgressNavigation(anchor.href, window.location.href, window.location.origin)) {
        start();
      }
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", start);
    window.addEventListener("pageshow", finish);
    window.addEventListener("pagehide", finish);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", start);
      window.removeEventListener("pageshow", finish);
      window.removeEventListener("pagehide", finish);
      clearTimers();
    };
  }, []);

  useEffect(() => {
    // The route (path or query) changed — if a navigation was in flight, finish
    // the bar and fade it out.
    if (!loadingRef.current) return;
    loadingRef.current = false;
    navigationSequenceRef.current += 1;
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    setWidth(100);
    const hideTimer = window.setTimeout(() => setVisible(false), 240);
    const resetTimer = window.setTimeout(() => setWidth(0), 520);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(resetTimer);
    };
  }, [routeKey]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[3px]"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms ease" }}
    >
      <div
        className="h-full rounded-r-full"
        style={{
          width: `${width}%`,
          background: "var(--dc-primary-gradient)",
          boxShadow: "0 0 10px rgb(var(--dc-primary-rgb) / 0.7)",
          transition: "width 220ms ease",
        }}
      />
    </div>
  );
}
