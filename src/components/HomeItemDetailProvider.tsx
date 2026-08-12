"use client";

import dynamic from "next/dynamic";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ModalCardData } from "@/components/card-modal/types";
import type { SealedModalProductData } from "@/components/sealed-modal/types";

const CardModal = dynamic(() => import("@/components/CardModal"), {
  ssr: false,
  loading: () => null,
});
const SealedProductModal = dynamic(() => import("@/components/SealedProductModal"), {
  ssr: false,
  loading: () => null,
});

interface HomeItemDetailContextValue {
  openingCardId: string | null;
  openCard: (cardId: string) => Promise<void>;
  openSealed: (product: SealedModalProductData) => void;
}

const HomeItemDetailContext = createContext<HomeItemDetailContextValue | null>(null);

export function useHomeItemDetails(): HomeItemDetailContextValue {
  const value = useContext(HomeItemDetailContext);
  if (!value) {
    throw new Error("useHomeItemDetails must be used inside HomeItemDetailProvider");
  }
  return value;
}

export default function HomeItemDetailProvider({ children }: { children: ReactNode }) {
  const [selectedCard, setSelectedCard] = useState<ModalCardData | null>(null);
  const [selectedSealed, setSelectedSealed] = useState<SealedModalProductData | null>(null);
  const [openingCardId, setOpeningCardId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const cardCache = useRef(new Map<string, ModalCardData>());
  const activeRequest = useRef<{ cardId: string; controller: AbortController } | null>(null);

  useEffect(() => () => activeRequest.current?.controller.abort(), []);

  const openCard = useCallback(async (cardId: string) => {
    if (activeRequest.current?.cardId === cardId) return;
    activeRequest.current?.controller.abort();
    const controller = new AbortController();
    activeRequest.current = { cardId, controller };
    setSelectedSealed(null);

    const cached = cardCache.current.get(cardId);
    if (cached) {
      activeRequest.current = null;
      setOpeningCardId(null);
      setDetailError(null);
      setSelectedCard(cached);
      return;
    }

    setOpeningCardId(cardId);
    setDetailError(null);
    try {
      const response = await fetch(`/api/cards/${encodeURIComponent(cardId)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Could not load card details");
      const card = (await response.json()) as ModalCardData;
      if (activeRequest.current?.controller !== controller) return;
      cardCache.current.set(cardId, card);
      setSelectedCard(card);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setDetailError(error instanceof Error ? error.message : "Could not load card details");
    } finally {
      if (activeRequest.current?.controller === controller) {
        activeRequest.current = null;
        setOpeningCardId((current) => (current === cardId ? null : current));
      }
    }
  }, []);

  const openSealed = useCallback((product: SealedModalProductData) => {
    activeRequest.current?.controller.abort();
    activeRequest.current = null;
    setOpeningCardId(null);
    setDetailError(null);
    setSelectedCard(null);
    setSelectedSealed(product);
  }, []);

  const value = useMemo(
    () => ({ openingCardId, openCard, openSealed }),
    [openingCardId, openCard, openSealed]
  );

  return (
    <HomeItemDetailContext.Provider value={value}>
      {children}
      {detailError ? (
        <div
          role="alert"
          className="fixed bottom-24 left-1/2 z-[120] -translate-x-1/2 rounded-xl border border-rose-300/20 bg-[rgb(var(--dc-surface-elevated-rgb)/0.98)] px-4 py-2 text-sm font-bold text-rose-200 shadow-2xl"
        >
          {detailError}
        </div>
      ) : null}
      {selectedCard ? (
        <CardModal
          key={`${selectedCard.id}:${selectedCard.price_fetched_at ?? "none"}`}
          card={selectedCard}
          backLabel="Back to Home"
          onClose={() => {
            cardCache.current.delete(selectedCard.id);
            setSelectedCard(null);
          }}
        />
      ) : null}
      {selectedSealed ? (
        <SealedProductModal
          key={selectedSealed.id}
          product={selectedSealed}
          backLabel="Back to Home"
          onClose={() => setSelectedSealed(null)}
        />
      ) : null}
    </HomeItemDetailContext.Provider>
  );
}
