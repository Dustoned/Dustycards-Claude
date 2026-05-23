"use client";

import { useEffect } from "react";

const SERVICE_WORKER_PATH = "/dustycards-sw.js";

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

export default function OfflineCacheRegistration() {
  useEffect(() => {
    if (!canUseServiceWorker()) return;

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
