"use client";

import { useEffect } from "react";

const SERVICE_WORKER_PATH = "/dustycards-sw.js";
const CACHE_PREFIX = "dustycards-";

function canUseServiceWorker(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;

  return window.isSecureContext || window.location.hostname === "localhost";
}

async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return;
    await navigator.storage.persist();
  } catch {
    // Persistent storage is optional; normal browser cache still works without it.
  }
}

async function clearLocalOfflineCache() {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((registration) => registration.scope.startsWith(window.location.origin))
        .map((registration) => registration.unregister())
    );
  } catch {
    // Development cleanup should never block the app.
  }

  try {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX))
        .map((key) => caches.delete(key))
    );
  } catch {
    // Cache storage is optional and may be unavailable in some browsers.
  }
}

export default function OfflineCacheRegistration() {
  useEffect(() => {
    if (!canUseServiceWorker()) return;

    if (process.env.NODE_ENV !== "production") {
      void clearLocalOfflineCache();
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH, {
          scope: "/",
        });

        if (cancelled) return;

        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }

        void registration.update().catch(() => undefined);
        void requestPersistentStorage();
      } catch {
        // The app should keep working even if a browser blocks service workers.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
