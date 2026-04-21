"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSettings } from "@/components/SettingsProvider";

const AUTO_PRICE_REFRESH_POLL_MS = 30_000;
const AUTO_PRICE_REFRESH_START_DELAY_MS = 3_000;
const AUTO_PRICE_REFRESH_MIN_TRIGGER_GAP_MS = 25_000;
const AUTO_PRICE_REFRESH_FORCE_GAP_MS = 5_000;
const AUTO_PRICE_REFRESH_REFRESH_COOLDOWN_MS = 15_000;
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

  useEffect(() => {
    if (!isLoaded || !settings.autoPriceRefresh) {
      return;
    }

    let cancelled = false;

    async function trigger(force = false) {
      if (cancelled || inFlightRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;

      const now = Date.now();
      const lastTriggerAt = readLastTriggerAt();
      const minGap = force ? AUTO_PRICE_REFRESH_FORCE_GAP_MS : AUTO_PRICE_REFRESH_MIN_TRIGGER_GAP_MS;

      if (now - lastTriggerAt < minGap) {
        return;
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

        const data = (await response.json()) as {
          ok?: boolean;
          skipped?: boolean;
          updatedCards?: number;
          newPrices?: number;
          refreshedPrices?: number;
          nativeHistoryItems?: number;
        };

        if (
          cancelled ||
          !data.ok ||
          data.skipped ||
          !(
            (data.updatedCards ?? 0) > 0 ||
            (data.newPrices ?? 0) > 0 ||
            (data.refreshedPrices ?? 0) > 0 ||
            (data.nativeHistoryItems ?? 0) > 0
          )
        ) {
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
      window.clearTimeout(initialTimeout);
      window.clearInterval(pollInterval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isLoaded, router, settings.autoPriceRefresh]);

  return null;
}
