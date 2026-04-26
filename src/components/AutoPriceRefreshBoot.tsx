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

const AUTO_PRICE_REFRESH_POLL_MS = 30_000;
const AUTO_PRICE_REFRESH_START_DELAY_MS = 3_000;
const AUTO_PRICE_REFRESH_MIN_TRIGGER_GAP_MS = 25_000;
const AUTO_PRICE_REFRESH_FORCE_GAP_MS = 5_000;
const AUTO_PRICE_REFRESH_REFRESH_COOLDOWN_MS = 15_000;
const AUTO_PRICE_REFRESH_CHAIN_DELAY_MS = 2_000;
const AUTO_PRICE_REFRESH_TAB_LOCK_RENEW_MS = 30_000;
const AUTO_PRICE_REFRESH_STORAGE_KEY = "dustycards-auto-price-refresh-last-trigger";

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
  const { settings, isLoaded } = useSettings();
  const router = useRouter();
  const inFlightRef = useRef(false);
  const lastRouterRefreshAtRef = useRef(0);
  const followUpTimeoutRef = useRef<number | null>(null);
  const chainedFollowUpsRef = useRef(0);
  const tabOwnerIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !settings.autoPriceRefresh) {
      return;
    }

    let cancelled = false;

    function clearFollowUpTimer() {
      if (followUpTimeoutRef.current == null) return;

      window.clearTimeout(followUpTimeoutRef.current);
      followUpTimeoutRef.current = null;
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

        if (cancelled || !data.ok || data.skipped) {
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

    const initialTimeout = window.setTimeout(() => {
      void trigger(true);
    }, AUTO_PRICE_REFRESH_START_DELAY_MS);

    const pollInterval = window.setInterval(() => {
      void trigger(false);
    }, AUTO_PRICE_REFRESH_POLL_MS);

    const handleFocus = () => {
      void trigger(true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void trigger(true);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      clearFollowUpTimer();
      window.clearTimeout(initialTimeout);
      window.clearInterval(pollInterval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isLoaded, router, settings.autoPriceRefresh]);

  return null;
}
