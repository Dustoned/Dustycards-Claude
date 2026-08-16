"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import CardModal from "@/components/CardModal";
import type { ModalCardData } from "@/components/card-modal/types";

interface CardDetailRoutePageProps {
  card: ModalCardData;
  backHref: string;
  backLabel: string;
  initialMarketSource?: "cardmarket" | "tcgplayer";
}

/**
 * Route-level host for the same card detail module used by collection,
 * search, expansions, movers and Home. Dedicated feature routes should only
 * provide their back destination; card UI and actions stay centralized.
 */
export default function CardDetailRoutePage({
  card,
  backHref,
  backLabel,
  initialMarketSource,
}: CardDetailRoutePageProps) {
  const router = useRouter();
  const closeDetail = useCallback(() => {
    router.replace(backHref);
  }, [backHref, router]);

  return (
    <CardModal
      card={card}
      backLabel={backLabel}
      initialMarketSource={initialMarketSource}
      onClose={closeDetail}
      // Links inside a route-hosted detail already perform their own
      // navigation. They must not also trigger the route's Back behavior.
      onNavigate={() => undefined}
    />
  );
}
