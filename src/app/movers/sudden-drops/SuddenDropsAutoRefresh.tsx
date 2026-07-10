"use client";

import { startTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 5_000;
const REFRESH_RELEASE_MS = 1_000;

export default function SuddenDropsAutoRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const inFlightRef = useRef(false);
  const releaseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    function refresh() {
      if (cancelled || inFlightRef.current) return;
      if (document.visibilityState === "hidden" || !navigator.onLine) return;

      inFlightRef.current = true;
      startTransition(() => router.refresh());

      if (releaseTimerRef.current != null) {
        window.clearTimeout(releaseTimerRef.current);
      }
      releaseTimerRef.current = window.setTimeout(() => {
        inFlightRef.current = false;
        releaseTimerRef.current = null;
      }, REFRESH_RELEASE_MS);
    }

    refresh();
    const intervalId = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      if (releaseTimerRef.current != null) {
        window.clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
      }
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, router]);

  return null;
}
