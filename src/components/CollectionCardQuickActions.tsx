"use client";

import { useEffect, useState } from "react";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";
import CollectionWantButton from "@/components/CollectionWantButton";
import type { CardQuickActionData } from "@/lib/card-quick-actions";
import {
  COLLECTION_CARD_ADDED_EVENT,
  dispatchCollectionCardAdded,
  getCollectionCardAddedEffects,
  resolveCollectionCardOwnedState,
  type CollectionCardAddedDetail,
} from "@/lib/collection-client-events";
import {
  dispatchWantsChanged,
  WANTS_CHANGED_EVENT,
  type WantsChangedDetail,
} from "@/lib/wants-client-events";
import { parseGradingTargetLabel } from "@/lib/grading-targets";

export default function CollectionCardQuickActions({
  data,
  className,
  gradedLabel = null,
  initialBinderId = null,
  lockedBinderName = null,
}: {
  data: CardQuickActionData;
  className?: string;
  gradedLabel?: string | null;
  initialBinderId?: string | null;
  lockedBinderName?: string | null;
}) {
  const [owned, setOwned] = useState(() =>
    resolveCollectionCardOwnedState(data.card.id, data.owned)
  );
  const [wantItem, setWantItem] = useState(data.wantItem);
  const parsedGrade = parseGradingTargetLabel(gradedLabel);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setOwned(resolveCollectionCardOwnedState(data.card.id, data.owned));
      setWantItem(data.wantItem);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [data.card.id, data.owned, data.wantItem]);

  useEffect(() => {
    function handleWantsChanged(event: Event) {
      const detail = (event as CustomEvent<WantsChangedDetail>).detail;
      if (!detail || detail.cardId !== data.card.id) return;
      setWantItem(detail.item);
    }

    function handleCollectionAdded(event: Event) {
      const detail = (event as CustomEvent<CollectionCardAddedDetail>).detail;
      if (!detail || detail.cardId !== data.card.id) return;
      if (getCollectionCardAddedEffects(detail).markOwned) {
        setOwned(true);
      }
    }

    window.addEventListener(WANTS_CHANGED_EVENT, handleWantsChanged);
    window.addEventListener(COLLECTION_CARD_ADDED_EVENT, handleCollectionAdded);
    return () => {
      window.removeEventListener(WANTS_CHANGED_EVENT, handleWantsChanged);
      window.removeEventListener(COLLECTION_CARD_ADDED_EVENT, handleCollectionAdded);
    };
  }, [data.card.id]);

  function handleAddedToCollection(detail: CollectionCardAddedDetail) {
    const effects = getCollectionCardAddedEffects(detail);

    if (effects.removeWant && wantItem) {
      dispatchWantsChanged({ cardId: data.card.id, wanted: false, item: null });
    }
    dispatchCollectionCardAdded(detail);
  }

  return (
    <div
      data-card-inline-actions
      className={`inline-flex shrink-0 items-center gap-1 rounded-xl border border-white/9 bg-black/28 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.2)] backdrop-blur-sm ${className ?? ""}`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <span data-card-action="collection" className="inline-flex">
        <CollectionAddCardButton
          card={data.card}
          mode="icon"
          theme="dark"
          refreshOnAdded={false}
          onAdded={handleAddedToCollection}
          initialBinderId={initialBinderId}
          lockedBinderName={lockedBinderName}
          defaultCardKind={gradedLabel ? "graded" : "raw"}
          defaultGradingCompany={parsedGrade.company}
          defaultGradingGrade={parsedGrade.grade != null ? String(parsedGrade.grade) : null}
          className="!h-11 !w-11 !rounded-lg !border-violet-300/22 !bg-violet-500/18 !text-violet-100 hover:!border-violet-200/38 hover:!bg-violet-500/28 sm:!h-9 sm:!w-9"
        />
      </span>
      <span data-card-action="want" className="inline-flex">
        <CollectionWantButton
          card={data.card}
          mode="icon"
          theme="dark"
          initialWanted={Boolean(wantItem)}
          wantItemId={wantItem?.id ?? null}
          disabled={owned && !wantItem}
          disabledTitle={owned ? `${data.card.name} is already in your collection` : undefined}
          onChanged={setWantItem}
          className="!h-11 !w-11 !rounded-lg !border-white/10 !bg-white/[0.045] !text-white/74 hover:!border-violet-200/30 hover:!bg-violet-500/16 hover:!text-violet-100 disabled:!cursor-not-allowed disabled:!opacity-35 sm:!h-9 sm:!w-9"
        />
      </span>
    </div>
  );
}
