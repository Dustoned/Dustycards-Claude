"use client";

import { useEffect, useRef } from "react";

const VERSION_POLL_MS = 60_000;
const INITIAL_VERSION_CHECK_DELAY_MS = 30_000;
const BUILD_RELOAD_STORAGE_KEY = "dustycards:build-reload-target";
const PAGE_CACHE_PREFIX = "dustycards-pages-";

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

export function shouldReloadForBuild(
  loadedBuild: string,
  liveBuild: string | null,
  attemptedBuild: string | null
): boolean {
  return appBuildChanged(loadedBuild, liveBuild) && liveBuild !== attemptedBuild;
}

function readAttemptedBuild(): string | null {
  try {
    return window.sessionStorage.getItem(BUILD_RELOAD_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeAttemptedBuild(build: string) {
  try {
    window.sessionStorage.setItem(BUILD_RELOAD_STORAGE_KEY, build);
  } catch {
    // The in-memory reload guard still prevents repeats in this document.
  }
}

function clearCompletedBuildAttempt(build: string) {
  try {
    if (window.sessionStorage.getItem(BUILD_RELOAD_STORAGE_KEY) === build) {
      window.sessionStorage.removeItem(BUILD_RELOAD_STORAGE_KEY);
    }
  } catch {
    // Session storage is optional.
  }
}

async function clearCachedAppPages() {
  if (!("caches" in window)) return;

  try {
    const names = await window.caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(PAGE_CACHE_PREFIX))
        .map((name) => window.caches.delete(name))
    );
  } catch {
    // A reload still works when cache storage is unavailable.
  }
}

export default function AppVersionWatcher({ initialBuild }: { initialBuild: string }) {
  const loadedBuildRef = useRef(initialBuild);
  const attemptedBuildRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let checking = false;
    let checksEnabled = false;

    clearCompletedBuildAttempt(loadedBuildRef.current);

    async function reloadOnceForBuild(liveBuild: string) {
      const attemptedBuild = attemptedBuildRef.current ?? readAttemptedBuild();
      if (!shouldReloadForBuild(loadedBuildRef.current, liveBuild, attemptedBuild)) return;

      attemptedBuildRef.current = liveBuild;
      writeAttemptedBuild(liveBuild);
      await clearCachedAppPages();
      if (!cancelled) window.location.reload();
    }

    async function checkVersion() {
      if (!checksEnabled || checking) return;
      checking = true;

      try {
        const version = await fetchAppVersion();
        if (cancelled || !version) return;

        if (
          document.visibilityState === "visible" &&
          shouldReloadForBuild(
            loadedBuildRef.current,
            version,
            attemptedBuildRef.current ?? readAttemptedBuild()
          )
        ) {
          await reloadOnceForBuild(version);
        }
      } finally {
        checking = false;
      }
    }

    function checkVisibleVersion() {
      if (document.visibilityState !== "visible") return;
      void checkVersion();
    }

    const initialCheckId = window.setTimeout(() => {
      checksEnabled = true;
      void checkVersion();
    }, INITIAL_VERSION_CHECK_DELAY_MS);
    const intervalId = window.setInterval(() => {
      void checkVersion();
    }, VERSION_POLL_MS);

    document.addEventListener("visibilitychange", checkVisibleVersion);
    window.addEventListener("focus", checkVisibleVersion);

    return () => {
      cancelled = true;
      window.clearTimeout(initialCheckId);
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", checkVisibleVersion);
      window.removeEventListener("focus", checkVisibleVersion);
    };
  }, []);

  return null;
}
