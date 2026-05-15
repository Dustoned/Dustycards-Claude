"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  AUTO_PRICE_REFRESH_TAB_LOCK_TTL_MS,
  createAutoPriceRefreshTabOwnerId,
  hasVisibleRefreshChanges,
  releaseAutoPriceRefreshTabLock,
  shouldQueueAutoPriceRefreshFollowUp,
  tryAcquireAutoPriceRefreshTabLock,
  type AutoPriceRefreshClientResponse,
} from "@/lib/auto-price-refresh-client";
import { useSettings } from "@/components/SettingsProvider";

const AUTO_PRICE_REFRESH_START_DELAY_MS = 3_000;
const AUTO_PRICE_REFRESH_MIN_TRIGGER_GAP_MS = 25_000;
const AUTO_PRICE_REFRESH_FORCE_GAP_MS = 5_000;
const AUTO_PRICE_REFRESH_REFRESH_COOLDOWN_MS = 15_000;
const AUTO_PRICE_REFRESH_CHAIN_DELAY_MS = 2_000;
const AUTO_PRICE_REFRESH_TAB_LOCK_RENEW_MS = 30_000;
const AUTO_PRICE_REFRESH_FIXED_WINDOW_MS = 12 * 60 * 60 * 1000;
const AUTO_PRICE_REFRESH_WINDOW_GRACE_MS = 2 * 60 * 60 * 1000;
const AUTO_PRICE_REFRESH_WINDOW_DELAY_MS = 10_000;
const AUTO_PRICE_REFRESH_STORAGE_KEY = "dustycards-auto-price-refresh-last-trigger";

function getFixedWindowStart(now: number): number {
  return Math.floor(now / AUTO_PRICE_REFRESH_FIXED_WINDOW_MS) * AUTO_PRICE_REFRESH_FIXED_WINDOW_MS;
}

function getDelayUntilNextWindowTrigger(now: number, lastWindowStart: number | null): number {
  const windowStart = getFixedWindowStart(now);
  const windowAge = now - windowStart;

  if (windowAge <= AUTO_PRICE_REFRESH_WINDOW_GRACE_MS && lastWindowStart !== windowStart) {
    return AUTO_PRICE_REFRESH_START_DELAY_MS;
  }

  return Math.max(
    windowStart + AUTO_PRICE_REFRESH_FIXED_WINDOW_MS + AUTO_PRICE_REFRESH_WINDOW_DELAY_MS - now,
    AUTO_PRICE_REFRESH_START_DELAY_MS
  );
}

