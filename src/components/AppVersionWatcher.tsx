"use client";

import { useEffect, useRef } from "react";

const VERSION_POLL_MS = 60_000;

async function fetchAppVersion(): Promise<string | null> {
  const response = await fetch("/api/app-version", {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });

  if (!response.ok) return null;

  const data = (await response.json().catch(() => null)) as
    | { version?: unknown; build?: unknown }
    | null;
  if (typeof data?.build === "string" && data.build) return data.build;
  return typeof data?.version === "string" && data.version ? data.version : null;
}

export function appBuildChanged(loadedBuild: string, liveBuild: string | null): boolean {
  return Boolean(loadedBuild && liveBuild && loadedBuild !== liveBuild);
}

export default function AppVersionWatcher({ initialBuild }: { initialBuild: string }) {
  const loadedBuildRef = useRef(initialBuild);
  const pendingReloadRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let checking = false;

    async function checkVersion() {
      if (checking) return;
      checking = true;

      try {
        const version = await fetchAppVersion();
        if (cancelled || !version) return;

        if (appBuildChanged(loadedBuildRef.current, version)) {
          if (document.visibilityState === "hidden") {
            pendingReloadRef.current = true;
            return;
          }

          window.location.reload();
        }
      } finally {
        checking = false;
      }
    }

    function checkVisibleVersion() {
      if (document.visibilityState !== "visible") return;

      if (pendingReloadRef.current) {
        window.location.reload();
        return;
      }

      void checkVersion();
    }

    void checkVersion();
    const intervalId = window.setInterval(() => {
      void checkVersion();
    }, VERSION_POLL_MS);

    document.addEventListener("visibilitychange", checkVisibleVersion);
    window.addEventListener("focus", checkVisibleVersion);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", checkVisibleVersion);
      window.removeEventListener("focus", checkVisibleVersion);
    };
  }, []);

  return null;
}
