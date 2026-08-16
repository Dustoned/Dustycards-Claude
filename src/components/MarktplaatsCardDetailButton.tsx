"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useHomeItemDetails } from "@/components/HomeItemDetailProvider";

export default function MarktplaatsCardDetailButton({
  cardId,
  label,
  children,
  className,
}: {
  cardId: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const { openingCardId, openCard } = useHomeItemDetails();
  const loading = openingCardId === cardId;

  return (
    <button
      type="button"
      onClick={() => void openCard(cardId)}
      disabled={loading}
      aria-label={label}
      className={className}
    >
      {loading ? (
        <span className="absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-black/60">
          <Loader2 className="h-5 w-5 animate-spin text-violet-200" aria-hidden="true" />
        </span>
      ) : null}
      {children}
    </button>
  );
}
