"use client";

import { Check, ShoppingBag, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  COLLECTION_CARD_ADDED_EVENT,
  type CollectionCardAddedDetail,
} from "@/lib/collection-client-events";

interface VisibleCollectionToast extends CollectionCardAddedDetail {
  id: number;
}

export default function CollectionActionToast() {
  const [toast, setToast] = useState<VisibleCollectionToast | null>(null);

  useEffect(() => {
    const showConfirmation = (event: Event) => {
      const detail = (event as CustomEvent<CollectionCardAddedDetail>).detail;
      if (!detail) return;
      setToast({ ...detail, id: Date.now() });
    };

    window.addEventListener(COLLECTION_CARD_ADDED_EVENT, showConfirmation);
    return () => window.removeEventListener(COLLECTION_CARD_ADDED_EVENT, showConfirmation);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3_200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  if (!toast) return null;

  const savedForSale = toast.destination === "for-sale";
  const Icon = savedForSale ? ShoppingBag : Check;

  return (
    <div
      key={toast.id}
      role="status"
      aria-live="polite"
      className="fixed left-3 right-3 top-[calc(var(--ui-app-header-height)+env(safe-area-inset-top,0px)+0.65rem)] z-[430] mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-emerald-300/18 bg-[#0c1211]/92 p-2.5 pr-2 text-white shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:left-auto sm:right-5 sm:top-auto sm:bottom-5 sm:mx-0 sm:w-[min(24rem,calc(100vw-2.5rem))]"
      data-collection-confirmation-toast
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-300/18 bg-emerald-300/10 text-emerald-200">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-sm font-black">
          {savedForSale ? "Saved for sale" : "Added to collection"}
        </strong>
        <span className="block truncate text-xs font-semibold text-white/52">
          {toast.cardName ?? "Card saved successfully"}
        </span>
      </span>
      <button
        type="button"
        onClick={() => setToast(null)}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/42 transition-colors hover:bg-white/8 hover:text-white"
        aria-label="Dismiss confirmation"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
