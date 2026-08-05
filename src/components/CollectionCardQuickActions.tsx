"use client";

import { useEffect, useState } from "react";
import { Heart, Plus } from "lucide-react";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";
import CollectionWantButton from "@/components/CollectionWantButton";
import type { CardQuickActionData } from "@/lib/card-quick-actions";
import {
  getCollectionCardAddedEffects,
  resolveCollectionCardOwnedState,
  subscribeCollectionCardAdded,
  type CollectionCardAddedDetail,
} from "@/lib/collection-client-events";
import {
  dispatchWantsChanged,
  subscribeWantsChanged,
} from "@/lib/wants-client-events";
import { parseGradingTargetLabel } from "@/lib/grading-targets";

const INLINE_ACTION_CLUSTER_CLASS =
  "inline-flex shrink-0 items-center gap-1 rounded-xl border border-[rgb(var(--dc-border-rgb)/0.9)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.9)] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.16)] backdrop-blur-sm";

export function CollectionCardQuickActionsPlaceholder({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      data-card-inline-actions
      data-card-inline-actions-state="loading"
      aria-busy="true"
      className={`${INLINE_ACTION_CLUSTER_CLASS} ${className ?? ""}`}
    >
      <span data-card-action="collection" className="inline-flex">
        <button
          type="button"
          disabled
          aria-label="Collection action is loading"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-violet-300/16 bg-violet-500/10 text-violet-100/42 md:h-9 md:w-9"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </span>
      <span data-card-action="want" className="inline-flex">
        <button
          type="button"
          disabled
          aria-label="Want action is loading"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/8 bg-white/[0.03] text-white/32 md:h-9 md:w-9"
        >
          <Heart className="h-4 w-4" aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}

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
    const unsubscribeWants = subscribeWantsChanged(data.card.id, (detail) => {
      setWantItem(detail.item);
    });
    const unsubscribeCollection = subscribeCollectionCardAdded(data.card.id, (detail) => {
      if (getCollectionCardAddedEffects(detail).markOwned) {
        setOwned(true);
      }
    });
    return () => {
      unsubscribeWants();
      unsubscribeCollection();
    };
  }, [data.card.id]);

  function handleAddedToCollection(detail: CollectionCardAddedDetail) {
    const effects = getCollectionCardAddedEffects(detail);

    if (effects.removeWant && wantItem) {
      dispatchWantsChanged({ cardId: data.card.id, wanted: false, item: null });
    }
  }

  return (
    <div
      data-card-inline-actions
      data-card-inline-actions-state="ready"
      className={`${INLINE_ACTION_CLUSTER_CLASS} ${className ?? ""}`}
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
          className="!h-11 !w-11 !rounded-lg !border-violet-300/22 !bg-violet-500/18 !text-violet-100 hover:!border-violet-200/38 hover:!bg-violet-500/28 md:!h-9 md:!w-9"
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
          className="!h-11 !w-11 !rounded-lg !border-white/10 !bg-white/[0.045] !text-white/74 hover:!border-violet-200/30 hover:!bg-violet-500/16 hover:!text-violet-100 disabled:!cursor-not-allowed disabled:!opacity-35 md:!h-9 md:!w-9"
        />
      </span>
    </div>
  );
}
