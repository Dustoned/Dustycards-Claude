"use client";

import { useEffect, useRef, startTransition } from "react";
import { useRouter } from "next/navigation";

const ACTIVE_SYNC_REFRESH_MS = 3_000;

export default function SyncStatusAutoRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    function refresh() {
      if (cancelled || inFlightRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;

      inFlightRef.current = true;

      startTransition(() => {
        router.refresh();
      });

      window.setTimeout(() => {
        inFlightRef.current = false;
      }, 1_000);
    }

    refresh();

    const intervalId = window.setInterval(refresh, ACTIVE_SYNC_REFRESH_MS);
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
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visibilityHandler);
    };
  }, [enabled, router]);

  return null;
}
