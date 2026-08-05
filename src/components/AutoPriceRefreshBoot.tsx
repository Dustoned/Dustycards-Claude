"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  AUTO_PRICE_REFRESH_TAB_LOCK_TTL_MS,
  createAutoPriceRefreshTabOwnerId,
  hasVisibleRefreshChanges,
  releaseAutoPriceRefreshTabLock,
  tryAcquireAutoPriceRefreshTabLock,
  type AutoPriceRefreshClientResponse,
} from "@/lib/auto-price-refresh-client";
import { useSettings } from "@/components/SettingsProvider";
import { invalidateMarketHomeClientCache } from "@/lib/home-client-cache";

const AUTO_PRICE_REFRESH_START_DELAY_MS = 3_000;
const AUTO_PRICE_REFRESH_POLL_MS = 5 * 60_000;
const AUTO_PRICE_REFRESH_MIN_TRIGGER_GAP_MS = 60_000;
const AUTO_PRICE_REFRESH_REFRESH_COOLDOWN_MS = 15_000;
const AUTO_PRICE_REFRESH_TAB_LOCK_RENEW_MS = 30_000;
const AUTO_PRICE_REFRESH_STORAGE_KEY = "dustycards-auto-price-refresh-last-trigger";

function isLocalBrowserHost(): boolean {
  const hostname = window.location.hostname.toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
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

export default function AutoPriceRefreshBoot({ enabled = false }: { enabled?: boolean }) {
  const { currentUserRole, isLoaded, isMobileViewport, settings } = useSettings();
  const router = useRouter();
  const inFlightRef = useRef(false);
  const lastRouterRefreshAtRef = useRef(0);
  const startTimeoutRef = useRef<number | null>(null);
  const tabOwnerIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      !enabled ||
      !settings.autoPriceRefresh ||
      !isLoaded ||
      currentUserRole !== "admin" ||
      isMobileViewport ||
      isLocalBrowserHost()
    ) {
      return;
    }

    let cancelled = false;

    function clearStartTimer() {
      if (startTimeoutRef.current == null) return;

      window.clearTimeout(startTimeoutRef.current);
      startTimeoutRef.current = null;
    }

    async function trigger() {
      if (cancelled || inFlightRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;

      const now = Date.now();
      const lastTriggerAt = readLastTriggerAt();

      if (now - lastTriggerAt < AUTO_PRICE_REFRESH_MIN_TRIGGER_GAP_MS) {
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
          return;
        }

        if (!hasVisibleRefreshChanges(data)) {
          return;
        }

        const refreshNow = Date.now();
        if (refreshNow - lastRouterRefreshAtRef.current < AUTO_PRICE_REFRESH_REFRESH_COOLDOWN_MS) {
          return;
        }

        lastRouterRefreshAtRef.current = refreshNow;
        invalidateMarketHomeClientCache();
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

    startTimeoutRef.current = window.setTimeout(() => {
      startTimeoutRef.current = null;
      void trigger();
    }, AUTO_PRICE_REFRESH_START_DELAY_MS);
    const intervalId = window.setInterval(() => {
      void trigger();
    }, AUTO_PRICE_REFRESH_POLL_MS);

    const handleFocus = () => {
      void trigger();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void trigger();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      clearStartTimer();
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [currentUserRole, enabled, isLoaded, isMobileViewport, router, settings.autoPriceRefresh]);

  return null;
}