function readLastTriggerAt(): number {
  try {
    const raw = localStorage.getItem(AUTO_PRICE_REFRESH_STORAGE_KEY);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeLastTriggerAt(value: number) {
  try {
    localStorage.setItem(AUTO_PRICE_REFRESH_STORAGE_KEY, String(value));
  } catch {}
}

export default function AutoPriceRefreshBoot() {
  const { currentUserRole, isLoaded } = useSettings();
  const router = useRouter();
  const inFlightRef = useRef(false);
  const lastRouterRefreshAtRef = useRef(0);
  const followUpTimeoutRef = useRef<number | null>(null);
  const windowTimeoutRef = useRef<number | null>(null);
  const chainedFollowUpsRef = useRef(0);
  const lastScheduledWindowStartRef = useRef<number | null>(null);
  const tabOwnerIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded || currentUserRole !== "admin") {
      return;
    }

    let cancelled = false;

    function clearFollowUpTimer() {
      if (followUpTimeoutRef.current == null) return;

      window.clearTimeout(followUpTimeoutRef.current);
      followUpTimeoutRef.current = null;
    }

    function clearWindowTimer() {
      if (windowTimeoutRef.current == null) return;

      window.clearTimeout(windowTimeoutRef.current);
      windowTimeoutRef.current = null;
    }

    function markAndTriggerCurrentWindow() {
      const windowStart = getFixedWindowStart(Date.now());
      lastScheduledWindowStartRef.current = windowStart;
      void trigger(true);
    }

    function scheduleNextWindowTrigger() {
      if (cancelled) return;

      clearWindowTimer();
      const delay = getDelayUntilNextWindowTrigger(
        Date.now(),
        lastScheduledWindowStartRef.current
      );

      windowTimeoutRef.current = window.setTimeout(() => {
        windowTimeoutRef.current = null;
        markAndTriggerCurrentWindow();
        scheduleNextWindowTrigger();
      }, delay);
    }

    function triggerIfInsideCurrentWindow() {
      const now = Date.now();
      const windowStart = getFixedWindowStart(now);
      if (now - windowStart > AUTO_PRICE_REFRESH_WINDOW_GRACE_MS) return;
      if (lastScheduledWindowStartRef.current === windowStart) return;

      markAndTriggerCurrentWindow();
      scheduleNextWindowTrigger();
    }

    function scheduleFollowUp() {
      if (cancelled) return;

      clearFollowUpTimer();

      const now = Date.now();
      const gapRemaining = Math.max(
        AUTO_PRICE_REFRESH_FORCE_GAP_MS - (now - readLastTriggerAt()),
        0
      );
      const delay = Math.max(AUTO_PRICE_REFRESH_CHAIN_DELAY_MS, gapRemaining + 100);

      followUpTimeoutRef.current = window.setTimeout(() => {
        followUpTimeoutRef.current = null;
        void trigger(true);
      }, delay);
    }

    async function trigger(force = false) {
      if (cancelled || inFlightRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;

      if (!force) {
        chainedFollowUpsRef.current = 0;
      }

      const now = Date.now();
      const lastTriggerAt = readLastTriggerAt();
      const minGap = force ? AUTO_PRICE_REFRESH_FORCE_GAP_MS : AUTO_PRICE_REFRESH_MIN_TRIGGER_GAP_MS;

      if (now - lastTriggerAt < minGap) {
        return;
      }

      const ownerId =
        tabOwnerIdRef.current ?? (tabOwnerIdRef.current = createAutoPriceRefreshTabOwnerId());
      let lockRenewInterval: number | null = null;

      try {
        if (!tryAcquireAutoPriceRefreshTabLock(localStorage, ownerId, now)) {
          return;
        }

        lockRenewInterval = window.setInterval(() => {
          tryAcquireAutoPriceRefreshTabLock(
            localStorage,
            ownerId,
            Date.now(),
            AUTO_PRICE_REFRESH_TAB_LOCK_TTL_MS
          );
        }, AUTO_PRICE_REFRESH_TAB_LOCK_RENEW_MS);
      } catch {
        // If browser storage is blocked, keep the server-side sync conflict guard as fallback.
      }

      inFlightRef.current = true;
      writeLastTriggerAt(now);

      try {
        const response = await fetch("/api/price-refresh", {
          method: "POST",
          cache: "no-store",
        });

        if (response.status === 409) {
          return;
        }

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as AutoPriceRefreshClientResponse;

        if (cancelled || !data.ok) {
          chainedFollowUpsRef.current = 0;
          return;
        }

        const hasServerStartedHistoryJob =
          data.cardHistoryJobStarted === true || data.cardHistoryJobRunning === true;

        if (data.skipped && !hasServerStartedHistoryJob) {
          chainedFollowUpsRef.current = 0;
          return;
        }

        if (shouldQueueAutoPriceRefreshFollowUp(data, chainedFollowUpsRef.current)) {
          chainedFollowUpsRef.current += 1;
          scheduleFollowUp();
        } else {
          chainedFollowUpsRef.current = 0;
        }

        if (!hasVisibleRefreshChanges(data)) {
          return;
        }

        const refreshNow = Date.now();
        if (refreshNow - lastRouterRefreshAtRef.current < AUTO_PRICE_REFRESH_REFRESH_COOLDOWN_MS) {
          return;
        }

        lastRouterRefreshAtRef.current = refreshNow;
        router.refresh();
      } catch {
        return;
      } finally {
        if (lockRenewInterval != null) {
          window.clearInterval(lockRenewInterval);
        }
        try {
          releaseAutoPriceRefreshTabLock(localStorage, ownerId);
        } catch {}
        inFlightRef.current = false;
      }
    }

    scheduleNextWindowTrigger();

    const handleFocus = () => {
      triggerIfInsideCurrentWindow();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        triggerIfInsideCurrentWindow();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      clearFollowUpTimer();
      clearWindowTimer();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [currentUserRole, isLoaded, router]);

  return null;
}
