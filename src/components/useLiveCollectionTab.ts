"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const COLLECTION_URL_CHANGE_EVENT = "dustycards:collection-url-change";

function readCollectionTab() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("graded") === "1" ? "graded" : params.get("tab");
}

export function emitCollectionUrlChange() {
  window.dispatchEvent(new Event(COLLECTION_URL_CHANGE_EVENT));
}

export function useLiveCollectionTab() {
  const searchParams = useSearchParams();
  const routeTab = searchParams.get("graded") === "1" ? "graded" : searchParams.get("tab");
  const [clientState, setClientState] = useState<{ href: string; tab: string | null } | null>(null);

  useEffect(() => {
    const syncTab = () =>
      setClientState({
        href: window.location.href,
        tab: readCollectionTab(),
      });

    window.addEventListener(COLLECTION_URL_CHANGE_EVENT, syncTab);
    window.addEventListener("popstate", syncTab);
    return () => {
      window.removeEventListener(COLLECTION_URL_CHANGE_EVENT, syncTab);
      window.removeEventListener("popstate", syncTab);
    };
  }, []);

  const currentHref = typeof window === "undefined" ? null : window.location.href;
  return clientState?.href === currentHref ? clientState.tab : routeTab;
}
