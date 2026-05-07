"use client";

import { useEffect, useRef, startTransition } from "react";
import { useRouter } from "next/navigation";
import { useSettings } from "@/components/SettingsProvider";

const ACTIVE_SYNC_REFRESH_MS = 3_000;
const IDLE_SYNC_REFRESH_MS = 15_000;

export default function SyncStatusAutoRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const { currentUserRole, settings, isLoaded } = useSettings();
  const inFlightRef = useRef(false);
  const releaseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const watchBackgroundRefresh =
      isLoaded && currentUserRole === "admin" && settings.autoPriceRefresh;
    const refreshIntervalMs =
      enabled || watchBackgroundRefresh ? ACTIVE_SYNC_REFRESH_MS : IDLE_SYNC_REFRESH_MS;

    function refresh() {
      if (cancelled || inFlightRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;

      inFlightRef.current = true;

      startTransition(() => {
        router.refresh();
      });

      if (releaseTimerRef.current != null) {
        window.clearTimeout(releaseTimerRef.current);
      }

      releaseTimerRef.current = window.setTimeout(() => {
        inFlightRef.current = false;
        releaseTimerRef.current = null;
      }, 1_000);
    }

    if (enabled || watchBackgroundRefresh) {
      refresh();
    }

    const intervalId = window.setInterval(refresh, refreshIntervalMs);
    const visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visibilityHandler);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      if (releaseTimerRef.current != null) {
        window.clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
      }
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visibilityHandler);
    };
  }, [currentUserRole, enabled, isLoaded, router, settings.autoPriceRefresh]);

  return null;
}
