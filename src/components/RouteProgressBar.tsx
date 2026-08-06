"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ROUTE_PROGRESS_START_EVENT,
  type RouteProgressStartDetail,
} from "@/lib/route-progress";

const STATUS_DELAY_MS = 550;
const SLOW_NAVIGATION_MS = 3_500;
const RECOVERY_ACTION_MS = 8_000;
const DIRECT_RECOVERY_COOLDOWN_MS = 60_000;
const DIRECT_RECOVERY_STORAGE_PREFIX = "dustycards:direct-route-recovery:";

export function shouldAttemptDirectRouteRecovery(
  lastAttemptAt: number | null,
  now: number,
  cooldownMs = DIRECT_RECOVERY_COOLDOWN_MS
): boolean {
  return lastAttemptAt == null || now - lastAttemptAt >= cooldownMs;
}

function directRecoveryStorageKey(href: string): string {
  try {
    const target = new URL(href, window.location.origin);
    return `${DIRECT_RECOVERY_STORAGE_PREFIX}${target.pathname}${target.search}`;
  } catch {
    return `${DIRECT_RECOVERY_STORAGE_PREFIX}${href}`;
  }
}

function readDirectRecoveryAttempt(href: string): number | null {
  try {
    const value = Number(window.sessionStorage.getItem(directRecoveryStorageKey(href)));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function markDirectRecoveryAttempt(href: string, now: number) {
  try {
    window.sessionStorage.setItem(directRecoveryStorageKey(href), String(now));
  } catch {
    // A private browser can disable session storage; navigation still works.
  }
}

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
  const normalized = value
    ?.replace(/\s+/g, " ")
    .trim()
    .replace(/^open full chase analysis for\s+/i, "")
    .replace(/^open full analysis for\s+/i, "")
    .replace(/^open card details? for\s+/i, "")
    .replace(/^open\s+/i, "")
    .replace(/^back to\s+/i, "");
  if (!normalized) return null;
  return normalized.length > 24 ? normalized.slice(0, 24).trimEnd() : normalized;
}

export function getDirectRouteRecoveryMessage(label: string | null): string {
  return label ? `Reopening ${label}…` : "Reopening page…";
}

function getAnchorProgressLabel(anchor: HTMLAnchorElement): string | null {
  const explicitLabel =
    anchor.getAttribute("data-route-progress-label") ??
    anchor.getAttribute("aria-label") ??
    anchor.getAttribute("title");
  if (explicitLabel) return normalizeRouteProgressLabel(explicitLabel);

  const labelledChild = anchor.querySelector<HTMLElement>(
    "[data-route-progress-label], [data-navigation-item-label], h1, h2, h3"
  );
  return normalizeRouteProgressLabel(labelledChild?.textContent);
}

export function hasRouteProgressReachedDestination(
  pendingHref: string | null,
  currentHref: string,
  origin: string
): boolean {
  if (!pendingHref) return false;
  try {
    const target = new URL(pendingHref, origin);
    const current = new URL(currentHref, origin);
    return (
      target.origin === current.origin &&
      `${target.pathname}${target.search}` === `${current.pathname}${current.search}`
    );
  } catch {
    return false;
  }
}

// Gives every internal navigation one consistent lifecycle: immediate visual
// feedback and a clear slow-route message. A genuinely stuck RSC transition is
// recovered once with a normal document navigation; a short session guard
// prevents reload loops if the destination itself is unavailable.
export default function RouteProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
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
      setShowRecovery(false);
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
      setShowRecovery(false);
      setWidth(7);
      setMessage(label ? `Opening ${label}…` : "Opening page…");

      const trickle = () => {
        if (!loadingRef.current || navigationSequenceRef.current !== sequence) return;
        if (
          hasRouteProgressReachedDestination(
            pendingHrefRef.current,
            window.location.href,
            window.location.origin
          )
        ) {
          finish();
          return;
        }
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

          const href = pendingHrefRef.current;
          const now = Date.now();
          const lastAttemptAt = readDirectRecoveryAttempt(href);
          setShowStatus(true);

          if (shouldAttemptDirectRouteRecovery(lastAttemptAt, now)) {
            markDirectRecoveryAttempt(href, now);
            setMessage(getDirectRouteRecoveryMessage(label));
            window.location.assign(href);
            return;
          }

          setShowRecovery(true);
          setMessage(label ? `${label} is still loading` : "This page is still loading");
        }, RECOVERY_ACTION_MS)
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
        label: getAnchorProgressLabel(anchor),
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
  }, []);

  useEffect(() => {
    if (!loadingRef.current) return;
    loadingRef.current = false;
    pendingHrefRef.current = null;
    navigationSequenceRef.current += 1;
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    setShowStatus(false);
    setShowRecovery(false);
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
          className={`${showRecovery ? "pointer-events-auto" : "pointer-events-none"} route-progress-status fixed left-1/2 z-[239] flex -translate-x-1/2 items-center gap-2 rounded-full border border-[rgb(var(--dc-border-rgb)/0.9)] bg-[var(--dc-surface-glass)] px-3 py-2 text-xs font-semibold text-[rgb(var(--dc-text-primary-rgb)/0.82)] shadow-[0_18px_48px_var(--dc-shadow-color)] backdrop-blur-xl`}
        >
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-[rgb(var(--dc-primary-rgb))] motion-reduce:animate-none"
          />
          <span className="truncate">{message}</span>
          {showRecovery ? (
            <button
              type="button"
              onClick={() => {
                const href = pendingHrefRef.current;
                if (href) window.location.assign(href);
              }}
              className="shrink-0 rounded-full border border-white/14 bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-white/16"
            >
              Open direct
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
